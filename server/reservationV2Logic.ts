/**
 * Reservation V2 Business Logic
 *
 * Central orchestration module for the V2 reservation system.
 * Handles: creation, pro actions, cancellation, venue confirmation,
 * auto-accept, protection window, upgrade, and notification dispatch.
 *
 * Relies on:
 *   - capacityManager.ts (availability & quota allocation)
 *   - clientScoringV2.ts (scoring events)
 *   - noShowDisputeLogic.ts (no-show workflow)
 *   - shared/reservationStates.ts (state machine)
 *   - shared/reservationTypesV2.ts (types & constants)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransitionReservationStatusV2, isTerminalReservationStatus } from "../shared/reservationStates";
import {
  RESERVATION_TIMINGS,
  classifyCancellation,
  type StockType,
  type PaymentType,
} from "../shared/reservationTypesV2";
import { allocateStock } from "./capacityManager";
import {
  recordHonoredReservation,
  recordCancellation,
  recordFreeToPaidUpgrade,
  isClientSuspended,
} from "./clientScoringV2";
import { declareNoShow } from "./noShowDisputeLogic";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import { sendTemplateEmail } from "./emailService";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("reservationV2");
const BASE_URL = process.env.VITE_APP_URL || "https://sam.ma";

// =============================================================================
// Types
// =============================================================================

export interface CreateReservationInput {
  userId: string;
  establishmentId: string;
  slotId?: string;
  startsAt: string; // ISO datetime
  partySize: number;
  paymentType: PaymentType;
  promoCodeId?: string;
  meta?: Record<string, unknown>;
}

export interface CreateReservationResult {
  ok: boolean;
  reservation?: Record<string, unknown>;
  waitlisted?: boolean;
  error?: string;
  errorCode?: string;
}

export interface ProActionResult {
  ok: boolean;
  newStatus?: string;
  error?: string;
}

// =============================================================================
// 1. Create reservation
// =============================================================================

/**
 * Create a new V2 reservation.
 * Handles: suspension check, capacity allocation, stock assignment, QR token generation.
 */
export async function createReservationV2(args: {
  supabase: SupabaseClient;
  input: CreateReservationInput;
}): Promise<CreateReservationResult> {
  const { supabase, input } = args;
  const {
    userId, establishmentId, slotId, startsAt,
    partySize, paymentType, promoCodeId, meta,
  } = input;

  // 1. Check if user email is verified
  const { data: authUserData, error: authErr } = await supabase.auth.admin.getUserById(userId);
  if (authErr || !authUserData?.user) {
    return { ok: false, error: "Compte utilisateur introuvable.", errorCode: "user_not_found" };
  }
  if (!authUserData.user.email_confirmed_at) {
    return {
      ok: false,
      error: "Veuillez confirmer votre adresse email avant de réserver.",
      errorCode: "email_not_verified",
    };
  }

  // 2. Check if user is suspended
  const suspension = await isClientSuspended({ supabase, userId });
  if (suspension.suspended) {
    return {
      ok: false,
      error: `Votre compte est suspendu jusqu'au ${suspension.until ? new Date(suspension.until).toLocaleDateString("fr-FR") : "indéfini"}`,
      errorCode: "user_suspended",
    };
  }

  // 3. Prevent self-booking (pro cannot book at own establishment)
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (membership) {
    return {
      ok: false,
      error: "Vous ne pouvez pas réserver dans votre propre établissement.",
      errorCode: "self_booking_forbidden",
    };
  }

  // 4. Prevent double booking (same user, same slot, same establishment)
  const { data: existingReservation } = await supabase
    .from("reservations")
    .select("id")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .eq("starts_at", startsAt)
    .in("status", [
      "requested", "pending_pro_validation", "confirmed", "deposit_paid",
      "on_hold", "consumed",
    ])
    .maybeSingle();

  if (existingReservation) {
    return {
      ok: false,
      error: "Vous avez déjà une réservation active pour ce créneau dans cet établissement.",
      errorCode: "double_booking",
    };
  }

  // 5. Group booking → redirect to quote
  if (partySize > 15) {
    return {
      ok: false,
      error: "Pour les groupes de plus de 15 personnes, veuillez faire une demande de devis.",
      errorCode: "redirect_to_quote",
    };
  }

  // 6. Parse date/time for allocation
  const startsAtDate = new Date(startsAt);
  const dateStr = startsAtDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = startsAtDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" });

  // 7. Allocate stock (capacity + quota check)
  const allocation = await allocateStock({
    supabase,
    establishmentId,
    date: dateStr,
    time: timeStr,
    paymentType,
    partySize,
  });

  if (!allocation.allowed) {
    // No capacity → offer waitlist
    return {
      ok: false,
      error: "Créneau complet. Vous pouvez rejoindre la liste d'attente.",
      errorCode: "slot_full",
    };
  }

  // 8. Generate QR code token
  const qrCodeToken = generateQrToken();

  // 9. Calculate processing deadline
  const hoursUntil = (startsAtDate.getTime() - Date.now()) / (1000 * 60 * 60);
  const deadlineHours = hoursUntil <= 24
    ? RESERVATION_TIMINGS.PRO_SAME_DAY_DEADLINE_HOURS
    : RESERVATION_TIMINGS.PRO_NORMAL_DEADLINE_HOURS;
  const proProcessingDeadline = new Date(
    Date.now() + deadlineHours * 60 * 60 * 1000,
  ).toISOString();

  // 10. Calculate protection window (H-3)
  const protectionWindowStart = new Date(
    startsAtDate.getTime() - RESERVATION_TIMINGS.PROTECTION_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // 11. Check for auto-accept rules
  const autoAccepted = await checkAutoAccept({
    supabase,
    establishmentId,
    userId,
    partySize,
    date: dateStr,
    time: timeStr,
  });

  const initialStatus = autoAccepted ? "confirmed" : "pending_pro_validation";

  // 11b. Enrich meta with client scoring & per-establishment no-show history
  const enrichedMeta: Record<string, unknown> = { ...(meta || {}) };

  const { data: userStatsRow } = await supabase
    .from("consumer_user_stats")
    .select("reliability_score, no_shows_count")
    .eq("user_id", userId)
    .maybeSingle();

  const reliabilityScore = typeof (userStatsRow as any)?.reliability_score === "number"
    ? (userStatsRow as any).reliability_score as number
    : 90;
  const globalNoShows = typeof (userStatsRow as any)?.no_shows_count === "number"
    ? (userStatsRow as any).no_shows_count as number
    : 0;

  enrichedMeta.client_risk_score = Math.max(0, Math.min(100, Math.round(reliabilityScore)));
  enrichedMeta.no_show_count = globalNoShows;

  // Query past no-shows at THIS specific establishment
  const { data: estNoShowRows } = await supabase
    .from("reservations")
    .select("starts_at, party_size")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .in("status", ["noshow", "no_show_confirmed"])
    .order("starts_at", { ascending: false })
    .limit(10);

  const estNoShowList = (estNoShowRows ?? []).map((ns: any) => ({
    date: new Date(ns.starts_at).toLocaleDateString("fr-FR", { timeZone: "Africa/Casablanca" }),
    time: new Date(ns.starts_at).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Casablanca",
    }),
    party_size: typeof ns.party_size === "number" ? ns.party_size : 0,
  }));

  enrichedMeta.establishment_no_shows = estNoShowList;
  enrichedMeta.has_establishment_no_show = estNoShowList.length > 0;

  // 12. Insert reservation
  const nowIso = new Date().toISOString();
  const { data: reservation, error: insertError } = await supabase
    .from("reservations")
    .insert({
      user_id: userId,
      establishment_id: establishmentId,
      slot_id: slotId || null,
      starts_at: startsAt,
      party_size: partySize,
      status: initialStatus,
      type: "standard",
      payment_type: paymentType,
      promo_code_id: promoCodeId || null,
      qr_code_token: qrCodeToken,
      stock_type: allocation.stockType,
      protection_window_start: protectionWindowStart,
      pro_processing_deadline: proProcessingDeadline,
      meta: enrichedMeta,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (insertError) {
    log.error({ err: insertError }, "createReservationV2 insert error");
    return { ok: false, error: "Erreur lors de la création de la réservation", errorCode: "insert_failed" };
  }

  // 13. Notifications
  void dispatchReservationCreatedNotifications({
    supabase,
    reservation: reservation as Record<string, unknown>,
    autoAccepted,
    userId,
    establishmentId,
  });

  return {
    ok: true,
    reservation: reservation as Record<string, unknown>,
    waitlisted: false,
  };
}

// =============================================================================
// 2. Pro actions
// =============================================================================

/**
 * Pro accepts a reservation.
 */
export async function proAcceptReservation(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
  customMessage?: string;
}): Promise<ProActionResult> {
  return proTransition({
    ...args,
    targetStatus: "confirmed",
    notificationTemplate: "user_booking_pro_confirmed",
  });
}

/**
 * Pro refuses a reservation.
 */
export async function proRefuseReservation(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
  reason?: string;
  customMessage?: string;
}): Promise<ProActionResult> {
  return proTransition({
    ...args,
    targetStatus: "refused",
    notificationTemplate: "user_booking_refused",
  });
}

/**
 * Pro puts reservation on hold.
 */
export async function proHoldReservation(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
  customMessage?: string;
}): Promise<ProActionResult> {
  return proTransition({
    ...args,
    targetStatus: "on_hold",
    notificationTemplate: null, // Will use generic notification
  });
}

/**
 * Pro cancels a confirmed reservation (with restrictions).
 */
export async function proCancelReservation(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
  reason: string;
}): Promise<ProActionResult> {
  const { supabase, reservationId, establishmentId, reason } = args;

  // Fetch reservation to check protection window
  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, status, starts_at, payment_type, protection_window_start")
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .single();

  if (error || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;
  const protectionStart = r.protection_window_start ? new Date(String(r.protection_window_start)) : null;

  // Check protection window for free reservations
  if (String(r.payment_type) === "free" && protectionStart && new Date() >= protectionStart) {
    return { ok: false, error: "Annulation bloquée: réservation gratuite dans la fenêtre de protection (H-3)" };
  }

  return proTransition({
    supabase,
    reservationId,
    establishmentId,
    targetStatus: "cancelled_pro",
    cancellationReason: reason,
    notificationTemplate: "user_booking_cancelled_by_pro",
  });
}

/**
 * Pro confirms venue (client came) — fallback for non-QR check-in.
 */
export async function proConfirmVenue(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
}): Promise<ProActionResult> {
  const { supabase, reservationId, establishmentId } = args;
  const nowIso = new Date().toISOString();

  // Fetch reservation
  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, user_id, status")
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .single();

  if (error || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;
  const status = String(r.status ?? "");

  if (status !== "confirmed" && status !== "deposit_paid") {
    return { ok: false, error: `Cannot confirm venue from status: ${status}` };
  }

  // Update to consumed
  await supabase
    .from("reservations")
    .update({
      status: "consumed",
      pro_venue_response: "client_came",
      pro_venue_responded_at: nowIso,
      checked_in_at: nowIso,
      consumed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", reservationId);

  // Record honored for scoring
  const userId = String(r.user_id ?? "");
  if (userId) {
    void recordHonoredReservation({ supabase, userId });
  }

  return { ok: true, newStatus: "consumed" };
}

/**
 * Pro declares no-show via venue confirmation.
 */
export async function proDeclareNoShowVenue(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
}): Promise<ProActionResult> {
  const { supabase, reservationId, establishmentId } = args;
  const nowIso = new Date().toISOString();

  await supabase
    .from("reservations")
    .update({
      pro_venue_response: "client_no_show",
      pro_venue_responded_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId);

  // Delegate to no-show dispute logic
  const result = await declareNoShow({
    supabase,
    reservationId,
    declaredBy: "pro",
  });

  return {
    ok: result.ok,
    newStatus: "noshow",
    error: result.error,
  };
}

// =============================================================================
// 3. Client cancellation
// =============================================================================

/**
 * Client cancels their reservation. Scoring impact based on timing.
 */
export async function clientCancelReservation(args: {
  supabase: SupabaseClient;
  reservationId: string;
  userId: string;
  reason?: string;
}): Promise<ProActionResult & { cancellationType?: string }> {
  const { supabase, reservationId, userId, reason } = args;

  // Fetch reservation
  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, status, starts_at, payment_type, protection_window_start")
    .eq("id", reservationId)
    .eq("user_id", userId)
    .single();

  if (error || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;
  const status = String(r.status ?? "");
  const startsAt = new Date(String(r.starts_at ?? ""));
  const paymentType = String(r.payment_type ?? "free");

  // Check state machine
  if (!canTransitionReservationStatusV2({ from: status, to: "cancelled_user" })) {
    return { ok: false, error: `Cannot cancel from status: ${status}` };
  }

  // Check protection window
  const protectionStart = r.protection_window_start ? new Date(String(r.protection_window_start)) : null;
  if (paymentType === "free" && protectionStart && new Date() >= protectionStart) {
    return { ok: false, error: "Annulation bloquée: vous êtes dans la fenêtre de protection (< 3h avant la réservation)" };
  }

  const nowIso = new Date().toISOString();

  // Update reservation
  await supabase
    .from("reservations")
    .update({
      status: "cancelled_user",
      cancellation_reason: reason || null,
      cancelled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", reservationId);

  // Record cancellation for scoring
  const scoringResult = await recordCancellation({
    supabase,
    userId,
    startsAt,
  });

  // Notify pro
  const establishmentId = String(r.establishment_id ?? "");
  void notifyProMembers({
    supabase,
    establishmentId,
    category: "booking",
    title: "Réservation annulée par le client",
    body: `Le client a annulé sa réservation${reason ? ` (motif: ${reason})` : ""}`,
    data: { action: "booking_cancelled_user", reservationId, targetTab: "reservations" },
  });

  return {
    ok: true,
    newStatus: "cancelled_user",
    cancellationType: scoringResult.cancellationType,
  };
}

// =============================================================================
// 4. Free-to-paid upgrade
// =============================================================================

/**
 * Upgrade a free reservation to paid (secure the booking with deposit).
 */
export async function upgradeFreeToPaid(args: {
  supabase: SupabaseClient;
  reservationId: string;
  userId: string;
}): Promise<ProActionResult> {
  const { supabase, reservationId, userId } = args;

  // Fetch reservation
  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, user_id, status, payment_type, stock_type")
    .eq("id", reservationId)
    .eq("user_id", userId)
    .single();

  if (error || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;

  if (String(r.payment_type) !== "free") {
    return { ok: false, error: "reservation_already_paid" };
  }

  if (isTerminalReservationStatus(String(r.status))) {
    return { ok: false, error: "reservation_is_terminal" };
  }

  const nowIso = new Date().toISOString();

  // Upgrade: move from free_stock to paid_stock
  await supabase
    .from("reservations")
    .update({
      payment_type: "paid",
      stock_type: "paid_stock",
      converted_from_free_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", reservationId);

  // Record upgrade for scoring (+2 points)
  await recordFreeToPaidUpgrade({ supabase, userId });

  return { ok: true, newStatus: String(r.status) };
}

// =============================================================================
// 5. QR Code check-in (consumed)
// =============================================================================

/**
 * Process QR code scan → mark reservation as consumed.
 */
export async function processQrCheckIn(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
}): Promise<ProActionResult> {
  const { supabase, reservationId, establishmentId } = args;
  const nowIso = new Date().toISOString();

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, user_id, status, checked_in_at")
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .single();

  if (error || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;

  // Already consumed
  if (r.checked_in_at) {
    return { ok: true, newStatus: "consumed" };
  }

  const status = String(r.status ?? "");
  if (status !== "confirmed" && status !== "deposit_paid") {
    return { ok: false, error: `Cannot check in from status: ${status}` };
  }

  // Mark as consumed
  await supabase
    .from("reservations")
    .update({
      status: "consumed",
      checked_in_at: nowIso,
      qr_scanned_at: nowIso,
      consumed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", reservationId);

  // Record honored for scoring
  const userId = String(r.user_id ?? "");
  if (userId) {
    void recordHonoredReservation({ supabase, userId });
  }

  return { ok: true, newStatus: "consumed" };
}

// =============================================================================
// Internal: Pro transition helper
// =============================================================================

async function proTransition(args: {
  supabase: SupabaseClient;
  reservationId: string;
  establishmentId: string;
  targetStatus: string;
  cancellationReason?: string;
  customMessage?: string;
  notificationTemplate: string | null;
}): Promise<ProActionResult> {
  const { supabase, reservationId, establishmentId, targetStatus, cancellationReason, customMessage } = args;

  // Fetch reservation
  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("id, user_id, status, starts_at")
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .single();

  if (error || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;
  const currentStatus = String(r.status ?? "");

  // Check state machine
  if (!canTransitionReservationStatusV2({ from: currentStatus, to: targetStatus })) {
    return { ok: false, error: `Cannot transition from ${currentStatus} to ${targetStatus}` };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: targetStatus,
    updated_at: nowIso,
  };

  if (cancellationReason) {
    patch.cancellation_reason = cancellationReason;
    patch.cancelled_at = nowIso;
  }
  if (customMessage) {
    patch.pro_custom_message = customMessage;
  }

  await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId);

  return { ok: true, newStatus: targetStatus };
}

// =============================================================================
// Internal: Auto-accept check
// =============================================================================

async function checkAutoAccept(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  userId: string;
  partySize: number;
  date: string;
  time: string;
}): Promise<boolean> {
  const { supabase, establishmentId, userId, partySize, date, time } = args;

  // Fetch active rules for this establishment
  const { data: rules, error } = await supabase
    .from("pro_auto_accept_rules")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .limit(10);

  if (error || !rules || rules.length === 0) {
    return false;
  }

  // Get client score
  const { data: stats } = await supabase
    .from("consumer_user_stats")
    .select("reliability_score")
    .eq("user_id", userId)
    .maybeSingle();

  const clientScore = typeof (stats as any)?.reliability_score === "number"
    ? (stats as any).reliability_score
    : 60; // Default score

  const dow = new Date(date + "T00:00:00Z").getUTCDay();
  const timeMinutes = parseTimeToMinutes(time);

  for (const rule of rules as Record<string, unknown>[]) {
    // Global auto-accept
    if (rule.is_global === true) {
      // Check conditional filters
      if (rule.min_client_score && clientScore < Number(rule.min_client_score)) continue;
      if (rule.max_party_size && partySize > Number(rule.max_party_size)) continue;

      // Check applicable days
      if (rule.applicable_days) {
        const days = rule.applicable_days as number[];
        if (Array.isArray(days) && days.length > 0 && !days.includes(dow)) continue;
      }

      // Check applicable time slots
      if (rule.applicable_time_slots) {
        const slots = rule.applicable_time_slots as Array<{ start: string; end: string }>;
        if (Array.isArray(slots) && slots.length > 0) {
          const inSlot = slots.some((s) => {
            const sStart = parseTimeToMinutes(s.start);
            const sEnd = parseTimeToMinutes(s.end);
            return timeMinutes >= sStart && timeMinutes < sEnd;
          });
          if (!inSlot) continue;
        }
      }

      return true; // All conditions met
    }
  }

  return false;
}

// =============================================================================
// Internal: Notification dispatch
// =============================================================================

async function dispatchReservationCreatedNotifications(args: {
  supabase: SupabaseClient;
  reservation: Record<string, unknown>;
  autoAccepted: boolean;
  userId: string;
  establishmentId: string;
}): Promise<void> {
  try {
    const { supabase, reservation, autoAccepted, establishmentId } = args;

    // Check for per-establishment no-show history in meta
    const resMeta = reservation.meta && typeof reservation.meta === "object" && !Array.isArray(reservation.meta)
      ? reservation.meta as Record<string, unknown>
      : {};
    const hasEstNoShow = resMeta.has_establishment_no_show === true;
    const estNoShows = Array.isArray(resMeta.establishment_no_shows)
      ? resMeta.establishment_no_shows as Array<{ date: string; time: string; party_size: number }>
      : [];

    // Build warning-enhanced title and body
    let notifTitle = autoAccepted
      ? "Nouvelle réservation (acceptée auto)"
      : "Nouvelle demande de réservation";

    let notifBody = `${reservation.party_size} personne(s) — ${String(reservation.starts_at ?? "").slice(0, 16)}`;

    if (hasEstNoShow && estNoShows.length > 0) {
      const lastNs = estNoShows[0];
      notifTitle = autoAccepted
        ? "⚠️ Réservation auto — Client avec no-show chez vous"
        : "⚠️ Nouvelle réservation — Client avec no-show chez vous";
      notifBody += ` | ⚠️ No-show précédent le ${lastNs.date} à ${lastNs.time} (${lastNs.party_size} pers.)`;
    }

    // Notify pro members
    await notifyProMembers({
      supabase,
      establishmentId,
      category: "booking",
      title: notifTitle,
      body: notifBody,
      data: {
        action: autoAccepted ? "booking_auto_accepted" : "booking_new_request",
        reservationId: String(reservation.id ?? ""),
        targetTab: "reservations",
        hasEstablishmentNoShow: hasEstNoShow,
      },
    });

    // Admin notification
    void emitAdminNotification({
      type: "new_reservation_v2",
      title: autoAccepted ? "Réservation auto-acceptée" : "Nouvelle réservation",
      body: `${reservation.party_size} pers. — ${String(reservation.stock_type ?? "")} — ${autoAccepted ? "auto" : "pending"}`,
      data: {
        reservationId: String(reservation.id ?? ""),
        establishmentId,
        stockType: String(reservation.stock_type ?? ""),
        autoAccepted,
      },
    });
  } catch (err) {
    log.error({ err }, "dispatchReservationCreatedNotifications error");
  }
}

// =============================================================================
// Helpers
// =============================================================================

function generateQrToken(): string {
  // UUID v4 compatible token (crypto-safe)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = (time || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
