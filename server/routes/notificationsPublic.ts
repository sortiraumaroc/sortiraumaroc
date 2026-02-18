/**
 * Notifications Public Routes — Consumer-facing
 *
 * 5 endpoints:
 *  - GET  /api/me/notifications                — list in-app notifications
 *  - POST /api/me/notifications/:id/read       — mark single notification as read
 *  - POST /api/me/notifications/read-all       — mark all notifications as read
 *  - GET  /api/me/notification-preferences      — get notification preferences
 *  - PUT  /api/me/notification-preferences      — update notification preferences
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { getUserPreferences, updateUserPreferences } from "../notificationPreferences";
import { createRateLimiter } from "../middleware/rateLimiter";

// =============================================================================
// Rate limiters
// =============================================================================

const notificationReadRateLimiter = createRateLimiter("notification-read", {
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
  } catch {
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
// 1. GET /api/me/notifications — List in-app notifications
// =============================================================================

async function listNotifications(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("notification_logs")
      .select("*")
      .eq("recipient_id", auth.userId)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[listNotifications] DB error:", error);
      return res.status(500).json({ error: "internal_error" });
    }

    res.json({ ok: true, notifications: data ?? [] });
  } catch (err) {
    console.error("[listNotifications] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 2. POST /api/me/notifications/:id/read — Mark single notification as read
// =============================================================================

async function markNotificationRead(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const notificationId = req.params.id;
    if (!notificationId) {
      return res.status(400).json({ error: "missing_notification_id" });
    }

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("notification_logs")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_id", auth.userId);

    if (error) {
      console.error("[markNotificationRead] DB error:", error);
      return res.status(500).json({ error: "internal_error" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[markNotificationRead] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 3. POST /api/me/notifications/read-all — Mark all notifications as read
// =============================================================================

async function markAllNotificationsRead(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("notification_logs")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("recipient_id", auth.userId)
      .eq("channel", "in_app")
      .neq("status", "read");

    if (error) {
      console.error("[markAllNotificationsRead] DB error:", error);
      return res.status(500).json({ error: "internal_error" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[markAllNotificationsRead] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 4. GET /api/me/notification-preferences — Get notification preferences
// =============================================================================

async function getNotificationPreferences(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const preferences = await getUserPreferences(auth.userId);

    res.json({ ok: true, preferences });
  } catch (err) {
    console.error("[getNotificationPreferences] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 5. PUT /api/me/notification-preferences — Update notification preferences
// =============================================================================

async function updateNotificationPreferences(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "invalid_body" });
    }

    const updated = await updateUserPreferences(auth.userId, "consumer", body);

    res.json({ ok: true, preferences: updated });
  } catch (err) {
    console.error("[updateNotificationPreferences] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerNotificationPublicRoutes(app: Router): void {
  app.get("/api/me/notifications", notificationReadRateLimiter, listNotifications);
  app.post("/api/me/notifications/:id/read", notificationReadRateLimiter, markNotificationRead);
  app.post("/api/me/notifications/read-all", notificationReadRateLimiter, markAllNotificationsRead);
  app.get("/api/me/notification-preferences", notificationReadRateLimiter, getNotificationPreferences);
  app.put("/api/me/notification-preferences", notificationReadRateLimiter, updateNotificationPreferences);
}
