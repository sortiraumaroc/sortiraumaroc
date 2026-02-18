/**
 * Wheel of Fortune Admin Routes — 15 endpoints
 *
 *  - GET    /api/admin/wheel                            — list wheel events
 *  - GET    /api/admin/wheel/:id                        — get single wheel event
 *  - POST   /api/admin/wheel                            — create wheel event
 *  - PUT    /api/admin/wheel/:id                        — update wheel event
 *  - POST   /api/admin/wheel/:id/activate               — activate wheel
 *  - POST   /api/admin/wheel/:id/pause                  — pause wheel
 *  - POST   /api/admin/wheel/:id/end                    — end wheel
 *  - POST   /api/admin/wheel/:id/prizes                 — add prize
 *  - PUT    /api/admin/wheel/prizes/:prizeId            — update prize
 *  - DELETE /api/admin/wheel/prizes/:prizeId            — remove prize
 *  - POST   /api/admin/wheel/prizes/:prizeId/upload-codes — upload external codes CSV
 *  - GET    /api/admin/wheel/:id/stats                  — get wheel stats
 *  - GET    /api/admin/wheel/:id/recap                  — get daily recap
 *  - GET    /api/admin/wheel/:id/export                 — export spins CSV
 *  - POST   /api/admin/wheel/:id/validate-probabilities — validate probabilities
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { assertAdminApiEnabled, checkAdminKey, getAdminSupabase } from "../supabaseAdmin";
import { getSessionCookieName, parseCookies, verifyAdminSessionToken } from "../adminSession";
import {
  createWheelEvent,
  updateWheelEvent,
  activateWheel,
  pauseWheel,
  endWheel,
  addPrize,
  updatePrize,
  removePrize,
  uploadExternalCodes,
  getWheelStats,
  getDailyRecap,
  validateProbabilities,
  exportSpins,
} from "../wheelAdminLogic";
import { auditAdminAction } from "../auditLogV2";
import { isValidUUID, sanitizeText } from "../sanitizeV2";
import { wheelAdminRateLimiter } from "../middleware/rateLimiter";

// =============================================================================
// Admin auth
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

// 1. GET /api/admin/wheel
async function listWheelEvents(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const supabase = getAdminSupabase();
    const { data, error, count } = await supabase
      .from("wheel_events")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ events: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error("[WheelAdmin] listWheelEvents error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 2. GET /api/admin/wheel/:id
async function getWheelEvent(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data: event, error } = await supabase
      .from("wheel_events")
      .select("*")
      .eq("id", wheelId)
      .single();

    if (error || !event) {
      res.status(404).json({ error: "Wheel event not found" });
      return;
    }

    // Fetch prizes
    const { data: prizes } = await supabase
      .from("wheel_prizes")
      .select("*")
      .eq("wheel_event_id", wheelId)
      .order("position", { ascending: true });

    res.json({ event, prizes: prizes ?? [] });
  } catch (err) {
    console.error("[WheelAdmin] getWheelEvent error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 3. POST /api/admin/wheel
async function createWheelEventRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const body = req.body ?? {};
    // Sanitize text fields
    if (typeof body.name === "string") body.name = sanitizeText(body.name, 200);
    if (typeof body.description === "string") body.description = sanitizeText(body.description, 2000);
    if (typeof body.welcome_message === "string") body.welcome_message = sanitizeText(body.welcome_message, 500);
    if (typeof body.already_played_message === "string") body.already_played_message = sanitizeText(body.already_played_message, 500);

    const result = await createWheelEvent(body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.status(201).json(result);

    void auditAdminAction("admin.wheel.create", {
      targetType: "wheel_event",
      targetId: (result as any).eventId,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[WheelAdmin] createWheelEvent error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 4. PUT /api/admin/wheel/:id
async function updateWheelEventRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const body = req.body ?? {};
    // Sanitize text fields
    if (typeof body.name === "string") body.name = sanitizeText(body.name, 200);
    if (typeof body.description === "string") body.description = sanitizeText(body.description, 2000);
    if (typeof body.welcome_message === "string") body.welcome_message = sanitizeText(body.welcome_message, 500);
    if (typeof body.already_played_message === "string") body.already_played_message = sanitizeText(body.already_played_message, 500);

    const result = await updateWheelEvent(wheelId, body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[WheelAdmin] updateWheelEvent error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 5. POST /api/admin/wheel/:id/activate
async function activateWheelRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const result = await activateWheel(wheelId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.wheel.activate", {
      targetType: "wheel_event",
      targetId: wheelId,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[WheelAdmin] activateWheel error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 6. POST /api/admin/wheel/:id/pause
async function pauseWheelRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const result = await pauseWheel(wheelId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.wheel.pause", {
      targetType: "wheel_event",
      targetId: wheelId,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[WheelAdmin] pauseWheel error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 7. POST /api/admin/wheel/:id/end
async function endWheelRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const result = await endWheel(wheelId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.wheel.end", {
      targetType: "wheel_event",
      targetId: wheelId,
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[WheelAdmin] endWheel error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 8. POST /api/admin/wheel/:id/prizes
async function addPrizeRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const body = req.body ?? {};
    // Sanitize text fields
    if (typeof body.name === "string") body.name = sanitizeText(body.name, 100);
    if (typeof body.description === "string") body.description = sanitizeText(body.description, 500);
    if (typeof body.conditions === "string") body.conditions = sanitizeText(body.conditions, 500);

    const result = await addPrize(wheelId, body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.status(201).json(result);

    void auditAdminAction("admin.wheel.add_prize", {
      targetType: "wheel_prize",
      targetId: wheelId,
      details: { prizeId: (result as any).prizeId },
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[WheelAdmin] addPrize error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 9. PUT /api/admin/wheel/prizes/:prizeId
async function updatePrizeRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const prizeId = req.params.prizeId;
    if (!isValidUUID(prizeId)) {
      res.status(400).json({ error: "Invalid prize ID" });
      return;
    }

    const body = req.body ?? {};
    const result = await updatePrize(prizeId, body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[WheelAdmin] updatePrize error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 10. DELETE /api/admin/wheel/prizes/:prizeId
async function removePrizeRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const prizeId = req.params.prizeId;
    if (!isValidUUID(prizeId)) {
      res.status(400).json({ error: "Invalid prize ID" });
      return;
    }

    const result = await removePrize(prizeId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[WheelAdmin] removePrize error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 11. POST /api/admin/wheel/prizes/:prizeId/upload-codes
async function uploadExternalCodesRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const prizeId = req.params.prizeId;
    if (!isValidUUID(prizeId)) {
      res.status(400).json({ error: "Invalid prize ID" });
      return;
    }

    const csvContent = req.body?.csv_content;
    if (!csvContent || typeof csvContent !== "string") {
      res.status(400).json({ error: "csv_content is required" });
      return;
    }

    const result = await uploadExternalCodes(prizeId, csvContent);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json(result);

    void auditAdminAction("admin.wheel.upload_codes", {
      targetType: "wheel_prize",
      targetId: prizeId,
      details: { imported: (result as any).imported },
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("[WheelAdmin] uploadExternalCodes error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 12. GET /api/admin/wheel/:id/stats
async function getWheelStatsRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const result = await getWheelStats(wheelId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("[WheelAdmin] getWheelStats error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 13. GET /api/admin/wheel/:id/recap
async function getDailyRecapRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const recap = await getDailyRecap(wheelId);

    if (!recap) {
      res.status(404).json({ error: "no_data_for_today" });
      return;
    }

    res.json({ ok: true, recap });
  } catch (err) {
    console.error("[WheelAdmin] getDailyRecap error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 14. GET /api/admin/wheel/:id/export
async function exportSpinsRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const result = await exportSpins(wheelId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="wheel-${wheelId}-spins.csv"`);
    res.send((result as any).csv);
  } catch (err) {
    console.error("[WheelAdmin] exportSpins error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// 15. POST /api/admin/wheel/:id/validate-probabilities
async function validateProbabilitiesRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const wheelId = req.params.id;
    if (!isValidUUID(wheelId)) {
      res.status(400).json({ error: "Invalid wheel event ID" });
      return;
    }

    const result = await validateProbabilities(wheelId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("[WheelAdmin] validateProbabilities error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerWheelAdminRoutes(app: Router): void {
  app.get("/api/admin/wheel", wheelAdminRateLimiter, listWheelEvents);
  app.get("/api/admin/wheel/:id", wheelAdminRateLimiter, getWheelEvent);
  app.post("/api/admin/wheel", wheelAdminRateLimiter, createWheelEventRoute);
  app.put("/api/admin/wheel/:id", wheelAdminRateLimiter, updateWheelEventRoute);
  app.post("/api/admin/wheel/:id/activate", wheelAdminRateLimiter, activateWheelRoute);
  app.post("/api/admin/wheel/:id/pause", wheelAdminRateLimiter, pauseWheelRoute);
  app.post("/api/admin/wheel/:id/end", wheelAdminRateLimiter, endWheelRoute);
  app.post("/api/admin/wheel/:id/prizes", wheelAdminRateLimiter, addPrizeRoute);
  app.put("/api/admin/wheel/prizes/:prizeId", wheelAdminRateLimiter, updatePrizeRoute);
  app.delete("/api/admin/wheel/prizes/:prizeId", wheelAdminRateLimiter, removePrizeRoute);
  app.post("/api/admin/wheel/prizes/:prizeId/upload-codes", wheelAdminRateLimiter, uploadExternalCodesRoute);
  app.get("/api/admin/wheel/:id/stats", wheelAdminRateLimiter, getWheelStatsRoute);
  app.get("/api/admin/wheel/:id/recap", wheelAdminRateLimiter, getDailyRecapRoute);
  app.get("/api/admin/wheel/:id/export", wheelAdminRateLimiter, exportSpinsRoute);
  app.post("/api/admin/wheel/:id/validate-probabilities", wheelAdminRateLimiter, validateProbabilitiesRoute);
}
