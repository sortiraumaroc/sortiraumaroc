/**
 * Rental Consumer Routes — Authenticated consumer endpoints
 *
 * 6 endpoints:
 *  - POST /api/rental/reservations          — create rental reservation
 *  - GET  /api/rental/reservations          — list my rental reservations
 *  - GET  /api/rental/reservations/:id      — get reservation detail
 *  - POST /api/rental/reservations/:id/kyc  — upload KYC document reference
 *  - PUT  /api/rental/reservations/:id/cancel — cancel reservation
 *  - GET  /api/rental/kyc/reuse             — check reusable KYC
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { zBody, zParams } from "../lib/validate";
import { CreateRentalReservationSchema, UploadKycDocumentSchema, CancelRentalReservationSchema, RentalReservationIdParams } from "../schemas/rentalConsumer";

const log = createModuleLogger("rentalConsumer");
import {
  checkVehicleAvailability,
  calculateRentalPrice,
  generateBookingReference,
} from "../rentalLogic";
import { RENTAL_CANCELLABLE_STATUS_SET } from "../../shared/rentalTypes";

// =============================================================================
// Auth helpers (same pattern as packsPublic.ts)
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
    log.warn({ err }, "Consumer auth token verification failed");
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
// Helpers
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// =============================================================================
// 1. POST /api/rental/reservations — Create rental reservation
// =============================================================================

const createReservation: RequestHandler = async (req, res) => {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const {
      vehicle_id,
      pickup_city,
      pickup_date,
      pickup_time,
      dropoff_city,
      dropoff_date,
      dropoff_time,
      selected_options,
      insurance_plan_id,
    } = req.body ?? {};

    // Validate required fields
    if (!vehicle_id || !pickup_city || !pickup_date || !pickup_time || !dropoff_date || !dropoff_time) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // Check availability
    const availability = await checkVehicleAvailability({
      vehicleId: vehicle_id,
      pickupDate: pickup_date,
      dropoffDate: dropoff_date,
    });

    if (!availability.available) {
      res.status(409).json({ error: "vehicle_not_available" });
      return;
    }

    // Calculate price
    const quote = await calculateRentalPrice({
      vehicleId: vehicle_id,
      pickupDate: pickup_date,
      dropoffDate: dropoff_date,
      selectedOptions: selected_options || [],
      insurancePlanId: insurance_plan_id || null,
    });

    if (!quote) {
      res.status(404).json({ error: "vehicle_not_found" });
      return;
    }

    // Get vehicle's establishment_id
    const supabase = getAdminSupabase();
    const { data: vehicle } = await supabase
      .from("rental_vehicles")
      .select("establishment_id")
      .eq("id", vehicle_id)
      .single();

    if (!vehicle) {
      res.status(404).json({ error: "vehicle_not_found" });
      return;
    }

    // Get commission rate from establishment extra or default 15%
    const { data: est } = await supabase
      .from("establishments")
      .select("extra")
      .eq("id", vehicle.establishment_id)
      .single();

    const commissionPercent = (est?.extra as any)?.rental_commission_percent ?? 15;
    const commissionAmount = Math.round(quote.total_price * (commissionPercent / 100) * 100) / 100;

    // Generate booking reference
    const bookingReference = generateBookingReference();

    // Insert reservation
    const { data: reservation, error: insertErr } = await supabase
      .from("rental_reservations")
      .insert({
        booking_reference: bookingReference,
        user_id: auth.userId,
        establishment_id: vehicle.establishment_id,
        vehicle_id,
        pickup_city,
        pickup_date,
        pickup_time,
        dropoff_city: dropoff_city || pickup_city,
        dropoff_date,
        dropoff_time,
        selected_options: selected_options || [],
        insurance_plan_id: insurance_plan_id || null,
        deposit_amount: quote.deposit_amount,
        deposit_status: "pending",
        base_price: quote.base_price,
        options_total: quote.options_total,
        insurance_total: quote.insurance_total,
        total_price: quote.total_price,
        commission_percent: commissionPercent,
        commission_amount: commissionAmount,
        currency: "MAD",
        kyc_status: "pending",
        status: "pending_kyc",
      })
      .select()
      .single();

    if (insertErr) {
      log.error({ err: insertErr }, "createReservation insert error");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.status(201).json({ reservation, quote });
  } catch (err) {
    log.error({ err }, "createReservation error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. GET /api/rental/reservations — List my rental reservations
// =============================================================================

const listMyReservations: RequestHandler = async (req, res) => {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const status = asString(req.query.status);

    let query = supabase
      .from("rental_reservations")
      .select(`
        *,
        rental_vehicles (id, brand, model, category, photos, specs),
        establishments (id, name, city, logo_url)
      `)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      log.error({ err: error }, "listMyReservations error");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ reservations: data || [] });
  } catch (err) {
    log.error({ err }, "listMyReservations error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. GET /api/rental/reservations/:id — Get reservation detail
// =============================================================================

const getReservationDetail: RequestHandler = async (req, res) => {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const reservationId = req.params.id;
    if (!reservationId) {
      res.status(400).json({ error: "missing_reservation_id" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("rental_reservations")
      .select(`
        *,
        rental_vehicles (id, brand, model, category, year, photos, specs, mileage_policy, mileage_limit_per_day, pricing),
        establishments (id, name, city, address, phone, logo_url, hours, lat, lng),
        rental_insurance_plans (id, name, description, coverages, price_per_day, franchise, badge),
        rental_kyc_documents (id, document_type, side, photo_url, status, refusal_reason, created_at)
      `)
      .eq("id", reservationId)
      .eq("user_id", auth.userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "reservation_not_found" });
      return;
    }

    res.json({ reservation: data });
  } catch (err) {
    log.error({ err }, "getReservationDetail error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. POST /api/rental/reservations/:id/kyc — Upload KYC document reference
// =============================================================================

const uploadKycDocument: RequestHandler = async (req, res) => {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const reservationId = req.params.id;
    const { document_type, side, photo_url } = req.body ?? {};

    if (!reservationId || !document_type || !side || !photo_url) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // Validate document_type and side
    if (!["permit", "cin", "passport"].includes(document_type)) {
      res.status(400).json({ error: "invalid_document_type" });
      return;
    }
    if (!["front", "back"].includes(side)) {
      res.status(400).json({ error: "invalid_side" });
      return;
    }

    // Verify reservation belongs to user
    const supabase = getAdminSupabase();
    const { data: reservation } = await supabase
      .from("rental_reservations")
      .select("id, user_id")
      .eq("id", reservationId)
      .eq("user_id", auth.userId)
      .single();

    if (!reservation) {
      res.status(404).json({ error: "reservation_not_found" });
      return;
    }

    // Upsert KYC document (unique per reservation + document_type + side)
    const { data: doc, error: docErr } = await supabase
      .from("rental_kyc_documents")
      .upsert(
        {
          reservation_id: reservationId,
          user_id: auth.userId,
          document_type,
          side,
          photo_url,
          status: "pending",
        },
        { onConflict: "reservation_id,document_type,side" },
      )
      .select()
      .single();

    if (docErr) {
      log.error({ err: docErr }, "uploadKycDocument error");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.status(201).json({ document: doc });
  } catch (err) {
    log.error({ err }, "uploadKycDocument error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. PUT /api/rental/reservations/:id/cancel — Cancel reservation
// =============================================================================

const cancelReservation: RequestHandler = async (req, res) => {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const reservationId = req.params.id;
    if (!reservationId) {
      res.status(400).json({ error: "missing_reservation_id" });
      return;
    }

    const reason = asString(req.body?.reason) || null;

    const supabase = getAdminSupabase();

    // Fetch reservation
    const { data: reservation } = await supabase
      .from("rental_reservations")
      .select("id, status, user_id")
      .eq("id", reservationId)
      .eq("user_id", auth.userId)
      .single();

    if (!reservation) {
      res.status(404).json({ error: "reservation_not_found" });
      return;
    }

    // Check if cancellable
    if (!RENTAL_CANCELLABLE_STATUS_SET.has(reservation.status)) {
      res.status(409).json({ error: "reservation_not_cancellable", current_status: reservation.status });
      return;
    }

    // Update status
    const { data: updated, error: updateErr } = await supabase
      .from("rental_reservations")
      .update({
        status: "cancelled_user",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq("id", reservationId)
      .select()
      .single();

    if (updateErr) {
      log.error({ err: updateErr }, "cancelReservation error");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ reservation: updated });
  } catch (err) {
    log.error({ err }, "cancelReservation error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. GET /api/rental/kyc/reuse — Check if user has recent validated KYC
// =============================================================================

const checkReusableKyc: RequestHandler = async (req, res) => {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data, error } = await supabase
      .from("rental_kyc_documents")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("status", "validated")
      .gte("created_at", sixMonthsAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      log.error({ err: error }, "checkReusableKyc error");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    const documents = data || [];
    // Reusable if we have at least permit front+back and one ID document front+back
    const hasPermitFront = documents.some((d: any) => d.document_type === "permit" && d.side === "front");
    const hasPermitBack = documents.some((d: any) => d.document_type === "permit" && d.side === "back");
    const hasIdFront = documents.some((d: any) => (d.document_type === "cin" || d.document_type === "passport") && d.side === "front");
    const hasIdBack = documents.some((d: any) => (d.document_type === "cin" || d.document_type === "passport") && d.side === "back");

    const reusable = hasPermitFront && hasPermitBack && hasIdFront && hasIdBack;

    res.json({ reusable, documents });
  } catch (err) {
    log.error({ err }, "checkReusableKyc error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerRentalConsumerRoutes(app: Router): void {
  app.post("/api/rental/reservations", zBody(CreateRentalReservationSchema), createReservation);
  app.get("/api/rental/reservations", listMyReservations);
  app.get("/api/rental/reservations/:id", zParams(RentalReservationIdParams), getReservationDetail);
  app.post("/api/rental/reservations/:id/kyc", zParams(RentalReservationIdParams), zBody(UploadKycDocumentSchema), uploadKycDocument);
  app.put("/api/rental/reservations/:id/cancel", zParams(RentalReservationIdParams), zBody(CancelRentalReservationSchema), cancelReservation);
  app.get("/api/rental/kyc/reuse", checkReusableKyc);
}
