/**
 * Notifications — Consumer-facing API helpers
 *
 * Mirrors the same `authedJson` pattern used by reservationV2Api.ts.
 * Endpoints map 1:1 to server notification routes.
 */

import { getConsumerAccessToken } from "@/lib/auth";

// =============================================================================
// Error class
// =============================================================================

export class NotificationsApiError extends Error {
  status: number;
  errorCode?: string;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown, errorCode?: string) {
    super(message);
    this.name = "NotificationsApiError";
    this.status = status;
    this.payload = payload;
    this.errorCode = errorCode;
  }
}

// =============================================================================
// Authed fetch helper
// =============================================================================

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new NotificationsApiError("Not authenticated", 401);

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new NotificationsApiError(
      "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      0,
      e,
    );
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg =
      (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    const code = typeof rec?.errorCode === "string" ? rec.errorCode : undefined;
    throw new NotificationsApiError(msg, res.status, payload, code);
  }

  return payload as T;
}

// =============================================================================
// Response types
// =============================================================================

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  [key: string]: unknown;
}

// =============================================================================
// 1. List notifications
// =============================================================================

export async function listNotifications(): Promise<{
  ok: true;
  notifications: Notification[];
}> {
  return authedJson("/api/me/notifications");
}

// =============================================================================
// 2. Mark single notification as read
// =============================================================================

export async function markNotificationRead(
  notificationId: string,
): Promise<{ ok: true }> {
  return authedJson(
    `/api/me/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
  );
}

// =============================================================================
// 3. Mark all notifications as read
// =============================================================================

export async function markAllNotificationsRead(): Promise<{ ok: true }> {
  return authedJson("/api/me/notifications/read-all", { method: "POST" });
}

// =============================================================================
// 4. Get notification preferences
// =============================================================================

export async function getNotificationPreferences(): Promise<{
  ok: true;
  preferences: NotificationPreferences;
}> {
  return authedJson("/api/me/notification-preferences");
}

// =============================================================================
// 5. Update notification preferences
// =============================================================================

export async function updateNotificationPreferences(
  prefs: Record<string, unknown>,
): Promise<{ ok: true; preferences: NotificationPreferences }> {
  return authedJson("/api/me/notification-preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}
