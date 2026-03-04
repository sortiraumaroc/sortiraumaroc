/**
 * No-Show Dispute Logic
 *
 * Handles the complete no-show declaration and dispute workflow:
 *
 * 1. Pro declares no-show → notification to client (48h to respond)
 * 2. Client responds:
 *    a) No response in 48h → no-show confirmed, score impacted
 *    b) Confirms absence → no-show confirmed
 *    c) Disputes → arbitration by admin
 * 3. Admin arbitrates:
 *    - Favor client → false no-show, pro sanctioned progressively
 *    - Favor pro → no-show confirmed
 *    - Indeterminate → no impact either side
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import { sendTemplateEmail } from "./emailService";
import { recordNoShow } from "./clientScoringV2";
import { RESERVATION_TIMINGS } from "../shared/reservationTypesV2";
import type { DisputeStatus, ClientDisputeResponse } from "../shared/reservationTypesV2";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("noShowDispute");

// =============================================================================
// Types
// =============================================================================

export interface DeclareNoShowResult {
  ok: boolean;
  disputeId?: string;
  error?: string;
}

export interface ClientRespondResult {
  ok: boolean;
  newStatus?: DisputeStatus;
  error?: string;
}

export interface ArbitrateResult {
  ok: boolean;
  decision?: string;
  sanctionApplied?: string;
  error?: string;
}

// =============================================================================
// 1. Pro declares no-show
// =============================================================================

/**
 * Create a no-show dispute record and notify the client.
 * Called when pro clicks "Déclarer no-show" or from H+12/H+18/H+24 system.
 */
export async function declareNoShow(args: {
  supabase: SupabaseClient;
  reservationId: string;
  declaredBy: "pro" | "system";
}): Promise<DeclareNoShowResult> {
  const { supabase, reservationId, declaredBy } = args;

  // Fetch reservation details
  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .select("id, user_id, establishment_id, status, starts_at, party_size, booking_reference")
    .eq("id", reservationId)
    .single();

  if (resError || !reservation) {
    return { ok: false, error: "reservation_not_found" };
  }

  const r = reservation as Record<string, unknown>;
  const userId = String(r.user_id ?? "");
  const establishmentId = String(r.establishment_id ?? "");

  // Verify reservation is in a valid state for no-show
  const status = String(r.status ?? "");
  if (status !== "noshow" && status !== "confirmed") {
    return { ok: false, error: `invalid_status_for_noshow: ${status}` };
  }

  // Transition to noshow if not already
  if (status !== "noshow") {
    await supabase
      .from("reservations")
      .update({ status: "noshow" })
      .eq("id", reservationId);
  }

  // Check if dispute already exists
  const { data: existing } = await supabase
    .from("no_show_disputes")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (existing) {
    return { ok: true, disputeId: String((existing as any).id) };
  }

  // Create dispute record
  const nowIso = new Date().toISOString();
  const deadlineIso = new Date(
    Date.now() + RESERVATION_TIMINGS.DISPUTE_CLIENT_RESPONSE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: dispute, error: insertError } = await supabase
    .from("no_show_disputes")
    .insert({
      reservation_id: reservationId,
      user_id: userId,
      establishment_id: establishmentId,
      declared_by: declaredBy,
      declared_at: nowIso,
      client_notified_at: nowIso,
      client_response_deadline: deadlineIso,
      dispute_status: "pending_client_response",
    })
    .select("id")
    .single();

  if (insertError) {
    log.error({ err: insertError }, "declareNoShow insert error");
    return { ok: false, error: "failed_to_create_dispute" };
  }

  const disputeId = String((dispute as any).id);

  // Notify client via email
  void notifyClientOfNoShow({
    supabase,
    userId,
    establishmentId,
    reservationId,
    disputeId,
    deadline: deadlineIso,
  });

  // Notify admin
  void emitAdminNotification({
    type: "no_show_declared",
    title: "No-show déclaré",
    body: `Réservation ${String(r.booking_reference ?? reservationId).slice(0, 8)} — déclaré par ${declaredBy}. Le client a 48h pour répondre.`,
    data: { reservationId, disputeId, establishmentId, declaredBy },
  });

  return { ok: true, disputeId };
}

// =============================================================================
// 2. Client responds to no-show declaration
// =============================================================================

/**
 * Client responds to a no-show declaration.
 * - "confirms_absence" → no-show confirmed immediately
 * - "disputes" → moved to arbitration
 */
export async function clientRespondToNoShow(args: {
  supabase: SupabaseClient;
  disputeId: string;
  userId: string;
  response: ClientDisputeResponse;
  evidence?: Array<{ url: string; type: string; description?: string }>;
}): Promise<ClientRespondResult> {
  const { supabase, disputeId, userId, response, evidence } = args;

  // Fetch dispute
  const { data: dispute, error } = await supabase
    .from("no_show_disputes")
    .select("id, reservation_id, user_id, establishment_id, dispute_status, client_response_deadline")
    .eq("id", disputeId)
    .single();

  if (error || !dispute) {
    return { ok: false, error: "dispute_not_found" };
  }

  const d = dispute as Record<string, unknown>;

  // Verify ownership
  if (String(d.user_id) !== userId) {
    return { ok: false, error: "not_your_dispute" };
  }

  // Verify status
  if (String(d.dispute_status) !== "pending_client_response") {
    return { ok: false, error: `dispute_not_pending: ${d.dispute_status}` };
  }

  // Check deadline
  const deadline = new Date(String(d.client_response_deadline ?? ""));
  if (deadline < new Date()) {
    return { ok: false, error: "response_deadline_expired" };
  }

  const nowIso = new Date().toISOString();
  const reservationId = String(d.reservation_id);
  const establishmentId = String(d.establishment_id);

  if (response === "confirms_absence") {
    // Client confirms they didn't show up → no-show confirmed
    await supabase
      .from("no_show_disputes")
      .update({
        client_response: "confirms_absence",
        client_responded_at: nowIso,
        dispute_status: "no_show_confirmed",
        updated_at: nowIso,
      })
      .eq("id", disputeId);

    // Update reservation status
    await supabase
      .from("reservations")
      .update({ status: "no_show_confirmed" })
      .eq("id", reservationId);

    // Impact scoring
    await recordNoShow({ supabase, userId });

    return { ok: true, newStatus: "no_show_confirmed" };
  }

  if (response === "disputes") {
    // Client contests → move to arbitration
    const updatePayload: Record<string, unknown> = {
      client_response: "disputes",
      client_responded_at: nowIso,
      dispute_status: "disputed_pending_arbitration",
      updated_at: nowIso,
    };

    if (evidence && evidence.length > 0) {
      updatePayload.evidence_client = evidence;
    }

    await supabase
      .from("no_show_disputes")
      .update(updatePayload)
      .eq("id", disputeId);

    // Update reservation status
    await supabase
      .from("reservations")
      .update({ status: "no_show_disputed" })
      .eq("id", reservationId);

    // Notify admin for arbitration
    void emitAdminNotification({
      type: "no_show_disputed",
      title: "No-show contesté — Arbitrage nécessaire",
      body: `Le client conteste le no-show pour la réservation ${reservationId.slice(0, 8)}. Arbitrage requis.`,
      data: { reservationId, disputeId, establishmentId },
    });

    // Notify pro
    void notifyProMembers({
      supabase,
      establishmentId,
      category: "booking",
      title: "No-show contesté",
      body: "Le client conteste votre déclaration de no-show. L'équipe SAM va arbitrer.",
      data: { action: "no_show_disputed", reservationId, disputeId },
    });

    return { ok: true, newStatus: "disputed_pending_arbitration" };
  }

  return { ok: false, error: "invalid_response" };
}

// =============================================================================
// 3. Admin arbitrates
// =============================================================================

/**
 * Admin renders arbitration decision.
 */
export async function arbitrateDispute(args: {
  supabase: SupabaseClient;
  disputeId: string;
  adminUserId: string;
  decision: "favor_client" | "favor_pro" | "indeterminate";
  notes?: string;
}): Promise<ArbitrateResult> {
  const { supabase, disputeId, adminUserId, decision, notes } = args;

  // Fetch dispute
  const { data: dispute, error } = await supabase
    .from("no_show_disputes")
    .select("id, reservation_id, user_id, establishment_id, dispute_status")
    .eq("id", disputeId)
    .single();

  if (error || !dispute) {
    return { ok: false, error: "dispute_not_found" };
  }

  const d = dispute as Record<string, unknown>;

  if (String(d.dispute_status) !== "disputed_pending_arbitration") {
    return { ok: false, error: `dispute_not_in_arbitration: ${d.dispute_status}` };
  }

  const nowIso = new Date().toISOString();
  const reservationId = String(d.reservation_id);
  const userId = String(d.user_id);
  const establishmentId = String(d.establishment_id);

  let newDisputeStatus: DisputeStatus;
  let newReservationStatus: string;
  let sanctionApplied: string | undefined;

  switch (decision) {
    case "favor_client": {
      // Client was there → false no-show by pro
      newDisputeStatus = "resolved_favor_client";
      newReservationStatus = "consumed"; // Client was actually there

      // Sanction the pro (progressive)
      sanctionApplied = await applyProSanction({
        supabase,
        establishmentId,
        disputeId,
        adminUserId,
        reason: "Fausse déclaration de no-show (arbitrage en faveur du client)",
      });
      break;
    }
    case "favor_pro": {
      // No-show confirmed by arbitration
      newDisputeStatus = "resolved_favor_pro";
      newReservationStatus = "no_show_confirmed";

      // Impact client scoring
      await recordNoShow({ supabase, userId });
      break;
    }
    case "indeterminate": {
      // Cannot determine → no impact either side
      newDisputeStatus = "resolved_indeterminate";
      newReservationStatus = "no_show_confirmed"; // Defaults to confirmed but no scoring impact
      break;
    }
    default:
      return { ok: false, error: "invalid_decision" };
  }

  // Update dispute
  await supabase
    .from("no_show_disputes")
    .update({
      dispute_status: newDisputeStatus,
      arbitrated_by: adminUserId,
      arbitrated_at: nowIso,
      arbitration_notes: notes || null,
      updated_at: nowIso,
    })
    .eq("id", disputeId);

  // Update reservation
  await supabase
    .from("reservations")
    .update({ status: newReservationStatus })
    .eq("id", reservationId);

  // Notify both parties via email
  void notifyArbitrationResult({
    supabase,
    userId,
    establishmentId,
    reservationId,
    decision,
  });

  return { ok: true, decision, sanctionApplied };
}

// =============================================================================
// 4. Expire unresponded disputes (cron)
// =============================================================================

/**
 * Expire disputes where client didn't respond within 48h.
 * No-show is confirmed automatically.
 */
export async function expireUnrespondedDisputes(args: {
  supabase: SupabaseClient;
}): Promise<{ expired: number }> {
  const { supabase } = args;
  const nowIso = new Date().toISOString();

  // Find expired pending disputes
  const { data: expired, error } = await supabase
    .from("no_show_disputes")
    .select("id, reservation_id, user_id, establishment_id")
    .eq("dispute_status", "pending_client_response")
    .lt("client_response_deadline", nowIso);

  if (error || !expired || expired.length === 0) {
    return { expired: 0 };
  }

  for (const row of expired as Record<string, unknown>[]) {
    const disputeId = String(row.id);
    const reservationId = String(row.reservation_id);
    const userId = String(row.user_id);

    // Confirm no-show
    await supabase
      .from("no_show_disputes")
      .update({
        dispute_status: "no_show_confirmed",
        updated_at: nowIso,
      })
      .eq("id", disputeId);

    await supabase
      .from("reservations")
      .update({ status: "no_show_confirmed" })
      .eq("id", reservationId);

    // Impact scoring
    await recordNoShow({ supabase, userId });
  }

  return { expired: expired.length };
}

// =============================================================================
// Progressive Pro Sanctions
// =============================================================================

/**
 * Apply progressive sanction to a pro establishment.
 * 1st offense: warning
 * 2nd offense: deactivation 7d
 * 3rd+: deactivation 30d, possibility of permanent exclusion
 */
async function applyProSanction(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  disputeId: string;
  adminUserId: string;
  reason: string;
}): Promise<string> {
  const { supabase, establishmentId, disputeId, adminUserId, reason } = args;

  // Get current trust score to check prior infractions
  const { data: trustScore } = await supabase
    .from("pro_trust_scores")
    .select("false_no_show_count, sanctions_count, current_sanction")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const priorFalseNoShows = toInt((trustScore as any)?.false_no_show_count);
  const priorSanctions = toInt((trustScore as any)?.sanctions_count);

  // Determine sanction level
  let sanctionType: string;
  let deactivationDays: number | null = null;

  if (priorFalseNoShows === 0) {
    sanctionType = "warning";
  } else if (priorFalseNoShows === 1) {
    sanctionType = "deactivation_7d";
    deactivationDays = 7;
  } else {
    sanctionType = "deactivation_30d";
    deactivationDays = 30;
  }

  const nowIso = new Date().toISOString();
  const deactivationEnd = deactivationDays
    ? new Date(Date.now() + deactivationDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Record sanction
  await supabase.from("establishment_sanctions").insert({
    establishment_id: establishmentId,
    type: sanctionType,
    reason,
    related_dispute_id: disputeId,
    imposed_by: adminUserId,
    imposed_at: nowIso,
    deactivation_start: deactivationDays ? nowIso : null,
    deactivation_end: deactivationEnd,
  });

  // Update trust score
  await supabase
    .from("pro_trust_scores")
    .upsert(
      {
        establishment_id: establishmentId,
        false_no_show_count: priorFalseNoShows + 1,
        sanctions_count: priorSanctions + 1,
        current_sanction: sanctionType === "warning" ? "warning" : sanctionType === "deactivation_7d" ? "deactivated_7d" : "deactivated_30d",
        deactivated_until: deactivationEnd,
        last_calculated_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "establishment_id" },
    );

  // Notify pro
  void notifyProMembers({
    supabase,
    establishmentId,
    category: "system",
    title: sanctionType === "warning" ? "Avertissement" : `Désactivation ${deactivationDays}j`,
    body: reason,
    data: { action: "sanction_applied", sanctionType, disputeId },
  });

  // Notify admin
  void emitAdminNotification({
    type: "sanction_applied",
    title: `Sanction appliquée: ${sanctionType}`,
    body: `Établissement ${establishmentId.slice(0, 8)} — ${reason}`,
    data: { establishmentId, sanctionType, disputeId },
  });

  return sanctionType;
}

// =============================================================================
// Notification helpers
// =============================================================================

async function notifyClientOfNoShow(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  reservationId: string;
  disputeId: string;
  deadline: string;
}): Promise<void> {
  try {
    // Get user email
    const { data: user } = await args.supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();

    const email = typeof (user as any)?.email === "string" ? String((user as any).email).trim() : "";
    if (!email) return;

    // Get establishment name
    const { data: est } = await args.supabase
      .from("establishments")
      .select("name")
      .eq("id", args.establishmentId)
      .maybeSingle();

    const estName = typeof (est as any)?.name === "string" ? String((est as any).name) : "";

    const baseUrl = process.env.VITE_APP_URL || "https://sam.ma";
    const respondUrl = `${baseUrl}/no-show/respond/${args.disputeId}`;

    await sendTemplateEmail({
      templateKey: "reservation_no_show_declared",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: (user as any)?.full_name || "",
        establishment_name: estName,
        respond_url: respondUrl,
        deadline: new Date(args.deadline).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" }),
      },
      meta: {
        source: "noShowDisputeLogic.declareNoShow",
        reservation_id: args.reservationId,
        dispute_id: args.disputeId,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyClientOfNoShow error");
  }
}

async function notifyArbitrationResult(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  reservationId: string;
  decision: string;
}): Promise<void> {
  try {
    // Get user email
    const { data: user } = await args.supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();

    const email = typeof (user as any)?.email === "string" ? String((user as any).email).trim() : "";
    if (!email) return;

    // Get establishment name
    const { data: est } = await args.supabase
      .from("establishments")
      .select("name")
      .eq("id", args.establishmentId)
      .maybeSingle();

    const estName = typeof (est as any)?.name === "string" ? String((est as any).name) : "";

    await sendTemplateEmail({
      templateKey: "reservation_arbitration_result",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: (user as any)?.full_name || "",
        establishment_name: estName,
        decision: args.decision === "favor_client"
          ? "en votre faveur"
          : args.decision === "favor_pro"
            ? "en faveur de l'établissement"
            : "indéterminée",
      },
      meta: {
        source: "noShowDisputeLogic.arbitrateDispute",
        reservation_id: args.reservationId,
        decision: args.decision,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyArbitrationResult error");
  }
}

// =============================================================================
// Helpers
// =============================================================================

function toInt(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
