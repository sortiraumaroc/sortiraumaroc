/**
 * Reservation V2 — Pro Routes
 *
 * 24 endpoints for pro-facing reservation management:
 * - Reservations list, calendar, actions (accept/refuse/hold/cancel)
 * - QR scan, venue confirmation, no-show declaration
 * - Capacity & discount configuration
 * - Auto-accept rules
 * - Quotes management
 * - Statistics
 */

import type { Router, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  proAcceptReservation,
  proRefuseReservation,
  proHoldReservation,
  proCancelReservation,
  proConfirmVenue,
  proDeclareNoShowVenue,
  processQrCheckIn,
} from "../reservationV2Logic";
import {
  getSlotAvailability,
  getDayAvailability,
  getSlotDiscounts,
} from "../capacityManager";
import {
  acknowledgeQuote,
  sendQuote,
  sendQuoteMessage,
} from "../quoteRequestLogic";
import {
  proActionRateLimiter,
  qrScanRateLimiter,
  getClientIp,
} from "../middleware/rateLimiter";
import { auditProAction } from "../auditLogV2";

// =============================================================================
// Auth helper (mirrors pro.ts pattern)
// =============================================================================

type ProUser = { id: string; email?: string | null };

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getProUser(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): Promise<ProUser | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return { id: data.user.id, email: data.user.email };
}

async function ensureEstablishmentMember(
  userId: string,
  establishmentId: string,
): Promise<boolean> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("pro_establishment_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  return !!data;
}

function getEstablishmentId(req: Parameters<RequestHandler>[0]): string {
  // Try query param, then header, then body
  return (
    String(req.query.establishment_id ?? "") ||
    String(req.headers["x-establishment-id"] ?? "") ||
    String((req.body as any)?.establishment_id ?? "")
  ).trim();
}

// =============================================================================
// 1. GET /api/pro/reservations
// =============================================================================

const listProReservations: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });

  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const status = String(req.query.status ?? "");
  const date = String(req.query.date ?? "");
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  let query = supabase
    .from("reservations")
    .select(`
      id, user_id, starts_at, party_size, status, type, payment_type,
      stock_type, booking_reference, qr_code_token, pro_processing_deadline,
      protection_window_start, created_at, updated_at, cancellation_reason,
      pro_venue_response, pro_venue_responded_at, consumed_at, checked_in_at,
      consumer_users!inner(full_name, email, phone)
    `)
    .eq("establishment_id", estId)
    .order("starts_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (date) {
    query = query.gte("starts_at", `${date}T00:00:00`).lt("starts_at", `${date}T23:59:59`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, reservations: data ?? [] });
};

// =============================================================================
// 2. GET /api/pro/reservations/calendar
// =============================================================================

const getProCalendar: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });

  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  const startDate = String(req.query.start_date ?? "");
  const endDate = String(req.query.end_date ?? "");
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "start_date and end_date are required" });
  }

  const supabase = getAdminSupabase();

  // Get reservation counts grouped by date and status
  const { data, error } = await supabase
    .from("reservations")
    .select("id, starts_at, status, party_size, payment_type")
    .eq("establishment_id", estId)
    .gte("starts_at", `${startDate}T00:00:00`)
    .lte("starts_at", `${endDate}T23:59:59`)
    .not("status", "in", "(cancelled,cancelled_user,cancelled_pro,cancelled_waitlist_expired,refused,expired)");

  if (error) return res.status(500).json({ error: error.message });

  // Group by date
  const byDate: Record<string, { count: number; totalGuests: number; statuses: Record<string, number> }> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const dateKey = String(r.starts_at ?? "").slice(0, 10);
    if (!byDate[dateKey]) byDate[dateKey] = { count: 0, totalGuests: 0, statuses: {} };
    byDate[dateKey].count++;
    byDate[dateKey].totalGuests += Number(r.party_size ?? 0);
    const st = String(r.status);
    byDate[dateKey].statuses[st] = (byDate[dateKey].statuses[st] ?? 0) + 1;
  }

  res.json({ ok: true, calendar: byDate });
};

// =============================================================================
// 3-6. Pro actions: accept, refuse, hold, cancel
// =============================================================================

const proAccept: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await proAcceptReservation({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
    customMessage: typeof req.body?.message === "string" ? req.body.message : undefined,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  void auditProAction("pro.reservation.accept", { proUserId: user.id, targetType: "reservation", targetId: req.params.id, details: { establishmentId: estId }, ip: getClientIp(req) });
  res.json({ ok: true, newStatus: result.newStatus });
};

const proRefuse: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await proRefuseReservation({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    customMessage: typeof req.body?.message === "string" ? req.body.message : undefined,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  void auditProAction("pro.reservation.refuse", { proUserId: user.id, targetType: "reservation", targetId: req.params.id, details: { establishmentId: estId, reason: req.body?.reason }, ip: getClientIp(req) });
  res.json({ ok: true, newStatus: result.newStatus });
};

const proHold: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await proHoldReservation({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
    customMessage: typeof req.body?.message === "string" ? req.body.message : undefined,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  // Hold is less sensitive, no audit needed
  res.json({ ok: true, newStatus: result.newStatus });
};

const proCancel: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await proCancelReservation({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
    reason: String(req.body?.reason ?? ""),
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  void auditProAction("pro.reservation.cancel", { proUserId: user.id, targetType: "reservation", targetId: req.params.id, details: { establishmentId: estId, reason: req.body?.reason }, ip: getClientIp(req) });
  res.json({ ok: true, newStatus: result.newStatus });
};

// =============================================================================
// 7. POST /api/pro/reservations/:id/request-deposit (future)
// =============================================================================

const proRequestDeposit: RequestHandler = async (req, res) => {
  // Placeholder for future deposit request flow
  res.status(501).json({ error: "Deposit request not yet implemented" });
};

// =============================================================================
// 8. POST /api/pro/reservations/:id/scan-qr
// =============================================================================

const proScanQr: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await processQrCheckIn({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  void auditProAction("pro.reservation.scan_qr", { proUserId: user.id, targetType: "reservation", targetId: req.params.id, details: { establishmentId: estId }, ip: getClientIp(req) });
  res.json({ ok: true, newStatus: result.newStatus });
};

// =============================================================================
// 9. POST /api/pro/reservations/:id/confirm-venue
// =============================================================================

const proConfirmVenueRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await proConfirmVenue({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  void auditProAction("pro.reservation.confirm_venue", { proUserId: user.id, targetType: "reservation", targetId: req.params.id, details: { establishmentId: estId }, ip: getClientIp(req) });
  res.json({ ok: true, newStatus: result.newStatus });
};

// =============================================================================
// 10. POST /api/pro/reservations/:id/declare-no-show
// =============================================================================

const proDeclareNoShow: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await proDeclareNoShowVenue({
    supabase,
    reservationId: req.params.id,
    establishmentId: estId,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  void auditProAction("pro.reservation.declare_no_show", { proUserId: user.id, targetType: "reservation", targetId: req.params.id, details: { establishmentId: estId }, ip: getClientIp(req) });
  res.json({ ok: true, newStatus: result.newStatus });
};

// =============================================================================
// 11-12. Capacity configuration
// =============================================================================

const getProCapacity: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishment_capacity")
    .select("*")
    .eq("establishment_id", estId)
    .order("day_of_week", { ascending: true, nullsFirst: false })
    .order("time_slot_start", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, capacity: data ?? [] });
};

const updateProCapacity: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const body = req.body as Record<string, unknown>;
  const configs = Array.isArray(body.configs) ? body.configs : [];
  if (configs.length === 0) {
    return res.status(400).json({ error: "configs array is required" });
  }

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Delete existing configs for this establishment, then insert new ones
  await supabase
    .from("establishment_capacity")
    .delete()
    .eq("establishment_id", estId);

  const rows = configs.map((c: any) => ({
    establishment_id: estId,
    day_of_week: c.day_of_week ?? null,
    specific_date: c.specific_date ?? null,
    time_slot_start: c.time_slot_start ?? "12:00",
    time_slot_end: c.time_slot_end ?? "23:00",
    slot_interval_minutes: c.slot_interval_minutes ?? 30,
    total_capacity: c.total_capacity ?? 50,
    occupation_duration_minutes: c.occupation_duration_minutes ?? 90,
    paid_stock_percentage: c.paid_stock_percentage ?? 88,
    free_stock_percentage: c.free_stock_percentage ?? 6,
    buffer_percentage: c.buffer_percentage ?? 6,
    is_closed: c.is_closed ?? false,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const { error } = await supabase
    .from("establishment_capacity")
    .insert(rows);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, count: rows.length });
};

// =============================================================================
// 13-16. Discounts CRUD
// =============================================================================

const getProDiscounts: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishment_slot_discounts")
    .select("*")
    .eq("establishment_id", estId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, discounts: data ?? [] });
};

const createProDiscount: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const body = req.body as Record<string, unknown>;
  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("establishment_slot_discounts")
    .insert({
      establishment_id: estId,
      applies_to: body.applies_to ?? "day_of_week",
      day_of_week: body.day_of_week ?? null,
      specific_date: body.specific_date ?? null,
      time_slot_start: body.time_slot_start ?? null,
      time_slot_end: body.time_slot_end ?? null,
      discount_type: body.discount_type ?? "percentage",
      discount_value: Number(body.discount_value ?? 0),
      label: String(body.label ?? ""),
      is_active: body.is_active !== false,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ok: true, id: (data as any).id });
};

const updateProDiscount: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const body = req.body as Record<string, unknown>;
  const supabase = getAdminSupabase();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.applies_to !== undefined) patch.applies_to = body.applies_to;
  if (body.day_of_week !== undefined) patch.day_of_week = body.day_of_week;
  if (body.specific_date !== undefined) patch.specific_date = body.specific_date;
  if (body.time_slot_start !== undefined) patch.time_slot_start = body.time_slot_start;
  if (body.time_slot_end !== undefined) patch.time_slot_end = body.time_slot_end;
  if (body.discount_type !== undefined) patch.discount_type = body.discount_type;
  if (body.discount_value !== undefined) patch.discount_value = Number(body.discount_value);
  if (body.label !== undefined) patch.label = String(body.label);
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.start_date !== undefined) patch.start_date = body.start_date;
  if (body.end_date !== undefined) patch.end_date = body.end_date;

  const { error } = await supabase
    .from("establishment_slot_discounts")
    .update(patch)
    .eq("id", req.params.id)
    .eq("establishment_id", estId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

const deleteProDiscount: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("establishment_slot_discounts")
    .delete()
    .eq("id", req.params.id)
    .eq("establishment_id", estId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// =============================================================================
// 17-18. Auto-accept rules
// =============================================================================

const getAutoAcceptRules: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_auto_accept_rules")
    .select("*")
    .eq("establishment_id", estId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, rules: data ?? [] });
};

const updateAutoAcceptRules: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const body = req.body as Record<string, unknown>;
  const rules = Array.isArray(body.rules) ? body.rules : [];
  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Replace all rules
  await supabase.from("pro_auto_accept_rules").delete().eq("establishment_id", estId);

  if (rules.length > 0) {
    const rows = rules.map((r: any) => ({
      establishment_id: estId,
      is_global: r.is_global ?? false,
      min_client_score: r.min_client_score ?? null,
      max_party_size: r.max_party_size ?? null,
      applicable_time_slots: r.applicable_time_slots ?? null,
      applicable_days: r.applicable_days ?? null,
      auto_request_deposit_below_score: r.auto_request_deposit_below_score ?? null,
      is_active: r.is_active !== false,
      created_at: nowIso,
      updated_at: nowIso,
    }));

    const { error } = await supabase.from("pro_auto_accept_rules").insert(rows);
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, count: rules.length });
};

// =============================================================================
// 19-22. Quotes management
// =============================================================================

const getProQuotes: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(`
      id, user_id, party_size, preferred_date, preferred_time_slot,
      is_date_flexible, event_type, event_type_other, requirements,
      budget_indication, status, created_at, updated_at,
      acknowledged_at, acknowledge_deadline, quote_deadline,
      consumer_users!inner(full_name, email, phone)
    `)
    .eq("establishment_id", estId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, quotes: data ?? [] });
};

const proAcknowledgeQuote: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const result = await acknowledgeQuote({ supabase, quoteId: req.params.id, establishmentId: estId });

  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ ok: true, newStatus: result.newStatus });
};

const proSendQuote: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const body = req.body as Record<string, unknown>;
  const supabase = getAdminSupabase();

  const result = await sendQuote({
    supabase,
    quoteId: req.params.id,
    establishmentId: estId,
    quoteMessage: String(body.message ?? ""),
    attachments: Array.isArray(body.attachments) ? body.attachments as any : undefined,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ ok: true, newStatus: result.newStatus });
};

const proSendQuoteMessage: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const body = req.body as Record<string, unknown>;
  const supabase = getAdminSupabase();

  const result = await sendQuoteMessage({
    supabase,
    quoteId: req.params.id,
    senderType: "pro",
    senderId: estId,
    content: String(body.content ?? ""),
    attachments: Array.isArray(body.attachments) ? body.attachments as any : undefined,
  });

  if (!result.ok) return res.status(400).json({ error: result.error });
  res.status(201).json({ ok: true, messageId: result.messageId });
};

// =============================================================================
// 23-24. Statistics
// =============================================================================

const getProReservationStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const supabase = getAdminSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Aggregate stats
  const { data: all } = await supabase
    .from("reservations")
    .select("id, status, payment_type, party_size")
    .eq("establishment_id", estId)
    .gt("created_at", thirtyDaysAgo);

  const reservations = (all ?? []) as Record<string, unknown>[];
  const total = reservations.length;
  const consumed = reservations.filter((r) => r.status === "consumed" || r.status === "consumed_default").length;
  const noShows = reservations.filter((r) => String(r.status).startsWith("no_show")).length;
  const cancelled = reservations.filter((r) => String(r.status).startsWith("cancelled")).length;
  const paid = reservations.filter((r) => r.payment_type === "paid").length;
  const free = reservations.filter((r) => r.payment_type === "free").length;
  const totalGuests = reservations.reduce((sum, r) => sum + Number(r.party_size ?? 0), 0);

  res.json({
    ok: true,
    stats: {
      period: "30d",
      total,
      consumed,
      noShows,
      cancelled,
      paid,
      free,
      totalGuests,
      fillRate: total > 0 ? Math.round((consumed / total) * 100) : 0,
      noShowRate: total > 0 ? Math.round((noShows / total) * 100) : 0,
      conversionRate: free > 0 ? Math.round((paid / (paid + free)) * 100) : 0,
    },
  });
};

const getProOccupancyStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id is required" });
  if (!(await ensureEstablishmentMember(user.id, estId))) return res.status(403).json({ error: "Forbidden" });

  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  const supabase = getAdminSupabase();

  const availability = await getDayAvailability({ supabase, establishmentId: estId, date });

  res.json({ ok: true, date, availability });
};

// =============================================================================
// Route registration
// =============================================================================

export function registerReservationV2ProRoutes(app: Router): void {
  // Reservation list & calendar
  app.get("/api/pro/reservations", listProReservations);
  app.get("/api/pro/reservations/calendar", getProCalendar);

  // Reservation actions (rate limited)
  app.post("/api/pro/reservations/:id/accept", proActionRateLimiter, proAccept);
  app.post("/api/pro/reservations/:id/refuse", proActionRateLimiter, proRefuse);
  app.post("/api/pro/reservations/:id/hold", proActionRateLimiter, proHold);
  app.post("/api/pro/reservations/:id/request-deposit", proActionRateLimiter, proRequestDeposit);
  app.post("/api/pro/reservations/:id/cancel", proActionRateLimiter, proCancel);
  app.post("/api/pro/reservations/:id/scan-qr", qrScanRateLimiter, proScanQr);
  app.post("/api/pro/reservations/:id/confirm-venue", proActionRateLimiter, proConfirmVenueRoute);
  app.post("/api/pro/reservations/:id/declare-no-show", proActionRateLimiter, proDeclareNoShow);

  // Capacity & discounts
  app.get("/api/pro/capacity", getProCapacity);
  app.put("/api/pro/capacity", proActionRateLimiter, updateProCapacity);
  app.get("/api/pro/discounts", getProDiscounts);
  app.post("/api/pro/discounts", proActionRateLimiter, createProDiscount);
  app.put("/api/pro/discounts/:id", proActionRateLimiter, updateProDiscount);
  app.delete("/api/pro/discounts/:id", proActionRateLimiter, deleteProDiscount);

  // Auto-accept rules
  app.get("/api/pro/auto-accept-rules", getAutoAcceptRules);
  app.put("/api/pro/auto-accept-rules", proActionRateLimiter, updateAutoAcceptRules);

  // Quotes
  app.get("/api/pro/quotes", getProQuotes);
  app.post("/api/pro/quotes/:id/acknowledge", proActionRateLimiter, proAcknowledgeQuote);
  app.post("/api/pro/quotes/:id/send-quote", proActionRateLimiter, proSendQuote);
  app.post("/api/pro/quotes/:id/messages", proActionRateLimiter, proSendQuoteMessage);

  // Statistics
  app.get("/api/pro/stats/reservations", getProReservationStats);
  app.get("/api/pro/stats/occupancy", getProOccupancyStats);
}
