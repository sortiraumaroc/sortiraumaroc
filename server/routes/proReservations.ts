import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanManageReservations,
  ensureCanViewBilling,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asJsonObject,
  normalizeEmail,
  looksLikeUuid,
  isDemoRoutesAllowed,
  getDemoProEmail,
} from "./proHelpers";
import { ensureEscrowHoldForReservation, settleEscrowForReservation } from "../finance";
import { emitAdminNotification } from "../adminNotifications";
import { emitConsumerUserEvent } from "../consumerNotifications";
import { recomputeConsumerUserStatsV1 } from "../consumerReliability";
import { sendTemplateEmail } from "../emailService";
import {
  isReservationPaymentsEnabled,
  isCommissionsEnabled,
} from "../platformSettings";
import { NotificationEventType } from "../../shared/notifications";
import { canTransitionReservationStatus, OCCUPYING_RESERVATION_STATUSES } from "../../shared/reservationStates";
import { triggerWaitlistPromotionForSlot } from "../waitlist";
import { mkIsoInTimeZoneDayOffset, formatDateLongFr } from "../../shared/datetime";

const log = createModuleLogger("proReservations");

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function safeParseUrl(value: string): URL | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return new URL(trimmed);
  } catch { /* intentional: URL parsing */
    return null;
  }
}

function extractReservationLookupFromQrCode(raw: string): { reservationId?: string; bookingReference?: string } {
  const code = String(raw ?? "").trim();
  if (!code) return {};

  if (looksLikeUuid(code)) return { reservationId: code };

  const prefixed = code.match(/^(SAM|SAMPACK):(.+)$/i);
  if (prefixed?.[2]) {
    const payload = prefixed[2].trim();
    const parts = payload.split("|").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const [kRaw, vRaw] = part.split("=", 2);
      const k = (kRaw ?? "").trim().toLowerCase();
      const v = (vRaw ?? "").trim();
      if (k === "ref" && v) return { bookingReference: v };
      if ((k === "reservation_id" || k === "rid") && v && looksLikeUuid(v)) return { reservationId: v };
    }
  }

  const url = safeParseUrl(code);
  if (url) {
    const reservationId = url.searchParams.get("reservation_id") ?? url.searchParams.get("rid");
    if (reservationId && looksLikeUuid(reservationId)) return { reservationId };

    const ref = url.searchParams.get("booking_reference") ?? url.searchParams.get("ref");
    if (ref && ref.trim()) return { bookingReference: ref.trim() };

    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && looksLikeUuid(last)) return { reservationId: last };
    if (last && last.trim()) return { bookingReference: last.trim() };
  }

  if (code.startsWith("{") && code.endsWith("}")) {
    try {
      const parsed = JSON.parse(code) as unknown;
      if (isRecord(parsed)) {
        const rid = asString(parsed.reservation_id) ?? asString(parsed.reservationId);
        if (rid && looksLikeUuid(rid)) return { reservationId: rid };
        const ref = asString(parsed.booking_reference) ?? asString(parsed.bookingReference);
        if (ref) return { bookingReference: ref };
      }
    } catch { /* intentional: JSON parsing */ }
  }

  const m = code.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (m?.[1]) return { reservationId: m[1] };

  return { bookingReference: code };
}

function isOfferExpiredByIso(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return true;
  return ts < Date.now();
}

type ProWaitlistEntryRow = {
  id: string;
  reservation_id: string;
  slot_id: string | null;
  user_id: string;
  status: string;
  position: number | null;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

async function expireWaitlistEntryBestEffortPro(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  entry: ProWaitlistEntryRow;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  try {
    if (!args.entry?.id) return;
    if (args.entry.status !== "offer_sent") return;
    if (!isOfferExpiredByIso(args.entry.offer_expires_at)) return;

    const nowIso = new Date().toISOString();

    await args.supabase
      .from("waitlist_entries")
      .update({ status: "offer_expired", offer_expires_at: null, updated_at: nowIso })
      .eq("id", args.entry.id);

    await args.supabase.from("waitlist_events").insert({
      waitlist_entry_id: args.entry.id,
      reservation_id: args.entry.reservation_id,
      establishment_id: null,
      slot_id: args.entry.slot_id,
      user_id: args.entry.user_id,
      event_type: "waitlist_offer_expired",
      actor_role: "pro",
      actor_user_id: args.actorUserId,
      metadata: { reason: args.reason, offer_expires_at: args.entry.offer_expires_at },
    });

    await args.supabase.from("system_logs").insert({
      actor_user_id: args.actorUserId,
      actor_role: "pro",
      action: "waitlist.offer_expired",
      entity_type: "waitlist_entry",
      entity_id: args.entry.id,
      payload: {
        reservation_id: args.entry.reservation_id,
        slot_id: args.entry.slot_id,
        offer_expires_at: args.entry.offer_expires_at,
        reason: args.reason,
      },
    });

    if (args.entry.slot_id) {
      void triggerWaitlistPromotionForSlot({
        supabase: args.supabase as any,
        slotId: args.entry.slot_id,
        actorRole: "pro",
        actorUserId: args.actorUserId,
        reason: "offer_expired_lazy_check",
      });
    }

    args.entry.status = "offer_expired";
    args.entry.offer_expires_at = null;
  } catch (err) {
    log.warn({ err }, "offer expired lazy check failed");
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const createManualReservation: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const startsAtRaw = asString(req.body.starts_at);
  const endsAtRaw = asString(req.body.ends_at);
  const statusRaw = asString(req.body.status);
  const partySizeRaw = asNumber(req.body.party_size);
  const amountTotalRaw = asNumber(req.body.amount_total);
  const amountDepositRaw = asNumber(req.body.amount_deposit);
  const currency = asString(req.body.currency) ?? "MAD";
  const metaInput = asJsonObject(req.body.meta) ?? {};

  if (!startsAtRaw) return res.status(400).json({ error: "starts_at is required" });
  const startsAt = new Date(startsAtRaw);
  if (!Number.isFinite(startsAt.getTime())) return res.status(400).json({ error: "starts_at invalide" });

  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAtRaw && (!endsAt || !Number.isFinite(endsAt.getTime()))) return res.status(400).json({ error: "ends_at invalide" });

  const allowedStatuses = new Set([
    "requested",
    "pending_pro_validation",
    "confirmed",
    "refused",
    "waitlist",
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "noshow",
  ]);
  const status = statusRaw && allowedStatuses.has(statusRaw) ? statusRaw : "requested";

  // payment_status is managed server-side (webhook/admin). Manual reservations always start as pending.
  const payment_status = "pending";

  const party_size = typeof partySizeRaw === "number" && Number.isFinite(partySizeRaw) && partySizeRaw > 0 ? Math.round(partySizeRaw) : null;
  const amount_total = typeof amountTotalRaw === "number" && Number.isFinite(amountTotalRaw) && amountTotalRaw >= 0 ? Math.round(amountTotalRaw) : null;

  // Check if reservation payments are enabled (Phase 1 = disabled)
  const paymentsEnabled = await isReservationPaymentsEnabled();
  const commissionsEnabled = await isCommissionsEnabled();

  // In test mode (Phase 1), ignore deposits and commissions
  const amount_deposit = paymentsEnabled && typeof amountDepositRaw === "number" && Number.isFinite(amountDepositRaw) && amountDepositRaw >= 0
    ? Math.round(amountDepositRaw)
    : null;

  const supabase = getAdminSupabase();

  const { data: est, error: estErr } = await supabase.from("establishments").select("universe").eq("id", establishmentId).maybeSingle();
  if (estErr) return res.status(500).json({ error: estErr.message });

  const kind = asString(req.body.kind) ?? (typeof (est as { universe?: unknown } | null)?.universe === "string" ? (est as { universe: string }).universe : "unknown");

  // In test mode (Phase 1), no commissions
  const commission_percent = commissionsEnabled ? 10 : 0;
  const commission_amount = commissionsEnabled && amount_deposit ? Math.round((amount_deposit * commission_percent) / 100) : null;

  const meta = {
    ...metaInput,
    source: "manual",
    created_by_pro: userResult.user.id,
    created_by_role: permission.role,
  };

  const { data: created, error: createErr } = await supabase
    .from("reservations")
    .insert({
      booking_reference: `PRO-${establishmentId.slice(0, 6)}-${randomUUID().slice(0, 8)}`,
      kind,
      establishment_id: establishmentId,
      user_id: null,
      status,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      party_size,
      amount_total,
      amount_deposit,
      currency,
      payment_status,
      commission_percent,
      commission_amount,
      checked_in_at: null,
      meta,
    })
    .select("id")
    .single();

  if (createErr || !created) return res.status(500).json({ error: createErr?.message ?? "Impossible de créer la réservation" });

  res.json({ ok: true, reservation_id: (created as { id: string }).id });
};

export const listProReservations: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("starts_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, reservations: data ?? [] });
};

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

export const listProWaitlist: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "active";
  const statusFilter = statusRaw === "waiting" || statusRaw === "offer_sent" || statusRaw === "active" || statusRaw === "all" ? statusRaw : "active";

  const supabase = getAdminSupabase();

  let query = supabase
    .from("waitlist_entries")
    .select(
      "id,reservation_id,slot_id,user_id,status,position,offer_sent_at,offer_expires_at,created_at,updated_at,reservations!inner(id,booking_reference,establishment_id,starts_at,party_size,status,meta,created_at)",
    )
    .eq("reservations.establishment_id", establishmentId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(300);

  if (statusFilter === "waiting") {
    query = query.in("status", ["waiting", "queued"]);
  } else if (statusFilter === "offer_sent") {
    query = query.in("status", ["offer_sent"]);
  } else if (statusFilter === "active") {
    query = query.in("status", ["waiting", "queued", "offer_sent"]);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as any[];
  const entries: Array<ProWaitlistEntryRow & { reservation: any | null }> = rows.map((r) => ({
    id: String(r?.id ?? ""),
    reservation_id: String(r?.reservation_id ?? ""),
    slot_id: typeof r?.slot_id === "string" ? r.slot_id : null,
    user_id: String(r?.user_id ?? ""),
    status: String(r?.status ?? ""),
    position: typeof r?.position === "number" ? r.position : null,
    offer_sent_at: typeof r?.offer_sent_at === "string" ? r.offer_sent_at : null,
    offer_expires_at: typeof r?.offer_expires_at === "string" ? r.offer_expires_at : null,
    created_at: typeof r?.created_at === "string" ? r.created_at : "",
    updated_at: typeof r?.updated_at === "string" ? r.updated_at : "",
    reservation: (r as any)?.reservations ?? null,
  }));

  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await expireWaitlistEntryBestEffortPro({ supabase, entry: e, actorUserId: userResult.user.id, reason: "pro_list" });
  }

  res.json({ ok: true, items: entries });
};

export const sendProWaitlistOffer: RequestHandler = async (req, res) => {
  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !looksLikeUuid(entryId)) return res.status(400).json({ error: "invalid_waitlist_id" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,slot_id,status,user_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!(entry as any)?.id) return res.status(404).json({ error: "waitlist_entry_not_found" });

  const reservationId = String((entry as any).reservation_id ?? "");
  if (!reservationId) return res.status(409).json({ error: "missing_reservation_id" });

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id,establishment_id,slot_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });
  const establishmentId = String((reservation as any)?.establishment_id ?? "");
  if (!establishmentId) return res.status(409).json({ error: "missing_establishment_id" });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const bodySlotId = isRecord(req.body) ? (asString((req.body as any).slot_id) ?? asString((req.body as any).slotId)) : undefined;
  const slotId = bodySlotId ?? (typeof (entry as any)?.slot_id === "string" ? String((entry as any).slot_id) : String((reservation as any)?.slot_id ?? ""));
  if (!slotId || !looksLikeUuid(slotId)) return res.status(409).json({ error: "missing_slot_id" });
  if (bodySlotId && bodySlotId !== slotId) return res.status(400).json({ error: "slot_id_mismatch" });

  const result = await triggerWaitlistPromotionForSlot({
    supabase: supabase as any,
    slotId,
    actorRole: "pro",
    actorUserId: userResult.user.id,
    reason: "pro_manual_send_offer",
  });

  await supabase.from("system_logs").insert({
    actor_user_id: userResult.user.id,
    actor_role: "pro",
    action: "waitlist.offer_sent",
    entity_type: "waitlist_entry",
    entity_id: entryId,
    payload: {
      establishment_id: establishmentId,
      slot_id: slotId,
      requested_entry_id: entryId,
      result,
    },
  });

  res.json({ ok: true, result });
};

export const closeProWaitlistEntry: RequestHandler = async (req, res) => {
  const entryId = typeof req.params.id === "string" ? req.params.id : "";
  if (!entryId || !looksLikeUuid(entryId)) return res.status(400).json({ error: "invalid_waitlist_id" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const { data: entry, error: entryErr } = await supabase
    .from("waitlist_entries")
    .select("id,reservation_id,slot_id,status,user_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryErr) return res.status(500).json({ error: entryErr.message });
  if (!(entry as any)?.id) return res.status(404).json({ error: "waitlist_entry_not_found" });

  const reservationId = String((entry as any).reservation_id ?? "");
  if (!reservationId) return res.status(409).json({ error: "missing_reservation_id" });

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id,establishment_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });
  const establishmentId = String((reservation as any)?.establishment_id ?? "");
  if (!establishmentId) return res.status(409).json({ error: "missing_establishment_id" });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const reason = isRecord(req.body) ? (asString((req.body as any).reason) ?? asString((req.body as any).message) ?? "") : "";
  const nowIso = new Date().toISOString();

  await supabase
    .from("waitlist_entries")
    .update({ status: "removed", offer_expires_at: null, updated_at: nowIso, meta: { reason: reason || null } })
    .eq("id", entryId);

  await supabase.from("waitlist_events").insert({
    waitlist_entry_id: entryId,
    reservation_id: reservationId,
    establishment_id: establishmentId,
    slot_id: (entry as any)?.slot_id ?? null,
    user_id: (entry as any)?.user_id ?? null,
    event_type: "waitlist_removed_by_pro",
    actor_role: "pro",
    actor_user_id: userResult.user.id,
    metadata: { reason: reason || null },
  });

  await supabase.from("system_logs").insert({
    actor_user_id: userResult.user.id,
    actor_role: "pro",
    action: "waitlist.removed_by_pro",
    entity_type: "waitlist_entry",
    entity_id: entryId,
    payload: { establishment_id: establishmentId, reservation_id: reservationId, reason: reason || null },
  });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Reservation message templates
// ---------------------------------------------------------------------------

export const listProReservationMessageTemplates: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservation_messages_templates")
    .select("id,owner_type,owner_id,code,label,body,is_active,created_at,updated_at")
    .or(`owner_type.eq.global,and(owner_type.eq.pro,owner_id.eq.${establishmentId})`)
    .order("owner_type", { ascending: true })
    .order("label", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, templates: data ?? [] });
};

export const createProReservationMessageTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const code = asString(req.body.code) ?? "";
  const label = asString(req.body.label) ?? "";
  const body = asString(req.body.body) ?? "";
  const isActive = typeof req.body.is_active === "boolean" ? req.body.is_active : true;

  if (!code.trim()) return res.status(400).json({ error: "code is required" });
  if (!label.trim()) return res.status(400).json({ error: "label is required" });
  if (!body.trim()) return res.status(400).json({ error: "body is required" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("reservation_messages_templates")
    .insert({
      owner_type: "pro",
      owner_id: establishmentId,
      code: code.trim(),
      label: label.trim(),
      body: body.trim(),
      is_active: isActive,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
};

export const updateProReservationMessageTemplate: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const templateId = typeof req.params.templateId === "string" ? req.params.templateId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!templateId) return res.status(400).json({ error: "templateId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const code = asString(req.body.code);
  const label = asString(req.body.label);
  const body = asString(req.body.body);
  const isActive = typeof req.body.is_active === "boolean" ? req.body.is_active : undefined;

  const patch: Record<string, unknown> = {};
  if (code !== undefined) {
    if (!code.trim()) return res.status(400).json({ error: "code is required" });
    patch.code = code.trim();
  }
  if (label !== undefined) {
    if (!label.trim()) return res.status(400).json({ error: "label is required" });
    patch.label = label.trim();
  }
  if (body !== undefined) {
    if (!body.trim()) return res.status(400).json({ error: "body is required" });
    patch.body = body.trim();
  }
  if (isActive !== undefined) patch.is_active = isActive;

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const supabase = getAdminSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("reservation_messages_templates")
    .select("id, owner_type, owner_id")
    .eq("id", templateId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  const row = existing as { id: string; owner_type: string; owner_id: string | null } | null;
  if (!row?.id) return res.status(404).json({ error: "Template introuvable" });

  // Only PRO-owned templates are editable from the PRO space
  if (row.owner_type !== "pro" || row.owner_id !== establishmentId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { error } = await supabase
    .from("reservation_messages_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("owner_type", "pro")
    .eq("owner_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// updateProReservation — the big one (~840 lines)
// ---------------------------------------------------------------------------

export const updateProReservation: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const reservationId = typeof req.params.reservationId === "string" ? req.params.reservationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!reservationId) return res.status(400).json({ error: "reservationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const statusRaw = asString(req.body.status);
  const paymentStatusRaw = asString(req.body.payment_status);
  const checkedInAtRaw = asString(req.body.checked_in_at);
  const refusalReasonCodeRaw = asString(req.body.refusal_reason_code) ?? asString(req.body.refusalReasonCode);
  const refusalReasonCustomRaw = asString(req.body.refusal_reason_custom) ?? asString(req.body.refusalReasonCustom);
  const isFromWaitlistRaw = typeof req.body.is_from_waitlist === "boolean" ? req.body.is_from_waitlist : typeof req.body.isFromWaitlist === "boolean" ? req.body.isFromWaitlist : undefined;
  const proMessageRaw = asString(req.body.pro_message) ?? asString(req.body.proMessage);
  const templateCodeRaw = asString(req.body.template_code) ?? asString(req.body.templateCode);

  const startsAtRaw = asString(req.body.starts_at) ?? asString(req.body.startsAt);
  const partySizeRaw = asNumber(req.body.party_size ?? req.body.partySize);
  const slotIdRaw = asString(req.body.slot_id) ?? asString(req.body.slotId);

  const metaPatchRaw = isRecord(req.body.meta_patch) ? (req.body.meta_patch as Record<string, unknown>) : isRecord(req.body.metaPatch) ? (req.body.metaPatch as Record<string, unknown>) : null;
  const metaDeleteKeysRaw = Array.isArray(req.body.meta_delete_keys)
    ? req.body.meta_delete_keys
    : Array.isArray(req.body.metaDeleteKeys)
      ? req.body.metaDeleteKeys
      : null;

  const patch: Record<string, unknown> = {};

  const supabase = getAdminSupabase();

  const notifyProMembersLocal = async (payload: { title: string; body: string; category: string; data?: Record<string, unknown> }) => {
    const { data: memberships } = await supabase
      .from("pro_establishment_memberships")
      .select("user_id")
      .eq("establishment_id", establishmentId)
      .limit(5000);

    const userIds = new Set<string>();
    for (const row of (memberships ?? []) as Array<{ user_id?: unknown }>) {
      const id = isRecord(row) ? asString(row.user_id) : null;
      if (id) userIds.add(id);
    }

    const out = Array.from(userIds).map((user_id) => ({
      user_id,
      establishment_id: establishmentId,
      category: payload.category,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    if (!out.length) return;

    // Best-effort: ignore notification errors.
    await supabase.from("pro_notifications").insert(out);
  };

  const { data: existing, error: existingErr } = await supabase
    .from("reservations")
    .select("status, payment_status, amount_deposit, meta, starts_at, ends_at, party_size, slot_id, user_id, booking_reference, checked_in_at")
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existing) return res.status(404).json({ error: "reservation introuvable" });

  const previousStatus = String((existing as { status?: unknown }).status ?? "");
  const previousPaymentStatus = String((existing as { payment_status?: unknown }).payment_status ?? "");
  const previousCheckedInAt = typeof (existing as any)?.checked_in_at === "string" ? String((existing as any).checked_in_at).trim() : "";
  const existingDepositCents =
    typeof (existing as { amount_deposit?: unknown }).amount_deposit === "number" && Number.isFinite((existing as { amount_deposit: number }).amount_deposit)
      ? Math.max(0, Math.round((existing as { amount_deposit: number }).amount_deposit))
      : 0;

  const consumerUserId = typeof (existing as any)?.user_id === "string" ? String((existing as any).user_id).trim() : "";
  const bookingReference = typeof (existing as any)?.booking_reference === "string" ? String((existing as any).booking_reference).trim() : "";

  // ---------------------------------------------------------------------------
  // PROTECTION WINDOW CHECK: Prevent cancellation/refusal of free reservations
  // within the protection window (X hours before the reservation starts)
  // ---------------------------------------------------------------------------
  const isNegativeStatusChange = statusRaw && (
    statusRaw === "refused" ||
    statusRaw === "cancelled_pro" ||
    statusRaw === "cancelled" ||
    statusRaw === "waitlist"
  );

  if (isNegativeStatusChange && previousStatus !== statusRaw) {
    // Only check protection if the reservation is confirmed/pending and unpaid
    const isPotentiallyProtected = (
      (previousStatus === "confirmed" || previousStatus === "pending_pro_validation") &&
      existingDepositCents === 0 &&
      previousPaymentStatus !== "paid"
    );

    if (isPotentiallyProtected) {
      const { data: protectionResult, error: protectionErr } = await supabase.rpc(
        "is_reservation_protected",
        { p_reservation_id: reservationId }
      );

      if (!protectionErr && protectionResult && (protectionResult as any).protected === true) {
        const hoursUntilStart = (protectionResult as any).hours_until_start ?? 0;
        const protectionWindowHours = (protectionResult as any).protection_window_hours ?? 2;

        return res.status(403).json({
          error: "reservation_protected",
          message: `Cette réservation gratuite ne peut pas être annulée ou refusée car elle est protégée (${Math.round(hoursUntilStart * 10) / 10}h avant le début, fenêtre de protection: ${protectionWindowHours}h)`,
          protection_details: protectionResult,
        });
      }
    }
  }

  if (statusRaw) {
    const allowedStatuses = new Set([
      "requested",
      "pending_pro_validation",
      "confirmed",
      "refused",
      "waitlist",
      "cancelled",
      "cancelled_user",
      "cancelled_pro",
      "noshow",
    ]);
    if (!allowedStatuses.has(statusRaw)) return res.status(400).json({ error: "status invalide" });

    // Deep business rule: strict state-machine transitions.
    if (!canTransitionReservationStatus({ from: previousStatus, to: statusRaw })) {
      return res.status(400).json({ error: "invalid_status_transition", from: previousStatus, to: statusRaw });
    }

    // Enforce: guaranteed reservations cannot be confirmed until payment is validated.
    if (statusRaw === "confirmed" && existingDepositCents > 0 && previousPaymentStatus !== "paid") {
      return res.status(409).json({ error: "Réservation garantie non payée" });
    }

    patch.status = statusRaw;

    // Keep refusal fields coherent
    if (statusRaw === "confirmed") {
      patch.refusal_reason_code = null;
      patch.refusal_reason_custom = null;
    }
  }

  if (paymentStatusRaw) {
    return res.status(403).json({ error: "payment_status_managed_by_system" });
  }

  if (checkedInAtRaw !== undefined) {
    if (checkedInAtRaw === "") {
      patch.checked_in_at = null;
    } else {
      const d = new Date(checkedInAtRaw);
      if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "checked_in_at invalide" });
      patch.checked_in_at = d.toISOString();
    }
  }

  if (startsAtRaw !== undefined) {
    const existingSlotId = typeof (existing as any)?.slot_id === "string" ? String((existing as any).slot_id) : "";
    const isChangingSlot = slotIdRaw !== undefined;

    // If the reservation is slot-based, time changes must happen through slot_id (the slot is the source of truth).
    if (existingSlotId && !isChangingSlot) {
      return res.status(400).json({ error: "starts_at_requires_slot_change" });
    }

    if (!startsAtRaw) return res.status(400).json({ error: "starts_at invalide" });
    const d = new Date(startsAtRaw);
    if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "starts_at invalide" });
    patch.starts_at = d.toISOString();
  }

  if (partySizeRaw !== undefined) {
    if (!Number.isFinite(partySizeRaw)) return res.status(400).json({ error: "party_size invalide" });
    const n = Math.max(1, Math.round(partySizeRaw));
    patch.party_size = n;
  }

  if (slotIdRaw !== undefined) {
    patch.slot_id = slotIdRaw ? slotIdRaw : null;
  }

  if (refusalReasonCodeRaw !== undefined) patch.refusal_reason_code = refusalReasonCodeRaw || null;
  if (refusalReasonCustomRaw !== undefined) patch.refusal_reason_custom = refusalReasonCustomRaw || null;
  if (isFromWaitlistRaw !== undefined) patch.is_from_waitlist = isFromWaitlistRaw;

  const existingMeta = (existing as { meta?: unknown }).meta;
  const metaBase = existingMeta && typeof existingMeta === "object" && existingMeta !== null ? (existingMeta as Record<string, unknown>) : {};

  const hadProposedChange = isRecord(metaBase.proposed_change);

  const allowedMetaKeys = new Set([
    "guest_first_name",
    "guest_last_name",
    "guest_phone",
    "guest_comment",
    "client_risk_score",
    "no_show_count",
    "guarantee_required",
    "modification_requested",
    "requested_change",
    "proposed_change",
    "present_at",
  ]);

  const nextMeta = { ...metaBase };

  if (metaPatchRaw) {
    for (const [k, v] of Object.entries(metaPatchRaw)) {
      if (!allowedMetaKeys.has(k)) continue;
      nextMeta[k] = v;
    }
  }

  if (metaDeleteKeysRaw) {
    for (const kRaw of metaDeleteKeysRaw) {
      const k = typeof kRaw === "string" ? kRaw : "";
      if (!k) continue;
      if (!allowedMetaKeys.has(k)) continue;
      delete nextMeta[k];
    }
  }

  if (proMessageRaw) {
    nextMeta.last_pro_message = {
      body: proMessageRaw,
      template_code: templateCodeRaw ?? null,
      at: new Date().toISOString(),
      by_user_id: userResult.user.id,
      by_role: permission.role,
    };
  }

  // Slot capacity guard + slot-as-truth if slot_id is set/changed.
  if (Object.prototype.hasOwnProperty.call(patch, "slot_id")) {
    const nextSlotId = patch.slot_id as string | null;
    if (nextSlotId) {
      const { data: slot, error: slotErr } = await supabase
        .from("pro_slots")
        .select("id, capacity, starts_at, ends_at")
        .eq("id", nextSlotId)
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      if (slotErr) return res.status(500).json({ error: slotErr.message });
      if (!slot) return res.status(400).json({ error: "slot_id invalide" });

      const slotStartsRaw = typeof (slot as any).starts_at === "string" ? String((slot as any).starts_at).trim() : "";
      const slotEndsRaw = typeof (slot as any).ends_at === "string" ? String((slot as any).ends_at).trim() : "";

      const slotStarts = slotStartsRaw ? new Date(slotStartsRaw) : null;
      if (!slotStarts || !Number.isFinite(slotStarts.getTime())) return res.status(400).json({ error: "slot_starts_at_invalid" });

      const slotStartsIso = slotStarts.toISOString();

      // If the caller tried to set starts_at along with slot_id, it must match the slot.
      if (startsAtRaw) {
        const d = new Date(startsAtRaw);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "starts_at invalide" });
        if (d.toISOString() !== slotStartsIso) return res.status(400).json({ error: "slot_starts_at_mismatch" });
      }

      // Slot is the source of truth
      patch.starts_at = slotStartsIso;
      if (slotEndsRaw) {
        const d = new Date(slotEndsRaw);
        patch.ends_at = Number.isFinite(d.getTime()) ? d.toISOString() : null;
      } else {
        patch.ends_at = null;
      }

      const cap = typeof (slot as { capacity?: unknown }).capacity === "number" ? Math.max(0, Math.round((slot as { capacity: number }).capacity)) : null;
      if (cap != null) {
        const currentPartySize = typeof (existing as { party_size?: unknown }).party_size === "number" ? Math.max(1, Math.round((existing as { party_size: number }).party_size)) : 1;
        const nextPartySize = typeof patch.party_size === "number" ? Math.max(1, Math.round(patch.party_size as number)) : currentPartySize;

        const { data: usedRows, error: usedErr } = await supabase
          .from("reservations")
          .select("party_size")
          .eq("establishment_id", establishmentId)
          .eq("slot_id", nextSlotId)
          .neq("id", reservationId)
          .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
          .limit(5000);

        if (usedErr) return res.status(500).json({ error: usedErr.message });

        const used = (usedRows ?? []).reduce((acc, row) => {
          const n = typeof (row as { party_size?: unknown }).party_size === "number" ? Math.max(0, Math.round((row as { party_size: number }).party_size)) : 0;
          return acc + n;
        }, 0);

        const remaining = Math.max(0, cap - used);
        if (remaining < nextPartySize) return res.status(400).json({ error: "Capacité insuffisante sur ce créneau" });
      }
    }
  }

  if (Object.keys(nextMeta).length !== Object.keys(metaBase).length || proMessageRaw || metaPatchRaw || metaDeleteKeysRaw) {
    patch.meta = nextMeta;
  }

  const hasProposedChange = isRecord(nextMeta.proposed_change);
  const proposedStartsAt = hasProposedChange ? asString((nextMeta.proposed_change as any)?.starts_at) : null;

  if (!Object.keys(patch).length) return res.status(400).json({ error: "No changes provided" });

  const nextStatus = typeof patch.status === "string" ? (patch.status as string) : previousStatus;

  const { error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  if (statusRaw && statusRaw !== previousStatus) {
    await supabase.from("system_logs").insert({
      actor_user_id: userResult.user.id,
      actor_role: `pro:${permission.role}`,
      action: "reservation.status_changed",
      entity_type: "reservation",
      entity_id: reservationId,
      payload: {
        establishment_id: establishmentId,
        previous_status: previousStatus,
        new_status: nextStatus,
        refusal_reason_code: refusalReasonCodeRaw ?? null,
        template_code: templateCodeRaw ?? null,
      },
    });

    try {
      const kind = String(nextStatus || "").toLowerCase();

      let consumerEventType: string | null = null;
      let adminType: string | null = null;

      if (kind === "confirmed") {
        consumerEventType = NotificationEventType.booking_confirmed;
        adminType = NotificationEventType.booking_confirmed;
      } else if (kind === "refused") {
        consumerEventType = NotificationEventType.booking_refused;
        adminType = NotificationEventType.booking_refused;
      } else if (kind === "waitlist") {
        consumerEventType = NotificationEventType.booking_waitlisted;
        adminType = NotificationEventType.booking_waitlisted;
      } else if (kind === "noshow") {
        consumerEventType = NotificationEventType.noshow_marked;
        adminType = NotificationEventType.noshow_marked;
      } else if (kind === "cancelled" || kind.startsWith("cancelled_")) {
        consumerEventType = NotificationEventType.booking_cancelled;
        adminType = NotificationEventType.booking_cancelled;
      }

      const ref = bookingReference || reservationId;
      const title = consumerEventType
        ? consumerEventType === NotificationEventType.booking_confirmed
          ? "Réservation confirmée"
          : consumerEventType === NotificationEventType.booking_refused
            ? "Réservation refusée"
            : consumerEventType === NotificationEventType.booking_waitlisted
              ? "Réservation en liste d'attente"
              : consumerEventType === NotificationEventType.noshow_marked
                ? "No-show marqué"
                : consumerEventType === NotificationEventType.booking_cancelled
                  ? "Réservation annulée"
                  : "Mise à jour réservation"
        : "Mise à jour réservation";

      const body = `Réservation ${ref} · ${previousStatus} → ${nextStatus}`;

      if (consumerEventType && consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: consumerEventType,
          metadata: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            previousStatus,
            nextStatus,
          },
        });
      }

      if (adminType) {
        void emitAdminNotification({
          type: adminType,
          title,
          body,
          data: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            previousStatus,
            nextStatus,
          },
        });
      }
    } catch (err) {
      log.warn({ err }, "reservation notification emit failed");
    }

    // ---- Send reservation status-change emails (best-effort, fire-and-forget) ----
    void (async () => {
      try {
        const kind = String(nextStatus || "").toLowerCase();
        if (!["confirmed", "refused", "cancelled_pro", "noshow"].includes(kind)) return;

        const startsAtIso = typeof (existing as any)?.starts_at === "string" ? String((existing as any).starts_at).trim() : "";
        const dateLabel = startsAtIso ? formatDateLongFr(startsAtIso) : "";
        const ref = bookingReference || reservationId;
        const partySize = typeof (existing as any)?.party_size === "number" && Number.isFinite((existing as any).party_size)
          ? Math.max(1, Math.round((existing as any).party_size)) : 1;
        const baseUrl = (process.env.PUBLIC_URL ?? "https://sortiraumaroc.com").replace(/\/+$/, "");

        // Fetch establishment name
        const { data: estData } = await supabase
          .from("establishments")
          .select("name")
          .eq("id", establishmentId)
          .maybeSingle();
        const establishmentName = typeof (estData as any)?.name === "string" ? String((estData as any).name).trim() : "";

        // Fetch consumer email + name
        let consumerEmail = "";
        let consumerName = "";
        if (consumerUserId) {
          const { data: authData } = await supabase.auth.admin.getUserById(consumerUserId);
          consumerEmail = typeof (authData?.user as any)?.email === "string" ? String((authData?.user as any).email).trim() : "";
          const meta = (authData?.user as any)?.user_metadata;
          consumerName = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
        }

        const consumerCtaUrl = `${baseUrl}/profile/bookings/${encodeURIComponent(reservationId)}`;

        if (kind === "confirmed" && consumerEmail) {
          await sendTemplateEmail({
            templateKey: "user_booking_pro_confirmed",
            lang: "fr",
            fromKey: "noreply",
            to: [consumerEmail],
            variables: {
              user_name: consumerName || "Client",
              booking_ref: ref,
              date: dateLabel,
              guests: String(partySize),
              establishment: establishmentName,
              cta_url: consumerCtaUrl,
            },
            ctaUrl: consumerCtaUrl,
            meta: {
              source: "pro.updateProReservation",
              reservation_id: reservationId,
              establishment_id: establishmentId,
            },
          });
        }

        if (kind === "refused" && consumerEmail) {
          const reasonCode = typeof (patch as any)?.refusal_reason_code === "string" ? String((patch as any).refusal_reason_code).trim() : "";
          await sendTemplateEmail({
            templateKey: "user_booking_refused",
            lang: "fr",
            fromKey: "noreply",
            to: [consumerEmail],
            variables: {
              user_name: consumerName || "Client",
              booking_ref: ref,
              date: dateLabel,
              guests: String(partySize),
              establishment: establishmentName,
              reason: reasonCode || "Non précisée",
              cta_url: consumerCtaUrl,
            },
            ctaUrl: consumerCtaUrl,
            meta: {
              source: "pro.updateProReservation",
              reservation_id: reservationId,
              establishment_id: establishmentId,
              refusal_reason_code: reasonCode,
            },
          });
        }

        if (kind === "cancelled_pro" && consumerEmail) {
          await sendTemplateEmail({
            templateKey: "user_booking_cancelled_by_pro",
            lang: "fr",
            fromKey: "noreply",
            to: [consumerEmail],
            variables: {
              user_name: consumerName || "Client",
              booking_ref: ref,
              date: dateLabel,
              guests: String(partySize),
              establishment: establishmentName,
              cta_url: consumerCtaUrl,
            },
            ctaUrl: consumerCtaUrl,
            meta: {
              source: "pro.updateProReservation",
              reservation_id: reservationId,
              establishment_id: establishmentId,
            },
          });
        }

        if (kind === "noshow" && consumerEmail) {
          await sendTemplateEmail({
            templateKey: "user_no_show_notification",
            lang: "fr",
            fromKey: "noreply",
            to: [consumerEmail],
            variables: {
              user_name: consumerName || "Client",
              booking_ref: ref,
              date: dateLabel,
              establishment: establishmentName,
              cta_url: consumerCtaUrl,
            },
            ctaUrl: consumerCtaUrl,
            meta: {
              source: "pro.updateProReservation",
              reservation_id: reservationId,
              establishment_id: establishmentId,
            },
          });
        }
      } catch (err) {
        log.warn({ err }, "Best-effort: consumer notification for reservation update failed");
      }
    })();
  }

  if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus) {
    await supabase.from("system_logs").insert({
      actor_user_id: userResult.user.id,
      actor_role: `pro:${permission.role}`,
      action: "reservation.payment_status_changed",
      entity_type: "reservation",
      entity_id: reservationId,
      payload: {
        establishment_id: establishmentId,
        previous_payment_status: previousPaymentStatus,
        new_payment_status: paymentStatusRaw,
      },
    });

    try {
      const title =
        paymentStatusRaw === "paid"
          ? "Paiement reçu"
          : paymentStatusRaw === "refunded"
            ? "Paiement remboursé"
            : "Paiement en attente";

      const body = `Réservation ${reservationId} · ${previousPaymentStatus} → ${paymentStatusRaw}`;

      await notifyProMembersLocal({
        category: "billing",
        title,
        body,
        data: { reservationId, action: "payment_status_changed", previous: previousPaymentStatus, next: paymentStatusRaw, targetTab: "reservations" },
      });

      void emitAdminNotification({
        type: paymentStatusRaw === "paid" ? "payment_received" : paymentStatusRaw === "refunded" ? "payment_refunded" : "payment_pending",
        title,
        body,
        data: { reservationId, establishmentId, previousPaymentStatus, paymentStatus: paymentStatusRaw },
      });

      if (consumerUserId && paymentStatusRaw === "refunded") {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: NotificationEventType.refund_done,
          metadata: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            previousPaymentStatus,
            paymentStatus: paymentStatusRaw,
          },
        });
      }
    } catch (err) {
      log.warn({ err }, "payment status notification failed");
    }
  }

  if (hasProposedChange && !hadProposedChange) {
    try {
      const title = "Créneau alternatif proposé";
      const body = `Réservation ${reservationId}${proposedStartsAt ? ` · proposé: ${proposedStartsAt}` : ""}`;

      // Audit trail (best-effort)
      try {
        await supabase.from("system_logs").insert({
          actor_user_id: userResult.user.id,
          actor_role: `pro:${permission.role}`,
          action: "reservation.proposed_change_created",
          entity_type: "reservation",
          entity_id: reservationId,
          payload: {
            establishment_id: establishmentId,
            proposed_change: (nextMeta as any)?.proposed_change ?? null,
          },
        });
      } catch (err) {
        log.warn({ err }, "audit log insert failed");
      }

      await notifyProMembersLocal({
        category: "booking",
        title,
        body,
        data: { reservationId, action: "proposed_change_created", starts_at: proposedStartsAt, targetTab: "reservations" },
      });

      void emitAdminNotification({
        type: "alternative_slot_proposed",
        title,
        body,
        data: { reservationId, establishmentId, proposedStartsAt },
      });

      if (consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: NotificationEventType.booking_change_proposed,
          metadata: {
            reservationId,
            bookingReference: bookingReference || undefined,
            establishmentId,
            proposedStartsAt: proposedStartsAt || undefined,
          },
        });
      }
    } catch (err) {
      log.warn({ err }, "proposed change notification failed");
    }
  }

  if (consumerUserId && typeof proMessageRaw === "string" && proMessageRaw.trim()) {
    try {
      await emitConsumerUserEvent({
        supabase,
        userId: consumerUserId,
        eventType: NotificationEventType.message_received,
        metadata: {
          reservationId,
          bookingReference: bookingReference || undefined,
          establishmentId,
          from_role: "pro",
          channel: "template",
        },
      });
    } catch (err) {
      log.warn({ err }, "message event notification failed");
    }
  }

  // Finance pipeline (escrow/ledger)
  try {
    const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };

    if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus && paymentStatusRaw === "paid") {
      await ensureEscrowHoldForReservation({ reservationId, actor });
    }

    const cancelStatuses = new Set(["cancelled", "cancelled_user", "cancelled_pro", "refused", "waitlist"]);

    const computeCancelRefundPercent = async (): Promise<number> => {
      const defaults = { free_cancellation_hours: 24, cancellation_penalty_percent: 50 };

      let freeHours = defaults.free_cancellation_hours;
      let penaltyPct = defaults.cancellation_penalty_percent;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("free_cancellation_hours,cancellation_penalty_percent")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.free_cancellation_hours === "number") {
          freeHours = Math.max(0, Math.round((policyRow as any).free_cancellation_hours));
        }

        if (typeof (policyRow as any)?.cancellation_penalty_percent === "number") {
          penaltyPct = Math.min(100, Math.max(0, Math.round((policyRow as any).cancellation_penalty_percent)));
        }
      } catch (err) {
        log.warn({ err }, "fetch cancellation policy failed");
      }

      const startsAtIso = typeof (existing as any)?.starts_at === "string" ? String((existing as any).starts_at) : "";
      const startsAt = startsAtIso ? new Date(startsAtIso) : null;
      const hoursToStart = startsAt && Number.isFinite(startsAt.getTime()) ? (startsAt.getTime() - Date.now()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;

      return hoursToStart >= freeHours ? 100 : Math.max(0, 100 - penaltyPct);
    };

    const computeNoShowRefundPercent = async (): Promise<number> => {
      const defaults = { no_show_penalty_percent: 100, no_show_always_100_guaranteed: true };

      let penaltyPct = defaults.no_show_penalty_percent;
      let always100Guaranteed = defaults.no_show_always_100_guaranteed;

      try {
        const { data: policyRow } = await supabase
          .from("booking_policies")
          .select("no_show_penalty_percent,no_show_always_100_guaranteed")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (typeof (policyRow as any)?.no_show_penalty_percent === "number") {
          penaltyPct = Math.min(100, Math.max(0, Math.round((policyRow as any).no_show_penalty_percent)));
        }

        if (typeof (policyRow as any)?.no_show_always_100_guaranteed === "boolean") {
          always100Guaranteed = (policyRow as any).no_show_always_100_guaranteed;
        }
      } catch (err) {
        log.warn({ err }, "fetch noshow policy failed");
      }

      if (always100Guaranteed && existingDepositCents > 0) penaltyPct = 100;

      return Math.max(0, 100 - penaltyPct);
    };

    const refundPercentForCancel =
      statusRaw && (statusRaw === "cancelled" || statusRaw === "cancelled_user" || statusRaw === "cancelled_pro")
        ? await computeCancelRefundPercent()
        : 100;

    if (paymentStatusRaw && paymentStatusRaw !== previousPaymentStatus && paymentStatusRaw === "refunded") {
      await settleEscrowForReservation({ reservationId, actor, reason: "cancel", refundPercent: 100 });
    }

    if (statusRaw && cancelStatuses.has(statusRaw)) {
      await settleEscrowForReservation({ reservationId, actor, reason: "cancel", refundPercent: refundPercentForCancel });
    }

    if (statusRaw === "noshow") {
      const refundPercentForNoShow = await computeNoShowRefundPercent();
      await settleEscrowForReservation({ reservationId, actor, reason: "noshow", refundPercent: refundPercentForNoShow });
    }

    if (checkedInAtRaw && checkedInAtRaw !== "") {
      await settleEscrowForReservation({ reservationId, actor, reason: "checkin" });
    }
  } catch (e) {
    log.error({ err: e }, "finance pipeline failed (pro.updateReservation)");
  }

  // NEW: auto-promotion waitlist logic
  // When a reservation frees capacity (cancel, move slot, reduce party size), offer the slot to the next waitlist entry.
  try {
    const occupancy = new Set(["confirmed", "pending_pro_validation", "requested"]);
    const prevSlotId = typeof (existing as any)?.slot_id === "string" ? String((existing as any).slot_id) : "";

    const previousPartySize =
      typeof (existing as any)?.party_size === "number" && Number.isFinite((existing as any).party_size)
        ? Math.max(1, Math.round((existing as any).party_size))
        : 1;

    const nextPartySize =
      typeof (patch as any)?.party_size === "number" && Number.isFinite((patch as any).party_size)
        ? Math.max(1, Math.round((patch as any).party_size))
        : previousPartySize;

    const nextSlotIdRaw = Object.prototype.hasOwnProperty.call(patch, "slot_id") ? (patch.slot_id as any) : prevSlotId;
    const nextSlotId = typeof nextSlotIdRaw === "string" ? nextSlotIdRaw : nextSlotIdRaw == null ? "" : String(nextSlotIdRaw);

    const prevOccupies = occupancy.has(previousStatus);
    const nextOccupies = occupancy.has(nextStatus);

    const freedByStatus = prevOccupies && !nextOccupies;
    const freedBySlotMove = prevOccupies && prevSlotId && nextSlotId && prevSlotId !== nextSlotId;
    const freedByPartyReduction = prevOccupies && nextOccupies && prevSlotId && prevSlotId === nextSlotId && nextPartySize < previousPartySize;

    if (prevSlotId && (freedByStatus || freedBySlotMove || freedByPartyReduction)) {
      void triggerWaitlistPromotionForSlot({
        supabase: supabase as any,
        slotId: prevSlotId,
        actorRole: `pro:${permission.role}`,
        actorUserId: userResult.user.id,
        reason: "pro_update_freed_capacity",
      });
    }
  } catch (err) {
    log.warn({ err }, "waitlist promotion trigger failed");
  }

  // Reliability stats (v1): recompute after a no-show or a first check-in.
  // Best-effort: do not block business flows.
  try {
    const nextCheckedInAt = Object.prototype.hasOwnProperty.call(patch, "checked_in_at") ? (patch as any).checked_in_at : null;
    const hasFirstCheckin = !!nextCheckedInAt && !previousCheckedInAt;

    const shouldRecompute =
      !!consumerUserId && ((statusRaw && statusRaw !== previousStatus && statusRaw === "noshow") || hasFirstCheckin);

    if (shouldRecompute) {
      await recomputeConsumerUserStatsV1({ supabase, userId: consumerUserId });
    }
  } catch (err) {
    log.warn({ err }, "recompute consumer stats failed");
  }

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// QR scan & check-in
// ---------------------------------------------------------------------------

export const listProQrScanLogs: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("qr_scan_logs")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("scanned_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, logs: data ?? [] });
};

export const scanProQrCode: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const rawCode = asString(req.body.code);
  const holderName = asString(req.body.holder_name) ?? null;
  if (!rawCode) return res.status(400).json({ error: "code is required" });

  const lookup = extractReservationLookupFromQrCode(rawCode);
  const reservationId = lookup.reservationId;
  const bookingReference = lookup.bookingReference;

  if (!reservationId && !bookingReference) return res.status(400).json({ error: "Impossible de lire le QR code" });

  const supabase = getAdminSupabase();

  const query = supabase
    .from("reservations")
    .select("id,booking_reference,status,payment_status,amount_deposit,checked_in_at,starts_at,user_id")
    .eq("establishment_id", establishmentId)
    .limit(1);

  const { data: reservation, error: resErr } = reservationId
    ? await query.eq("id", reservationId).maybeSingle()
    : await query.eq("booking_reference", bookingReference as string).maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });

  const r = reservation as
    | {
        id: string;
        booking_reference: string | null;
        status: string | null;
        payment_status: string | null;
        amount_deposit: number | null;
        checked_in_at: string | null;
        starts_at: string | null;
      }
    | null;

  if (!r?.id) return res.status(404).json({ error: "Réservation introuvable" });

  const deposit = typeof r.amount_deposit === "number" && Number.isFinite(r.amount_deposit) ? r.amount_deposit : 0;
  const isGuaranteed = deposit > 0;

  const { data: alreadyAccepted, error: acceptedErr } = await supabase
    .from("qr_scan_logs")
    .select("id,scanned_at")
    .eq("reservation_id", r.id)
    .eq("result", "accepted")
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (acceptedErr) return res.status(500).json({ error: acceptedErr.message });

  const nowIso = new Date().toISOString();

  const finalize = async (args: { result: "accepted" | "rejected"; reason: string; message: string }) => {
    const { data: scanLog, error: logErr } = await supabase
      .from("qr_scan_logs")
      .insert({
        establishment_id: establishmentId,
        reservation_id: r.id,
        booking_reference: r.booking_reference,
        payload: JSON.stringify({ code: rawCode, reason: args.reason }),
        scanned_by_user_id: userResult.user.id,
        scanned_at: nowIso,
        holder_name: holderName,
        result: args.result,
      })
      .select("id")
      .single();

    if (logErr) {
      const msg = String(logErr.message ?? "");
      const duplicate = msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");
      if (duplicate && args.result === "accepted") {
        return res.json({
          ok: true,
          result: "rejected",
          reason: "already_used",
          message: "Déjà validé (utilisation unique)",
          log_id: (scanLog as { id?: string } | null)?.id ?? "",
          reservation: r,
        });
      }
      return res.status(500).json({ error: logErr.message });
    }

    if (args.result === "accepted") {
      if (!r.checked_in_at) {
        await supabase
          .from("reservations")
          .update({ checked_in_at: nowIso })
          .eq("id", r.id)
          .eq("establishment_id", establishmentId);

        // Reliability stats (v1): check-in improves reliability.
        try {
          const consumerUserId = typeof (r as any)?.user_id === "string" ? String((r as any).user_id).trim() : "";
          if (consumerUserId) {
            await recomputeConsumerUserStatsV1({ supabase, userId: consumerUserId });
          }
        } catch (err) {
          log.warn({ err }, "recompute consumer stats failed");
        }

        // Finance pipeline: check-in triggers settlement (release escrow -> commission + payout)
        try {
          const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };
          await settleEscrowForReservation({ reservationId: r.id, actor, reason: "checkin" });
        } catch (e) {
          log.error({ err: e }, "finance pipeline failed (pro.qrCheckin)");
        }
      }
    }

    return res.json({
      ok: true,
      result: args.result,
      reason: args.reason,
      message: args.message,
      log_id: (scanLog as { id: string }).id,
      reservation: r,
    });
  };

  if ((alreadyAccepted as { id?: string } | null)?.id) {
    return finalize({ result: "rejected", reason: "already_used", message: "Déjà validé (utilisation unique)" });
  }

  if ((r.status ?? "") !== "confirmed") {
    return finalize({ result: "rejected", reason: "not_confirmed", message: "Réservation non confirmée" });
  }

  if (isGuaranteed && (r.payment_status ?? "") !== "paid") {
    return finalize({ result: "rejected", reason: "unpaid", message: "Réservation garantie non payée" });
  }

  return finalize({ result: "accepted", reason: "ok", message: "Validation acceptée" });
};

// ============================================================================
// POST /api/pro/establishments/:establishmentId/checkin-by-user
// Check in a reservation using userId (from personal QR scan)
// ============================================================================
export const checkinByUserId: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const targetUserId = asString(req.body.userId);
  const reservationId = asString(req.body.reservationId);
  if (!targetUserId) return res.status(400).json({ error: "userId is required" });
  if (!reservationId) return res.status(400).json({ error: "reservationId is required" });

  const supabase = getAdminSupabase();

  // Look up the specific reservation
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id, booking_reference, status, payment_status, amount_deposit, checked_in_at, starts_at, party_size, user_id")
    .eq("id", reservationId)
    .eq("user_id", targetUserId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });

  const r = reservation as {
    id: string;
    booking_reference: string | null;
    status: string | null;
    payment_status: string | null;
    amount_deposit: number | null;
    checked_in_at: string | null;
    starts_at: string | null;
    party_size: number | null;
    user_id: string;
  } | null;

  if (!r?.id) return res.status(404).json({ error: "Réservation introuvable pour cet utilisateur" });

  // Already checked in?
  if (r.checked_in_at) {
    return res.json({
      ok: true,
      result: "rejected",
      reason: "already_checked_in",
      message: "Déjà validé",
      reservation: r,
    });
  }

  // Must be confirmed
  if ((r.status ?? "") !== "confirmed") {
    return res.json({
      ok: true,
      result: "rejected",
      reason: "not_confirmed",
      message: "Réservation non confirmée",
      reservation: r,
    });
  }

  // If guaranteed, must be paid
  const deposit = typeof r.amount_deposit === "number" && Number.isFinite(r.amount_deposit) ? r.amount_deposit : 0;
  if (deposit > 0 && (r.payment_status ?? "") !== "paid") {
    return res.json({
      ok: true,
      result: "rejected",
      reason: "unpaid",
      message: "Réservation garantie non payée",
      reservation: r,
    });
  }

  const nowIso = new Date().toISOString();

  // Insert scan log
  await supabase
    .from("qr_scan_logs")
    .insert({
      establishment_id: establishmentId,
      reservation_id: r.id,
      booking_reference: r.booking_reference,
      payload: JSON.stringify({ source: "checkin_by_user", userId: targetUserId }),
      scanned_by_user_id: userResult.user.id,
      scanned_at: nowIso,
      holder_name: null,
      result: "accepted",
    });

  // Check in the reservation
  await supabase
    .from("reservations")
    .update({ checked_in_at: nowIso })
    .eq("id", r.id)
    .eq("establishment_id", establishmentId);

  // Reliability stats: check-in improves reliability
  try {
    if (targetUserId) {
      await recomputeConsumerUserStatsV1({ supabase, userId: targetUserId });
    }
  } catch (err) {
    log.warn({ err }, "recompute consumer stats failed");
  }

  // Finance pipeline: check-in triggers settlement
  try {
    const actor = { userId: userResult.user.id, role: `pro:${permission.role}` };
    await settleEscrowForReservation({ reservationId: r.id, actor, reason: "checkin" });
  } catch (e) {
    log.error({ err: e }, "finance pipeline failed (pro.checkinByUser)");
  }

  return res.json({
    ok: true,
    result: "accepted",
    reason: "ok",
    message: "Entrée validée \u2713",
    reservation: {
      ...r,
      checked_in_at: nowIso,
    },
  });
};

// ---------------------------------------------------------------------------
// Pack billing
// ---------------------------------------------------------------------------

export const listProPackBilling: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  const [{ data: purchases, error: pErr }, { data: redemptions, error: rErr }] = await Promise.all([
    supabase
      .from("pack_purchases")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("pack_redemptions")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("redeemed_at", { ascending: false })
      .limit(1000),
  ]);

  if (pErr) return res.status(500).json({ error: pErr.message });
  if (rErr) return res.status(500).json({ error: rErr.message });

  res.json({ ok: true, purchases: purchases ?? [], redemptions: redemptions ?? [] });
};

// ---------------------------------------------------------------------------
// Seed fake reservations (demo mode only)
// ---------------------------------------------------------------------------

export const seedFakeReservations: RequestHandler = async (req, res) => {
  if (!isDemoRoutesAllowed()) return res.status(404).json({ error: "not_found" });

  const demoEmail = getDemoProEmail();
  if (!demoEmail) return res.status(404).json({ error: "not_found" });

  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const email = userResult.user.email ? normalizeEmail(userResult.user.email) : "";
  if (email !== demoEmail) return res.status(403).json({ error: "Forbidden" });

  const countPerStatusRaw = isRecord(req.body) ? asNumber(req.body.count_per_status) : undefined;
  const countPerStatus = Math.min(10, Math.max(1, Math.round(countPerStatusRaw ?? 2)));

  const supabase = getAdminSupabase();

  const { data: est, error: estErr } = await supabase.from("establishments").select("universe").eq("id", establishmentId).maybeSingle();
  if (estErr) return res.status(500).json({ error: estErr.message });
  const kind = typeof (est as { universe?: unknown } | null)?.universe === "string" ? (est as { universe: string }).universe : "unknown";

  const [{ data: slots, error: slotsErr }, { data: packs, error: packsErr }] = await Promise.all([
    supabase
      .from("pro_slots")
      .select("id,starts_at,base_price")
      .eq("establishment_id", establishmentId)
      .order("starts_at", { ascending: true })
      .limit(25),
    supabase
      .from("packs")
      .select("id,price")
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (slotsErr) return res.status(500).json({ error: slotsErr.message });
  if (packsErr) return res.status(500).json({ error: packsErr.message });

  const slotRows = (slots ?? []) as Array<{ id: string; starts_at: string; base_price: number | null }>;
  const packRows = (packs ?? []) as Array<{ id: string; price: number }>;

  const batchId = randomUUID();
  const now = new Date();

  const templates: Array<{
    status: "requested" | "confirmed" | "cancelled" | "noshow";
    payment: "pending" | "paid" | "refunded";
    timeOffsetsDays: number[];
    hours: number[];
  }> = [
    { status: "requested", payment: "pending", timeOffsetsDays: [1, 2, 3, 5, 7], hours: [18, 19, 20, 21] },
    { status: "confirmed", payment: "paid", timeOffsetsDays: [-1, -2, -4, -6, -9], hours: [19, 20, 21] },
    { status: "cancelled", payment: "refunded", timeOffsetsDays: [-2, -5, -8, -11], hours: [18, 20] },
    { status: "noshow", payment: "paid", timeOffsetsDays: [-3, -6, -10, -14], hours: [19, 21] },
  ];

  const amountSamplesMad = [180, 220, 260, 320, 380, 450, 520, 600, 750, 980];

  const demoGuests = [
    { first: "Youssef", last: "El Amrani", phone: "06 12 34 56 78" },
    { first: "Fatima Zahra", last: "El Idrissi", phone: "07 23 45 67 89" },
    { first: "Ahmed", last: "Al Fassi", phone: "06 98 76 54 32" },
    { first: "Khadija", last: "Benali", phone: "07 11 22 33 44" },
    { first: "Omar", last: "Berrada", phone: "06 55 66 77 88" },
    { first: "Salma", last: "Ait Lahcen", phone: "07 88 77 66 55" },
    { first: "Hicham", last: "El Kettani", phone: "06 33 44 55 66" },
    { first: "Nadia", last: "Chraibi", phone: "07 44 55 66 77" },
  ];

  const demoComments = [
    "Table en terrasse si possible",
    "Allergie: fruits a coque",
    "Anniversaire (petite attention)",
    "Arrivee un peu en retard",
    "Besoin d'une chaise bebe",
    "Sans gluten si possible",
    "Merci de confirmer par WhatsApp",
    "",
  ];

  const mkIso = (days: number, hour: number) =>
    mkIsoInTimeZoneDayOffset({
      baseDate: now,
      daysOffset: days,
      hour,
    });

  const rows: Array<Record<string, unknown>> = [];

  for (const t of templates) {
    for (let i = 0; i < countPerStatus; i += 1) {
      const offset = t.timeOffsetsDays[i % t.timeOffsetsDays.length];
      const hour = t.hours[i % t.hours.length];

      const slot = slotRows.length ? slotRows[(i + rows.length) % slotRows.length] : null;
      const pack = packRows.length ? packRows[(i + rows.length) % packRows.length] : null;

      const useSlot = !!slot && (t.status === "requested" || t.status === "confirmed");
      const usePack = !!pack && (t.status === "requested" || t.status === "confirmed") && (i % 2 === 1);

      const starts_at = useSlot ? slot!.starts_at : mkIso(offset, hour);

      const amountTotalCents = usePack
        ? pack!.price
        : useSlot && typeof slot!.base_price === "number"
          ? slot!.base_price
          : Math.round(amountSamplesMad[(i + rows.length) % amountSamplesMad.length] * 100);

      const depositForRequest = t.status === "requested" ? i % 2 === 1 : true;

      const payment_status =
        t.status === "requested"
          ? depositForRequest
            ? "paid"
            : "pending"
          : t.payment;

      const amountDepositCents =
        t.status === "requested"
          ? depositForRequest
            ? Math.round(amountTotalCents * 0.3)
            : null
          : Math.round(amountTotalCents * 0.3);

      const commission_percent = 10;
      const commission_amount = amountDepositCents ? Math.round((amountDepositCents * commission_percent) / 100) : null;

      const guest = demoGuests[(i + rows.length) % demoGuests.length];
      const comment = demoComments[(i + rows.length * 2) % demoComments.length];

      rows.push({
        booking_reference: `FAKE-${establishmentId.slice(0, 6)}-${randomUUID().slice(0, 8)}`,
        kind,
        establishment_id: establishmentId,
        user_id: null,
        status: t.status,
        starts_at,
        ends_at: null,
        party_size: kind === "hebergement" ? 2 : 2 + ((i + rows.length) % 5),
        amount_total: amountTotalCents,
        amount_deposit: amountDepositCents,
        currency: "MAD",
        payment_status,
        commission_percent,
        commission_amount,
        checked_in_at: t.status === "confirmed" && i % 2 === 0 ? new Date().toISOString() : null,
        meta: {
          demo: true,
          source: "seed",
          seed_batch: batchId,
          seeded_by_pro: userResult.user.id,
          seeded_by_role: permission.role,
          guest_first_name: guest.first,
          guest_last_name: guest.last,
          guest_phone: guest.phone,
          guest_comment: comment,
          client_risk_score: Math.max(35, 95 - (((i + rows.length) * 9) % 70)),
          no_show_count: ((i + rows.length) % 3) === 0 ? 1 : 0,
          ...(useSlot ? { slot_id: slot!.id } : {}),
          ...(usePack ? { pack_id: pack!.id } : {}),
        },
      });
    }
  }

  if (rows.length > 200) return res.status(400).json({ error: "Too many rows" });

  const { error: insertErr } = await supabase.from("reservations").insert(rows);
  if (insertErr) return res.status(500).json({ error: insertErr.message });

  res.json({ ok: true, inserted: rows.length, batch_id: batchId });
};

// ============================================
// Reservation History / Timeline
// ============================================

export const getReservationHistory: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);
  const reservationId = asString(req.params.reservationId);

  if (!establishmentId || !reservationId) {
    return res.status(400).json({ error: "establishmentId and reservationId are required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Fetch history
  const { data: history, error } = await supabase
    .from("reservation_history")
    .select("*")
    .eq("reservation_id", reservationId)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ history: history ?? [] });
};

export const logReservationAction: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const userEmail = sessionData.user.email ?? "Pro";
  const establishmentId = asString(req.params.establishmentId);
  const reservationId = asString(req.params.reservationId);

  if (!establishmentId || !reservationId) {
    return res.status(400).json({ error: "establishmentId and reservationId are required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  const body = req.body as Record<string, unknown>;
  const action = asString(body.action);
  const actionLabel = asString(body.action_label);
  const message = asString(body.message);
  const previousStatus = asString(body.previous_status);
  const newStatus = asString(body.new_status);
  const previousData = asJsonObject(body.previous_data);
  const newData = asJsonObject(body.new_data);

  if (!action || !actionLabel) {
    return res.status(400).json({ error: "action and action_label are required" });
  }

  const { data, error } = await supabase
    .from("reservation_history")
    .insert({
      reservation_id: reservationId,
      establishment_id: establishmentId,
      actor_type: "pro",
      actor_id: userId,
      actor_name: userEmail,
      action,
      action_label: actionLabel,
      previous_status: previousStatus,
      new_status: newStatus,
      previous_data: previousData,
      new_data: newData,
      message,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, entry: data });
};

export const listEstablishmentReservationHistory: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Parse query params
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const action = asString(req.query.action);

  // Build query
  let query = supabase
    .from("reservation_history")
    .select("*, reservations!inner(booking_reference, starts_at, party_size)")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) {
    query = query.eq("action", action);
  }

  const { data: history, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ history: history ?? [], limit, offset });
};
