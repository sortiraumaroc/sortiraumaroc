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

import type { Router, Request, Response, RequestHandler } from "express";
import { assertAdminApiEnabled, checkAdminKey, getAdminSupabase } from "../supabaseAdmin";
import { getSessionCookieName, parseCookies, verifyAdminSessionToken } from "../adminSession";
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

// =============================================================================
// Admin auth (same pattern as adminNotifications.ts)
// =============================================================================

function getAdminSessionToken(req: Parameters<RequestHandler>[0]): { token: string; source: "cookie" | "header" } | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return { token: cookieToken, source: "cookie" };
  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim()) return { token: headerToken.trim(), source: "header" };
  const authHeader = req.header("authorization") ?? undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, source: "header" };
  }
  return null;
}

function isSafeMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function isSameOrigin(req: Parameters<RequestHandler>[0]): boolean {
  const originHeader = req.header("origin");
  if (!originHeader) return true;
  let origin: URL;
  try { origin = new URL(originHeader); } catch { return false; }
  const host = req.header("x-forwarded-host") ?? req.header("host");
  if (!host) return false;
  return origin.host === host;
}

function requireAdminKey(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): boolean {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false) { res.status(503).json({ error: enabled.message }); return false; }
  const session = getAdminSessionToken(req);
  if (session && verifyAdminSessionToken(session.token) !== null) {
    if (session.source === "cookie" && !isSafeMethod(req.method) && !isSameOrigin(req)) {
      res.status(403).json({ error: "Forbidden" }); return false;
    }
    return true;
  }
  const header = req.header("x-admin-key") ?? undefined;
  if (!checkAdminKey(header)) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

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
    console.error("[BannersAdmin] listBanners error:", err);
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
    console.error("[BannersAdmin] getBanner error:", err);
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
    console.error("[BannersAdmin] createBanner error:", err);
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
    console.error("[BannersAdmin] updateBanner error:", err);
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
    console.error("[BannersAdmin] duplicateBanner error:", err);
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
    console.error("[BannersAdmin] activateBanner error:", err);
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
    console.error("[BannersAdmin] pauseBanner error:", err);
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
    console.error("[BannersAdmin] disableBanner error:", err);
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
    console.error("[BannersAdmin] getBannerStats error:", err);
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
    console.error("[BannersAdmin] listFormResponses error:", err);
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
    console.error("[BannersAdmin] exportFormResponses error:", err);
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
    console.error("[BannersAdmin] listBannerViews error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerBannerAdminRoutes(app: Router): void {
  app.get("/api/admin/banners", bannerAdminRateLimiter, listBanners);
  app.get("/api/admin/banners/:id", bannerAdminRateLimiter, getBanner);
  app.post("/api/admin/banners", bannerAdminRateLimiter, createBannerRoute);
  app.put("/api/admin/banners/:id", bannerAdminRateLimiter, updateBannerRoute);
  app.post("/api/admin/banners/:id/duplicate", bannerAdminRateLimiter, duplicateBannerRoute);
  app.post("/api/admin/banners/:id/activate", bannerAdminRateLimiter, activateBannerRoute);
  app.post("/api/admin/banners/:id/pause", bannerAdminRateLimiter, pauseBannerRoute);
  app.post("/api/admin/banners/:id/disable", bannerAdminRateLimiter, disableBannerRoute);
  app.get("/api/admin/banners/:id/stats", bannerAdminRateLimiter, getBannerStatsRoute);
  app.get("/api/admin/banners/:id/form-responses", bannerAdminRateLimiter, listFormResponses);
  app.get("/api/admin/banners/:id/form-responses/export", bannerAdminRateLimiter, exportFormResponsesRoute);
  app.get("/api/admin/banners/:id/views", bannerAdminRateLimiter, listBannerViews);
}
