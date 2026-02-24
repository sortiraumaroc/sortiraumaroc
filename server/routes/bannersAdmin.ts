/**
 * Banners Admin Routes — 12 endpoints
 *
 *  - GET    /api/admin/banners                          — list banners
 *  - GET    /api/admin/banners/:id                      — get single banner
 *  - POST   /api/admin/banners                          — create banner
 *  - PUT    /api/admin/banners/:id                      — update banner
 *  - POST   /api/admin/banners/:id/duplicate            — duplicate banner
 *  - POST   /api/admin/banners/:id/activate             — activate banner
 *  - POST   /api/admin/banners/:id/pause                — pause banner
 *  - POST   /api/admin/banners/:id/disable              — disable banner
 *  - GET    /api/admin/banners/:id/stats                — get banner stats
 *  - GET    /api/admin/banners/:id/form-responses       — list form responses
 *  - GET    /api/admin/banners/:id/form-responses/export — export as CSV
 *  - GET    /api/admin/banners/:id/views                — list banner views
 */

import type { Router, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./adminHelpers";
import {
  createBanner,
  updateBanner,
  duplicateBanner,
  activateBanner,
  pauseBanner,
  disableBanner,
  getBannerStats,
} from "../bannerLogic";
import { exportFormResponses } from "../bannerFormLogic";
import { auditAdminAction } from "../auditLogV2";
import { isValidUUID, sanitizeText } from "../sanitizeV2";
import { bannerAdminRateLimiter } from "../middleware/rateLimiter";
import { createModuleLogger } from "../lib/logger";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";
import {
  BannerCreateSchema,
  BannerUpdateSchema,
  ListBannersQuery,
  ListBannerFormResponsesQuery,
  ListBannerViewsQuery,
} from "../schemas/bannersAdmin";

const log = createModuleLogger("bannersAdmin");

// =============================================================================
// Helpers
// =============================================================================

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// =============================================================================
// Handlers
// =============================================================================

// 1. GET /api/admin/banners
async function listBanners(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const supabase = getAdminSupabase();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const statusFilter = typeof req.query.status === "string" && req.query.status.trim()
      ? req.query.status.trim()
      : undefined;
    const typeFilter = typeof req.query.type === "string" && req.query.type.trim()
      ? req.query.type.trim()
      : undefined;
    const platformFilter = typeof req.query.platform === "string" && req.query.platform.trim()
      ? req.query.platform.trim()
      : undefined;

    let query = supabase
      .from("banners")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }
    if (platformFilter) {
      query = query.eq("platform", platformFilter);
    }

    const { data, error, count } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ banners: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    log.error({ err }, "listBanners error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 2. GET /api/admin/banners/:id
async function getBanner(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data: banner, error } = await supabase
      .from("banners")
      .select("*")
      .eq("id", bannerId)
      .single();

    if (error || !banner) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }

    // Get stats summary inline
    const statsResult = await getBannerStats(bannerId);

    res.json({ banner, stats: statsResult.ok ? (statsResult as any).stats : null });
  } catch (err) {
    log.error({ err }, "getBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 3. POST /api/admin/banners
async function createBannerRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const body = req.body ?? {};
    // Sanitize text fields (XSS prevention)
    if (typeof body.title === "string") body.title = sanitizeText(body.title, 80);
    if (typeof body.subtitle === "string") body.subtitle = sanitizeText(body.subtitle, 150);
    if (typeof body.cta_text === "string") body.cta_text = sanitizeText(body.cta_text, 50);
    if (typeof body.secondary_cta_text === "string") body.secondary_cta_text = sanitizeText(body.secondary_cta_text, 50);
    if (typeof body.internal_name === "string") body.internal_name = sanitizeText(body.internal_name, 200);

    const result = await createBanner(body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.status(201).json(result);

    void auditAdminAction("admin.banner.create", {
      targetType: "banner",
      targetId: (result as any).bannerId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "createBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 4. PUT /api/admin/banners/:id
async function updateBannerRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const body = req.body ?? {};
    // Sanitize text fields (XSS prevention)
    if (typeof body.title === "string") body.title = sanitizeText(body.title, 80);
    if (typeof body.subtitle === "string") body.subtitle = sanitizeText(body.subtitle, 150);
    if (typeof body.cta_text === "string") body.cta_text = sanitizeText(body.cta_text, 50);
    if (typeof body.secondary_cta_text === "string") body.secondary_cta_text = sanitizeText(body.secondary_cta_text, 50);
    if (typeof body.internal_name === "string") body.internal_name = sanitizeText(body.internal_name, 200);

    const result = await updateBanner(bannerId, body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "updateBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 5. POST /api/admin/banners/:id/duplicate
async function duplicateBannerRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const result = await duplicateBanner(bannerId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.status(201).json(result);
  } catch (err) {
    log.error({ err }, "duplicateBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 6. POST /api/admin/banners/:id/activate
async function activateBannerRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const result = await activateBanner(bannerId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.banner.activate", {
      targetType: "banner",
      targetId: bannerId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "activateBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 7. POST /api/admin/banners/:id/pause
async function pauseBannerRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const result = await pauseBanner(bannerId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.banner.pause", {
      targetType: "banner",
      targetId: bannerId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "pauseBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 8. POST /api/admin/banners/:id/disable
async function disableBannerRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const result = await disableBanner(bannerId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.banner.disable", {
      targetType: "banner",
      targetId: bannerId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "disableBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 9. GET /api/admin/banners/:id/stats
async function getBannerStatsRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const result = await getBannerStats(bannerId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, "getBannerStats error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 10. GET /api/admin/banners/:id/form-responses
async function listFormResponses(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const supabase = getAdminSupabase();
    const { data, error, count } = await supabase
      .from("banner_form_responses")
      .select("*", { count: "exact" })
      .eq("banner_id", bannerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ responses: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    log.error({ err }, "listFormResponses error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 11. GET /api/admin/banners/:id/form-responses/export
async function exportFormResponsesRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const result = await exportFormResponses(bannerId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="banner-${bannerId}-responses.csv"`);
    res.send((result as any).csv);
  } catch (err) {
    log.error({ err }, "exportFormResponses error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 12. GET /api/admin/banners/:id/views
async function listBannerViews(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const bannerId = req.params.id;
    if (!isValidUUID(bannerId)) {
      res.status(400).json({ error: "Invalid banner ID" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const supabase = getAdminSupabase();
    const { data, error, count } = await supabase
      .from("banner_views")
      .select("*", { count: "exact" })
      .eq("banner_id", bannerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ views: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    log.error({ err }, "listBannerViews error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerBannerAdminRoutes(app: Router): void {
  app.get("/api/admin/banners", bannerAdminRateLimiter, zQuery(ListBannersQuery), listBanners);
  app.get("/api/admin/banners/:id", zParams(zIdParam), bannerAdminRateLimiter, getBanner);
  app.post("/api/admin/banners", bannerAdminRateLimiter, zBody(BannerCreateSchema), createBannerRoute);
  app.put("/api/admin/banners/:id", zParams(zIdParam), bannerAdminRateLimiter, zBody(BannerUpdateSchema), updateBannerRoute);
  app.post("/api/admin/banners/:id/duplicate", zParams(zIdParam), bannerAdminRateLimiter, duplicateBannerRoute);
  app.post("/api/admin/banners/:id/activate", zParams(zIdParam), bannerAdminRateLimiter, activateBannerRoute);
  app.post("/api/admin/banners/:id/pause", zParams(zIdParam), bannerAdminRateLimiter, pauseBannerRoute);
  app.post("/api/admin/banners/:id/disable", zParams(zIdParam), bannerAdminRateLimiter, disableBannerRoute);
  app.get("/api/admin/banners/:id/stats", zParams(zIdParam), bannerAdminRateLimiter, getBannerStatsRoute);
  app.get("/api/admin/banners/:id/form-responses", zParams(zIdParam), bannerAdminRateLimiter, zQuery(ListBannerFormResponsesQuery), listFormResponses);
  app.get("/api/admin/banners/:id/form-responses/export", zParams(zIdParam), bannerAdminRateLimiter, exportFormResponsesRoute);
  app.get("/api/admin/banners/:id/views", zParams(zIdParam), bannerAdminRateLimiter, zQuery(ListBannerViewsQuery), listBannerViews);
}
