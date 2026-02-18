/**
 * Rental Public Routes
 *
 * 5 endpoints:
 *  - GET  /api/rental/search           — search rental vehicles
 *  - GET  /api/rental/vehicles/:id     — vehicle detail
 *  - GET  /api/rental/cities           — list cities with active rental establishments
 *  - GET  /api/rental/insurance-plans  — list active insurance plans
 *  - POST /api/rental/price-quote      — calculate price quote
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  searchRentalVehicles,
  getRentalVehicleDetail,
  getRentalCities,
  calculateRentalPrice,
} from "../rentalLogic";

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
  } catch {
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

function asBool(v: unknown): boolean | undefined {
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  if (typeof v === "boolean") return v;
  return undefined;
}

// =============================================================================
// 1. GET /api/rental/search — Search rental vehicles
// =============================================================================

const searchVehicles: RequestHandler = async (req, res) => {
  try {
    const params = {
      pickup_city: asString(req.query.pickup_city),
      dropoff_city: asString(req.query.dropoff_city),
      pickup_date: asString(req.query.pickup_date),
      pickup_time: asString(req.query.pickup_time),
      dropoff_date: asString(req.query.dropoff_date),
      dropoff_time: asString(req.query.dropoff_time),
      category: asString(req.query.category),
      transmission: asString(req.query.transmission),
      fuel_type: asString(req.query.fuel_type),
      min_seats: asNumber(req.query.min_seats),
      doors: asNumber(req.query.doors),
      ac: asBool(req.query.ac),
      mileage_policy: asString(req.query.mileage_policy),
      min_price: asNumber(req.query.min_price),
      max_price: asNumber(req.query.max_price),
      establishment_id: asString(req.query.establishment_id),
      sort_by: asString(req.query.sort_by),
      page: Math.max(1, asNumber(req.query.page) || 1),
      per_page: Math.min(50, Math.max(1, asNumber(req.query.per_page) || 20)),
    };

    const result = await searchRentalVehicles(params);

    res.json({
      vehicles: result.vehicles,
      total: result.total,
      page: params.page,
      per_page: params.per_page,
    });
  } catch (err) {
    console.error("[RentalPublic] searchVehicles error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. GET /api/rental/vehicles/:id — Vehicle detail
// =============================================================================

const getVehicleDetail: RequestHandler = async (req, res) => {
  try {
    const vehicleId = req.params.id;
    if (!vehicleId) {
      res.status(400).json({ error: "missing_vehicle_id" });
      return;
    }

    const vehicle = await getRentalVehicleDetail(vehicleId);

    if (!vehicle) {
      res.status(404).json({ error: "vehicle_not_found" });
      return;
    }

    res.json({ vehicle });
  } catch (err) {
    console.error("[RentalPublic] getVehicleDetail error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. GET /api/rental/cities — List cities with active rental establishments
// =============================================================================

const listCities: RequestHandler = async (_req, res) => {
  try {
    const cities = await getRentalCities();

    res.json({ cities });
  } catch (err) {
    console.error("[RentalPublic] listCities error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. GET /api/rental/insurance-plans — List active insurance plans
// =============================================================================

const listInsurancePlans: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("rental_insurance_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ plans: data ?? [] });
  } catch (err) {
    console.error("[RentalPublic] listInsurancePlans error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. POST /api/rental/price-quote — Calculate price quote
// =============================================================================

const getPriceQuote: RequestHandler = async (req, res) => {
  try {
    const { vehicle_id, pickup_date, dropoff_date, selected_options, insurance_plan_id } =
      req.body ?? {};

    if (!vehicle_id || !pickup_date || !dropoff_date) {
      res.status(400).json({
        error: "missing_required_fields",
        message: "vehicle_id, pickup_date and dropoff_date are required.",
      });
      return;
    }

    const quote = await calculateRentalPrice({
      vehicle_id,
      pickup_date,
      dropoff_date,
      selected_options: selected_options ?? [],
      insurance_plan_id: insurance_plan_id ?? undefined,
    });

    res.json(quote);
  } catch (err) {
    console.error("[RentalPublic] getPriceQuote error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerRentalPublicRoutes(app: Router): void {
  // Public (no auth required)
  app.get("/api/rental/search", searchVehicles);
  app.get("/api/rental/vehicles/:id", getVehicleDetail);
  app.get("/api/rental/cities", listCities);
  app.get("/api/rental/insurance-plans", listInsurancePlans);

  // Public (no auth required for price quotes)
  app.post("/api/rental/price-quote", getPriceQuote);
}
