/**
 * Wheel of Fortune Public Routes — Consumer-facing
 *
 * 5 endpoints:
 *  - GET  /api/wheel/active          — get active wheel + canSpin status
 *  - POST /api/wheel/spin            — spin the wheel
 *  - GET  /api/me/wheel/history      — user spin history
 *  - GET  /api/me/wheel/gifts        — user wheel gifts
 *  - GET  /api/wheel/:id/preview     — public preview (no probabilities)
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("wheelPublic");
import { getActiveWheel, canUserSpin, spinWheel, getSpinHistory, getUserWheelGifts } from "../wheelOfFortuneLogic";
import { createRateLimiter, getClientIp } from "../middleware/rateLimiter";
import { isValidUUID } from "../sanitizeV2";
import { auditClientAction } from "../auditLogV2";
import { zBody, zParams, zQuery } from "../lib/validate";
import { SpinWheelSchema, WheelIdParams, WheelHistoryQuery } from "../schemas/publicRoutes";

// =============================================================================
// Rate limiters
// =============================================================================

const wheelSpinRateLimiter = createRateLimiter("wheel-spin", {
  windowMs: 60_000,
  maxRequests: 5,
});

const wheelReadRateLimiter = createRateLimiter("wheel-read", {
  windowMs: 60_000,
  maxRequests: 30,
});

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

/** Extract optional userId (null if not authenticated) */
async function getOptionalUserId(req: Request): Promise<string | null> {
  const auth = await getConsumerUserId(req);
  return auth.ok ? auth.userId : null;
}

// =============================================================================
// 1. GET /api/wheel/active — Get active wheel + canSpin status
// =============================================================================

async function getActiveWheelHandler(req: Request, res: Response) {
  try {
    const userId = await getOptionalUserId(req);
    const ip = getClientIp(req);

    const wheel = await getActiveWheel();
    if (!wheel) {
      return res.json({ ok: true, wheel: null, canSpin: false });
    }

    const canSpin = userId
      ? await canUserSpin(userId, wheel.id)
      : { canSpin: false, reason: "not_authenticated" as const };

    res.json({ ok: true, wheel, canSpin });
  } catch (err) {
    log.error({ err }, "getActiveWheel error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 2. POST /api/wheel/spin — Spin the wheel
// =============================================================================

async function spinWheelHandler(req: Request, res: Response) {
  try {
    const userId = await getOptionalUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "authentication_required" });
    }

    const ip = getClientIp(req);
    const deviceId = typeof req.body?.device_id === "string" ? req.body.device_id.trim() : undefined;

    // Need active wheel to get wheelId
    const wheel = await getActiveWheel();
    if (!wheel) {
      return res.status(404).json({ error: "no_active_wheel" });
    }

    const result = await spinWheel(userId, wheel.id, deviceId || undefined, ip);

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    // Audit log
    void (async () => {
      try {
        await auditClientAction(
          "client.wheel.spin",
          {
            userId,
            targetType: "wheel_spin",
            targetId: result.gift_distribution_id ?? undefined,
            details: { prizeType: result.prize?.type },
            ip,
          },
        );
      } catch (err) { log.warn({ err }, "Best-effort: wheel spin audit log failed"); }
    })();

    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "spinWheel error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 3. GET /api/me/wheel/history — User spin history
// =============================================================================

async function getSpinHistoryHandler(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    // Get active wheel for history (or use query param)
    const wheelId = typeof req.query.wheel_id === "string" ? req.query.wheel_id : undefined;
    const wheel = wheelId ? { id: wheelId } : await getActiveWheel();
    if (!wheel) {
      return res.json({ ok: true, history: [] });
    }

    const history = await getSpinHistory(auth.userId, wheel.id);

    res.json({ ok: true, history });
  } catch (err) {
    log.error({ err }, "getSpinHistory error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 4. GET /api/me/wheel/gifts — User wheel gifts
// =============================================================================

async function getUserWheelGiftsHandler(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const gifts = await getUserWheelGifts(auth.userId);

    res.json({ ok: true, gifts });
  } catch (err) {
    log.error({ err }, "getUserWheelGifts error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 5. GET /api/wheel/:id/preview — Public preview (no probabilities)
// =============================================================================

async function getWheelPreview(req: Request, res: Response) {
  try {
    const wheelId = req.params.id;
    if (!wheelId || !isValidUUID(wheelId)) {
      return res.status(400).json({ error: "invalid_wheel_id" });
    }

    const supabase = getAdminSupabase();

    // Fetch wheel event
    const { data: wheel, error: wheelError } = await supabase
      .from("wheel_events")
      .select("id, name, description, start_date, end_date, status, visual_config, created_at")
      .eq("id", wheelId)
      .single();

    if (wheelError || !wheel) {
      return res.status(404).json({ error: "wheel_not_found" });
    }

    // Fetch prizes WITHOUT probabilities
    const { data: prizes, error: prizesError } = await supabase
      .from("wheel_prizes")
      .select("id, label, type, value, color, icon, position, total_stock, remaining_stock")
      .eq("wheel_event_id", wheelId)
      .order("position", { ascending: true });

    if (prizesError) {
      log.error({ err: prizesError }, "getWheelPreview prizes error");
      return res.status(500).json({ error: "internal_error" });
    }

    res.json({ ok: true, wheel, prizes: prizes ?? [] });
  } catch (err) {
    log.error({ err }, "getWheelPreview error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerWheelPublicRoutes(app: Router): void {
  app.get("/api/wheel/active", wheelReadRateLimiter, getActiveWheelHandler);
  app.post("/api/wheel/spin", wheelSpinRateLimiter, zBody(SpinWheelSchema), spinWheelHandler);
  app.get("/api/me/wheel/history", zQuery(WheelHistoryQuery), wheelReadRateLimiter, getSpinHistoryHandler);
  app.get("/api/me/wheel/gifts", wheelReadRateLimiter, getUserWheelGiftsHandler);
  app.get("/api/wheel/:id/preview", zParams(WheelIdParams), wheelReadRateLimiter, getWheelPreview);
}
