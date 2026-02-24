/**
 * Client Scoring V2
 *
 * Computes client reliability score on 0-100 scale (displayed as 0-5.0 stars).
 * Base score: 60 (= 3.0 stars).
 *
 * Scoring events:
 *   +5  per honored reservation (QR scanned or venue confirmed)
 *   -15 per no-show confirmed
 *   -5  per late cancellation (12h-24h before)
 *   -10 per very late cancellation (<12h before)
 *   +1  per review posted
 *   +2  per free→paid upgrade
 *   +5  seniority bonus after 5 reservations
 *   +10 seniority bonus after 20 reservations
 *
 * Rehabilitation: after 5 consecutive honored, consecutive_no_shows resets.
 * Auto-suspension: 3 consecutive no-shows → 7d, recurrence → 30d.
 * Admin can lift suspension at any time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SCORE_SCALE,
  SCORING_WEIGHTS,
  SUSPENSION_RULES,
  computeClientScoreV2,
  scoreToStars,
  classifyCancellation,
  type CancellationType,
} from "../shared/reservationTypesV2";
import { scoreToReliabilityLevel, type ConsumerReliabilityLevel } from "./consumerReliability";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("clientScoringV2");

// =============================================================================
// Types
// =============================================================================

export interface ClientScoreResult {
  score: number;
  stars: number;
  level: ConsumerReliabilityLevel;
  isSuspended: boolean;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  stats: {
    totalReservations: number;
    honoredReservations: number;
    noShowsCount: number;
    lateCancellations: number;
    veryLateCancellations: number;
    reviewsPosted: number;
    freeToPaidConversions: number;
    consecutiveHonored: number;
    consecutiveNoShows: number;
  };
}

export interface ScoringEvent {
  type:
    | "honored"
    | "no_show"
    | "late_cancel"
    | "very_late_cancel"
    | "review_posted"
    | "free_to_paid"
    | "suspension_lifted";
  reservationId?: string;
  userId: string;
}

// =============================================================================
// Core: Recompute full client score from DB stats
// =============================================================================

/**
 * Full recompute of client score V2 from consumer_user_stats.
 * Call this after any scoring event.
 */
export async function recomputeClientScoreV2(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ClientScoreResult> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) {
    return defaultScoreResult();
  }

  // Fetch current stats
  const { data: stats, error } = await args.supabase
    .from("consumer_user_stats")
    .select(
      "reliability_score, reservations_count, no_shows_count, " +
      "honored_reservations, late_cancellations, very_late_cancellations, " +
      "reviews_posted, consecutive_honored, consecutive_no_shows, " +
      "free_to_paid_conversions, is_suspended, suspended_until, " +
      "suspension_reason, total_reservations, scoring_version",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !stats) {
    return defaultScoreResult();
  }

  const s = stats as unknown as Record<string, unknown>;

  const honored = toInt(s.honored_reservations);
  const noShows = toInt(s.no_shows_count);
  const lateCancels = toInt(s.late_cancellations);
  const veryLateCancels = toInt(s.very_late_cancellations);
  const totalRes = toInt(s.total_reservations);
  const reviewsPosted = toInt(s.reviews_posted);
  const freeToPaid = toInt(s.free_to_paid_conversions);
  const consecutiveHonored = toInt(s.consecutive_honored);
  const consecutiveNoShows = toInt(s.consecutive_no_shows);
  const isSuspended = s.is_suspended === true;
  const suspendedUntil = typeof s.suspended_until === "string" ? s.suspended_until : null;
  const suspensionReason = typeof s.suspension_reason === "string" ? s.suspension_reason : null;

  // Compute score using shared formula
  const score = computeClientScoreV2({
    honored,
    noShows,
    lateCancellations: lateCancels,
    veryLateCancellations: veryLateCancels,
    totalReservations: totalRes,
    reviewsPosted,
    freeToPaidConversions: freeToPaid,
  });

  const stars = scoreToStars(score);
  const level = scoreToReliabilityLevel(score);

  // Persist the computed score back
  await args.supabase
    .from("consumer_user_stats")
    .update({
      reliability_score: score,
      scoring_version: 2,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    score,
    stars,
    level,
    isSuspended,
    suspendedUntil,
    suspensionReason,
    stats: {
      totalReservations: totalRes,
      honoredReservations: honored,
      noShowsCount: noShows,
      lateCancellations: lateCancels,
      veryLateCancellations: veryLateCancels,
      reviewsPosted,
      freeToPaidConversions: freeToPaid,
      consecutiveHonored,
      consecutiveNoShows,
    },
  };
}

// =============================================================================
// Event handlers: Update stats + recompute
// =============================================================================

/**
 * Record a "honored" event (reservation consumed: QR scanned or pro confirmed).
 */
export async function recordHonoredReservation(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ClientScoreResult> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return defaultScoreResult();

  await ensureStatsRow(args.supabase, userId);

  // Read current values for read-modify-write pattern
  const { data: current } = await args.supabase
    .from("consumer_user_stats")
    .select("honored_reservations, total_reservations, consecutive_honored, consecutive_no_shows")
    .eq("user_id", userId)
    .maybeSingle();

  const prevHonored = toInt((current as any)?.honored_reservations);
  const prevTotal = toInt((current as any)?.total_reservations);
  const prevConsecutiveHonored = toInt((current as any)?.consecutive_honored);
  const newConsecutiveHonored = prevConsecutiveHonored + 1;

  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    honored_reservations: prevHonored + 1,
    total_reservations: prevTotal + 1,
    consecutive_honored: newConsecutiveHonored,
    last_activity_at: nowIso,
    updated_at: nowIso,
  };

  // Rehabilitation: after REHABILITATION_CONSECUTIVE consecutive honored, reset no-show streak
  if (newConsecutiveHonored >= SUSPENSION_RULES.REHABILITATION_CONSECUTIVE) {
    patch.consecutive_no_shows = 0;
  }

  await args.supabase
    .from("consumer_user_stats")
    .update(patch)
    .eq("user_id", userId);

  return recomputeClientScoreV2(args);
}

/**
 * Record a "no-show" event. Checks for auto-suspension.
 */
export async function recordNoShow(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ClientScoreResult & { newlySuspended: boolean }> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return { ...defaultScoreResult(), newlySuspended: false };

  await ensureStatsRow(args.supabase, userId);

  // Fetch current consecutive no-shows
  const { data: current } = await args.supabase
    .from("consumer_user_stats")
    .select("consecutive_no_shows, no_shows_count, is_suspended")
    .eq("user_id", userId)
    .maybeSingle();

  const prevConsecutive = toInt((current as any)?.consecutive_no_shows);
  const prevTotal = toInt((current as any)?.no_shows_count);
  const wasSuspended = (current as any)?.is_suspended === true;

  const newConsecutive = prevConsecutive + 1;
  const newTotal = prevTotal + 1;

  // Check suspension thresholds
  let shouldSuspend = false;
  let suspensionDays = 0;
  let suspensionReason = "";

  if (newConsecutive >= SUSPENSION_RULES.CONSECUTIVE_NO_SHOWS_THRESHOLD && !wasSuspended) {
    shouldSuspend = true;
    if (newTotal >= 5) {
      suspensionDays = SUSPENSION_RULES.SECOND_SUSPENSION_DAYS;
      suspensionReason = `${newTotal} no-shows cumulés (dont ${newConsecutive} consécutifs)`;
    } else {
      suspensionDays = SUSPENSION_RULES.FIRST_SUSPENSION_DAYS;
      suspensionReason = `${newConsecutive} no-shows consécutifs`;
    }
  }

  const nowIso = new Date().toISOString();
  const suspendedUntil = shouldSuspend
    ? new Date(Date.now() + suspensionDays * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  await args.supabase
    .from("consumer_user_stats")
    .update({
      no_shows_count: newTotal,
      consecutive_no_shows: newConsecutive,
      consecutive_honored: 0, // Reset honored streak on no-show
      ...(shouldSuspend
        ? {
            is_suspended: true,
            suspended_until: suspendedUntil,
            suspension_reason: suspensionReason,
          }
        : {}),
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", userId);

  const result = await recomputeClientScoreV2(args);
  return { ...result, newlySuspended: shouldSuspend };
}

/**
 * Record a cancellation event. Impact depends on timing.
 */
export async function recordCancellation(args: {
  supabase: SupabaseClient;
  userId: string;
  startsAt: Date;
  cancelledAt?: Date;
}): Promise<ClientScoreResult & { cancellationType: CancellationType }> {
  const userId = String(args.userId ?? "").trim();
  const cancelAt = args.cancelledAt ?? new Date();
  const cancellationType = classifyCancellation(args.startsAt, cancelAt);

  if (!userId || cancellationType === "free") {
    // > 24h: no scoring impact
    const score = await recomputeClientScoreV2({ supabase: args.supabase, userId });
    return { ...score, cancellationType };
  }

  await ensureStatsRow(args.supabase, userId);

  const nowIso = new Date().toISOString();

  // Read current values for read-modify-write increment
  const { data: currentStats } = await args.supabase
    .from("consumer_user_stats")
    .select("late_cancellations, very_late_cancellations")
    .eq("user_id", userId)
    .maybeSingle();

  if (cancellationType === "late") {
    await args.supabase
      .from("consumer_user_stats")
      .update({
        late_cancellations: toInt((currentStats as any)?.late_cancellations) + 1,
        last_activity_at: nowIso,
        updated_at: nowIso,
      })
      .eq("user_id", userId);
  } else if (cancellationType === "very_late") {
    await args.supabase
      .from("consumer_user_stats")
      .update({
        very_late_cancellations: toInt((currentStats as any)?.very_late_cancellations) + 1,
        last_activity_at: nowIso,
        updated_at: nowIso,
      })
      .eq("user_id", userId);
  }

  const result = await recomputeClientScoreV2({ supabase: args.supabase, userId });
  return { ...result, cancellationType };
}

/**
 * Record a review posted event.
 */
export async function recordReviewPosted(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ClientScoreResult> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return defaultScoreResult();

  await ensureStatsRow(args.supabase, userId);

  // Read-modify-write for increment
  const { data: cur } = await args.supabase
    .from("consumer_user_stats")
    .select("reviews_posted")
    .eq("user_id", userId)
    .maybeSingle();

  await args.supabase
    .from("consumer_user_stats")
    .update({
      reviews_posted: toInt((cur as any)?.reviews_posted) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return recomputeClientScoreV2(args);
}

/**
 * Record a free-to-paid upgrade event.
 */
export async function recordFreeToPaidUpgrade(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ClientScoreResult> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return defaultScoreResult();

  await ensureStatsRow(args.supabase, userId);

  // Read-modify-write for increment
  const { data: cur } = await args.supabase
    .from("consumer_user_stats")
    .select("free_to_paid_conversions")
    .eq("user_id", userId)
    .maybeSingle();

  await args.supabase
    .from("consumer_user_stats")
    .update({
      free_to_paid_conversions: toInt((cur as any)?.free_to_paid_conversions) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return recomputeClientScoreV2(args);
}

/**
 * Lift a client suspension (admin action).
 */
export async function liftSuspension(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ClientScoreResult> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return defaultScoreResult();

  await args.supabase
    .from("consumer_user_stats")
    .update({
      is_suspended: false,
      suspended_until: null,
      suspension_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return recomputeClientScoreV2(args);
}

/**
 * Check if a user is currently suspended.
 */
export async function isClientSuspended(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ suspended: boolean; until: string | null; reason: string | null }> {
  const { data } = await args.supabase
    .from("consumer_user_stats")
    .select("is_suspended, suspended_until, suspension_reason")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (!data) return { suspended: false, until: null, reason: null };

  const row = data as Record<string, unknown>;
  const isSuspended = row.is_suspended === true;
  const until = typeof row.suspended_until === "string" ? row.suspended_until : null;

  // Check if suspension has expired
  if (isSuspended && until && new Date(until) < new Date()) {
    // Auto-lift expired suspension
    await args.supabase
      .from("consumer_user_stats")
      .update({
        is_suspended: false,
        suspended_until: null,
        suspension_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", args.userId);

    return { suspended: false, until: null, reason: null };
  }

  return {
    suspended: isSuspended,
    until,
    reason: typeof row.suspension_reason === "string" ? row.suspension_reason : null,
  };
}

/**
 * Auto-lift expired suspensions (cron job).
 * Returns number of suspensions lifted.
 */
export async function autoLiftExpiredSuspensions(args: {
  supabase: SupabaseClient;
}): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data, error } = await args.supabase
    .from("consumer_user_stats")
    .update({
      is_suspended: false,
      suspended_until: null,
      suspension_reason: null,
      updated_at: nowIso,
    })
    .eq("is_suspended", true)
    .lt("suspended_until", nowIso)
    .not("suspended_until", "is", null)
    .select("user_id");

  if (error) {
    log.error({ err: error }, "autoLiftExpiredSuspensions error");
    return 0;
  }

  return (data ?? []).length;
}

// =============================================================================
// Helpers
// =============================================================================

function defaultScoreResult(): ClientScoreResult {
  return {
    score: SCORE_SCALE.BASE,
    stars: scoreToStars(SCORE_SCALE.BASE),
    level: "good",
    isSuspended: false,
    suspendedUntil: null,
    suspensionReason: null,
    stats: {
      totalReservations: 0,
      honoredReservations: 0,
      noShowsCount: 0,
      lateCancellations: 0,
      veryLateCancellations: 0,
      reviewsPosted: 0,
      freeToPaidConversions: 0,
      consecutiveHonored: 0,
      consecutiveNoShows: 0,
    },
  };
}

async function ensureStatsRow(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from("consumer_user_stats")
    .upsert(
      {
        user_id: userId,
        reliability_score: SCORE_SCALE.BASE,
        reservations_count: 0,
        no_shows_count: 0,
        honored_reservations: 0,
        late_cancellations: 0,
        very_late_cancellations: 0,
        reviews_posted: 0,
        consecutive_honored: 0,
        consecutive_no_shows: 0,
        free_to_paid_conversions: 0,
        is_suspended: false,
        total_reservations: 0,
        scoring_version: 2,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
}

function toInt(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

