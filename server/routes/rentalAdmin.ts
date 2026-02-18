/**
 * Rental Admin Routes
 *
 * 8 endpoints:
 *  - GET    /api/admin/rental/insurance-plans       — list all insurance plans
 *  - POST   /api/admin/rental/insurance-plans       — create insurance plan
 *  - PUT    /api/admin/rental/insurance-plans/:id   — update insurance plan
 *  - DELETE /api/admin/rental/insurance-plans/:id   — delete insurance plan
 *  - PUT    /api/admin/rental/establishments/:id/commission — set commission rate
 *  - GET    /api/admin/rental/vehicles/pending       — list vehicles pending moderation
 *  - PUT    /api/admin/rental/vehicles/:id/moderate   — approve or reject vehicle
 *  - GET    /api/admin/rental/stats                  — global rental stats
 */

import type { Router, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";

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
// 1. GET /api/admin/rental/insurance-plans
// =============================================================================

const listInsurancePlans: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("rental_insurance_plans")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[RentalAdmin] listInsurancePlans error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ plans: data || [] });
  } catch (err) {
    console.error("[RentalAdmin] listInsurancePlans error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. POST /api/admin/rental/insurance-plans
// =============================================================================

const createInsurancePlan: RequestHandler = async (req, res) => {
  try {
    const name = asString(req.body?.name);
    const description = asString(req.body?.description) || "";
    const coverages = Array.isArray(req.body?.coverages) ? req.body.coverages : [];
    const pricePerDay = asNumber(req.body?.price_per_day) ?? 0;
    const franchise = asNumber(req.body?.franchise) ?? 0;
    const partnerName = asString(req.body?.partner_name) || null;
    const badge = asString(req.body?.badge) || null;
    const sortOrder = asNumber(req.body?.sort_order) ?? 0;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("rental_insurance_plans")
      .insert({
        name,
        description,
        coverages,
        price_per_day: pricePerDay,
        franchise,
        partner_name: partnerName,
        badge,
        sort_order: sortOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("[RentalAdmin] createInsurancePlan error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.status(201).json({ plan: data });
  } catch (err) {
    console.error("[RentalAdmin] createInsurancePlan error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. PUT /api/admin/rental/insurance-plans/:id
// =============================================================================

const updateInsurancePlan: RequestHandler = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "missing plan id" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body?.name !== undefined) updates.name = asString(req.body.name);
    if (req.body?.description !== undefined) updates.description = asString(req.body.description) || "";
    if (req.body?.coverages !== undefined) updates.coverages = req.body.coverages;
    if (req.body?.price_per_day !== undefined) updates.price_per_day = asNumber(req.body.price_per_day);
    if (req.body?.franchise !== undefined) updates.franchise = asNumber(req.body.franchise);
    if (req.body?.partner_name !== undefined) updates.partner_name = asString(req.body.partner_name) || null;
    if (req.body?.badge !== undefined) updates.badge = asString(req.body.badge) || null;
    if (req.body?.sort_order !== undefined) updates.sort_order = asNumber(req.body.sort_order);
    if (req.body?.is_active !== undefined) updates.is_active = !!req.body.is_active;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "no fields to update" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("rental_insurance_plans")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[RentalAdmin] updateInsurancePlan error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ plan: data });
  } catch (err) {
    console.error("[RentalAdmin] updateInsurancePlan error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. DELETE /api/admin/rental/insurance-plans/:id
// =============================================================================

const deleteInsurancePlan: RequestHandler = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "missing plan id" });
      return;
    }

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("rental_insurance_plans")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[RentalAdmin] deleteInsurancePlan error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[RentalAdmin] deleteInsurancePlan error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. PUT /api/admin/rental/establishments/:id/commission
// =============================================================================

const setEstablishmentCommission: RequestHandler = async (req, res) => {
  try {
    const establishmentId = req.params.id;
    const commissionPercent = asNumber(req.body?.commission_percent);

    if (!establishmentId) {
      res.status(400).json({ error: "missing establishment id" });
      return;
    }
    if (commissionPercent === undefined || commissionPercent < 0 || commissionPercent > 100) {
      res.status(400).json({ error: "commission_percent must be between 0 and 100" });
      return;
    }

    const supabase = getAdminSupabase();
    // Store commission in establishment's extra jsonb field
    const { data: est } = await supabase
      .from("establishments")
      .select("extra")
      .eq("id", establishmentId)
      .single();

    const extra = (est?.extra as Record<string, unknown>) || {};
    extra.rental_commission_percent = commissionPercent;

    const { error } = await supabase
      .from("establishments")
      .update({ extra })
      .eq("id", establishmentId);

    if (error) {
      console.error("[RentalAdmin] setEstablishmentCommission error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ success: true, commission_percent: commissionPercent });
  } catch (err) {
    console.error("[RentalAdmin] setEstablishmentCommission error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. GET /api/admin/rental/vehicles/pending
// =============================================================================

const listPendingVehicles: RequestHandler = async (req, res) => {
  try {
    const supabase = getAdminSupabase();
    const page = Math.max(1, asNumber(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, asNumber(req.query.per_page) || 20));
    const offset = (page - 1) * perPage;

    const { data, error, count } = await supabase
      .from("rental_vehicles")
      .select(
        `
        *,
        establishments (id, name, city)
      `,
        { count: "exact" },
      )
      .eq("status", "inactive")
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      console.error("[RentalAdmin] listPendingVehicles error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ vehicles: data || [], total: count ?? 0, page, per_page: perPage });
  } catch (err) {
    console.error("[RentalAdmin] listPendingVehicles error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 7. PUT /api/admin/rental/vehicles/:id/moderate
// =============================================================================

const moderateVehicle: RequestHandler = async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const action = asString(req.body?.action); // "approve" or "reject"

    if (!vehicleId) {
      res.status(400).json({ error: "missing vehicle id" });
      return;
    }
    if (action !== "approve" && action !== "reject") {
      res.status(400).json({ error: "action must be 'approve' or 'reject'" });
      return;
    }

    const supabase = getAdminSupabase();
    const newStatus = action === "approve" ? "active" : "inactive";

    const { data, error } = await supabase
      .from("rental_vehicles")
      .update({ status: newStatus })
      .eq("id", vehicleId)
      .select()
      .single();

    if (error) {
      console.error("[RentalAdmin] moderateVehicle error:", error);
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.json({ vehicle: data, action });
  } catch (err) {
    console.error("[RentalAdmin] moderateVehicle error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 8. GET /api/admin/rental/stats
// =============================================================================

const getGlobalStats: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    // Count vehicles
    const { count: totalVehicles } = await supabase
      .from("rental_vehicles")
      .select("id", { count: "exact", head: true });

    const { count: activeVehicles } = await supabase
      .from("rental_vehicles")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    // Count reservations
    const { count: totalReservations } = await supabase
      .from("rental_reservations")
      .select("id", { count: "exact", head: true });

    const { count: confirmedReservations } = await supabase
      .from("rental_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed");

    const { count: pendingKycReservations } = await supabase
      .from("rental_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_kyc");

    const { count: completedReservations } = await supabase
      .from("rental_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");

    // Revenue
    const { data: revenueData } = await supabase
      .from("rental_reservations")
      .select("total_price, commission_amount")
      .in("status", ["confirmed", "in_progress", "completed"]);

    let totalRevenue = 0;
    let totalCommission = 0;
    if (revenueData) {
      for (const r of revenueData as any[]) {
        totalRevenue += Number(r.total_price) || 0;
        totalCommission += Number(r.commission_amount) || 0;
      }
    }

    // Active rental establishments count
    const { count: rentalEstablishments } = await supabase
      .from("establishments")
      .select("id", { count: "exact", head: true })
      .eq("universe", "rentacar")
      .eq("status", "active");

    res.json({
      stats: {
        total_vehicles: totalVehicles ?? 0,
        active_vehicles: activeVehicles ?? 0,
        rental_establishments: rentalEstablishments ?? 0,
        total_reservations: totalReservations ?? 0,
        confirmed_reservations: confirmedReservations ?? 0,
        pending_kyc_reservations: pendingKycReservations ?? 0,
        completed_reservations: completedReservations ?? 0,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_commission: Math.round(totalCommission * 100) / 100,
      },
    });
  } catch (err) {
    console.error("[RentalAdmin] getGlobalStats error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerRentalAdminRoutes(app: Router): void {
  // Insurance plans CRUD
  app.get("/api/admin/rental/insurance-plans", listInsurancePlans);
  app.post("/api/admin/rental/insurance-plans", createInsurancePlan);
  app.put("/api/admin/rental/insurance-plans/:id", updateInsurancePlan);
  app.delete("/api/admin/rental/insurance-plans/:id", deleteInsurancePlan);

  // Commission
  app.put("/api/admin/rental/establishments/:id/commission", setEstablishmentCommission);

  // Moderation
  app.get("/api/admin/rental/vehicles/pending", listPendingVehicles);
  app.put("/api/admin/rental/vehicles/:id/moderate", moderateVehicle);

  // Stats
  app.get("/api/admin/rental/stats", getGlobalStats);
}
