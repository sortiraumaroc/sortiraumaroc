/**
 * Wheel Admin Logic — Administration of Wheel of Fortune events
 *
 * CRUD for wheel events and prizes, external code management,
 * stats dashboard, CSV exports, probability validation.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("wheelAdmin");
import type {
  WheelEvent,
  WheelEventStatus,
  WheelPrize,
  WheelPrizeType,
  WheelSpin,
  WheelStats,
  WheelDailyRecap,
  AudienceFilters,
} from "../shared/notificationsBannersWheelTypes";
import { LIMITS } from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types
// =============================================================================

export interface CreateWheelEventInput {
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  spins_per_day?: number;
  eligibility: "all" | "segment";
  eligibility_filters?: AudienceFilters;
  welcome_message: string;
  already_played_message: string;
  theme?: Record<string, unknown>;
  created_by?: string;
}

export interface UpdateWheelEventInput {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  spins_per_day?: number;
  eligibility?: "all" | "segment";
  eligibility_filters?: AudienceFilters;
  welcome_message?: string;
  already_played_message?: string;
  theme?: Record<string, unknown>;
}

export interface AddPrizeInput {
  name: string;
  description?: string;
  type: WheelPrizeType;
  establishment_id?: string;
  value?: number;
  value_currency?: string;
  total_quantity: number;
  probability: number;
  substitute_prize_id?: string;
  segment_color: string;
  segment_icon?: string;
  gift_validity_days?: number;
  conditions?: string;
  sort_order: number;
}

export interface UpdatePrizeInput {
  name?: string;
  description?: string;
  type?: WheelPrizeType;
  establishment_id?: string | null;
  value?: number | null;
  total_quantity?: number;
  probability?: number;
  substitute_prize_id?: string | null;
  segment_color?: string;
  segment_icon?: string | null;
  gift_validity_days?: number;
  conditions?: string | null;
  sort_order?: number;
}

// =============================================================================
// Wheel Event CRUD
// =============================================================================

export async function createWheelEvent(input: CreateWheelEventInput): Promise<{ ok: boolean; wheel?: WheelEvent; error?: string }> {
  const supabase = getAdminSupabase();

  if (!input.name || input.name.length > LIMITS.WHEEL_EVENT_NAME_MAX) {
    return { ok: false, error: `Le nom doit faire entre 1 et ${LIMITS.WHEEL_EVENT_NAME_MAX} caractères` };
  }

  if (!input.start_date || !input.end_date) {
    return { ok: false, error: "Les dates de début et fin sont obligatoires" };
  }

  if (new Date(input.start_date) >= new Date(input.end_date)) {
    return { ok: false, error: "La date de début doit être avant la date de fin" };
  }

  const spinsPerDay = Math.max(1, Math.min(input.spins_per_day ?? 1, LIMITS.WHEEL_MAX_SPINS_PER_DAY));

  const { data, error } = await supabase
    .from("wheel_events")
    .insert({
      name: input.name,
      description: input.description ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      spins_per_day: spinsPerDay,
      eligibility: input.eligibility,
      eligibility_filters: input.eligibility === "segment" ? (input.eligibility_filters ?? {}) : {},
      welcome_message: input.welcome_message,
      already_played_message: input.already_played_message,
      theme: input.theme ?? {},
      status: "draft" as WheelEventStatus,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, wheel: data as WheelEvent };
}

export async function updateWheelEvent(
  wheelId: string,
  input: UpdateWheelEventInput,
): Promise<{ ok: boolean; wheel?: WheelEvent; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("wheel_events")
    .select("status")
    .eq("id", wheelId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Roue introuvable" };
  if (existing.status !== "draft" && existing.status !== "paused") {
    return { ok: false, error: "Seules les roues en brouillon ou en pause peuvent être modifiées" };
  }

  const updatePayload: Record<string, unknown> = {};
  if (input.name !== undefined) updatePayload.name = input.name;
  if (input.description !== undefined) updatePayload.description = input.description;
  if (input.start_date !== undefined) updatePayload.start_date = input.start_date;
  if (input.end_date !== undefined) updatePayload.end_date = input.end_date;
  if (input.spins_per_day !== undefined) updatePayload.spins_per_day = Math.max(1, Math.min(input.spins_per_day, LIMITS.WHEEL_MAX_SPINS_PER_DAY));
  if (input.eligibility !== undefined) updatePayload.eligibility = input.eligibility;
  if (input.eligibility_filters !== undefined) updatePayload.eligibility_filters = input.eligibility_filters;
  if (input.welcome_message !== undefined) updatePayload.welcome_message = input.welcome_message;
  if (input.already_played_message !== undefined) updatePayload.already_played_message = input.already_played_message;
  if (input.theme !== undefined) updatePayload.theme = input.theme;
  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("wheel_events")
    .update(updatePayload)
    .eq("id", wheelId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, wheel: data as WheelEvent };
}

// =============================================================================
// Status transitions
// =============================================================================

export async function activateWheel(wheelId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  // Validate probabilities first
  const probResult = await validateProbabilities(wheelId);
  if (!probResult.ok) {
    return { ok: false, error: `Probabilités invalides: ${probResult.error}` };
  }

  return updateWheelStatus(wheelId, "active", ["draft", "paused"]);
}

export async function pauseWheel(wheelId: string): Promise<{ ok: boolean; error?: string }> {
  return updateWheelStatus(wheelId, "paused", ["active"]);
}

export async function endWheel(wheelId: string): Promise<{ ok: boolean; error?: string }> {
  return updateWheelStatus(wheelId, "ended", ["active", "paused"]);
}

async function updateWheelStatus(
  wheelId: string,
  newStatus: WheelEventStatus,
  allowedFrom: WheelEventStatus[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("wheel_events")
    .select("status")
    .eq("id", wheelId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Roue introuvable" };
  if (!allowedFrom.includes(existing.status as WheelEventStatus)) {
    return { ok: false, error: `Transition de ${existing.status} vers ${newStatus} non autorisée` };
  }

  const { error } = await supabase
    .from("wheel_events")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", wheelId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// Prize CRUD
// =============================================================================

export async function addPrize(
  wheelId: string,
  input: AddPrizeInput,
): Promise<{ ok: boolean; prize?: WheelPrize; error?: string }> {
  const supabase = getAdminSupabase();

  if (!input.name || input.name.length > LIMITS.WHEEL_PRIZE_NAME_MAX) {
    return { ok: false, error: `Le nom doit faire entre 1 et ${LIMITS.WHEEL_PRIZE_NAME_MAX} caractères` };
  }

  if (input.probability < 0 || input.probability > 100) {
    return { ok: false, error: "La probabilité doit être entre 0 et 100" };
  }

  if (input.total_quantity < 1) {
    return { ok: false, error: "La quantité doit être au moins 1" };
  }

  const { data, error } = await supabase
    .from("wheel_prizes")
    .insert({
      wheel_event_id: wheelId,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      establishment_id: input.establishment_id ?? null,
      value: input.value ?? null,
      value_currency: input.value_currency ?? "MAD",
      total_quantity: input.total_quantity,
      remaining_quantity: input.total_quantity,
      probability: input.probability,
      substitute_prize_id: input.substitute_prize_id ?? null,
      segment_color: input.segment_color,
      segment_icon: input.segment_icon ?? null,
      gift_validity_days: input.gift_validity_days ?? 7,
      conditions: input.conditions ?? null,
      sort_order: input.sort_order,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, prize: data as WheelPrize };
}

export async function updatePrize(
  prizeId: string,
  input: UpdatePrizeInput,
): Promise<{ ok: boolean; prize?: WheelPrize; error?: string }> {
  const supabase = getAdminSupabase();

  const updatePayload: Record<string, unknown> = {};
  if (input.name !== undefined) updatePayload.name = input.name;
  if (input.description !== undefined) updatePayload.description = input.description;
  if (input.type !== undefined) updatePayload.type = input.type;
  if (input.establishment_id !== undefined) updatePayload.establishment_id = input.establishment_id;
  if (input.value !== undefined) updatePayload.value = input.value;
  if (input.total_quantity !== undefined) {
    updatePayload.total_quantity = input.total_quantity;
    // Also update remaining if increasing total
    const { data: current } = await supabase
      .from("wheel_prizes")
      .select("total_quantity, remaining_quantity")
      .eq("id", prizeId)
      .single();
    if (current) {
      const c = current as { total_quantity: number; remaining_quantity: number };
      const diff = input.total_quantity - c.total_quantity;
      if (diff > 0) {
        updatePayload.remaining_quantity = c.remaining_quantity + diff;
      }
    }
  }
  if (input.probability !== undefined) updatePayload.probability = input.probability;
  if (input.substitute_prize_id !== undefined) updatePayload.substitute_prize_id = input.substitute_prize_id;
  if (input.segment_color !== undefined) updatePayload.segment_color = input.segment_color;
  if (input.segment_icon !== undefined) updatePayload.segment_icon = input.segment_icon;
  if (input.gift_validity_days !== undefined) updatePayload.gift_validity_days = input.gift_validity_days;
  if (input.conditions !== undefined) updatePayload.conditions = input.conditions;
  if (input.sort_order !== undefined) updatePayload.sort_order = input.sort_order;
  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("wheel_prizes")
    .update(updatePayload)
    .eq("id", prizeId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, prize: data as WheelPrize };
}

export async function removePrize(prizeId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("wheel_prizes")
    .delete()
    .eq("id", prizeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// External Codes
// =============================================================================

/**
 * Upload external codes from CSV content.
 * Expected format: code,partner_name,partner_url (one per line)
 */
export async function uploadExternalCodes(
  prizeId: string,
  csvContent: string,
): Promise<{ ok: boolean; imported: number; error?: string }> {
  const supabase = getAdminSupabase();

  const lines = csvContent.trim().split("\n").filter((l) => l.trim().length > 0);

  // Skip header if present
  const startIdx = lines[0]?.toLowerCase().includes("code") ? 1 : 0;

  const rows: { prize_id: string; code: string; partner_name: string; partner_url: string | null }[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    if (!parts[0]) continue;

    rows.push({
      prize_id: prizeId,
      code: parts[0],
      partner_name: parts[1] ?? "",
      partner_url: parts[2] || null,
    });
  }

  if (rows.length === 0) return { ok: false, imported: 0, error: "Aucun code trouvé dans le CSV" };

  // Insert in batches
  let imported = 0;
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("wheel_external_codes").insert(batch);
    if (error) {
      log.error({ err: error.message }, "uploadExternalCodes batch error");
    } else {
      imported += batch.length;
    }
  }

  // Update remaining_quantity on the prize
  const { data: codeCount } = await supabase
    .from("wheel_external_codes")
    .select("id", { count: "exact", head: true })
    .eq("prize_id", prizeId)
    .is("assigned_to", null);

  if (codeCount !== null) {
    // Update total_quantity and remaining_quantity
    const totalCodes = await supabase
      .from("wheel_external_codes")
      .select("id", { count: "exact", head: true })
      .eq("prize_id", prizeId);

    await supabase
      .from("wheel_prizes")
      .update({
        total_quantity: totalCodes.count ?? 0,
        remaining_quantity: codeCount as unknown as number, // count
      })
      .eq("id", prizeId);
  }

  return { ok: true, imported };
}

// =============================================================================
// Stats
// =============================================================================

export async function getWheelStats(wheelId: string): Promise<{ ok: boolean; stats?: WheelStats; error?: string }> {
  const supabase = getAdminSupabase();

  // Get wheel base stats
  const { data: wheel, error: wheelErr } = await supabase
    .from("wheel_events")
    .select("stats_total_spins, stats_total_wins, stats_total_losses")
    .eq("id", wheelId)
    .single();

  if (wheelErr || !wheel) return { ok: false, error: "Roue introuvable" };
  const w = wheel as { stats_total_spins: number; stats_total_wins: number; stats_total_losses: number };

  // Today's spins
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: todaySpins } = await supabase
    .from("wheel_spins")
    .select("id", { count: "exact", head: true })
    .eq("wheel_event_id", wheelId)
    .gte("created_at", todayStart.toISOString());

  // Get prizes with win counts
  const { data: prizes } = await supabase
    .from("wheel_prizes")
    .select("*")
    .eq("wheel_event_id", wheelId)
    .order("sort_order", { ascending: true });

  const prizeStats = [];
  for (const prize of (prizes ?? []) as WheelPrize[]) {
    const { count: wins } = await supabase
      .from("wheel_spins")
      .select("id", { count: "exact", head: true })
      .eq("prize_id", prize.id)
      .eq("result", "won");

    const consumed = prize.total_quantity - prize.remaining_quantity;

    prizeStats.push({
      id: prize.id,
      name: prize.name,
      type: prize.type,
      total_quantity: prize.total_quantity,
      remaining_quantity: prize.remaining_quantity,
      wins_count: wins ?? 0,
      consumed_count: consumed,
      consumption_rate: prize.total_quantity > 0 ? Math.round((consumed / prize.total_quantity) * 100) : 0,
    });
  }

  // Participation rate — unique users today / eligible users
  const { count: uniqueToday } = await supabase
    .from("wheel_spins")
    .select("user_id", { count: "exact", head: true })
    .eq("wheel_event_id", wheelId)
    .gte("created_at", todayStart.toISOString());

  return {
    ok: true,
    stats: {
      total_spins: w.stats_total_spins,
      total_spins_today: todaySpins ?? 0,
      total_wins: w.stats_total_wins,
      total_losses: w.stats_total_losses,
      win_rate: w.stats_total_spins > 0 ? Math.round((w.stats_total_wins / w.stats_total_spins) * 100) : 0,
      participation_rate: 0, // Would need eligible count for accurate calc
      prizes: prizeStats,
    },
  };
}

/**
 * Get daily recap for admin email.
 */
export async function getDailyRecap(wheelId: string): Promise<WheelDailyRecap | null> {
  const supabase = getAdminSupabase();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  // Get today's spins
  const { data: spins } = await supabase
    .from("wheel_spins")
    .select("result, prize_name, prize_type")
    .eq("wheel_event_id", wheelId)
    .gte("created_at", todayStart.toISOString())
    .lt("created_at", todayEnd.toISOString());

  if (!spins) return null;

  const spinRows = spins as { result: string; prize_name: string | null; prize_type: string | null }[];

  const wins = spinRows.filter((s) => s.result === "won");
  const losses = spinRows.filter((s) => s.result === "lost");

  // Count prizes awarded
  const prizeMap = new Map<string, { name: string; type: string; count: number }>();
  for (const win of wins) {
    if (win.prize_name) {
      const key = win.prize_name;
      const existing = prizeMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        prizeMap.set(key, { name: win.prize_name, type: win.prize_type ?? "unknown", count: 1 });
      }
    }
  }

  // Depleted prizes
  const { data: prizes } = await supabase
    .from("wheel_prizes")
    .select("name, remaining_quantity")
    .eq("wheel_event_id", wheelId);

  const allPrizes = (prizes ?? []) as { name: string; remaining_quantity: number }[];
  const depleted = allPrizes.filter((p) => p.remaining_quantity === 0).map((p) => p.name);
  const lowStock = allPrizes
    .filter((p) => p.remaining_quantity > 0 && p.remaining_quantity <= 5)
    .map((p) => ({ name: p.name, remaining: p.remaining_quantity }));

  return {
    date: todayStart.toISOString().split("T")[0],
    spins_count: spinRows.length,
    wins_count: wins.length,
    losses_count: losses.length,
    prizes_awarded: Array.from(prizeMap.values()),
    depleted_prizes: depleted,
    low_stock_prizes: lowStock,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that prize probabilities sum to 100%.
 */
export async function validateProbabilities(
  wheelId: string,
): Promise<{ ok: boolean; total: number; prizes: { name: string; probability: number }[]; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: prizes, error } = await supabase
    .from("wheel_prizes")
    .select("name, probability")
    .eq("wheel_event_id", wheelId);

  if (error || !prizes) return { ok: false, total: 0, prizes: [], error: "Impossible de charger les lots" };

  const rows = prizes as { name: string; probability: number }[];
  const total = rows.reduce((sum, p) => sum + p.probability, 0);

  // Allow small floating point tolerance
  const isValid = Math.abs(total - 100) < 0.01;

  return {
    ok: isValid,
    total: Math.round(total * 100) / 100,
    prizes: rows,
    error: isValid ? undefined : `La somme des probabilités est ${total}%, elle doit être 100%`,
  };
}

// =============================================================================
// Export
// =============================================================================

/**
 * Export all spins for a wheel event as CSV.
 */
export async function exportSpins(wheelId: string): Promise<{ ok: boolean; csv?: string; error?: string }> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("wheel_spins")
    .select("*")
    .eq("wheel_event_id", wheelId)
    .order("created_at", { ascending: false })
    .limit(50000);

  if (error) return { ok: false, error: error.message };

  const spins = (data ?? []) as WheelSpin[];
  const headers = ["Date", "User ID", "Résultat", "Lot", "Type", "Device ID", "IP"];

  const lines: string[] = [headers.join(",")];

  for (const spin of spins) {
    const row = [
      spin.created_at,
      spin.user_id,
      spin.result,
      spin.prize_name ?? "",
      spin.prize_type ?? "",
      spin.device_id ?? "",
      spin.ip_address ?? "",
    ];
    lines.push(row.map(escapeCSV).join(","));
  }

  return { ok: true, csv: lines.join("\n") };
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
