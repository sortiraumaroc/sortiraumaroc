/**
 * Packs Pro Routes — Phase 4 (Pro-facing)
 *
 * Pack management (10):
 *  - GET    /api/pro/packs                  — list my packs
 *  - POST   /api/pro/packs                  — create pack
 *  - PUT    /api/pro/packs/:id              — update pack
 *  - POST   /api/pro/packs/:id/submit       — submit for moderation
 *  - POST   /api/pro/packs/:id/suspend      — suspend sales
 *  - POST   /api/pro/packs/:id/resume       — resume sales
 *  - POST   /api/pro/packs/:id/close        — close permanently
 *  - POST   /api/pro/packs/:id/duplicate    — duplicate
 *  - GET    /api/pro/packs/:id/stats        — pack stats
 *  - POST   /api/pro/packs/scan             — scan QR & consume
 *
 * Promo codes (4):
 *  - GET    /api/pro/pack-promos            — list promos
 *  - POST   /api/pro/pack-promos            — create promo
 *  - PUT    /api/pro/pack-promos/:id        — update promo
 *  - DELETE /api/pro/pack-promos/:id        — delete promo
 *
 * Billing (12):
 *  - GET    /api/pro/billing/current-period  — current period summary
 *  - GET    /api/pro/billing/periods         — period history
 *  - GET    /api/pro/billing/periods/:id     — period detail
 *  - POST   /api/pro/billing/periods/:id/call-to-invoice — call to invoice
 *  - GET    /api/pro/billing/invoices        — my invoices
 *  - GET    /api/pro/billing/invoices/:id/download — download invoice PDF
 *  - POST   /api/pro/billing/disputes        — create dispute
 *  - GET    /api/pro/billing/disputes        — my disputes
 *  - GET    /api/pro/billing/stats           — financial stats
 *  - GET    /api/pro/wallet                  — wallet balance & history
 *  - POST   /api/pro/wallet/topup            — top up wallet
 *  - GET    /api/pro/receipts                — my receipts (services)
 */

import type { Router, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  createPackV2,
  updatePackV2,
  submitPackForModeration,
  suspendPack,
  resumePack,
  closePack,
  duplicatePack,
} from "../packLifecycleLogic";
import {
  getClientActivePacksAtEstablishment,
  consumePack,
} from "../packConsumptionLogic";
import {
  ensureBillingPeriod,
  callToInvoice,
  createBillingDispute,
  escalateDispute,
} from "../billingPeriodLogic";
import { getModuleStatus } from "../moduleActivationLogic";
import { getDocumentPdfDownloadUrl } from "../vosfactures/client";
import { getBillingPeriodCode } from "../../shared/packsBillingTypes";
import {
  packScanRateLimiter,
  packProActionRateLimiter,
  billingCallToInvoiceRateLimiter,
  billingDisputeRateLimiter,
  getClientIp,
} from "../middleware/rateLimiter";
import { sanitizeText, sanitizePlain, isValidUUID } from "../sanitizeV2";
import { auditProAction } from "../auditLogV2";

// =============================================================================
// Auth helpers (same pattern as reservationV2Pro.ts)
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
// PACK MANAGEMENT
// =============================================================================

// GET /api/pro/packs
const listProPacks: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ packs: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status);

    let query = supabase
      .from("packs")
      .select(`
        id, title, short_description, cover_url, price, original_price,
        discount_percentage, stock, sold_count, consumed_count,
        moderation_status, is_featured, sale_start_date, sale_end_date,
        validity_start_date, validity_end_date, created_at, updated_at,
        establishment_id
      `)
      .in("establishment_id", estIds)
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("moderation_status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ packs: data ?? [] });
  } catch (err) {
    console.error("[PacksPro] listProPacks error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs
const createPack: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const body = req.body ?? {};

    // Sanitize text inputs
    if (body.title) body.title = sanitizePlain(body.title, 200);
    if (body.short_description) body.short_description = sanitizeText(body.short_description, 500);
    if (body.detailed_description) body.detailed_description = sanitizeText(body.detailed_description, 5000);
    if (body.conditions) body.conditions = sanitizeText(body.conditions, 2000);

    const establishmentId = asString(body.establishment_id);
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }

    if (!(await ensureEstablishmentMember(user.id, establishmentId))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    // Check module enabled
    const mod = await getModuleStatus("packs", establishmentId);
    if (!mod.effectivelyEnabled) {
      res.status(403).json({ error: "Module Packs desactive pour cet etablissement." });
      return;
    }

    const result = await createPackV2({
      establishmentId,
      title: body.title,
      shortDescription: body.short_description,
      detailedDescription: body.detailed_description,
      coverUrl: body.cover_url,
      additionalPhotos: body.additional_photos,
      category: body.category,
      price: body.price,
      originalPrice: body.original_price,
      partySize: body.party_size,
      items: body.items,
      inclusions: body.inclusions,
      exclusions: body.exclusions,
      conditions: body.conditions,
      validDays: body.valid_days,
      validTimeStart: body.valid_time_start,
      validTimeEnd: body.valid_time_end,
      saleStartDate: body.sale_start_date,
      saleEndDate: body.sale_end_date,
      validityStartDate: body.validity_start_date,
      validityEndDate: body.validity_end_date,
      stock: body.stock,
      limitPerClient: body.limit_per_client,
      isMultiUse: body.is_multi_use,
      totalUses: body.total_uses,
    });

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }

    res.status(201).json(result.data);

    void auditProAction("pro.pack.create", {
      proUserId: user.id,
      targetType: "pack",
      targetId: result.data.packId,
      details: { title: sanitizePlain(String(body.title ?? ""), 200) },
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] createPack error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/pro/packs/:id
const updatePack: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const body = req.body ?? {};

    // Verify ownership
    const supabase = getAdminSupabase();
    const { data: pack } = await supabase
      .from("packs")
      .select("establishment_id")
      .eq("id", packId)
      .maybeSingle();

    if (!pack) {
      res.status(404).json({ error: "pack_not_found" });
      return;
    }

    if (!(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await updatePackV2(packId, (pack as any).establishment_id, body);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }

    res.json(result.data);
  } catch (err) {
    console.error("[PacksPro] updatePack error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs/:id/submit
const submitForModeration: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const supabase = getAdminSupabase();
    const { data: pack } = await supabase
      .from("packs")
      .select("establishment_id")
      .eq("id", packId)
      .maybeSingle();

    if (!pack) {
      res.status(404).json({ error: "pack_not_found" });
      return;
    }
    if (!(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await submitPackForModeration(packId, (pack as any).establishment_id);
    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }

    res.json({ ok: true });

    void auditProAction("pro.pack.submit", {
      proUserId: user.id,
      targetType: "pack",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] submitForModeration error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs/:id/suspend
const suspendPackRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const supabase = getAdminSupabase();
    const { data: pack } = await supabase
      .from("packs")
      .select("establishment_id")
      .eq("id", packId)
      .maybeSingle();

    if (!pack || !(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await suspendPack(packId, (pack as any).establishment_id);
    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });

    void auditProAction("pro.pack.suspend", {
      proUserId: user.id,
      targetType: "pack",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] suspendPack error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs/:id/resume
const resumePackRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const supabase = getAdminSupabase();
    const { data: pack } = await supabase
      .from("packs")
      .select("establishment_id")
      .eq("id", packId)
      .maybeSingle();

    if (!pack || !(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await resumePack(packId, (pack as any).establishment_id);
    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });

    void auditProAction("pro.pack.resume", {
      proUserId: user.id,
      targetType: "pack",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] resumePack error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs/:id/close
const closePackRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const supabase = getAdminSupabase();
    const { data: pack } = await supabase
      .from("packs")
      .select("establishment_id")
      .eq("id", packId)
      .maybeSingle();

    if (!pack || !(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await closePack(packId, (pack as any).establishment_id);
    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });

    void auditProAction("pro.pack.close", {
      proUserId: user.id,
      targetType: "pack",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] closePack error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs/:id/duplicate
const duplicatePackRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const supabase = getAdminSupabase();
    const { data: pack } = await supabase
      .from("packs")
      .select("establishment_id")
      .eq("id", packId)
      .maybeSingle();

    if (!pack || !(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await duplicatePack(packId, (pack as any).establishment_id);
    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json(result.data);
  } catch (err) {
    console.error("[PacksPro] duplicatePack error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/packs/:id/stats
const getPackStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const packId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: pack } = await supabase
      .from("packs")
      .select("id, establishment_id, title, stock, sold_count, consumed_count, price, original_price")
      .eq("id", packId)
      .maybeSingle();

    if (!pack || !(await ensureEstablishmentMember(user.id, (pack as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const p = pack as any;

    // Revenue = sum of all paid purchases for this pack
    const { data: revenueData } = await supabase
      .from("pack_purchases")
      .select("final_price")
      .eq("pack_id", packId)
      .in("payment_status", ["completed", "paid"]);

    const totalRevenue = (revenueData as any[] || []).reduce(
      (sum: number, r: any) => sum + (r.final_price || 0),
      0,
    );

    // Refunds count
    const { count: refundCount } = await supabase
      .from("pack_refunds")
      .select("id", { count: "exact", head: true })
      .eq("pack_purchase_id", packId);

    res.json({
      packId: p.id,
      title: p.title,
      stock: p.stock,
      soldCount: p.sold_count,
      consumedCount: p.consumed_count,
      remaining: p.stock != null ? Math.max(0, p.stock - p.sold_count) : null,
      totalRevenue,
      refundCount: refundCount ?? 0,
    });
  } catch (err) {
    console.error("[PacksPro] getPackStats error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/packs/scan — Scan QR & consume
const scanAndConsume: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const body = req.body ?? {};
    const { qr_code_token, establishment_id, purchase_id } = body;

    // Validate QR token input
    const token = String(qr_code_token ?? "").trim();
    if (!token || token.length > 100) {
      res.status(400).json({ ok: false, error: "invalid_token" });
      return;
    }

    if (!qr_code_token || !establishment_id) {
      res.status(400).json({ error: "missing_qr_code_token_or_establishment_id" });
      return;
    }

    if (!(await ensureEstablishmentMember(user.id, establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    // If purchase_id is provided, consume directly
    if (purchase_id) {
      const result = await consumePack(purchase_id, establishment_id, user.id);
      if (!result.ok) {
        const err = result as { ok: false; error: string; errorCode?: string };
        res.status(400).json({ error: err.error, errorCode: err.errorCode });
        return;
      }
      res.json(result.data);

      void auditProAction("pro.pack.scan_consume", {
        proUserId: user.id,
        targetType: "pack_purchase",
        targetId: String(body.purchase_id ?? ""),
        details: { qrToken: sanitizePlain(String(body.qr_code_token ?? ""), 100) },
        ip: getClientIp(req),
      });
      return;
    }

    // Look up the consumer user from the QR code token
    const supabase = getAdminSupabase();
    const { data: consumer } = await supabase
      .from("consumer_users")
      .select("id")
      .eq("qr_code_token", qr_code_token)
      .maybeSingle();

    if (!consumer) {
      res.status(404).json({ error: "user_not_found_for_qr_token" });
      return;
    }

    // List active packs for this user at the establishment
    const packs = await getClientActivePacksAtEstablishment((consumer as any).id, establishment_id);
    if (!packs.ok) {
      const err = packs as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }

    res.json(packs.data);
  } catch (err) {
    console.error("[PacksPro] scanAndConsume error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// PROMO CODES
// =============================================================================

// GET /api/pro/pack-promos
const listPromos: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ promos: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("pack_promo_codes")
      .select("*")
      .in("establishment_id", estIds)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ promos: data ?? [] });
  } catch (err) {
    console.error("[PacksPro] listPromos error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/pack-promos
const createPromo: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const body = req.body ?? {};
    const establishmentId = asString(body.establishment_id);
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }

    if (!(await ensureEstablishmentMember(user.id, establishmentId))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("pack_promo_codes")
      .insert({
        establishment_id: establishmentId,
        code: (body.code || "").toUpperCase().trim(),
        discount_type: body.discount_type || "percentage",
        discount_value: body.discount_value,
        scope: "pro",
        pack_ids: body.pack_ids || null,
        max_uses: body.max_uses || null,
        max_uses_per_user: body.max_uses_per_user || 1,
        valid_from: body.valid_from || null,
        valid_to: body.valid_to || null,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  } catch (err) {
    console.error("[PacksPro] createPromo error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/pro/pack-promos/:id
const updatePromo: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const promoId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const { data: promo } = await supabase
      .from("pack_promo_codes")
      .select("establishment_id")
      .eq("id", promoId)
      .maybeSingle();

    if (!promo || !(await ensureEstablishmentMember(user.id, (promo as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (body.code !== undefined) updates.code = (body.code || "").toUpperCase().trim();
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
    if (body.pack_ids !== undefined) updates.pack_ids = body.pack_ids;
    if (body.max_uses !== undefined) updates.max_uses = body.max_uses;
    if (body.max_uses_per_user !== undefined) updates.max_uses_per_user = body.max_uses_per_user;
    if (body.valid_from !== undefined) updates.valid_from = body.valid_from;
    if (body.valid_to !== undefined) updates.valid_to = body.valid_to;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("pack_promo_codes")
      .update(updates)
      .eq("id", promoId)
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error("[PacksPro] updatePromo error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// DELETE /api/pro/pack-promos/:id
const deletePromo: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const promoId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: promo } = await supabase
      .from("pack_promo_codes")
      .select("establishment_id")
      .eq("id", promoId)
      .maybeSingle();

    if (!promo || !(await ensureEstablishmentMember(user.id, (promo as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const { error } = await supabase
      .from("pack_promo_codes")
      .delete()
      .eq("id", promoId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[PacksPro] deletePromo error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// BILLING
// =============================================================================

// GET /api/pro/billing/current-period
const getCurrentPeriod: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const establishmentId = asString(req.query.establishment_id);
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }
    if (!(await ensureEstablishmentMember(user.id, establishmentId))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const periodId = await ensureBillingPeriod(establishmentId, new Date());

    // Fetch the period record
    const supabase = getAdminSupabase();
    const { data: period } = await supabase
      .from("billing_periods")
      .select("*")
      .eq("id", periodId)
      .maybeSingle();

    // Fetch transactions for current period
    const periodCode = getBillingPeriodCode(new Date());
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("billing_period", periodCode)
      .order("created_at", { ascending: false });

    res.json({
      period: period ?? { id: periodId },
      transactions: transactions ?? [],
    });
  } catch (err) {
    console.error("[PacksPro] getCurrentPeriod error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/billing/periods
const listBillingPeriods: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const establishmentId = asString(req.query.establishment_id);
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }
    if (!(await ensureEstablishmentMember(user.id, establishmentId))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("billing_periods")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("start_date", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ periods: data ?? [] });
  } catch (err) {
    console.error("[PacksPro] listBillingPeriods error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/billing/periods/:id
const getBillingPeriodDetail: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const periodId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: period, error } = await supabase
      .from("billing_periods")
      .select("*")
      .eq("id", periodId)
      .maybeSingle();

    if (error || !period) {
      res.status(404).json({ error: "period_not_found" });
      return;
    }

    const p = period as any;
    if (!(await ensureEstablishmentMember(user.id, p.establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    // Fetch transactions
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("establishment_id", p.establishment_id)
      .eq("billing_period", p.period_code)
      .order("created_at", { ascending: false });

    res.json({
      period,
      transactions: transactions ?? [],
    });
  } catch (err) {
    console.error("[PacksPro] getBillingPeriodDetail error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/billing/periods/:id/call-to-invoice
const callToInvoiceRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const periodId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: period } = await supabase
      .from("billing_periods")
      .select("establishment_id")
      .eq("id", periodId)
      .maybeSingle();

    if (!period) {
      res.status(404).json({ error: "period_not_found" });
      return;
    }

    const p = period as any;
    if (!(await ensureEstablishmentMember(user.id, p.establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await callToInvoice(periodId, p.establishment_id);
    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }

    res.json({ ok: true });

    void auditProAction("pro.billing.call_to_invoice", {
      proUserId: user.id,
      targetType: "billing_period",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] callToInvoice error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/billing/invoices
const listInvoices: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ invoices: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("billing_periods")
      .select("*")
      .in("establishment_id", estIds)
      .not("vosfactures_invoice_id", "is", null)
      .order("start_date", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ invoices: data ?? [] });
  } catch (err) {
    console.error("[PacksPro] listInvoices error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/billing/invoices/:id/download
const downloadInvoice: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const invoiceId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: period } = await supabase
      .from("billing_periods")
      .select("establishment_id, vosfactures_invoice_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!period) {
      res.status(404).json({ error: "invoice_not_found" });
      return;
    }

    const p = period as any;
    if (!(await ensureEstablishmentMember(user.id, p.establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    if (!p.vosfactures_invoice_id) {
      res.status(404).json({ error: "no_vf_document" });
      return;
    }

    const pdfUrl = getDocumentPdfDownloadUrl(Number(p.vosfactures_invoice_id));
    res.redirect(pdfUrl);
  } catch (err) {
    console.error("[PacksPro] downloadInvoice error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/billing/disputes
const createDisputeRoute: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const body = req.body ?? {};
    const { billing_period_id, reason, disputed_transactions, evidence } = body;

    if (!billing_period_id || !reason) {
      res.status(400).json({ error: "missing_billing_period_id_or_reason" });
      return;
    }

    // Verify ownership
    const supabase = getAdminSupabase();
    const { data: period } = await supabase
      .from("billing_periods")
      .select("establishment_id")
      .eq("id", billing_period_id)
      .maybeSingle();

    if (!period || !(await ensureEstablishmentMember(user.id, (period as any).establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const result = await createBillingDispute(
      billing_period_id,
      (period as any).establishment_id,
      reason,
      disputed_transactions ?? null,
      evidence,
    );

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.status(201).json(result.data);

    void auditProAction("pro.billing.dispute_create", {
      proUserId: user.id,
      targetType: "billing_dispute",
      details: { reason: sanitizePlain(String(body.reason ?? ""), 500) },
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[PacksPro] createDispute error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/billing/disputes
const listDisputes: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ disputes: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("billing_disputes")
      .select("*")
      .in("establishment_id", estIds)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ disputes: data ?? [] });
  } catch (err) {
    console.error("[PacksPro] listDisputes error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/billing/stats
const getBillingStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const establishmentId = asString(req.query.establishment_id);
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }
    if (!(await ensureEstablishmentMember(user.id, establishmentId))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const supabase = getAdminSupabase();

    // Aggregate from transactions
    const { data: transactions } = await supabase
      .from("transactions")
      .select("type, gross_amount, commission_amount, net_amount, status")
      .eq("establishment_id", establishmentId)
      .eq("status", "completed");

    const txns = (transactions as any[]) || [];
    const totalGross = txns.reduce((s, t) => s + (t.gross_amount || 0), 0);
    const totalCommission = txns.reduce((s, t) => s + (t.commission_amount || 0), 0);
    const totalNet = txns.reduce((s, t) => s + (t.net_amount || 0), 0);
    const packSales = txns.filter((t) => t.type === "pack_sale").length;

    res.json({
      totalGross,
      totalCommission,
      totalNet,
      packSalesCount: packSales,
      transactionCount: txns.length,
    });
  } catch (err) {
    console.error("[PacksPro] getBillingStats error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/wallet
const getWallet: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const establishmentId = asString(req.query.establishment_id);
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }
    if (!(await ensureEstablishmentMember(user.id, establishmentId))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const supabase = getAdminSupabase();

    // Get wallet balance
    const { data: wallet } = await supabase
      .from("pro_wallets")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    // Get wallet transactions
    const { data: transactions } = await supabase
      .from("pro_wallet_transactions")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(50);

    res.json({
      balance: (wallet as any)?.balance ?? 0,
      wallet: wallet ?? null,
      transactions: transactions ?? [],
    });
  } catch (err) {
    console.error("[PacksPro] getWallet error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/pro/wallet/topup
const topupWallet: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const { establishment_id, amount, payment_reference } = req.body ?? {};
    if (!establishment_id || !amount) {
      res.status(400).json({ error: "missing_establishment_id_or_amount" });
      return;
    }
    if (!(await ensureEstablishmentMember(user.id, establishment_id))) {
      res.status(403).json({ error: "not_a_member" });
      return;
    }

    const supabase = getAdminSupabase();
    const now = new Date().toISOString();

    // Upsert wallet
    const { data: wallet } = await supabase
      .from("pro_wallets")
      .upsert(
        {
          establishment_id,
          balance: amount,
          updated_at: now,
        },
        { onConflict: "establishment_id" },
      )
      .select("balance")
      .single();

    // If wallet exists, increment balance
    if (wallet) {
      await supabase.rpc("increment_wallet_balance", {
        p_establishment_id: establishment_id,
        p_amount: amount,
      }).then(
        () => {},
        () => {
          // Fallback: manual increment
          void supabase
            .from("pro_wallets")
            .update({
              balance: ((wallet as any).balance || 0) + amount,
              updated_at: now,
            })
            .eq("establishment_id", establishment_id);
        },
      );
    }

    // Record transaction
    await supabase.from("pro_wallet_transactions").insert({
      establishment_id,
      type: "topup",
      amount,
      payment_reference: payment_reference || null,
      created_at: now,
    });

    res.json({ ok: true, newBalance: ((wallet as any)?.balance || 0) + amount });
  } catch (err) {
    console.error("[PacksPro] topupWallet error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/pro/receipts
const getProReceipts: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const estIds = await getProEstablishmentIds(user.id);
    if (estIds.length === 0) {
      res.json({ receipts: [] });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, reference_type, reference_id, gross_amount, receipt_id, created_at")
      .in("establishment_id", estIds)
      .in("type", ["pro_service", "wallet_topup"])
      .not("receipt_id", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ receipts: data ?? [] });
  } catch (err) {
    console.error("[PacksPro] getProReceipts error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerPacksProRoutes(app: Router): void {
  // Pack management — rate limited
  app.get("/api/pro/packs", listProPacks);
  app.post("/api/pro/packs", packProActionRateLimiter, createPack);
  app.put("/api/pro/packs/:id", packProActionRateLimiter, updatePack);
  app.post("/api/pro/packs/:id/submit", packProActionRateLimiter, submitForModeration);
  app.post("/api/pro/packs/:id/suspend", packProActionRateLimiter, suspendPackRoute);
  app.post("/api/pro/packs/:id/resume", packProActionRateLimiter, resumePackRoute);
  app.post("/api/pro/packs/:id/close", packProActionRateLimiter, closePackRoute);
  app.post("/api/pro/packs/:id/duplicate", packProActionRateLimiter, duplicatePackRoute);
  app.get("/api/pro/packs/:id/stats", getPackStats);
  app.post("/api/pro/packs/scan", packScanRateLimiter, scanAndConsume);

  // Promo codes
  app.get("/api/pro/pack-promos", listPromos);
  app.post("/api/pro/pack-promos", packProActionRateLimiter, createPromo);
  app.put("/api/pro/pack-promos/:id", updatePromo);
  app.delete("/api/pro/pack-promos/:id", deletePromo);

  // Billing — rate limited
  app.get("/api/pro/billing/current-period", getCurrentPeriod);
  app.get("/api/pro/billing/periods", listBillingPeriods);
  app.get("/api/pro/billing/periods/:id", getBillingPeriodDetail);
  app.post("/api/pro/billing/periods/:id/call-to-invoice", billingCallToInvoiceRateLimiter, callToInvoiceRoute);
  app.get("/api/pro/billing/invoices", listInvoices);
  app.get("/api/pro/billing/invoices/:id/download", downloadInvoice);
  app.post("/api/pro/billing/disputes", billingDisputeRateLimiter, createDisputeRoute);
  app.get("/api/pro/billing/disputes", listDisputes);
  app.get("/api/pro/billing/stats", getBillingStats);
  app.get("/api/pro/wallet", getWallet);
  app.post("/api/pro/wallet/topup", packProActionRateLimiter, topupWallet);
  app.get("/api/pro/receipts", getProReceipts);
}
