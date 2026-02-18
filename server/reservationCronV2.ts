/**
 * Reservation V2 Cron Jobs
 *
 * All automated periodic tasks for the V2 reservation system.
 * Each function is designed to be called from an HTTP endpoint
 * protected by `x-cron-secret` header validation.
 *
 * Recommended schedule:
 *   - expireUnprocessedReservations   : every 15 min
 *   - remindProUnprocessedReservations: every 30 min
 *   - requestVenueConfirmation (H+12) : every 30 min
 *   - remindVenueConfirmation  (H+18) : every 15 min
 *   - autoValidateVenue        (H+24) : every 15 min
 *   - expireNoShowDisputesCron         : every 1 hour
 *   - freezeBufferSlots       (H-3)   : every 15 min
 *   - sendUpgradeReminders    (J-2/J-1): daily at 10:00
 *   - recalculateProTrustScores        : daily at 03:00
 *   - autoLiftClientSuspensionsCron    : daily at 04:00
 *   - autoLiftProDeactivationsCron     : daily at 04:30
 *   - detectScoringPatterns            : daily at 05:00
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "./supabaseAdmin";
import { sendTemplateEmail } from "./emailService";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import { RESERVATION_TIMINGS } from "../shared/reservationTypesV2";
import { expireUnrespondedDisputes } from "./noShowDisputeLogic";
import { autoLiftExpiredSuspensions, recomputeClientScoreV2 } from "./clientScoringV2";
import { expireUnacknowledgedQuotes, expireUnsentQuotes } from "./quoteRequestLogic";
import { recordHonoredReservation } from "./clientScoringV2";

const BASE_URL = process.env.VITE_APP_URL || "https://sam.ma";

// =============================================================================
// Types
// =============================================================================

export interface CronResult {
  job: string;
  processed: number;
  errors: number;
  details?: unknown;
}

// =============================================================================
// 1. Expire unprocessed reservations (pro didn't respond in time)
// =============================================================================

/**
 * Expire reservations where pro didn't accept/refuse before deadline.
 * Transitions: pending_pro_validation → expired, on_hold → expired
 * Schedule: every 15 min
 */
export async function expireUnprocessedReservations(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Find reservations past pro processing deadline
  const { data: expired, error } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, status, starts_at, party_size, booking_reference")
    .in("status", ["pending_pro_validation", "on_hold"])
    .lt("pro_processing_deadline", nowIso)
    .not("pro_processing_deadline", "is", null);

  if (error) {
    console.error("[expireUnprocessedReservations] Fetch error:", error);
    return { job: "expire_unprocessed", processed: 0, errors: 1 };
  }

  if (!expired || expired.length === 0) {
    return { job: "expire_unprocessed", processed: 0, errors: 0 };
  }

  console.log(`[expireUnprocessedReservations] Found ${expired.length} reservations to expire`);

  for (const row of expired as Record<string, unknown>[]) {
    try {
      const reservationId = String(row.id);
      const userId = String(row.user_id ?? "");
      const establishmentId = String(row.establishment_id ?? "");

      // Transition to expired
      await supabase
        .from("reservations")
        .update({
          status: "expired",
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      // Notify client
      void notifyUserReservationExpired({
        supabase,
        userId,
        establishmentId,
        reservationId,
        startsAt: String(row.starts_at ?? ""),
      });

      // Notify admin
      void emitAdminNotification({
        type: "reservation_expired",
        title: "Réservation expirée (pro non-réponse)",
        body: `Réservation ${String(row.booking_reference ?? reservationId).slice(0, 8)} expirée — le pro n'a pas répondu dans le délai.`,
        data: { reservationId, establishmentId },
      });

      processed++;
    } catch (err) {
      console.error("[expireUnprocessedReservations] Error:", err);
      errors++;
    }
  }

  return { job: "expire_unprocessed", processed, errors };
}

// =============================================================================
// 2. Remind pro about unprocessed reservations
// =============================================================================

/**
 * Send reminder to pro for pending reservations approaching deadline.
 * Triggers when deadline is within 2 hours.
 * Schedule: every 30 min
 */
export async function remindProUnprocessedReservations(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const now = Date.now();
  const twoHoursFromNow = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Find pending reservations with deadline approaching within 2h (not yet reminded)
  const { data: pending, error } = await supabase
    .from("reservations")
    .select("id, establishment_id, party_size, starts_at, booking_reference, meta")
    .in("status", ["pending_pro_validation", "on_hold"])
    .gt("pro_processing_deadline", nowIso)
    .lt("pro_processing_deadline", twoHoursFromNow)
    .not("pro_processing_deadline", "is", null);

  if (error || !pending || pending.length === 0) {
    return { job: "remind_pro_unprocessed", processed: 0, errors: error ? 1 : 0 };
  }

  for (const row of pending as Record<string, unknown>[]) {
    try {
      const reservationId = String(row.id);
      const meta = (row.meta ?? {}) as Record<string, unknown>;

      // Skip if already reminded
      if (meta.pro_deadline_reminded === true) continue;

      const establishmentId = String(row.establishment_id ?? "");

      // Send reminder to pro
      await notifyProMembers({
        supabase,
        establishmentId,
        category: "booking",
        title: "Rappel : réservation en attente",
        body: `Réservation ${String(row.booking_reference ?? reservationId).slice(0, 8)} — ${row.party_size} pers. Le délai de traitement expire bientôt.`,
        data: { action: "pro_deadline_reminder", reservationId },
      });

      // Mark as reminded (using meta JSONB)
      await supabase
        .from("reservations")
        .update({
          meta: { ...meta, pro_deadline_reminded: true },
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      processed++;
    } catch (err) {
      console.error("[remindProUnprocessedReservations] Error:", err);
      errors++;
    }
  }

  return { job: "remind_pro_unprocessed", processed, errors };
}

// =============================================================================
// 3. H+12 — Request venue confirmation from pro
// =============================================================================

/**
 * After reservation time + 12h, ask pro if client came.
 * Only for confirmed/deposit_paid reservations that haven't been checked in.
 * Schedule: every 30 min
 */
export async function requestVenueConfirmation(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const now = Date.now();
  const h12Ago = new Date(now - RESERVATION_TIMINGS.VENUE_CONFIRMATION_REQUEST_HOURS * 60 * 60 * 1000).toISOString();
  const h18Ago = new Date(now - RESERVATION_TIMINGS.VENUE_CONFIRMATION_REMINDER_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Find reservations that started >12h ago but <18h ago, not yet venue-confirmed
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, starts_at, party_size, booking_reference, pro_confirmation_requested_at")
    .in("status", ["confirmed", "deposit_paid"])
    .lt("starts_at", h12Ago)
    .gt("starts_at", h18Ago)
    .is("checked_in_at", null)
    .is("pro_confirmation_requested_at", null);

  if (error || !reservations || reservations.length === 0) {
    return { job: "venue_confirmation_h12", processed: 0, errors: error ? 1 : 0 };
  }

  console.log(`[requestVenueConfirmation] Found ${reservations.length} reservations for H+12 confirmation`);

  for (const row of reservations as Record<string, unknown>[]) {
    try {
      const reservationId = String(row.id);
      const establishmentId = String(row.establishment_id ?? "");

      // Set confirmation deadline (H+24)
      const startsAt = new Date(String(row.starts_at ?? ""));
      const confirmDeadline = new Date(
        startsAt.getTime() + RESERVATION_TIMINGS.VENUE_AUTO_VALIDATION_HOURS * 60 * 60 * 1000,
      ).toISOString();

      // Mark as confirmation requested
      await supabase
        .from("reservations")
        .update({
          pro_confirmation_requested_at: nowIso,
          pro_confirmation_deadline: confirmDeadline,
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      // Notify pro
      await notifyProMembers({
        supabase,
        establishmentId,
        category: "booking",
        title: "Confirmation de venue requise",
        body: `Le client est-il venu pour la réservation ${String(row.booking_reference ?? reservationId).slice(0, 8)} (${row.party_size} pers.) ? Répondez avant l'auto-validation.`,
        data: { action: "venue_confirmation_request", reservationId },
      });

      processed++;
    } catch (err) {
      console.error("[requestVenueConfirmation] Error:", err);
      errors++;
    }
  }

  return { job: "venue_confirmation_h12", processed, errors };
}

// =============================================================================
// 4. H+18 — Remind pro about venue confirmation
// =============================================================================

/**
 * Second nudge: remind pro who hasn't confirmed venue after H+18.
 * Schedule: every 15 min
 */
export async function remindVenueConfirmation(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const now = Date.now();
  const h18Ago = new Date(now - RESERVATION_TIMINGS.VENUE_CONFIRMATION_REMINDER_HOURS * 60 * 60 * 1000).toISOString();
  const h24Ago = new Date(now - RESERVATION_TIMINGS.VENUE_AUTO_VALIDATION_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Find reservations: started >18h ago but <24h ago, confirmation requested but not responded
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, establishment_id, party_size, booking_reference, meta")
    .in("status", ["confirmed", "deposit_paid"])
    .lt("starts_at", h18Ago)
    .gt("starts_at", h24Ago)
    .is("checked_in_at", null)
    .not("pro_confirmation_requested_at", "is", null)
    .is("pro_venue_responded_at", null);

  if (error || !reservations || reservations.length === 0) {
    return { job: "venue_confirmation_h18", processed: 0, errors: error ? 1 : 0 };
  }

  for (const row of reservations as Record<string, unknown>[]) {
    try {
      const reservationId = String(row.id);
      const meta = (row.meta ?? {}) as Record<string, unknown>;

      // Skip if already reminded at H+18
      if (meta.venue_h18_reminded === true) continue;

      const establishmentId = String(row.establishment_id ?? "");

      await notifyProMembers({
        supabase,
        establishmentId,
        category: "booking",
        title: "RAPPEL URGENT : Confirmation de venue",
        body: `Réservation ${String(row.booking_reference ?? reservationId).slice(0, 8)} — Confirmez la venue du client avant l'auto-validation automatique.`,
        data: { action: "venue_confirmation_reminder", reservationId },
      });

      // Mark as H+18 reminded
      await supabase
        .from("reservations")
        .update({
          meta: { ...meta, venue_h18_reminded: true },
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      processed++;
    } catch (err) {
      console.error("[remindVenueConfirmation] Error:", err);
      errors++;
    }
  }

  return { job: "venue_confirmation_h18", processed, errors };
}

// =============================================================================
// 5. H+24 — Auto-validate (consumed_default)
// =============================================================================

/**
 * If pro didn't respond to venue confirmation after H+24,
 * auto-validate as consumed_default (benefit of the doubt to client).
 * Schedule: every 15 min
 */
export async function autoValidateVenue(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Find reservations past confirmation deadline, still not responded
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, booking_reference")
    .in("status", ["confirmed", "deposit_paid"])
    .is("checked_in_at", null)
    .is("pro_venue_responded_at", null)
    .not("pro_confirmation_deadline", "is", null)
    .lt("pro_confirmation_deadline", nowIso);

  if (error || !reservations || reservations.length === 0) {
    return { job: "auto_validate_h24", processed: 0, errors: error ? 1 : 0 };
  }

  console.log(`[autoValidateVenue] Found ${reservations.length} reservations for H+24 auto-validation`);

  for (const row of reservations as Record<string, unknown>[]) {
    try {
      const reservationId = String(row.id);
      const userId = String(row.user_id ?? "");
      const establishmentId = String(row.establishment_id ?? "");

      // Auto-validate as consumed_default
      await supabase
        .from("reservations")
        .update({
          status: "consumed_default",
          auto_validated_at: nowIso,
          checked_in_at: nowIso, // Set checked_in_at for review system compatibility
          consumed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      // Record as honored for scoring (benefit of doubt)
      if (userId) {
        void recordHonoredReservation({ supabase, userId });
      }

      // Notify pro that auto-validation happened
      void notifyProMembers({
        supabase,
        establishmentId,
        category: "booking",
        title: "Auto-validation (H+24)",
        body: `La réservation ${String(row.booking_reference ?? reservationId).slice(0, 8)} a été auto-validée car vous n'avez pas confirmé la venue dans le délai.`,
        data: { action: "auto_validated", reservationId },
      });

      // Notify admin
      void emitAdminNotification({
        type: "reservation_auto_validated",
        title: "Réservation auto-validée (H+24)",
        body: `Réservation ${String(row.booking_reference ?? reservationId).slice(0, 8)} — pro n'a pas répondu en 24h.`,
        data: { reservationId, establishmentId },
      });

      processed++;
    } catch (err) {
      console.error("[autoValidateVenue] Error:", err);
      errors++;
    }
  }

  return { job: "auto_validate_h24", processed, errors };
}

// =============================================================================
// 6. Expire no-show dispute client responses (48h)
// =============================================================================

/**
 * Delegates to noShowDisputeLogic.expireUnrespondedDisputes().
 * Schedule: every 1 hour
 */
export async function expireNoShowDisputesCron(): Promise<CronResult> {
  const supabase = getAdminSupabase();

  try {
    const result = await expireUnrespondedDisputes({ supabase });
    return { job: "expire_no_show_disputes", processed: result.expired, errors: 0 };
  } catch (err) {
    console.error("[expireNoShowDisputesCron] Error:", err);
    return { job: "expire_no_show_disputes", processed: 0, errors: 1 };
  }
}

// =============================================================================
// 7. Buffer freeze (H-3) — Block free reservations in protection window
// =============================================================================

/**
 * Mark free reservations entering the protection window (H-3).
 * This is informational — the actual blocking is done by allocateStock() in capacityManager.
 * We also check for free reservations that haven't been confirmed and send final reminders.
 * Schedule: every 15 min
 */
export async function freezeBufferSlots(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const now = Date.now();
  const h3FromNow = new Date(now + RESERVATION_TIMINGS.PROTECTION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Find free reservations starting within 3h that haven't been reminded about upgrade
  const { data: freeReservations, error } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, starts_at, party_size, booking_reference, meta")
    .eq("payment_type", "free")
    .in("status", ["confirmed", "pending_pro_validation"])
    .lt("starts_at", h3FromNow)
    .gt("starts_at", nowIso);

  if (error || !freeReservations || freeReservations.length === 0) {
    return { job: "freeze_buffer_h3", processed: 0, errors: error ? 1 : 0 };
  }

  for (const row of freeReservations as Record<string, unknown>[]) {
    try {
      const reservationId = String(row.id);
      const meta = (row.meta ?? {}) as Record<string, unknown>;

      // Skip if already reminded about H-3 freeze
      if (meta.h3_freeze_reminded === true) continue;

      const userId = String(row.user_id ?? "");

      // Send final reminder to client
      void notifyUserProtectionWindow({
        supabase,
        userId,
        establishmentId: String(row.establishment_id ?? ""),
        reservationId,
        startsAt: String(row.starts_at ?? ""),
      });

      // Mark as reminded
      await supabase
        .from("reservations")
        .update({
          meta: { ...meta, h3_freeze_reminded: true },
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      processed++;
    } catch (err) {
      console.error("[freezeBufferSlots] Error:", err);
      errors++;
    }
  }

  return { job: "freeze_buffer_h3", processed, errors };
}

// =============================================================================
// 8. Upgrade reminders (J-2 / J-1)
// =============================================================================

/**
 * Send upgrade reminders to users with free reservations.
 * J-2: gentle reminder. J-1: last chance.
 * Schedule: daily at 10:00
 */
export async function sendUpgradeReminders(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const now = Date.now();
  const nowIso = new Date().toISOString();

  // J-2 window: reservations starting between 44h and 52h from now
  const j2Start = new Date(now + 44 * 60 * 60 * 1000).toISOString();
  const j2End = new Date(now + 52 * 60 * 60 * 1000).toISOString();

  // J-1 window: reservations starting between 20h and 28h from now
  const j1Start = new Date(now + 20 * 60 * 60 * 1000).toISOString();
  const j1End = new Date(now + 28 * 60 * 60 * 1000).toISOString();

  let processed = 0;
  let errors = 0;

  // J-2 reminders
  const { data: j2Reservations } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, starts_at, party_size, meta")
    .eq("payment_type", "free")
    .in("status", ["confirmed", "pending_pro_validation"])
    .gt("starts_at", j2Start)
    .lt("starts_at", j2End);

  for (const row of (j2Reservations ?? []) as Record<string, unknown>[]) {
    try {
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      if (meta.upgrade_j2_reminded === true) continue;

      const reservationId = String(row.id);

      void notifyUserUpgradeReminder({
        supabase,
        userId: String(row.user_id ?? ""),
        establishmentId: String(row.establishment_id ?? ""),
        reservationId,
        startsAt: String(row.starts_at ?? ""),
        isLastChance: false,
      });

      await supabase
        .from("reservations")
        .update({
          meta: { ...meta, upgrade_j2_reminded: true },
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      processed++;
    } catch (err) {
      errors++;
    }
  }

  // J-1 reminders
  const { data: j1Reservations } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, starts_at, party_size, meta")
    .eq("payment_type", "free")
    .in("status", ["confirmed", "pending_pro_validation"])
    .gt("starts_at", j1Start)
    .lt("starts_at", j1End);

  for (const row of (j1Reservations ?? []) as Record<string, unknown>[]) {
    try {
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      if (meta.upgrade_j1_reminded === true) continue;

      const reservationId = String(row.id);

      void notifyUserUpgradeReminder({
        supabase,
        userId: String(row.user_id ?? ""),
        establishmentId: String(row.establishment_id ?? ""),
        reservationId,
        startsAt: String(row.starts_at ?? ""),
        isLastChance: true,
      });

      await supabase
        .from("reservations")
        .update({
          meta: { ...meta, upgrade_j1_reminded: true },
          updated_at: nowIso,
        })
        .eq("id", reservationId);

      processed++;
    } catch (err) {
      errors++;
    }
  }

  return { job: "upgrade_reminders", processed, errors };
}

// =============================================================================
// 9. Recalculate pro trust scores (daily)
// =============================================================================

/**
 * Recalculate trust scores for all active establishments.
 * Aggregates: response rate, avg response time, cancellation rate, false no-show count.
 * Schedule: daily at 03:00
 */
export async function recalculateProTrustScores(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();
  let processed = 0;
  let errors = 0;

  // Get all establishments with reservation activity in last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: establishments, error } = await supabase
    .from("reservations")
    .select("establishment_id")
    .gt("created_at", ninetyDaysAgo)
    .not("establishment_id", "is", null);

  if (error || !establishments) {
    return { job: "recalculate_pro_trust", processed: 0, errors: 1 };
  }

  // Unique establishment IDs
  const estIdSet = new Set((establishments as Record<string, unknown>[]).map((e) => String(e.establishment_id)));
  const estIds = Array.from(estIdSet);

  for (const estId of estIds) {
    try {
      // Count total reservations (not cancelled by user)
      const { count: totalRes } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("establishment_id", estId)
        .gt("created_at", ninetyDaysAgo)
        .not("status", "in", "(cancelled_user,cancelled_waitlist_expired)");

      // Count reservations responded to by pro (accepted/refused/on_hold)
      const { count: respondedRes } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("establishment_id", estId)
        .gt("created_at", ninetyDaysAgo)
        .in("status", [
          "confirmed", "refused", "on_hold", "consumed", "consumed_default",
          "noshow", "no_show_confirmed", "no_show_disputed",
          "cancelled_pro", "deposit_requested", "deposit_paid",
        ]);

      // Count pro cancellations
      const { count: proCancels } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("establishment_id", estId)
        .eq("status", "cancelled_pro")
        .gt("created_at", ninetyDaysAgo);

      // Get false no-show count from existing trust record
      const { data: existingTrust } = await supabase
        .from("pro_trust_scores")
        .select("false_no_show_count, sanctions_count, current_sanction, deactivated_until")
        .eq("establishment_id", estId)
        .maybeSingle();

      const total = totalRes ?? 0;
      const responded = respondedRes ?? 0;
      const cancels = proCancels ?? 0;

      const responseRate = total > 0 ? Math.round((responded / total) * 100) : 100;
      const cancellationRate = total > 0 ? Math.round((cancels / total) * 100) : 0;

      // Compute trust score (simple weighted formula)
      let trustScore = 100;
      trustScore -= Math.max(0, (100 - responseRate)) * 0.4;
      trustScore -= cancellationRate * 0.3;
      const falseNoShows = (existingTrust as any)?.false_no_show_count ?? 0;
      trustScore -= falseNoShows * 10;
      trustScore = Math.max(0, Math.min(100, Math.round(trustScore)));

      // Upsert trust score
      await supabase
        .from("pro_trust_scores")
        .upsert(
          {
            establishment_id: estId,
            trust_score: trustScore,
            response_rate: responseRate,
            avg_response_time_minutes: 0, // TODO: compute from timestamps
            false_no_show_count: falseNoShows,
            total_disputes: (existingTrust as any)?.total_disputes ?? 0,
            cancellation_rate: cancellationRate,
            sanctions_count: (existingTrust as any)?.sanctions_count ?? 0,
            current_sanction: (existingTrust as any)?.current_sanction ?? "none",
            deactivated_until: (existingTrust as any)?.deactivated_until ?? null,
            last_calculated_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "establishment_id" },
        );

      processed++;
    } catch (err) {
      console.error("[recalculateProTrustScores] Error for", estId, err);
      errors++;
    }
  }

  return { job: "recalculate_pro_trust", processed, errors };
}

// =============================================================================
// 10. Auto-lift client suspensions (daily)
// =============================================================================

/**
 * Lift expired client suspensions.
 * Delegates to clientScoringV2.autoLiftExpiredSuspensions().
 * Schedule: daily at 04:00
 */
export async function autoLiftClientSuspensionsCron(): Promise<CronResult> {
  const supabase = getAdminSupabase();

  try {
    const lifted = await autoLiftExpiredSuspensions({ supabase });
    if (lifted > 0) {
      console.log(`[autoLiftClientSuspensions] Lifted ${lifted} expired suspensions`);
    }
    return { job: "auto_lift_client_suspensions", processed: lifted, errors: 0 };
  } catch (err) {
    console.error("[autoLiftClientSuspensionsCron] Error:", err);
    return { job: "auto_lift_client_suspensions", processed: 0, errors: 1 };
  }
}

// =============================================================================
// 11. Auto-lift pro deactivations (daily)
// =============================================================================

/**
 * Lift expired pro establishment deactivations.
 * Schedule: daily at 04:30
 */
export async function autoLiftProDeactivationsCron(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  try {
    // Find deactivated establishments where deactivation has expired
    const { data: expired, error } = await supabase
      .from("pro_trust_scores")
      .select("establishment_id, current_sanction, deactivated_until")
      .in("current_sanction", ["deactivated_7d", "deactivated_30d"])
      .lt("deactivated_until", nowIso)
      .not("deactivated_until", "is", null);

    if (error || !expired || expired.length === 0) {
      return { job: "auto_lift_pro_deactivations", processed: 0, errors: error ? 1 : 0 };
    }

    for (const row of expired as Record<string, unknown>[]) {
      const estId = String(row.establishment_id);

      await supabase
        .from("pro_trust_scores")
        .update({
          current_sanction: "none",
          deactivated_until: null,
          updated_at: nowIso,
        })
        .eq("establishment_id", estId);

      // Notify pro
      void notifyProMembers({
        supabase,
        establishmentId: estId,
        category: "system",
        title: "Désactivation levée",
        body: "Votre établissement est de nouveau actif. Veuillez maintenir un comportement exemplaire.",
        data: { action: "deactivation_lifted" },
      });
    }

    console.log(`[autoLiftProDeactivations] Lifted ${expired.length} deactivations`);
    return { job: "auto_lift_pro_deactivations", processed: expired.length, errors: 0 };
  } catch (err) {
    console.error("[autoLiftProDeactivationsCron] Error:", err);
    return { job: "auto_lift_pro_deactivations", processed: 0, errors: 1 };
  }
}

// =============================================================================
// 12. Detect scoring patterns (daily)
// =============================================================================

/**
 * Detect suspicious patterns and alert admin.
 * Checks: serial cancellers, frequent no-shows, rapid score drops.
 * Schedule: daily at 05:00
 */
export async function detectScoringPatterns(): Promise<CronResult> {
  const supabase = getAdminSupabase();
  const alerts: Array<{ userId: string; pattern: string; details: string }> = [];

  try {
    // Pattern 1: Users with consecutive_no_shows >= 2 (approaching suspension)
    const { data: nearSuspension } = await supabase
      .from("consumer_user_stats")
      .select("user_id, consecutive_no_shows, no_shows_count, reliability_score")
      .gte("consecutive_no_shows", 2)
      .eq("is_suspended", false);

    for (const row of (nearSuspension ?? []) as Record<string, unknown>[]) {
      alerts.push({
        userId: String(row.user_id),
        pattern: "approaching_suspension",
        details: `${row.consecutive_no_shows} no-shows consécutifs (score: ${row.reliability_score})`,
      });
    }

    // Pattern 2: Users with very low scores still active
    const { data: lowScore } = await supabase
      .from("consumer_user_stats")
      .select("user_id, reliability_score, no_shows_count, late_cancellations, very_late_cancellations")
      .lt("reliability_score", 20)
      .eq("is_suspended", false);

    for (const row of (lowScore ?? []) as Record<string, unknown>[]) {
      alerts.push({
        userId: String(row.user_id),
        pattern: "very_low_score",
        details: `Score ${row.reliability_score}/100 — ${row.no_shows_count} no-shows, ${row.late_cancellations} late cancels, ${row.very_late_cancellations} very late cancels`,
      });
    }

    // Pattern 3: Establishments with high false no-show count
    const { data: falseNoShowPros } = await supabase
      .from("pro_trust_scores")
      .select("establishment_id, false_no_show_count, trust_score")
      .gte("false_no_show_count", 2);

    for (const row of (falseNoShowPros ?? []) as Record<string, unknown>[]) {
      alerts.push({
        userId: String(row.establishment_id),
        pattern: "pro_false_no_shows",
        details: `${row.false_no_show_count} fausses déclarations de no-show (trust score: ${row.trust_score})`,
      });
    }

    // Emit summary to admin
    if (alerts.length > 0) {
      void emitAdminNotification({
        type: "scoring_patterns_detected",
        title: `${alerts.length} pattern(s) détecté(s)`,
        body: alerts.slice(0, 5).map((a) => `${a.pattern}: ${a.details}`).join("\n"),
        data: { alertCount: alerts.length, alerts: alerts.slice(0, 20) },
      });
    }

    return { job: "detect_scoring_patterns", processed: alerts.length, errors: 0 };
  } catch (err) {
    console.error("[detectScoringPatterns] Error:", err);
    return { job: "detect_scoring_patterns", processed: 0, errors: 1 };
  }
}

// =============================================================================
// 13. Expire quotes (delegated)
// =============================================================================

/**
 * Combined cron for expiring quote requests.
 * - Unacknowledged (48h)
 * - Unsent (7d after acknowledgement)
 * Schedule: every 1 hour
 */
export async function expireQuotesCron(): Promise<CronResult> {
  const supabase = getAdminSupabase();

  try {
    const r1 = await expireUnacknowledgedQuotes({ supabase });
    const r2 = await expireUnsentQuotes({ supabase });

    return {
      job: "expire_quotes",
      processed: r1.expired + r2.expired,
      errors: 0,
      details: { unacknowledged: r1.expired, unsent: r2.expired },
    };
  } catch (err) {
    console.error("[expireQuotesCron] Error:", err);
    return { job: "expire_quotes", processed: 0, errors: 1 };
  }
}

// =============================================================================
// Master runner — runs all cron jobs (useful for single endpoint)
// =============================================================================

// =============================================================================
// Scheduling configuration
// =============================================================================

type CronSchedule = "every_5min" | "every_15min" | "every_30min" | "every_1h" | "daily";

interface CronJobConfig {
  fn: () => Promise<CronResult>;
  schedule: CronSchedule;
  /** For daily jobs: hour (0-23) in server timezone when job should run */
  dailyHour?: number;
  /** For daily jobs: minute (0-59) when job should run */
  dailyMinute?: number;
}

const CRON_JOB_CONFIGS: Record<string, CronJobConfig> = {
  expire_unprocessed: { fn: expireUnprocessedReservations, schedule: "every_15min" },
  remind_pro_unprocessed: { fn: remindProUnprocessedReservations, schedule: "every_30min" },
  venue_confirmation_h12: { fn: requestVenueConfirmation, schedule: "every_30min" },
  venue_confirmation_h18: { fn: remindVenueConfirmation, schedule: "every_15min" },
  auto_validate_h24: { fn: autoValidateVenue, schedule: "every_15min" },
  expire_no_show_disputes: { fn: expireNoShowDisputesCron, schedule: "every_1h" },
  freeze_buffer_h3: { fn: freezeBufferSlots, schedule: "every_15min" },
  upgrade_reminders: { fn: sendUpgradeReminders, schedule: "daily", dailyHour: 10, dailyMinute: 0 },
  recalculate_pro_trust: { fn: recalculateProTrustScores, schedule: "daily", dailyHour: 3, dailyMinute: 0 },
  auto_lift_client_suspensions: { fn: autoLiftClientSuspensionsCron, schedule: "daily", dailyHour: 4, dailyMinute: 0 },
  auto_lift_pro_deactivations: { fn: autoLiftProDeactivationsCron, schedule: "daily", dailyHour: 4, dailyMinute: 30 },
  detect_scoring_patterns: { fn: detectScoringPatterns, schedule: "daily", dailyHour: 5, dailyMinute: 0 },
  expire_quotes: { fn: expireQuotesCron, schedule: "every_1h" },
};

/**
 * Check if a job is due to run right now, based on its schedule and the
 * caller interval (designed for a 5-minute Plesk cron calling /run-all).
 *
 * The caller runs every 5 min at :00, :05, :10 … :55.
 *
 * - every_5min  → always run
 * - every_15min → run at :00, :15, :30, :45
 * - every_30min → run at :00, :30
 * - every_1h    → run at :00
 * - daily       → run when current hour:minute matches dailyHour:dailyMinute (±4 min)
 */
function isJobDueNow(config: CronJobConfig, now: Date): boolean {
  const minute = now.getMinutes();
  const hour = now.getHours();

  switch (config.schedule) {
    case "every_5min":
      return true;
    case "every_15min":
      return minute % 15 < 5; // 0-4, 15-19, 30-34, 45-49
    case "every_30min":
      return minute % 30 < 5; // 0-4, 30-34
    case "every_1h":
      return minute < 5; // 0-4
    case "daily": {
      const targetHour = config.dailyHour ?? 3;
      const targetMinute = config.dailyMinute ?? 0;
      return hour === targetHour && Math.abs(minute - targetMinute) < 5;
    }
    default:
      return true;
  }
}

/**
 * Run cron jobs. Supports three modes:
 *
 * 1. `only: [...]` — Run only the specified jobs (ignores schedule)
 * 2. `smart: true` — Run only jobs that are due based on current time (default for /run-all)
 * 3. `smart: false` — Run ALL 13 jobs regardless of schedule
 *
 * Recommended Plesk cron: call POST /api/admin/cron/v2/run-all every 5 minutes.
 * The smart scheduler will decide which jobs to actually execute.
 */
export async function runAllCronJobs(args?: {
  only?: string[];
  smart?: boolean;
}): Promise<CronResult[]> {
  const only = args?.only;
  const smart = args?.smart ?? true; // default: smart scheduling

  let jobsToRun: Array<[string, CronJobConfig]>;

  if (only) {
    // Explicit job selection (ignores schedule)
    jobsToRun = Object.entries(CRON_JOB_CONFIGS).filter(([key]) => only.includes(key));
  } else if (smart) {
    // Smart scheduling: only run jobs that are due
    const now = new Date();
    jobsToRun = Object.entries(CRON_JOB_CONFIGS).filter(([, config]) => isJobDueNow(config, now));
    console.log(`[runAllCronJobs] Smart mode: ${jobsToRun.length}/${Object.keys(CRON_JOB_CONFIGS).length} jobs due at ${now.toISOString()}`);
  } else {
    // Force all
    jobsToRun = Object.entries(CRON_JOB_CONFIGS);
  }

  const results: CronResult[] = [];

  for (const [name, config] of jobsToRun) {
    const start = Date.now();
    try {
      const result = await config.fn();
      const durationMs = Date.now() - start;
      console.log(`[runAllCronJobs] ✓ ${name} processed=${result.processed} errors=${result.errors} (${durationMs}ms)`);
      results.push(result);
    } catch (err) {
      const durationMs = Date.now() - start;
      console.error(`[runAllCronJobs] ✗ ${name} FAILED after ${durationMs}ms:`, err);
      results.push({ job: name, processed: 0, errors: 1, details: String(err) });
    }
  }

  return results;
}

/** Get the list of all configured cron jobs with their schedules (for admin display) */
export function getCronJobSchedules(): Array<{ name: string; schedule: CronSchedule; dailyHour?: number; dailyMinute?: number }> {
  return Object.entries(CRON_JOB_CONFIGS).map(([name, config]) => ({
    name,
    schedule: config.schedule,
    dailyHour: config.dailyHour,
    dailyMinute: config.dailyMinute,
  }));
}

// =============================================================================
// Notification helpers
// =============================================================================

async function notifyUserReservationExpired(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  reservationId: string;
  startsAt: string;
}): Promise<void> {
  try {
    const { data: user } = await args.supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();

    const email = typeof (user as any)?.email === "string" ? String((user as any).email).trim() : "";
    if (!email) return;

    const { data: est } = await args.supabase
      .from("establishments")
      .select("name")
      .eq("id", args.establishmentId)
      .maybeSingle();

    await sendTemplateEmail({
      templateKey: "reservation_expired_no_pro_response",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: (user as any)?.full_name || "",
        establishment_name: (est as any)?.name || "",
        reservation_url: `${BASE_URL}/mes-reservations`,
      },
      meta: {
        source: "reservationCronV2.expireUnprocessedReservations",
        reservation_id: args.reservationId,
      },
    });
  } catch (err) {
    console.error("[notifyUserReservationExpired] Error:", err);
  }
}

async function notifyUserProtectionWindow(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  reservationId: string;
  startsAt: string;
}): Promise<void> {
  try {
    const { data: user } = await args.supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();

    const email = typeof (user as any)?.email === "string" ? String((user as any).email).trim() : "";
    if (!email) return;

    const { data: est } = await args.supabase
      .from("establishments")
      .select("name")
      .eq("id", args.establishmentId)
      .maybeSingle();

    const startsAt = new Date(args.startsAt);
    const timeStr = startsAt.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Casablanca",
    }).replace(":", "h");

    await sendTemplateEmail({
      templateKey: "reservation_protection_window",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: (user as any)?.full_name || "",
        establishment_name: (est as any)?.name || "",
        time: timeStr,
        upgrade_url: `${BASE_URL}/mes-reservations/${args.reservationId}/upgrade`,
      },
      meta: {
        source: "reservationCronV2.freezeBufferSlots",
        reservation_id: args.reservationId,
      },
    });
  } catch (err) {
    console.error("[notifyUserProtectionWindow] Error:", err);
  }
}

async function notifyUserUpgradeReminder(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  reservationId: string;
  startsAt: string;
  isLastChance: boolean;
}): Promise<void> {
  try {
    const { data: user } = await args.supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();

    const email = typeof (user as any)?.email === "string" ? String((user as any).email).trim() : "";
    if (!email) return;

    const { data: est } = await args.supabase
      .from("establishments")
      .select("name")
      .eq("id", args.establishmentId)
      .maybeSingle();

    const startsAt = new Date(args.startsAt);
    const dateStr = startsAt.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Africa/Casablanca",
    });

    await sendTemplateEmail({
      templateKey: args.isLastChance ? "reservation_upgrade_last_chance" : "reservation_upgrade_reminder",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: (user as any)?.full_name || "",
        establishment_name: (est as any)?.name || "",
        date: dateStr.charAt(0).toUpperCase() + dateStr.slice(1),
        upgrade_url: `${BASE_URL}/mes-reservations/${args.reservationId}/upgrade`,
      },
      meta: {
        source: "reservationCronV2.sendUpgradeReminders",
        reservation_id: args.reservationId,
      },
    });
  } catch (err) {
    console.error("[notifyUserUpgradeReminder] Error:", err);
  }
}
