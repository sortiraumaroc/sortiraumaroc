/**
 * Banners Public Routes — Consumer-facing (anonymous + authenticated)
 *
 * 4 endpoints:
 *  - GET  /api/banners/eligible        — get eligible banner for context
 *  - POST /api/banners/:id/view        — track banner impression
 *  - POST /api/banners/:id/click       — track banner click
 *  - POST /api/banners/:id/form-submit — submit banner form response
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams, zQuery } from "../lib/validate";
import { BannerViewSchema, BannerClickSchema, BannerFormSubmitSchema, BannerIdParams, EligibleBannerQuery } from "../schemas/bannersPublic";

const log = createModuleLogger("bannersPublic");
import { getEligibleBanner, trackBannerAction } from "../bannerLogic";
import { submitFormResponse } from "../bannerFormLogic";
import { createRateLimiter } from "../middleware/rateLimiter";

// =============================================================================
// Rate limiters
// =============================================================================

const bannerTrackingRateLimiter = createRateLimiter("banner-tracking", {
  windowMs: 60_000,
  maxRequests: 10,
});

const bannerFormRateLimiter = createRateLimiter("banner-form", {
  windowMs: 60_000,
  maxRequests: 5,
});

// =============================================================================
// Auth helper (optional — works for anonymous users too)
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
    log.warn({ err }, "Auth token verification failed");
    return { ok: false, status: 401, error: "unauthorized" };
  }
}

/** Extract optional userId (null if not authenticated) */
async function getOptionalUserId(req: Request): Promise<string | null> {
  const auth = await getConsumerUserId(req);
  return auth.ok ? auth.userId : null;
}

// =============================================================================
// Helpers
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// =============================================================================
// 1. GET /api/banners/eligible — Get eligible banner for the current context
// =============================================================================

async function getEligibleBannerHandler(req: Request, res: Response) {
  try {
    const userId = await getOptionalUserId(req);

    const platform = asString(req.query.platform);
    const trigger = asString(req.query.trigger);
    const page = asString(req.query.page);
    const sessionId = asString(req.query.session_id);

    const banner = await getEligibleBanner({
      userId,
      platform: (platform === "mobile" ? "mobile" : "web") as "web" | "mobile",
      trigger: (trigger ?? "on_app_open") as import("../../shared/notificationsBannersWheelTypes").BannerTrigger,
      page: page ?? undefined,
      sessionId: sessionId ?? "anonymous",
    });

    res.json({ ok: true, banner });
  } catch (err) {
    log.error({ err }, "getEligibleBanner error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 2. POST /api/banners/:id/view — Track banner impression
// =============================================================================

async function trackBannerView(req: Request, res: Response) {
  try {
    const bannerId = req.params.id;
    if (!bannerId) {
      return res.status(400).json({ error: "missing_banner_id" });
    }

    const userId = await getOptionalUserId(req);

    const sessionId = typeof req.body?.session_id === "string" ? req.body.session_id : "anonymous";
    await trackBannerAction(bannerId, userId, sessionId, "view");

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "trackBannerView error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 3. POST /api/banners/:id/click — Track banner click
// =============================================================================

async function trackBannerClick(req: Request, res: Response) {
  try {
    const bannerId = req.params.id;
    if (!bannerId) {
      return res.status(400).json({ error: "missing_banner_id" });
    }

    const userId = await getOptionalUserId(req);
    const sessionId = typeof req.body?.session_id === "string" ? req.body.session_id : "anonymous";

    await trackBannerAction(bannerId, userId, sessionId, "click");

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "trackBannerClick error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 4. POST /api/banners/:id/form-submit — Submit banner form response
// =============================================================================

async function submitBannerForm(req: Request, res: Response) {
  try {
    const bannerId = req.params.id;
    if (!bannerId) {
      return res.status(400).json({ error: "missing_banner_id" });
    }

    const userId = await getOptionalUserId(req);
    const body = req.body;

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "invalid_body" });
    }

    const result = await submitFormResponse(bannerId, userId, body);

    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "submitBannerForm error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerBannerPublicRoutes(app: Router): void {
  app.get("/api/banners/eligible", zQuery(EligibleBannerQuery), bannerTrackingRateLimiter, getEligibleBannerHandler);
  app.post("/api/banners/:id/view", zParams(BannerIdParams), bannerTrackingRateLimiter, zBody(BannerViewSchema), trackBannerView);
  app.post("/api/banners/:id/click", zParams(BannerIdParams), bannerTrackingRateLimiter, zBody(BannerClickSchema), trackBannerClick);
  app.post("/api/banners/:id/form-submit", zParams(BannerIdParams), bannerFormRateLimiter, zBody(BannerFormSubmitSchema), submitBannerForm);
}
