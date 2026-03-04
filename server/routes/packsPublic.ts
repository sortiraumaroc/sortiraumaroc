/**
 * Packs Public Routes — Phase 4 (Client-facing)
 *
 * 11 endpoints:
 *  - GET  /api/packs                        — list active packs
 *  - GET  /api/packs/:id                    — pack detail
 *  - GET  /api/establishments/:id/packs     — packs for an establishment
 *  - POST /api/packs/:id/purchase           — purchase a pack
 *  - POST /api/packs/validate-promo         — validate promo code
 *  - GET  /api/me/packs                     — my purchased packs
 *  - GET  /api/me/packs/:purchaseId         — purchased pack detail
 *  - POST /api/me/packs/:purchaseId/refund  — request refund
 *  - GET  /api/me/transactions              — my transaction history
 *  - GET  /api/me/receipts                  — my receipts list
 *  - GET  /api/me/receipts/:id/download     — download receipt PDF
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";

const log = createModuleLogger("packsPublic");
import { confirmPackPurchase, validatePackPromoCode } from "../packPurchaseLogic";
import { requestPackRefund } from "../packRefundLogic";
import { getModuleStatus } from "../moduleActivationLogic";
import { getDocumentPdfDownloadUrl } from "../vosfactures/client";
import {
  packPurchaseRateLimiter,
  packPromoValidateRateLimiter,
  packRefundRateLimiter,
  packReadRateLimiter,
} from "../middleware/rateLimiter";
import { sanitizeText, sanitizePlain, isValidUUID } from "../sanitizeV2";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";
import {
  PurchasePackSchema,
  ValidatePackPromoSchema,
  RequestPackRefundSchema,
  ListActivePacksQuery,
  ListMyPacksQuery,
  ListMyTransactionsQuery,
  PackIdParams,
  PurchaseIdParams,
} from "../schemas/packsPublic";
import { auditClientAction } from "../auditLogV2";
import { getClientIp } from "../middleware/rateLimiter";

// =============================================================================
// Auth helpers (same pattern as reservationV2Public.ts)
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
// 1. GET /api/packs — List active packs
// =============================================================================

const listActivePacks: RequestHandler = async (req, res) => {
  try {
    // Check global module
    const mod = await getModuleStatus("packs");
    if (!mod.effectivelyEnabled) {
      res.json({ packs: [], total: 0 });
      return;
    }

    const supabase = getAdminSupabase();

    // Filters
    const category = asString(req.query.category);
    const city = asString(req.query.city);
    const minPrice = asNumber(req.query.min_price);
    const maxPrice = asNumber(req.query.max_price);
    const minDiscount = asNumber(req.query.min_discount);
    const sort = asString(req.query.sort) || "popularity"; // popularity | discount | newest
    const page = Math.max(1, asNumber(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, asNumber(req.query.per_page) || 20));
    const offset = (page - 1) * perPage;

    let query = supabase
      .from("packs")
      .select(`
        id, title, short_description, cover_url, price, original_price,
        discount_percentage, category, party_size, stock, sold_count,
        sale_end_date, validity_end_date, is_featured, created_at,
        establishments (id, name, slug, city, cover_url)
      `, { count: "exact" })
      .eq("moderation_status", "active");

    if (category) query = query.eq("category", category);
    if (city) query = query.eq("establishments.city", city);
    if (minPrice !== undefined) query = query.gte("price", minPrice);
    if (maxPrice !== undefined) query = query.lte("price", maxPrice);
    if (minDiscount !== undefined) query = query.gte("discount_percentage", minDiscount);

    // Sort
    switch (sort) {
      case "discount":
        query = query.order("discount_percentage", { ascending: false, nullsFirst: false });
        break;
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "price_asc":
        query = query.order("price", { ascending: true });
        break;
      case "price_desc":
        query = query.order("price", { ascending: false });
        break;
      case "popularity":
      default:
        query = query.order("sold_count", { ascending: false });
        break;
    }

    query = query.range(offset, offset + perPage - 1);

    const { data, count, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ packs: data ?? [], total: count ?? 0, page, perPage });
  } catch (err) {
    log.error({ err }, "listActivePacks error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. GET /api/packs/:id — Pack detail
// =============================================================================

const getPackDetail: RequestHandler = async (req, res) => {
  try {
    const packId = req.params.id;
    if (!packId) {
      res.status(400).json({ error: "missing_pack_id" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("packs")
      .select(`
        *,
        establishments (id, name, slug, city, address, cover_url, phone, lat, lng)
      `)
      .eq("id", packId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "pack_not_found" });
      return;
    }

    // Only show active packs to public
    const p = data as any;
    if (p.moderation_status !== "active") {
      res.status(404).json({ error: "pack_not_found" });
      return;
    }

    res.json({ pack: data });
  } catch (err) {
    log.error({ err }, "getPackDetail error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. GET /api/establishments/:id/packs — Packs for an establishment
// =============================================================================

const getEstablishmentPacks: RequestHandler = async (req, res) => {
  try {
    const establishmentId = req.params.id;
    if (!establishmentId) {
      res.status(400).json({ error: "missing_establishment_id" });
      return;
    }

    // Check module status for this establishment
    const mod = await getModuleStatus("packs", establishmentId);
    if (!mod.effectivelyEnabled) {
      res.json({ packs: [] });
      return;
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("packs")
      .select(`
        id, title, short_description, cover_url, price, original_price,
        discount_percentage, category, party_size, stock, sold_count,
        sale_end_date, validity_end_date, is_featured, created_at
      `)
      .eq("establishment_id", establishmentId)
      .eq("moderation_status", "active")
      .order("is_featured", { ascending: false })
      .order("sold_count", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ packs: data ?? [] });
  } catch (err) {
    log.error({ err }, "getEstablishmentPacks error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. POST /api/packs/:id/purchase — Purchase a pack
// =============================================================================

const purchasePack: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  // Input validation (Phase 7)
  const packId = asString(req.params.id);
  if (!packId || !isValidUUID(packId)) {
    res.status(400).json({ ok: false, error: "invalid_pack_id" });
    return;
  }

  try {

    const { promo_code, payment_reference, payment_method } = req.body ?? {};

    const pm = (asString(payment_method) || "card") as "card" | "wallet" | "mobile_payment";
    const result = await confirmPackPurchase({
      packId,
      userId: auth.userId,
      quantity: 1,
      promoCode: asString(promo_code),
      paymentReference: asString(payment_reference) || "pending",
      paymentMethod: pm,
    });

    if (!result.ok) {
      const err2 = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err2.error, errorCode: err2.errorCode });
      return;
    }

    res.status(201).json(result.data);

    // Audit log (Phase 7)
    void auditClientAction("client.pack.purchase", {
      userId: auth.userId,
      targetType: "pack_purchase",
      targetId: result.data.purchaseId,
      details: { packId, quantity: 1, totalPrice: result.data.totalPriceCents },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "purchasePack error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. POST /api/packs/validate-promo — Validate promo code
// =============================================================================

const validatePromo: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  // Input sanitization (Phase 7)
  const rawCode = String(req.body?.code ?? "").trim();
  if (!rawCode || rawCode.length > 50) {
    res.status(400).json({ ok: false, error: "invalid_promo_code" });
    return;
  }

  try {
    const { pack_id, pack_price, establishment_id } = req.body ?? {};
    if (!pack_id || !rawCode) {
      res.status(400).json({ error: "missing_pack_id_or_code" });
      return;
    }

    const result = await validatePackPromoCode(
      rawCode,
      pack_id,
      auth.userId,
      pack_price || 0,
      establishment_id || "",
    );

    if (!result.valid) {
      res.status(400).json({ error: result.error || "Code promo invalide." });
      return;
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, "validatePromo error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. GET /api/me/packs — My purchased packs
// =============================================================================

const getMyPacks: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  try {
    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status); // active, consumed, expired, refunded

    // Try V2 join first (pack_purchases.pack_id → packs FK)
    let query = supabase
      .from("pack_purchases")
      .select(`
        id, pack_id, total_price, final_price, promo_code, promo_discount_amount,
        status, payment_status, uses_total, uses_remaining, qr_code_token,
        expires_at, created_at, updated_at,
        packs (id, title, short_description, cover_url, price, original_price,
               discount_percentage, is_multi_use, uses_per_purchase,
               establishments (id, name, slug, city, cover_url))
      `)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    // If FK relationship doesn't exist yet (V2 migration not run), fallback to V1
    if (error && error.message.includes("relationship")) {
      // V1 fallback: user_id column may not exist yet, try meta.buyer_user_id
      const hasUserIdCol = !error.message.includes("user_id");

      let fallbackQuery = supabase
        .from("pack_purchases")
        .select("*")
        .order("created_at", { ascending: false });

      if (hasUserIdCol) {
        fallbackQuery = fallbackQuery.eq("user_id", auth.userId);
      } else {
        fallbackQuery = fallbackQuery.contains("meta", { buyer_user_id: auth.userId });
      }

      if (statusFilter) {
        fallbackQuery = fallbackQuery.eq("status", statusFilter);
      }

      const { data: v1Data, error: v1Error } = await fallbackQuery;
      if (v1Error) {
        res.status(500).json({ error: v1Error.message });
        return;
      }

      // Enrich V1 data with pack info
      const enriched = await Promise.all(
        (v1Data ?? []).map(async (purchase: Record<string, unknown>) => {
          const packId = purchase.pack_id as string | null;
          if (!packId) return { ...purchase, pack_title: "Pack", pack_cover_url: null };
          const { data: pack } = await supabase
            .from("packs")
            .select("id, title, short_description, cover_url, price, original_price, establishment_id, establishments (id, name, slug, city, cover_url)")
            .eq("id", packId)
            .single();
          return {
            ...purchase,
            pack_title: (pack as any)?.title ?? "Pack",
            pack_cover_url: (pack as any)?.cover_url ?? null,
            packs: pack ?? null,
          };
        }),
      );

      res.json({ purchases: enriched });
      return;
    }

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Flatten pack title for frontend convenience
    const enriched = (data ?? []).map((p: any) => ({
      ...p,
      pack_title: p.packs?.title ?? "Pack",
      pack_cover_url: p.packs?.cover_url ?? null,
    }));

    res.json({ purchases: enriched });
  } catch (err) {
    log.error({ err }, "getMyPacks error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 7. GET /api/me/packs/:purchaseId — Purchased pack detail
// =============================================================================

const getMyPackDetail: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  try {
    const purchaseId = req.params.purchaseId;
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("pack_purchases")
      .select(`
        *,
        packs (*, establishments (id, name, slug, city, address, cover_url, phone)),
        pack_consumptions (id, use_number, consumed_at, consumed_by_name)
      `)
      .eq("id", purchaseId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "purchase_not_found" });
      return;
    }

    res.json({ purchase: data });
  } catch (err) {
    log.error({ err }, "getMyPackDetail error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 8. POST /api/me/packs/:purchaseId/refund — Request refund
// =============================================================================

const requestRefund: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  try {
    const purchaseId = req.params.purchaseId;
    const { reason, prefer_credit } = req.body ?? {};

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      res.status(400).json({ error: "Veuillez fournir un motif (min 5 caracteres)." });
      return;
    }

    const result = await requestPackRefund(
      purchaseId,
      auth.userId,
      reason.trim(),
      prefer_credit === true,
    );

    if (!result.ok) {
      const err2 = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err2.error, errorCode: err2.errorCode });
      return;
    }

    res.json(result.data);

    // Audit log (Phase 7)
    void auditClientAction("client.pack.refund_request", {
      userId: auth.userId,
      targetType: "pack_purchase",
      targetId: purchaseId,
      details: { reason: sanitizePlain(String(req.body?.reason ?? ""), 500) },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "requestRefund error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 9. GET /api/me/transactions — My transaction history
// =============================================================================

const getMyTransactions: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  try {
    const supabase = getAdminSupabase();
    const page = Math.max(1, asNumber(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, asNumber(req.query.per_page) || 20));
    const offset = (page - 1) * perPage;
    const typeFilter = asString(req.query.type); // pack_sale, deposit, etc.

    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    const { data, count, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ transactions: data ?? [], total: count ?? 0, page, perPage });
  } catch (err) {
    log.error({ err }, "getMyTransactions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 10. GET /api/me/receipts — My receipts
// =============================================================================

const getMyReceipts: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  try {
    const supabase = getAdminSupabase();

    // Receipts come from pack_purchases and transactions that have a receipt_id
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, reference_type, reference_id, gross_amount, receipt_id, created_at")
      .eq("user_id", auth.userId)
      .not("receipt_id", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ receipts: data ?? [] });
  } catch (err) {
    log.error({ err }, "getMyReceipts error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 11. GET /api/me/receipts/:id/download — Download receipt PDF
// =============================================================================

const downloadReceipt: RequestHandler = async (req, res) => {
  const auth = await getConsumerUserId(req);
  if (!requireAuth(auth, res)) return;

  try {
    const receiptId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership: the receipt belongs to a transaction of this user
    const { data, error } = await supabase
      .from("transactions")
      .select("id, receipt_id")
      .eq("user_id", auth.userId)
      .eq("receipt_id", receiptId)
      .maybeSingle();

    if (error || !data) {
      res.status(404).json({ error: "receipt_not_found" });
      return;
    }

    // Redirect to VosFactures PDF
    const pdfUrl = getDocumentPdfDownloadUrl(Number(receiptId));
    res.redirect(pdfUrl);
  } catch (err) {
    log.error({ err }, "downloadReceipt error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerPacksPublicRoutes(app: Router): void {
  // Public (no auth required) — rate limited for anti-scraping
  app.get("/api/packs", packReadRateLimiter, zQuery(ListActivePacksQuery), listActivePacks);
  app.get("/api/packs/:id", zParams(PackIdParams), packReadRateLimiter, getPackDetail);
  app.get("/api/establishments/:id/packs", zParams(zIdParam), packReadRateLimiter, getEstablishmentPacks);

  // Authenticated consumer — rate limited
  app.post("/api/packs/:id/purchase", zParams(PackIdParams), packPurchaseRateLimiter, zBody(PurchasePackSchema), purchasePack);
  app.post("/api/packs/validate-promo", packPromoValidateRateLimiter, zBody(ValidatePackPromoSchema), validatePromo);
  app.get("/api/me/packs", zQuery(ListMyPacksQuery), getMyPacks);
  app.get("/api/me/packs/:purchaseId", zParams(PurchaseIdParams), getMyPackDetail);
  app.post("/api/me/packs/:purchaseId/refund", zParams(PurchaseIdParams), packRefundRateLimiter, zBody(RequestPackRefundSchema), requestRefund);
  app.get("/api/me/transactions", zQuery(ListMyTransactionsQuery), getMyTransactions);
  app.get("/api/me/receipts", getMyReceipts);
  app.get("/api/me/receipts/:id/download", zParams(zIdParam), downloadReceipt);
}
