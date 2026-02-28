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
import { reportSuspiciousActivity } from "./suspiciousActivity";
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

  // Alerte unifiée si suspension déclenchée
  if (shouldSuspend) {
    void reportSuspiciousActivity({
      actorType: "consumer",
      actorId: userId,
      alertType: "consumer_suspension_triggered",
      severity: "warning",
      title: "Consumer auto-suspendu",
      details: suspensionReason || `${newConsecutive} no-shows consécutifs`,
      context: { consecutive_no_shows: newConsecutive, total_no_shows: newTotal, suspension_days: suspensionDays },
      deduplicationKey: `suspension_${userId}`,
    });
  }

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
// Anti-fraud: reservation pattern detection
// =============================================================================

/** Thresholds for anti-fraud checks */
const ANTIFRAUD = {
  /** Max active reservations at the same time slot across all establishments */
  MAX_CONCURRENT_SAME_SLOT: 2,
  /** Max cancellations at the same establishment within N days */
  CANCEL_REBOOK_WINDOW_DAYS: 7,
  MAX_CANCEL_REBOOK_CYCLES: 3,
  /** Max no-shows within a rolling window of N days */
  NO_SHOW_WINDOW_DAYS: 30,
  MAX_NO_SHOWS_IN_WINDOW: 3,
} as const;

export interface AntiFraudResult {
  allowed: boolean;
  reason?: string;
  code?: "concurrent_slot_abuse" | "cancel_rebook_abuse" | "excessive_no_shows";
}

/**
 * Check for multiple bookings at the same time slot across different establishments.
 * A user booking 3+ restaurants at the same hour is suspicious.
 */
export async function checkConcurrentSlotAbuse(args: {
  supabase: SupabaseClient;
  userId: string;
  startsAt: string;
}): Promise<AntiFraudResult> {
  const { supabase, userId, startsAt } = args;

  const { count, error } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("starts_at", startsAt)
    .in("status", [
      "requested", "pending_pro_validation", "confirmed",
      "deposit_paid", "on_hold",
    ]);

  if (error) {
    log.warn({ err: error }, "checkConcurrentSlotAbuse query error");
    return { allowed: true }; // fail-open
  }

  if ((count ?? 0) >= ANTIFRAUD.MAX_CONCURRENT_SAME_SLOT) {
    return {
      allowed: false,
      reason: `Vous avez déjà ${count} réservation(s) active(s) sur ce créneau. Limite : ${ANTIFRAUD.MAX_CONCURRENT_SAME_SLOT}.`,
      code: "concurrent_slot_abuse",
    };
  }

  return { allowed: true };
}

/**
 * Detect rapid cancel/rebook cycles at the same establishment.
 * If a user cancelled N+ times at the same restaurant in the last 7 days,
 * block new bookings there.
 */
export async function checkCancelRebookAbuse(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
}): Promise<AntiFraudResult> {
  const { supabase, userId, establishmentId } = args;

  const windowStart = new Date(
    Date.now() - ANTIFRAUD.CANCEL_REBOOK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count, error } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .in("status", [
      "cancelled_by_client", "cancelled_late", "cancelled_very_late",
    ])
    .gte("cancelled_at", windowStart);

  if (error) {
    log.warn({ err: error }, "checkCancelRebookAbuse query error");
    return { allowed: true };
  }

  if ((count ?? 0) >= ANTIFRAUD.MAX_CANCEL_REBOOK_CYCLES) {
    return {
      allowed: false,
      reason: `Trop d'annulations récentes dans cet établissement (${count} en ${ANTIFRAUD.CANCEL_REBOOK_WINDOW_DAYS}j). Veuillez réessayer plus tard.`,
      code: "cancel_rebook_abuse",
    };
  }

  return { allowed: true };
}

/**
 * Detect excessive no-shows in a rolling time window.
 * Different from consecutive_no_shows (which resets on honored).
 * This checks raw count within the last N days.
 */
export async function checkExcessiveNoShows(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<AntiFraudResult> {
  const { supabase, userId } = args;

  const windowStart = new Date(
    Date.now() - ANTIFRAUD.NO_SHOW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count, error } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "no_show")
    .gte("updated_at", windowStart);

  if (error) {
    log.warn({ err: error }, "checkExcessiveNoShows query error");
    return { allowed: true };
  }

  if ((count ?? 0) >= ANTIFRAUD.MAX_NO_SHOWS_IN_WINDOW) {
    return {
      allowed: false,
      reason: `Trop de no-shows récents (${count} en ${ANTIFRAUD.NO_SHOW_WINDOW_DAYS} jours). Votre compte a été restreint.`,
      code: "excessive_no_shows",
    };
  }

  return { allowed: true };
}

/**
 * Run all anti-fraud checks for a reservation creation attempt.
 * Returns the first failed check, or { allowed: true } if all pass.
 */
export async function runAntiFraudChecks(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  startsAt: string;
}): Promise<AntiFraudResult> {
  const [concurrent, cancelRebook, noShows] = await Promise.all([
    checkConcurrentSlotAbuse(args),
    checkCancelRebookAbuse(args),
    checkExcessiveNoShows(args),
  ]);

  const blocked = !concurrent.allowed ? concurrent
    : !cancelRebook.allowed ? cancelRebook
    : !noShows.allowed ? noShows
    : null;

  if (blocked) {
    const alertTypeMap: Record<string, "consumer_concurrent_slot_abuse" | "consumer_cancel_rebook_abuse" | "consumer_excessive_no_shows"> = {
      concurrent_slot_abuse: "consumer_concurrent_slot_abuse",
      cancel_rebook_abuse: "consumer_cancel_rebook_abuse",
      excessive_no_shows: "consumer_excessive_no_shows",
    };
    void reportSuspiciousActivity({
      actorType: "consumer",
      actorId: args.userId,
      alertType: alertTypeMap[blocked.code ?? ""] ?? "consumer_excessive_no_shows",
      severity: "warning",
      title: `Anti-fraude : ${blocked.code ?? "unknown"}`,
      details: blocked.reason ?? "Réservation bloquée par anti-fraude",
      establishmentId: args.establishmentId,
      deduplicationKey: `antifraud_${blocked.code}_${args.userId}`,
    });
    return blocked;
  }

  return { allowed: true };
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

