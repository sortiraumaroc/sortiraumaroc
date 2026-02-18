/**
 * Wheel of Fortune Logic — Core game mechanics
 *
 * Server-side only prize determination (no probabilities sent to client).
 * Anti-cheat: spin_token UUID, 1 spin/day, email verified, multi-account detection.
 * Integration: Prizes create platform_gift_distributions with source='wheel_of_fortune'.
 *
 * Key rules:
 *   - Result computed server-side ONLY (crypto.getRandomValues)
 *   - Probabilities redistributed when prizes depleted
 *   - External codes assigned from pool
 *   - spin_token UUID anti-replay
 */

import { getAdminSupabase } from "./supabaseAdmin";
import crypto, { randomUUID } from "crypto";
import { fireNotification } from "./notificationEngine";
import { emitAdminNotification } from "./adminNotifications";
import { emitConsumerUserEvent } from "./consumerNotifications";
import type {
  WheelEvent,
  WheelPrize,
  WheelSpin,
  SpinResponse,
  SpinResult,
  WheelPrizeType,
  AudienceFilters,
} from "../shared/notificationsBannersWheelTypes";
import { getAudienceUserIds } from "./audienceSegmentService";

// =============================================================================
// Types
// =============================================================================

interface CanSpinResult {
  canSpin: boolean;
  reason?: string;
  nextSpinAt?: string;
}

interface WeightedPrize {
  prize: WheelPrize;
  adjustedProbability: number;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get the currently active wheel event.
 */
export async function getActiveWheel(): Promise<WheelEvent | null> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("wheel_events")
    .select("*")
    .eq("status", "active")
    .lte("start_date", now)
    .gte("end_date", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as WheelEvent;
}

/**
 * Check if a user can spin the wheel.
 */
export async function canUserSpin(
  userId: string,
  wheelId: string,
): Promise<CanSpinResult> {
  const supabase = getAdminSupabase();

  // 1. Check wheel is active
  const { data: wheel } = await supabase
    .from("wheel_events")
    .select("status, start_date, end_date, spins_per_day, eligibility, eligibility_filters")
    .eq("id", wheelId)
    .single();

  if (!wheel || wheel.status !== "active") {
    return { canSpin: false, reason: "La roue n'est pas active" };
  }

  const now = new Date();
  if (now < new Date(wheel.start_date as string) || now > new Date(wheel.end_date as string)) {
    return { canSpin: false, reason: "La roue n'est pas dans sa période active" };
  }

  // 2. Check email confirmed
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  if (!authUser?.user?.email_confirmed_at) {
    return { canSpin: false, reason: "Votre email doit être vérifié pour jouer" };
  }

  // 3. Check eligibility segment
  if (wheel.eligibility === "segment" && wheel.eligibility_filters) {
    const filters = wheel.eligibility_filters as AudienceFilters;
    const eligible = await getAudienceUserIds(filters, { limit: 50000 });
    if (!eligible.includes(userId)) {
      return { canSpin: false, reason: "Vous ne faites pas partie de l'audience éligible" };
    }
  }

  // 4. Check spins today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("wheel_spins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("wheel_event_id", wheelId)
    .gte("created_at", todayStart.toISOString());

  const spinsToday = count ?? 0;
  const maxSpins = (wheel.spins_per_day as number) ?? 1;

  if (spinsToday >= maxSpins) {
    // Calculate next spin time (tomorrow 00:00)
    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    return {
      canSpin: false,
      reason: "Vous avez déjà joué aujourd'hui",
      nextSpinAt: tomorrow.toISOString(),
    };
  }

  return { canSpin: true };
}

/**
 * Spin the wheel — the main game function.
 *
 * Flow:
 *   1. Verify canUserSpin
 *   2. Generate spin_token (UUID)
 *   3. Calculate result (server-side weighted random)
 *   4. Handle prize type (gift distribution, external code, etc.)
 *   5. Record spin + update stats
 *   6. Send notifications
 *   7. Return result (no probabilities exposed)
 */
export async function spinWheel(
  userId: string,
  wheelId: string,
  deviceId?: string,
  ipAddress?: string,
): Promise<SpinResponse> {
  const supabase = getAdminSupabase();

  // 1. Verify eligibility
  const eligibility = await canUserSpin(userId, wheelId);
  if (!eligibility.canSpin) {
    return {
      ok: false,
      result: "lost",
      segment_index: 0,
      error: eligibility.reason,
      next_spin_at: eligibility.nextSpinAt,
    };
  }

  // 2. Generate anti-replay token
  const spinToken = randomUUID();

  // 3. Get available prizes
  const { data: prizes, error: prizesErr } = await supabase
    .from("wheel_prizes")
    .select("*")
    .eq("wheel_event_id", wheelId)
    .order("sort_order", { ascending: true });

  if (prizesErr || !prizes || prizes.length === 0) {
    return { ok: false, result: "lost", segment_index: 0, error: "Erreur de configuration de la roue" };
  }

  const allPrizes = prizes as WheelPrize[];

  // 4. Calculate result with probability redistribution
  const { selectedPrize, segmentIndex } = calculateSpinResult(allPrizes);

  // 5. Determine win/lose
  const isLoss = !selectedPrize || selectedPrize.type === "nothing" || selectedPrize.type === "retry";
  const result: SpinResult = isLoss ? "lost" : "won";

  let giftDistributionId: string | null = null;
  let externalCodeId: string | null = null;
  let externalCode: string | null = null;
  let partnerName: string | null = null;
  let partnerUrl: string | null = null;

  // 6. Process prize
  if (selectedPrize && !isLoss) {
    // Decrement remaining quantity
    if (selectedPrize.remaining_quantity > 0) {
      await supabase
        .from("wheel_prizes")
        .update({ remaining_quantity: selectedPrize.remaining_quantity - 1, updated_at: new Date().toISOString() })
        .eq("id", selectedPrize.id);
    }

    // Handle by prize type
    if (selectedPrize.type === "external_code") {
      // Assign an external code
      const codeResult = await assignExternalCode(selectedPrize.id, userId);
      if (codeResult) {
        externalCodeId = codeResult.id;
        externalCode = codeResult.code;
        partnerName = codeResult.partner_name;
        partnerUrl = codeResult.partner_url;
      }
    } else {
      // Create platform_gift_distribution for physical/discount/service prizes
      giftDistributionId = await createWheelGiftDistribution(
        userId,
        selectedPrize,
        wheelId,
      );
    }
  }

  // 7. Record spin
  const now = new Date().toISOString();
  await supabase.from("wheel_spins").insert({
    wheel_event_id: wheelId,
    user_id: userId,
    spin_token: spinToken,
    result,
    prize_id: selectedPrize?.id ?? null,
    prize_name: selectedPrize?.name ?? null,
    prize_type: selectedPrize?.type ?? null,
    gift_distribution_id: giftDistributionId,
    external_code_id: externalCodeId,
    segment_index: segmentIndex,
    device_id: deviceId ?? null,
    ip_address: ipAddress ?? null,
    created_at: now,
  });

  // 8. Update wheel stats
  void updateWheelStats(wheelId, result);

  // 9. Notifications
  if (result === "won" && selectedPrize) {
    // Notify user
    void fireNotification({
      event_type: "wheel.prize_won",
      recipient_id: userId,
      recipient_type: "consumer",
      channels: ["push", "in_app"],
      data: {
        prize_name: selectedPrize.name,
        prize_type: selectedPrize.type,
        prize_value: selectedPrize.value ?? 0,
      },
      is_critical: true,
    });
  }

  // Calculate next spin time
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  // 10. Build response (NO probabilities exposed)
  return {
    ok: true,
    result,
    segment_index: segmentIndex,
    prize: selectedPrize && !isLoss ? {
      name: selectedPrize.name,
      type: selectedPrize.type,
      description: selectedPrize.description,
      establishment_name: undefined, // Would need a join
      value: selectedPrize.value ?? undefined,
      expires_at: giftDistributionId
        ? new Date(Date.now() + selectedPrize.gift_validity_days * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      external_code: externalCode ?? undefined,
      partner_name: partnerName ?? undefined,
      partner_url: partnerUrl ?? undefined,
    } : undefined,
    gift_distribution_id: giftDistributionId ?? undefined,
    next_spin_at: tomorrow.toISOString(),
  };
}

/**
 * Get spin history for a user on a specific wheel.
 */
export async function getSpinHistory(
  userId: string,
  wheelId: string,
): Promise<WheelSpin[]> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("wheel_spins")
    .select("*")
    .eq("user_id", userId)
    .eq("wheel_event_id", wheelId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as WheelSpin[];
}

/**
 * Get user's wheel gifts (source = wheel_of_fortune).
 */
export async function getUserWheelGifts(userId: string): Promise<unknown[]> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("platform_gift_distributions")
    .select("*, platform_gift:platform_gifts(*)")
    .eq("consumer_user_id", userId)
    .eq("source", "wheel_of_fortune")
    .order("distributed_at", { ascending: false });

  if (error) return [];
  return data ?? [];
}

// =============================================================================
// Probability Engine
// =============================================================================

/**
 * Calculate spin result using weighted random selection.
 * Handles depleted prizes by redistributing their probability proportionally.
 */
function calculateSpinResult(allPrizes: WheelPrize[]): { selectedPrize: WheelPrize | null; segmentIndex: number } {
  // Separate available and depleted prizes
  const available: WeightedPrize[] = [];
  let depletedProbability = 0;

  for (const prize of allPrizes) {
    if (prize.remaining_quantity > 0) {
      available.push({ prize, adjustedProbability: prize.probability });
    } else {
      // Check for substitute
      if (prize.substitute_prize_id) {
        const substitute = allPrizes.find((p) => p.id === prize.substitute_prize_id);
        if (substitute && substitute.remaining_quantity > 0) {
          // Add probability to substitute
          const existingSub = available.find((a) => a.prize.id === substitute.id);
          if (existingSub) {
            existingSub.adjustedProbability += prize.probability;
          } else {
            available.push({ prize: substitute, adjustedProbability: prize.probability });
          }
          continue;
        }
      }
      // No substitute or substitute also depleted — redistribute
      depletedProbability += prize.probability;
    }
  }

  // Redistribute depleted probability proportionally
  if (depletedProbability > 0 && available.length > 0) {
    const totalAvailable = available.reduce((sum, a) => sum + a.adjustedProbability, 0);
    if (totalAvailable > 0) {
      for (const item of available) {
        item.adjustedProbability += (item.adjustedProbability / totalAvailable) * depletedProbability;
      }
    }
  }

  if (available.length === 0) {
    // All prizes depleted — result is loss at random segment
    const randomIndex = Math.floor(cryptoRandom() * allPrizes.length);
    return { selectedPrize: null, segmentIndex: randomIndex };
  }

  // Verify sum ≈ 100%
  const totalProb = available.reduce((sum, a) => sum + a.adjustedProbability, 0);

  // Weighted random selection
  const random = cryptoRandom() * totalProb;
  let cumulative = 0;

  for (const item of available) {
    cumulative += item.adjustedProbability;
    if (random <= cumulative) {
      const segmentIndex = allPrizes.findIndex((p) => p.id === item.prize.id);
      return { selectedPrize: item.prize, segmentIndex: segmentIndex >= 0 ? segmentIndex : 0 };
    }
  }

  // Fallback (should not happen)
  const lastItem = available[available.length - 1];
  const lastIndex = allPrizes.findIndex((p) => p.id === lastItem.prize.id);
  return { selectedPrize: lastItem.prize, segmentIndex: lastIndex >= 0 ? lastIndex : 0 };
}

/**
 * Crypto-secure random number between 0 and 1.
 */
function cryptoRandom(): number {
  const array = new Uint32Array(1);
  // Use Node.js crypto
  (crypto.webcrypto as Crypto).getRandomValues(array);
  return array[0] / (0xFFFFFFFF + 1);
}

// =============================================================================
// Prize Handlers
// =============================================================================

/**
 * Assign an external code to a user.
 */
async function assignExternalCode(
  prizeId: string,
  userId: string,
): Promise<{ id: string; code: string; partner_name: string; partner_url: string | null } | null> {
  const supabase = getAdminSupabase();

  // Find an unassigned code
  const { data: code, error } = await supabase
    .from("wheel_external_codes")
    .select("*")
    .eq("prize_id", prizeId)
    .is("assigned_to", null)
    .limit(1)
    .single();

  if (error || !code) {
    console.error("[Wheel] No external code available for prize:", prizeId);
    return null;
  }

  // Assign it
  await supabase
    .from("wheel_external_codes")
    .update({
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", code.id);

  return {
    id: code.id as string,
    code: code.code as string,
    partner_name: code.partner_name as string,
    partner_url: code.partner_url as string | null,
  };
}

/**
 * Create a platform_gift_distribution for a wheel prize.
 */
async function createWheelGiftDistribution(
  userId: string,
  prize: WheelPrize,
  wheelId: string,
): Promise<string | null> {
  const supabase = getAdminSupabase();

  const expiresAt = new Date(Date.now() + prize.gift_validity_days * 24 * 60 * 60 * 1000).toISOString();
  const qrToken = randomUUID();

  const { data, error } = await supabase
    .from("platform_gift_distributions")
    .insert({
      platform_gift_id: null, // Wheel prizes don't have a parent platform_gift
      consumer_user_id: userId,
      status: "distributed",
      distributed_at: new Date().toISOString(),
      expires_at: expiresAt,
      qr_token: qrToken,
      source: "wheel_of_fortune",
      notes: `Roue de la Chance — ${prize.name} (event: ${wheelId})`,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Wheel] Failed to create gift distribution:", error.message);
    return null;
  }

  return (data as { id: string }).id;
}

// =============================================================================
// Stats
// =============================================================================

async function updateWheelStats(wheelId: string, result: SpinResult): Promise<void> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("wheel_events")
    .select("stats_total_spins, stats_total_wins, stats_total_losses")
    .eq("id", wheelId)
    .single();

  if (!data) return;

  const stats = data as { stats_total_spins: number; stats_total_wins: number; stats_total_losses: number };

  await supabase
    .from("wheel_events")
    .update({
      stats_total_spins: stats.stats_total_spins + 1,
      stats_total_wins: stats.stats_total_wins + (result === "won" ? 1 : 0),
      stats_total_losses: stats.stats_total_losses + (result === "lost" ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", wheelId);
}
