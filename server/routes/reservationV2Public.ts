/**
 * Reservation V2 — Public (Consumer) Routes
 *
 * 18 endpoints for client-facing reservation operations:
 * - Availability lookup (calendar, day detail)
 * - Reservation CRUD (create, modify, cancel, upgrade)
 * - QR code, promo validation
 * - My reservations, my score
 * - Waitlist
 * - Quote requests
 * - No-show dispute response
 */

import type { Router, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { getSlotAvailability, getDayAvailability, getSlotDiscounts } from "../capacityManager";
import {
  createReservationV2,
  clientCancelReservation,
  upgradeFreeToPaid,
  processQrCheckIn,
} from "../reservationV2Logic";
import { recomputeClientScoreV2 } from "../clientScoringV2";
import {
  submitQuoteRequest,
  acceptQuote,
  declineQuote,
  sendQuoteMessage,
} from "../quoteRequestLogic";
import { clientRespondToNoShow } from "../noShowDisputeLogic";
import type { PaymentType, ClientDisputeResponse } from "../../shared/reservationTypesV2";
import {
  reservationCreateRateLimiter,
  reservationCancelRateLimiter,
  quoteRequestRateLimiter,
  disputeResponseRateLimiter,
  availabilityReadRateLimiter,
  upgradeRateLimiter,
} from "../middleware/rateLimiter";
import { auditClientAction } from "../auditLogV2";
import { getClientIp } from "../middleware/rateLimiter";
import {
  sanitizeText,
  sanitizePlain,
  isValidDateStr,
  isValidPartySize,
  isValidUUID,
  validatePaymentType,
  sanitizeObject,
} from "../sanitizeV2";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams, zIdParam } from "../lib/validate";
import {
  CreateReservationV2Schema,
  ModifyReservationV2Schema,
  CancelReservationV2Schema,
  ValidateReservationPromoSchema,
  JoinWaitlistV2Schema,
  SubmitQuoteSchema,
  PostQuoteMessageSchema,
  RespondToNoShowDisputeSchema,
  ReservationIdParams,
  AvailabilityDateParams,
  EstablishmentAvailabilityParams,
} from "../schemas/reservationV2Public";

const log = createModuleLogger("reservationV2Public");

// =============================================================================
// Auth helper (mirrors public.ts pattern)
// =============================================================================

type ConsumerAuthOk = { ok: true; userId: string };
type ConsumerAuthErr = { ok: false; status: number; error: string };
type ConsumerAuthResult = ConsumerAuthOk | ConsumerAuthErr;

async function getConsumerUserId(req: Request): Promise<ConsumerAuthResult> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "missing_token" };

  const supabase = getAdminSupabase();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "unauthorized" };
    return { ok: true, userId: data.user.id };
  } catch (err) {
    log.warn({ err }, "Failed to authenticate consumer token");
    return { ok: false, status: 401, error: "unauthorized" };
  }
}

function requireAuth(
  authResult: ConsumerAuthResult,
  res: Response,
): authResult is ConsumerAuthOk {
  if (authResult.ok === false) {
    res.status(authResult.status).json({ error: authResult.error });
    return false;
  }
  return true;
}

// =============================================================================
// 1. GET /api/establishments/:id/availability
// =============================================================================

async function getEstablishmentAvailability(req: Request, res: Response) {
  try {
    const establishmentId = req.params.id;
    const date = String(req.query.date ?? "");
    if (!establishmentId || !date) {
      return res.status(400).json({ error: "establishment_id and date are required" });
    }

    const supabase = getAdminSupabase();
    const result = await getDayAvailability({ supabase, establishmentId, date });

    // Get discounts for this date
    const discounts = await getSlotDiscounts({ supabase, establishmentId, date });

    res.json({ ok: true, availability: result, discounts });
  } catch (err) {
    log.error({ err }, "getEstablishmentAvailability failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 2. GET /api/establishments/:id/availability/:date
// =============================================================================

async function getEstablishmentDateAvailability(req: Request, res: Response) {
  try {
    const establishmentId = req.params.id;
    const date = req.params.date;
    if (!establishmentId || !date) {
      return res.status(400).json({ error: "establishment_id and date are required" });
    }

    const time = String(req.query.time ?? "");
    const supabase = getAdminSupabase();

    if (time) {
      // Specific time slot
      const slot = await getSlotAvailability({ supabase, establishmentId, date, time });
      const discounts = await getSlotDiscounts({ supabase, establishmentId, date, time });
      return res.json({ ok: true, slot, discounts });
    }

    // Full day
    const result = await getDayAvailability({ supabase, establishmentId, date });
    const discounts = await getSlotDiscounts({ supabase, establishmentId, date });
    res.json({ ok: true, availability: result, discounts });
  } catch (err) {
    log.error({ err }, "getEstablishmentDateAvailability failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 3. POST /api/reservations
// =============================================================================

async function createReservation(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body as Record<string, unknown>;
    const establishmentId = String(body.establishment_id ?? "").trim();
    const startsAt = String(body.starts_at ?? "").trim();
    const partySize = Number(body.party_size ?? 0);
    const paymentType = validatePaymentType(body.payment_type) ?? "free" as PaymentType;

    // Validate inputs
    if (!establishmentId || !isValidUUID(establishmentId)) {
      return res.status(400).json({ error: "establishment_id invalide" });
    }
    if (!startsAt || !isValidDateStr(startsAt)) {
      return res.status(400).json({ error: "starts_at invalide (format ISO requis)" });
    }
    if (!isValidPartySize(partySize)) {
      return res.status(400).json({ error: "party_size invalide (1-15 personnes)" });
    }

    const supabase = getAdminSupabase();
    const result = await createReservationV2({
      supabase,
      input: {
        userId: auth.userId,
        establishmentId,
        slotId: typeof body.slot_id === "string" ? body.slot_id : undefined,
        startsAt,
        partySize,
        paymentType,
        promoCodeId: typeof body.promo_code_id === "string" ? body.promo_code_id : undefined,
        meta: typeof body.meta === "object" && body.meta ? body.meta as Record<string, unknown> : undefined,
      },
    });

    if (!result.ok) {
      return res.status(result.errorCode === "user_suspended" ? 403 : 409).json({
        error: result.error,
        errorCode: result.errorCode,
      });
    }

    // Audit log
    void auditClientAction("client.reservation.create", {
      userId: auth.userId,
      targetType: "reservation",
      targetId: String((result.reservation as Record<string, unknown>)?.id ?? ""),
      details: { establishmentId, startsAt, partySize, paymentType },
      ip: getClientIp(req),
    });

    res.status(201).json({ ok: true, reservation: result.reservation, waitlisted: result.waitlisted });
  } catch (err) {
    log.error({ err }, "createReservation failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 4. PUT /api/reservations/:id
// =============================================================================

async function modifyReservation(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const reservationId = req.params.id;
    const body = req.body as Record<string, unknown>;
    const supabase = getAdminSupabase();

    // Fetch reservation
    const { data: reservation, error } = await supabase
      .from("reservations")
      .select("id, user_id, status, starts_at, establishment_id")
      .eq("id", reservationId)
      .eq("user_id", auth.userId)
      .single();

    if (error || !reservation) {
      return res.status(404).json({ error: "reservation_not_found" });
    }

    const r = reservation as Record<string, unknown>;

    // Check status allows modification
    const modifiable = new Set(["requested", "pending_pro_validation", "confirmed"]);
    if (!modifiable.has(String(r.status))) {
      return res.status(409).json({ error: `Cannot modify reservation in status: ${r.status}` });
    }

    // Check > 24h before
    const startsAt = new Date(String(r.starts_at));
    const hoursUntil = (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return res.status(409).json({ error: "Cannot modify reservation less than 24h before start" });
    }

    // Build patch
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.starts_at) patch.starts_at = body.starts_at;
    if (body.party_size && Number(body.party_size) >= 1) patch.party_size = Number(body.party_size);
    if (body.slot_id) patch.slot_id = body.slot_id;

    await supabase
      .from("reservations")
      .update(patch)
      .eq("id", reservationId);

    res.json({ ok: true, message: "Reservation modified" });
  } catch (err) {
    log.error({ err }, "modifyReservation failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 5. DELETE /api/reservations/:id
// =============================================================================

async function cancelReservation(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const result = await clientCancelReservation({
      supabase,
      reservationId: req.params.id,
      userId: auth.userId,
      reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    });

    if (!result.ok) {
      return res.status(409).json({ error: result.error });
    }

    void auditClientAction("client.reservation.cancel", {
      userId: auth.userId,
      targetType: "reservation",
      targetId: req.params.id,
      details: { cancellationType: result.cancellationType, reason: req.body?.reason },
      ip: getClientIp(req),
    });

    res.json({ ok: true, newStatus: result.newStatus, cancellationType: result.cancellationType });
  } catch (err) {
    log.error({ err }, "cancelReservation failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 6. POST /api/reservations/:id/upgrade
// =============================================================================

async function upgradeReservation(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const result = await upgradeFreeToPaid({
      supabase,
      reservationId: req.params.id,
      userId: auth.userId,
    });

    if (!result.ok) {
      return res.status(409).json({ error: result.error });
    }

    void auditClientAction("client.reservation.upgrade", {
      userId: auth.userId,
      targetType: "reservation",
      targetId: req.params.id,
      ip: getClientIp(req),
    });

    res.json({ ok: true, newStatus: result.newStatus });
  } catch (err) {
    log.error({ err }, "upgradeReservation failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 7. GET /api/reservations/:id/qrcode
// =============================================================================

async function getReservationQrCode(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("reservations")
      .select("id, qr_code_token, status, starts_at, establishment_id")
      .eq("id", req.params.id)
      .eq("user_id", auth.userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "reservation_not_found" });
    }

    const r = data as Record<string, unknown>;
    if (!r.qr_code_token) {
      return res.status(404).json({ error: "no_qr_code" });
    }

    res.json({
      ok: true,
      qrCodeToken: r.qr_code_token,
      status: r.status,
      startsAt: r.starts_at,
    });
  } catch (err) {
    log.error({ err }, "getReservationQrCode failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 8. POST /api/reservations/validate-promo
// =============================================================================

async function validatePromoCode(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body as Record<string, unknown>;
    const code = String(body.code ?? "").trim().toUpperCase();
    const establishmentId = String(body.establishment_id ?? "");
    const date = String(body.date ?? "");

    if (!code || !establishmentId) {
      return res.status(400).json({ error: "code and establishment_id are required" });
    }

    const supabase = getAdminSupabase();

    // Check promo code in establishment_slot_discounts or promo_codes table
    const { data: promo, error } = await supabase
      .from("establishment_slot_discounts")
      .select("id, discount_type, discount_value, label, is_active, start_date, end_date")
      .eq("establishment_id", establishmentId)
      .eq("label", code)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !promo) {
      return res.json({ ok: false, valid: false, error: "Code promo invalide" });
    }

    const p = promo as Record<string, unknown>;

    // Check date range
    if (p.start_date && date && String(p.start_date) > date) {
      return res.json({ ok: false, valid: false, error: "Code promo pas encore actif" });
    }
    if (p.end_date && date && String(p.end_date) < date) {
      return res.json({ ok: false, valid: false, error: "Code promo expiré" });
    }

    res.json({
      ok: true,
      valid: true,
      discount: {
        id: p.id,
        type: p.discount_type,
        value: p.discount_value,
        label: p.label,
      },
    });
  } catch (err) {
    log.error({ err }, "validatePromoCode failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 9. GET /api/me/reservations
// =============================================================================

async function getMyReservations(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const status = String(req.query.status ?? "");
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Number(req.query.offset ?? 0);
    const upcoming = req.query.upcoming === "true";
    const nowIso = new Date().toISOString();

    let query = supabase
      .from("reservations")
      .select(`
        id, establishment_id, starts_at, party_size, status, type, payment_type,
        stock_type, booking_reference, qr_code_token, created_at, updated_at,
        cancellation_reason, cancelled_at, pro_custom_message, consumed_at,
        establishments!inner(name, slug, cover_image_url, city)
      `)
      .eq("user_id", auth.userId)
      .order("starts_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (upcoming) {
      query = query.gt("starts_at", nowIso).not("status", "in", "(cancelled,cancelled_user,cancelled_pro,cancelled_waitlist_expired,refused,expired)");
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true, reservations: data ?? [] });
  } catch (err) {
    log.error({ err }, "getMyReservations failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 10. GET /api/me/score
// =============================================================================

async function getMyScore(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const result = await recomputeClientScoreV2({ supabase, userId: auth.userId });

    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "getMyScore failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 11. POST /api/waitlist
// =============================================================================

async function joinWaitlist(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body as Record<string, unknown>;
    const establishmentId = String(body.establishment_id ?? "").trim();
    const slotId = typeof body.slot_id === "string" ? body.slot_id.trim() : null;
    const startsAt = String(body.starts_at ?? "").trim();
    const partySize = Number(body.party_size ?? 1);

    if (!establishmentId || !startsAt) {
      return res.status(400).json({ error: "establishment_id and starts_at are required" });
    }

    const supabase = getAdminSupabase();
    const nowIso = new Date().toISOString();

    // Check if already on waitlist for this slot
    const { data: existing } = await supabase
      .from("waitlist_entries")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("establishment_id", establishmentId)
      .eq("slot_id", slotId)
      .in("status", ["waiting", "queued", "offer_sent"])
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "already_on_waitlist" });
    }

    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .insert({
        user_id: auth.userId,
        establishment_id: establishmentId,
        slot_id: slotId,
        starts_at: startsAt,
        party_size: partySize,
        status: "waiting",
        created_at: nowIso,
      })
      .select("id")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ ok: true, waitlistEntryId: (entry as any).id });
  } catch (err) {
    log.error({ err }, "joinWaitlist failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 12. POST /api/waitlist/:id/confirm
// =============================================================================

async function confirmWaitlistSlot(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const entryId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .select("id, user_id, establishment_id, slot_id, starts_at, party_size, status, offer_expires_at")
      .eq("id", entryId)
      .eq("user_id", auth.userId)
      .single();

    if (error || !entry) {
      return res.status(404).json({ error: "waitlist_entry_not_found" });
    }

    const e = entry as Record<string, unknown>;
    if (String(e.status) !== "offer_sent") {
      return res.status(409).json({ error: "No offer pending for this waitlist entry" });
    }

    // Check offer hasn't expired (30 min)
    if (e.offer_expires_at && new Date(String(e.offer_expires_at)) < new Date()) {
      return res.status(409).json({ error: "Offer expired" });
    }

    // Convert to reservation
    const result = await createReservationV2({
      supabase,
      input: {
        userId: auth.userId,
        establishmentId: String(e.establishment_id),
        slotId: typeof e.slot_id === "string" ? e.slot_id : undefined,
        startsAt: String(e.starts_at),
        partySize: Number(e.party_size),
        paymentType: "free",
        meta: { from_waitlist: true, waitlist_entry_id: entryId },
      },
    });

    if (!result.ok) {
      return res.status(409).json({ error: result.error, errorCode: result.errorCode });
    }

    // Mark waitlist entry as converted
    await supabase
      .from("waitlist_entries")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", entryId);

    res.json({ ok: true, reservation: result.reservation });
  } catch (err) {
    log.error({ err }, "confirmWaitlistSlot failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 13. POST /api/quotes
// =============================================================================

async function submitQuote(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body as Record<string, unknown>;
    const supabase = getAdminSupabase();

    const quoteEstId = String(body.establishment_id ?? "").trim();
    if (!quoteEstId || !isValidUUID(quoteEstId)) {
      return res.status(400).json({ error: "establishment_id invalide" });
    }

    const result = await submitQuoteRequest({
      supabase,
      input: {
        userId: auth.userId,
        establishmentId: quoteEstId,
        partySize: Number(body.party_size ?? 0),
        preferredDate: typeof body.preferred_date === "string" ? body.preferred_date : undefined,
        preferredTimeSlot: typeof body.preferred_time_slot === "string" ? body.preferred_time_slot : undefined,
        isDateFlexible: body.is_date_flexible === true,
        eventType: (body.event_type as any) ?? "other",
        eventTypeOther: typeof body.event_type_other === "string" ? sanitizePlain(body.event_type_other, 200) : undefined,
        requirements: typeof body.requirements === "string" ? sanitizeText(body.requirements, 2000) : undefined,
        budgetIndication: typeof body.budget_indication === "string" ? sanitizePlain(body.budget_indication, 100) : undefined,
        contactPhone: typeof body.contact_phone === "string" ? sanitizePlain(body.contact_phone, 20) : undefined,
        contactEmail: typeof body.contact_email === "string" ? sanitizePlain(body.contact_email, 100) : undefined,
      },
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ ok: true, quoteId: result.quoteId });
  } catch (err) {
    log.error({ err }, "submitQuote failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 14. GET /api/me/quotes
// =============================================================================

async function getMyQuotes(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("quote_requests")
      .select(`
        id, establishment_id, party_size, preferred_date, preferred_time_slot,
        is_date_flexible, event_type, status, created_at, updated_at,
        acknowledged_at, acknowledge_deadline, quote_deadline,
        establishments!inner(name, slug, cover_image_url, city)
      `)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, quotes: data ?? [] });
  } catch (err) {
    log.error({ err }, "getMyQuotes failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 15. GET /api/quotes/:id
// =============================================================================

async function getQuoteDetail(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const { data: quote, error } = await supabase
      .from("quote_requests")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", auth.userId)
      .single();

    if (error || !quote) {
      return res.status(404).json({ error: "quote_not_found" });
    }

    // Get messages
    const { data: messages } = await supabase
      .from("quote_messages")
      .select("id, sender_type, sender_id, content, attachments, created_at")
      .eq("quote_request_id", req.params.id)
      .order("created_at", { ascending: true });

    res.json({ ok: true, quote, messages: messages ?? [] });
  } catch (err) {
    log.error({ err }, "getQuoteDetail failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 16. POST /api/quotes/:id/messages
// =============================================================================

async function postQuoteMessage(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body as Record<string, unknown>;
    const supabase = getAdminSupabase();

    const result = await sendQuoteMessage({
      supabase,
      quoteId: req.params.id,
      senderType: "client",
      senderId: auth.userId,
      content: sanitizeText(String(body.content ?? ""), 5000),
      attachments: Array.isArray(body.attachments) ? body.attachments as any : undefined,
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ ok: true, messageId: result.messageId });
  } catch (err) {
    log.error({ err }, "postQuoteMessage failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 17. POST /api/quotes/:id/accept
// =============================================================================

async function acceptQuoteRoute(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const result = await acceptQuote({
      supabase,
      quoteId: req.params.id,
      userId: auth.userId,
    });

    if (!result.ok) {
      return res.status(409).json({ error: result.error });
    }

    res.json({ ok: true, quoteId: result.quoteId, reservationId: result.reservationId });
  } catch (err) {
    log.error({ err }, "acceptQuoteRoute failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 18. POST /api/no-show-disputes/:id/respond
// =============================================================================

async function respondToNoShowDispute(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body as Record<string, unknown>;
    const response = String(body.response ?? "") as ClientDisputeResponse;
    if (response !== "confirms_absence" && response !== "disputes") {
      return res.status(400).json({ error: "response must be 'confirms_absence' or 'disputes'" });
    }

    const supabase = getAdminSupabase();
    const result = await clientRespondToNoShow({
      supabase,
      disputeId: req.params.id,
      userId: auth.userId,
      response,
      evidence: Array.isArray(body.evidence) ? body.evidence as any : undefined,
    });

    if (!result.ok) {
      return res.status(409).json({ error: result.error });
    }

    void auditClientAction("client.dispute.respond", {
      userId: auth.userId,
      targetType: "dispute",
      targetId: req.params.id,
      details: { response, hasEvidence: Array.isArray(body.evidence) && body.evidence.length > 0 },
      ip: getClientIp(req),
    });

    res.json({ ok: true, newStatus: result.newStatus });
  } catch (err) {
    log.error({ err }, "respondToNoShowDispute failed");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerReservationV2PublicRoutes(app: Router): void {
  // Availability (anti-scraping rate limit)
  app.get("/api/establishments/:id/availability", zParams(EstablishmentAvailabilityParams), availabilityReadRateLimiter, getEstablishmentAvailability);
  app.get("/api/establishments/:id/availability/:date", zParams(AvailabilityDateParams), availabilityReadRateLimiter, getEstablishmentDateAvailability);

  // Reservations CRUD (strict rate limits on mutating operations)
  app.post("/api/reservations", reservationCreateRateLimiter, zBody(CreateReservationV2Schema), createReservation);
  app.put("/api/reservations/:id", zParams(ReservationIdParams), reservationCreateRateLimiter, zBody(ModifyReservationV2Schema), modifyReservation);
  app.delete("/api/reservations/:id", zParams(ReservationIdParams), reservationCancelRateLimiter, zBody(CancelReservationV2Schema), cancelReservation);
  app.post("/api/reservations/:id/upgrade", zParams(ReservationIdParams), upgradeRateLimiter, upgradeReservation);
  app.get("/api/reservations/:id/qrcode", zParams(ReservationIdParams), getReservationQrCode);
  app.post("/api/reservations/validate-promo", availabilityReadRateLimiter, zBody(ValidateReservationPromoSchema), validatePromoCode);

  // My reservations & score
  app.get("/api/me/reservations", getMyReservations);
  app.get("/api/me/score", getMyScore);

  // Waitlist
  app.post("/api/waitlist", reservationCreateRateLimiter, zBody(JoinWaitlistV2Schema), joinWaitlist);
  app.post("/api/waitlist/:id/confirm", zParams(ReservationIdParams), reservationCreateRateLimiter, confirmWaitlistSlot);

  // Quotes (strict anti-spam)
  app.post("/api/quotes", quoteRequestRateLimiter, zBody(SubmitQuoteSchema), submitQuote);
  app.get("/api/me/quotes", getMyQuotes);
  app.get("/api/quotes/:id", zParams(ReservationIdParams), getQuoteDetail);
  app.post("/api/quotes/:id/messages", zParams(ReservationIdParams), quoteRequestRateLimiter, zBody(PostQuoteMessageSchema), postQuoteMessage);
  app.post("/api/quotes/:id/accept", zParams(ReservationIdParams), reservationCreateRateLimiter, acceptQuoteRoute);

  // No-show dispute response (strict)
  app.post("/api/no-show-disputes/:id/respond", zParams(ReservationIdParams), disputeResponseRateLimiter, zBody(RespondToNoShowDisputeSchema), respondToNoShowDispute);
}
