/**
 * Public Analytics — POST /api/analytics/pageview
 *
 * Receives fire-and-forget page view events from the consumer site.
 * No authentication required (anonymous visitors).
 * Rate-limited to 60 req/min per IP.
 */

import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { getAdminSupabase } from "../supabaseAdmin";
import { createRateLimiter, getClientIp } from "../middleware/rateLimiter";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicAnalytics");

// ── Rate limiter ────────────────────────────────────────────────────────────
const pageviewRateLimiter = createRateLimiter("analytics-pageview", {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: "Trop de requêtes analytics.",
  keyGenerator: getClientIp,
});

// ── Validation schema ───────────────────────────────────────────────────────
const PageViewSchema = z.object({
  session_id: z.string().min(1).max(50),
  path: z.string().min(1).max(500),
  referrer: z.string().max(2000).optional(),
  is_mobile: z.boolean().default(false),
  viewport_width: z.number().int().min(0).max(10000).optional(),
  duration_seconds: z.number().int().min(0).max(3600).default(0),
  had_interaction: z.boolean().default(false),
});

// ── Route registration ──────────────────────────────────────────────────────
export function registerPublicAnalyticsRoutes(router: Router): void {
  router.post(
    "/api/analytics/pageview",
    pageviewRateLimiter,
    (async (req, res) => {
      try {
        const parsed = PageViewSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ ok: false });
        }

        const { session_id, path, referrer, is_mobile, viewport_width, duration_seconds, had_interaction } =
          parsed.data;

        const supabase = getAdminSupabase();
        const { error } = await supabase.from("analytics_page_views").insert({
          session_id,
          path,
          referrer: referrer || null,
          is_mobile,
          viewport_width: viewport_width ?? null,
          duration_seconds,
          had_interaction,
        });

        if (error) {
          // Log but don't fail — analytics are best-effort
          log.warn({ err: error }, "pageview insert failed");
        }

        return res.json({ ok: true });
      } catch (err) {
        log.error({ err }, "pageview error");
        return res.json({ ok: true }); // Always return ok — fire-and-forget
      }
    }) as RequestHandler,
  );
}
