/**
 * Push Token Management Routes
 *
 * Endpoints for registering and managing FCM tokens for push notifications.
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { createRateLimiter } from "../middleware/rateLimiter";
import { zBody } from "../lib/validate";
import { RegisterPushTokenSchema, UnregisterPushTokenSchema, UpdatePushPreferencesSchema } from "../schemas/pushTokens";

const log = createModuleLogger("pushTokens");

const supabase = getAdminSupabase();

// ---------------------------------------------------------------------------
// Helper: Extract user from bearer token
// ---------------------------------------------------------------------------

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.authorization ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return data.user.id;
}

// ---------------------------------------------------------------------------
// POST /api/consumer/push/register
// Register a new FCM token for the current consumer
// ---------------------------------------------------------------------------

export async function registerConsumerPushToken(req: Request, res: Response) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { token, device_type, device_name } = req.body as {
      token?: string;
      device_type?: string;
      device_name?: string;
    };

    if (!token || typeof token !== "string" || token.length < 10) {
      return res.status(400).json({ ok: false, error: "Invalid token" });
    }

    const deviceType = ["web", "ios", "android"].includes(device_type ?? "")
      ? device_type
      : "web";

    // Upsert token (if token exists, update it)
    const { error } = await supabase
      .from("consumer_fcm_tokens")
      .upsert(
        {
          user_id: userId,
          token,
          device_type: deviceType,
          device_name: device_name ?? null,
          active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "token",
        }
      );

    if (error) {
      log.error({ err: error }, "registerConsumerPushToken error");
      return res.status(500).json({ ok: false, error: "Failed to register token" });
    }

    return res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "registerConsumerPushToken unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/consumer/push/unregister
// Unregister an FCM token
// ---------------------------------------------------------------------------

export async function unregisterConsumerPushToken(req: Request, res: Response) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { token } = req.body as { token?: string };

    if (!token) {
      return res.status(400).json({ ok: false, error: "Token required" });
    }

    // Delete token (only if it belongs to this user)
    await supabase
      .from("consumer_fcm_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token", token);

    return res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "unregisterConsumerPushToken unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/consumer/push/preferences
// Update push notification preferences
// ---------------------------------------------------------------------------

export async function updateConsumerPushPreferences(req: Request, res: Response) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const {
      push_notifications_enabled,
      push_waitlist_enabled,
      push_bookings_enabled,
      push_marketing_enabled,
    } = req.body as {
      push_notifications_enabled?: boolean;
      push_waitlist_enabled?: boolean;
      push_bookings_enabled?: boolean;
      push_marketing_enabled?: boolean;
    };

    const updates: Record<string, boolean> = {};

    if (typeof push_notifications_enabled === "boolean") {
      updates.push_notifications_enabled = push_notifications_enabled;
    }
    if (typeof push_waitlist_enabled === "boolean") {
      updates.push_waitlist_enabled = push_waitlist_enabled;
    }
    if (typeof push_bookings_enabled === "boolean") {
      updates.push_bookings_enabled = push_bookings_enabled;
    }
    if (typeof push_marketing_enabled === "boolean") {
      updates.push_marketing_enabled = push_marketing_enabled;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: "No preferences to update" });
    }

    const { error } = await supabase
      .from("consumer_users")
      .update(updates)
      .eq("id", userId);

    if (error) {
      log.error({ err: error }, "updateConsumerPushPreferences error");
      return res.status(500).json({ ok: false, error: "Failed to update preferences" });
    }

    return res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "updateConsumerPushPreferences unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerPushTokenRoutes(app: Express) {
  app.post("/api/consumer/push/register", createRateLimiter("push-register", { windowMs: 5 * 60 * 1000, maxRequests: 10 }), zBody(RegisterPushTokenSchema), registerConsumerPushToken);
  app.post("/api/consumer/push/unregister", createRateLimiter("push-unregister", { windowMs: 5 * 60 * 1000, maxRequests: 10 }), zBody(UnregisterPushTokenSchema), unregisterConsumerPushToken);
  app.post("/api/consumer/push/preferences", zBody(UpdatePushPreferencesSchema), updateConsumerPushPreferences);
}
