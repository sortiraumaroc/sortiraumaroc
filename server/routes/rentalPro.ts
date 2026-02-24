import { zBody, zParams, zIdParam } from "../lib/validate";
import {
  createVehicleSchema,
  updateVehicleSchema,
  createVehicleBlockSchema,
  createRentalOptionSchema,
  updateRentalOptionSchema,
  kycValidateSchema,
  VehicleIdBlockIdParams,
} from "../schemas/rentalPro";

/**
 * Rental Pro Routes — Pro-facing vehicle rental management
 *
 * Vehicles (5):
 *  - GET    /api/pro/rental/vehicles              — list my vehicles
 *  - POST   /api/pro/rental/vehicles              — create vehicle
 *  - PUT    /api/pro/rental/vehicles/:id          — update vehicle
 *  - DELETE /api/pro/rental/vehicles/:id          — delete vehicle
 *  - POST   /api/pro/rental/vehicles/:id/photos   — upload photos (placeholder)
 *
 * Date blocks (3):
 *  - GET    /api/pro/rental/vehicles/:id/blocks           — list blocks
 *  - POST   /api/pro/rental/vehicles/:id/blocks           — create block
 *  - DELETE /api/pro/rental/vehicles/:vehicleId/blocks/:blockId — delete block
 *
 * Options (4):
 *  - GET    /api/pro/rental/options               — list options
 *  - POST   /api/pro/rental/options               — create option
 *  - PUT    /api/pro/rental/options/:id           — update option
 *  - DELETE /api/pro/rental/options/:id           — delete option
 *
 * Reservations (3):
 *  - GET    /api/pro/rental/reservations                  — list reservations
 *  - PUT    /api/pro/rental/reservations/:id/kyc-validate — validate/refuse KYC
 *  - POST   /api/pro/rental/reservations/:id/contract     — generate contract data
 *
 * Stats (1):
 *  - GET    /api/pro/rental/stats                 — dashboard stats
 */

import type { Router, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { generateRentalContractData } from "../rentalLogic";

const log = createModuleLogger("rentalPro");
import type {
  RentalVehicleCategory,
  RentalVehicleStatus,
  RentalKycStatus,
} from "../../shared/rentalTypes";

// =============================================================================
// Auth helpers (same pattern as packsPro.ts)
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

/** Get all establishment IDs for a pro user */
async function getProEstablishmentIds(userId: string): Promise<string[]> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userId);

  if (!data) return [];
  return (data as any[]).map((r) => r.establishment_id);
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
// VEHICLE MANAGEMENT
// =============================================================================

// GET /api/pro/rental/vehicles
const listVehicles: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ vehicles: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status) as RentalVehicleStatus | undefined;
    const categoryFilter = asString(req.query.category) as RentalVehicleCategory | undefined;

    let query = supabase
      .from("rental_vehicles")
      .select("*")
      .in("establishment_id", estIds)
      .order("sort_order", { ascending: true });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (categoryFilter) {
      query = query.eq("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ vehicles: data ?? [] });
  } catch (err) {
    log.error({ err }, "listVehicles error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/rental/vehicles
const createVehicle: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const {
      establishment_id,
      category,
      brand,
      model,
      year,
      photos,
      specs,
      mileage_policy,
      mileage_limit_per_day,
      extra_km_cost,
      pricing,
      high_season_dates,
      quantity,
      similar_vehicle,
      similar_models,
      status,
    } = req.body;

    if (!establishment_id || !category || !brand || !model) {
      res.status(400).json({ error: "Missing required fields: establishment_id, category, brand, model" });
      return;
    }

    const isMember = await ensureEstablishmentMember(user.id, establishment_id);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this establishment" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("rental_vehicles")
      .insert({
        establishment_id,
        category,
        brand,
        model,
        year: year ?? null,
        photos: photos ?? [],
        specs: specs ?? { seats: 5, doors: 4, transmission: "manuelle", ac: true, fuel_type: "essence" },
        mileage_policy: mileage_policy ?? "unlimited",
        mileage_limit_per_day: mileage_limit_per_day ?? null,
        extra_km_cost: extra_km_cost ?? null,
        pricing: pricing ?? { standard: 0 },
        high_season_dates: high_season_dates ?? null,
        quantity: quantity ?? 1,
        similar_vehicle: similar_vehicle ?? false,
        similar_models: similar_models ?? null,
        status: status ?? "active",
      })
      .select("*")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    log.error({ err }, "createVehicle error");
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/pro/rental/vehicles/:id
const updateVehicle: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const vehicleId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership: vehicle belongs to one of pro's establishments
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: existing } = await supabase
      .from("rental_vehicles")
      .select("id, establishment_id")
      .eq("id", vehicleId)
      .single();

    if (!existing) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }

    if (!estIds.includes(existing.establishment_id)) {
      res.status(403).json({ error: "Not authorized to update this vehicle" });
      return;
    }

    const {
      category,
      brand,
      model,
      year,
      photos,
      specs,
      mileage_policy,
      mileage_limit_per_day,
      extra_km_cost,
      pricing,
      high_season_dates,
      quantity,
      similar_vehicle,
      similar_models,
      status,
      sort_order,
    } = req.body;

    const updates: Record<string, any> = {};
    if (category !== undefined) updates.category = category;
    if (brand !== undefined) updates.brand = brand;
    if (model !== undefined) updates.model = model;
    if (year !== undefined) updates.year = year;
    if (photos !== undefined) updates.photos = photos;
    if (specs !== undefined) updates.specs = specs;
    if (mileage_policy !== undefined) updates.mileage_policy = mileage_policy;
    if (mileage_limit_per_day !== undefined) updates.mileage_limit_per_day = mileage_limit_per_day;
    if (extra_km_cost !== undefined) updates.extra_km_cost = extra_km_cost;
    if (pricing !== undefined) updates.pricing = pricing;
    if (high_season_dates !== undefined) updates.high_season_dates = high_season_dates;
    if (quantity !== undefined) updates.quantity = quantity;
    if (similar_vehicle !== undefined) updates.similar_vehicle = similar_vehicle;
    if (similar_models !== undefined) updates.similar_models = similar_models;
    if (status !== undefined) updates.status = status;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("rental_vehicles")
      .update(updates)
      .eq("id", vehicleId)
      .select("*")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data);
  } catch (err) {
    log.error({ err }, "updateVehicle error");
    res.status(500).json({ error: "internal_error" });
  }
};

// DELETE /api/pro/rental/vehicles/:id
const deleteVehicle: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const vehicleId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: existing } = await supabase
      .from("rental_vehicles")
      .select("id, establishment_id")
      .eq("id", vehicleId)
      .single();

    if (!existing) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }

    if (!estIds.includes(existing.establishment_id)) {
      res.status(403).json({ error: "Not authorized to delete this vehicle" });
      return;
    }

    const { error } = await supabase
      .from("rental_vehicles")
      .delete()
      .eq("id", vehicleId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    log.error({ err }, "deleteVehicle error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/rental/vehicles/:id/photos — placeholder for multer-based upload
const uploadVehiclePhotos: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  res.status(501).json({
    error: "Photo upload is handled via multer middleware — not yet wired",
    hint: "Use the admin image uploader or direct Supabase storage upload",
  });
};

// =============================================================================
// DATE BLOCKS
// =============================================================================

// GET /api/pro/rental/vehicles/:id/blocks
const listDateBlocks: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const vehicleId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: vehicle } = await supabase
      .from("rental_vehicles")
      .select("id, establishment_id")
      .eq("id", vehicleId)
      .single();

    if (!vehicle) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }

    if (!estIds.includes(vehicle.establishment_id)) {
      res.status(403).json({ error: "Not authorized to view this vehicle's blocks" });
      return;
    }

    const { data, error } = await supabase
      .from("rental_vehicle_date_blocks")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("start_date", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ blocks: data ?? [] });
  } catch (err) {
    log.error({ err }, "listDateBlocks error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/rental/vehicles/:id/blocks
const createDateBlock: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const vehicleId = req.params.id;
    const { start_date, end_date, reason } = req.body;

    if (!start_date || !end_date) {
      res.status(400).json({ error: "Missing required fields: start_date, end_date" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify ownership
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: vehicle } = await supabase
      .from("rental_vehicles")
      .select("id, establishment_id")
      .eq("id", vehicleId)
      .single();

    if (!vehicle) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }

    if (!estIds.includes(vehicle.establishment_id)) {
      res.status(403).json({ error: "Not authorized to manage this vehicle's blocks" });
      return;
    }

    const { data, error } = await supabase
      .from("rental_vehicle_date_blocks")
      .insert({
        vehicle_id: vehicleId,
        start_date,
        end_date,
        reason: reason ?? null,
      })
      .select("*")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    log.error({ err }, "createDateBlock error");
    res.status(500).json({ error: "internal_error" });
  }
};

// DELETE /api/pro/rental/vehicles/:vehicleId/blocks/:blockId
const deleteDateBlock: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const { vehicleId, blockId } = req.params;
    const supabase = getAdminSupabase();

    // Verify ownership
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: vehicle } = await supabase
      .from("rental_vehicles")
      .select("id, establishment_id")
      .eq("id", vehicleId)
      .single();

    if (!vehicle) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }

    if (!estIds.includes(vehicle.establishment_id)) {
      res.status(403).json({ error: "Not authorized to manage this vehicle's blocks" });
      return;
    }

    const { error } = await supabase
      .from("rental_vehicle_date_blocks")
      .delete()
      .eq("id", blockId)
      .eq("vehicle_id", vehicleId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    log.error({ err }, "deleteDateBlock error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// OPTIONS MANAGEMENT
// =============================================================================

// GET /api/pro/rental/options
const listOptions: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ options: [] });
      return;
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("rental_options")
      .select("*")
      .in("establishment_id", estIds)
      .order("sort_order", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ options: data ?? [] });
  } catch (err) {
    log.error({ err }, "listOptions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/rental/options
const createOption: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const { establishment_id, name, description, price, price_type, is_mandatory } = req.body;

    if (!establishment_id || !name || price === undefined) {
      res.status(400).json({ error: "Missing required fields: establishment_id, name, price" });
      return;
    }

    const isMember = await ensureEstablishmentMember(user.id, establishment_id);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this establishment" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("rental_options")
      .insert({
        establishment_id,
        name,
        description: description ?? null,
        price,
        price_type: price_type ?? "per_day",
        is_mandatory: is_mandatory ?? false,
      })
      .select("*")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    log.error({ err }, "createOption error");
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/pro/rental/options/:id
const updateOption: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const optionId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: existing } = await supabase
      .from("rental_options")
      .select("id, establishment_id")
      .eq("id", optionId)
      .single();

    if (!existing) {
      res.status(404).json({ error: "Option not found" });
      return;
    }

    if (!estIds.includes(existing.establishment_id)) {
      res.status(403).json({ error: "Not authorized to update this option" });
      return;
    }

    const { name, description, price, price_type, is_mandatory, sort_order, is_active } = req.body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = price;
    if (price_type !== undefined) updates.price_type = price_type;
    if (is_mandatory !== undefined) updates.is_mandatory = is_mandatory;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const { data, error } = await supabase
      .from("rental_options")
      .update(updates)
      .eq("id", optionId)
      .select("*")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data);
  } catch (err) {
    log.error({ err }, "updateOption error");
    res.status(500).json({ error: "internal_error" });
  }
};

// DELETE /api/pro/rental/options/:id
const deleteOption: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const optionId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: existing } = await supabase
      .from("rental_options")
      .select("id, establishment_id")
      .eq("id", optionId)
      .single();

    if (!existing) {
      res.status(404).json({ error: "Option not found" });
      return;
    }

    if (!estIds.includes(existing.establishment_id)) {
      res.status(403).json({ error: "Not authorized to delete this option" });
      return;
    }

    const { error } = await supabase
      .from("rental_options")
      .delete()
      .eq("id", optionId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    log.error({ err }, "deleteOption error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// RESERVATIONS
// =============================================================================

// GET /api/pro/rental/reservations
const listReservations: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ reservations: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status);

    let query = supabase
      .from("rental_reservations")
      .select(`
        *,
        rental_vehicles ( brand, model, category, photos ),
        rental_kyc_documents ( id, document_type, side, photo_url, status, refusal_reason )
      `)
      .in("establishment_id", estIds)
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ reservations: data ?? [] });
  } catch (err) {
    log.error({ err }, "listReservations error");
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/pro/rental/reservations/:id/kyc-validate
const validateKyc: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const reservationId = req.params.id;
    const { action, refusal_reason } = req.body as {
      action: "validate" | "refuse";
      refusal_reason?: string;
    };

    if (!action || !["validate", "refuse"].includes(action)) {
      res.status(400).json({ error: "action must be 'validate' or 'refuse'" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify reservation belongs to pro's establishment
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: reservation } = await supabase
      .from("rental_reservations")
      .select("id, establishment_id, status, kyc_status")
      .eq("id", reservationId)
      .single();

    if (!reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    if (!estIds.includes(reservation.establishment_id)) {
      res.status(403).json({ error: "Not authorized to manage this reservation" });
      return;
    }

    const now = new Date().toISOString();

    if (action === "validate") {
      // Update all KYC documents to validated
      const { error: kycError } = await supabase
        .from("rental_kyc_documents")
        .update({
          status: "validated" as RentalKycStatus,
          validated_by: user.id,
          validated_at: now,
        })
        .eq("reservation_id", reservationId);

      if (kycError) {
        res.status(500).json({ error: kycError.message });
        return;
      }

      // Update reservation: kyc_status -> validated, status -> confirmed
      const { data: updated, error: resError } = await supabase
        .from("rental_reservations")
        .update({
          kyc_status: "validated" as RentalKycStatus,
          status: "confirmed",
          updated_at: now,
        })
        .eq("id", reservationId)
        .select("*")
        .single();

      if (resError) {
        res.status(500).json({ error: resError.message });
        return;
      }

      res.json(updated);
    } else {
      // action === "refuse"
      // Update all KYC documents to refused
      const { error: kycError } = await supabase
        .from("rental_kyc_documents")
        .update({
          status: "refused" as RentalKycStatus,
          refusal_reason: refusal_reason ?? null,
        })
        .eq("reservation_id", reservationId);

      if (kycError) {
        res.status(500).json({ error: kycError.message });
        return;
      }

      // Update reservation: kyc_status -> refused
      const { data: updated, error: resError } = await supabase
        .from("rental_reservations")
        .update({
          kyc_status: "refused" as RentalKycStatus,
          kyc_refusal_reason: refusal_reason ?? null,
          updated_at: now,
        })
        .eq("id", reservationId)
        .select("*")
        .single();

      if (resError) {
        res.status(500).json({ error: resError.message });
        return;
      }

      res.json(updated);
    }
  } catch (err) {
    log.error({ err }, "validateKyc error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/rental/reservations/:id/contract
const generateContract: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const reservationId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify reservation belongs to pro's establishment
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.status(403).json({ error: "No establishments found" });
      return;
    }

    const { data: reservation } = await supabase
      .from("rental_reservations")
      .select("id, establishment_id")
      .eq("id", reservationId)
      .single();

    if (!reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    if (!estIds.includes(reservation.establishment_id)) {
      res.status(403).json({ error: "Not authorized to manage this reservation" });
      return;
    }

    const contractData = await generateRentalContractData(reservationId);
    if (!contractData) {
      res.status(404).json({ error: "Could not generate contract data" });
      return;
    }

    res.json({ contract_data: contractData });
  } catch (err) {
    log.error({ err }, "generateContract error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// STATS
// =============================================================================

// GET /api/pro/rental/stats
const getStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({
        stats: {
          total_vehicles: 0,
          active_vehicles: 0,
          total_reservations: 0,
          reservations_by_status: {},
          total_revenue: 0,
          total_commission: 0,
        },
      });
      return;
    }

    const supabase = getAdminSupabase();

    // Count vehicles and fetch reservations in parallel
    const [vehiclesRes, activeVehiclesRes, reservationsRes] = await Promise.all([
      supabase
        .from("rental_vehicles")
        .select("id", { count: "exact", head: true })
        .in("establishment_id", estIds),
      supabase
        .from("rental_vehicles")
        .select("id", { count: "exact", head: true })
        .in("establishment_id", estIds)
        .eq("status", "active"),
      supabase
        .from("rental_reservations")
        .select("id, status, total_price, commission_amount")
        .in("establishment_id", estIds),
    ]);

    const totalVehicles = vehiclesRes.count ?? 0;
    const activeVehicles = activeVehiclesRes.count ?? 0;
    const reservations = reservationsRes.data ?? [];
    const totalReservations = reservations.length;

    // Reservations by status
    const reservationsByStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let totalCommission = 0;

    for (const r of reservations) {
      const st = r.status ?? "unknown";
      reservationsByStatus[st] = (reservationsByStatus[st] ?? 0) + 1;

      // Only count revenue for non-cancelled reservations
      if (st === "confirmed" || st === "in_progress" || st === "completed") {
        totalRevenue += Number(r.total_price) || 0;
        totalCommission += Number(r.commission_amount) || 0;
      }
    }

    res.json({
      stats: {
        total_vehicles: totalVehicles,
        active_vehicles: activeVehicles,
        total_reservations: totalReservations,
        reservations_by_status: reservationsByStatus,
        total_revenue: totalRevenue,
        total_commission: totalCommission,
      },
    });
  } catch (err) {
    log.error({ err }, "getStats error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

export function registerRentalProRoutes(app: Router): void {
  // Vehicles
  app.get("/api/pro/rental/vehicles", listVehicles);
  app.post("/api/pro/rental/vehicles", zBody(createVehicleSchema), createVehicle);
  app.put("/api/pro/rental/vehicles/:id", zParams(zIdParam), zBody(updateVehicleSchema), updateVehicle);
  app.delete("/api/pro/rental/vehicles/:id", zParams(zIdParam), deleteVehicle);
  app.post("/api/pro/rental/vehicles/:id/photos", zParams(zIdParam), uploadVehiclePhotos);

  // Date blocks
  app.get("/api/pro/rental/vehicles/:id/blocks", zParams(zIdParam), listDateBlocks);
  app.post("/api/pro/rental/vehicles/:id/blocks", zParams(zIdParam), zBody(createVehicleBlockSchema), createDateBlock);
  app.delete("/api/pro/rental/vehicles/:vehicleId/blocks/:blockId", zParams(VehicleIdBlockIdParams), deleteDateBlock);

  // Options
  app.get("/api/pro/rental/options", listOptions);
  app.post("/api/pro/rental/options", zBody(createRentalOptionSchema), createOption);
  app.put("/api/pro/rental/options/:id", zParams(zIdParam), zBody(updateRentalOptionSchema), updateOption);
  app.delete("/api/pro/rental/options/:id", zParams(zIdParam), deleteOption);

  // Reservations
  app.get("/api/pro/rental/reservations", listReservations);
  app.put("/api/pro/rental/reservations/:id/kyc-validate", zParams(zIdParam), zBody(kycValidateSchema), validateKyc);
  app.post("/api/pro/rental/reservations/:id/contract", zParams(zIdParam), generateContract);

  // Stats
  app.get("/api/pro/rental/stats", getStats);
}
