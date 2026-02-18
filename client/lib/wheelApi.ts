/**
 * Wheel of Fortune — Combined consumer + admin API helpers
 *
 * Consumer auth: same `authedJson` pattern as reservationV2Api.ts
 * Admin auth: same `adminJson` pattern as packsV2AdminApi.ts
 *
 * Endpoints map 1:1 to server/routes/wheelPublic.ts & wheelAdmin.ts.
 */

import { getConsumerAccessToken } from "@/lib/auth";

// =============================================================================
// Error class
// =============================================================================

export class WheelApiError extends Error {
  status: number;
  errorCode?: string;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown, errorCode?: string) {
    super(message);
    this.name = "WheelApiError";
    this.status = status;
    this.payload = payload;
    this.errorCode = errorCode;
  }
}

// =============================================================================
// Consumer authed fetch
// =============================================================================

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new WheelApiError("Not authenticated", 401);

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
    throw new WheelApiError(
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
    throw new WheelApiError(msg, res.status, payload, code);
  }

  return payload as T;
}

// =============================================================================
// Admin authed fetch
// =============================================================================

const STORAGE_KEY = "sam_admin_api_key";
const SESSION_TOKEN_KEY = "sam_admin_session_token";

function getAdminHeaders(): Record<string, string> {
  const adminKey = sessionStorage.getItem(STORAGE_KEY) ?? "";
  const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  const headers: Record<string, string> = {};
  if (adminKey) headers["x-admin-key"] = adminKey;
  if (sessionToken) headers["x-admin-session"] = sessionToken;
  return headers;
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...getAdminHeaders(),
        ...(init?.headers ?? {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new WheelApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new WheelApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Consumer endpoints (5)
// =============================================================================

/** GET /api/wheel/active — get active wheel + canSpin status */
export async function getActiveWheel(): Promise<{ ok: true; wheel: unknown; canSpin: unknown }> {
  return authedJson("/api/wheel/active");
}

/** POST /api/wheel/spin — spin the wheel */
export async function spinWheel(deviceId?: string): Promise<{ ok: true; prize: unknown; gift_distribution_id?: string }> {
  return authedJson("/api/wheel/spin", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId }),
  });
}

/** GET /api/me/wheel/history — user spin history */
export async function getSpinHistory(wheelId?: string): Promise<{ ok: true; history: unknown[] }> {
  const qs = wheelId ? `?wheel_id=${encodeURIComponent(wheelId)}` : "";
  return authedJson(`/api/me/wheel/history${qs}`);
}

/** GET /api/me/wheel/gifts — user wheel gifts */
export async function getUserWheelGifts(): Promise<{ ok: true; gifts: unknown[] }> {
  return authedJson("/api/me/wheel/gifts");
}

/** GET /api/wheel/:id/preview — public preview (no probabilities) */
export async function getWheelPreview(wheelId: string): Promise<{ ok: true; wheel: unknown; prizes: unknown[] }> {
  return authedJson(`/api/wheel/${encodeURIComponent(wheelId)}/preview`);
}

// =============================================================================
// Admin endpoints (15)
// =============================================================================

/** GET /api/admin/wheel — list wheel events */
export async function adminListWheelEvents(opts?: {
  page?: number;
  limit?: number;
}): Promise<{ events: unknown[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return adminJson(`/api/admin/wheel${qs ? `?${qs}` : ""}`);
}

/** GET /api/admin/wheel/:id — get wheel detail + prizes */
export async function adminGetWheelEvent(wheelId: string): Promise<{ event: unknown; prizes: unknown[] }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}`);
}

/** POST /api/admin/wheel — create wheel event */
export async function adminCreateWheelEvent(input: Record<string, unknown>): Promise<{ ok: true; eventId: string }> {
  return adminJson("/api/admin/wheel", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/admin/wheel/:id — update wheel event */
export async function adminUpdateWheelEvent(wheelId: string, input: Record<string, unknown>): Promise<{ ok: true }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** POST /api/admin/wheel/:id/activate — activate wheel */
export async function adminActivateWheel(wheelId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/activate`, { method: "POST" });
}

/** POST /api/admin/wheel/:id/pause — pause wheel */
export async function adminPauseWheel(wheelId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/pause`, { method: "POST" });
}

/** POST /api/admin/wheel/:id/end — end wheel */
export async function adminEndWheel(wheelId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/end`, { method: "POST" });
}

/** POST /api/admin/wheel/:id/prizes — add prize */
export async function adminAddPrize(wheelId: string, input: Record<string, unknown>): Promise<{ ok: true; prizeId: string }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/prizes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/admin/wheel/prizes/:prizeId — update prize */
export async function adminUpdatePrize(prizeId: string, input: Record<string, unknown>): Promise<{ ok: true }> {
  return adminJson(`/api/admin/wheel/prizes/${encodeURIComponent(prizeId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** DELETE /api/admin/wheel/prizes/:prizeId — remove prize */
export async function adminRemovePrize(prizeId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/wheel/prizes/${encodeURIComponent(prizeId)}`, { method: "DELETE" });
}

/** POST /api/admin/wheel/prizes/:prizeId/upload-codes — upload external codes CSV */
export async function adminUploadExternalCodes(prizeId: string, csvContent: string): Promise<{ ok: true; imported: number }> {
  return adminJson(`/api/admin/wheel/prizes/${encodeURIComponent(prizeId)}/upload-codes`, {
    method: "POST",
    body: JSON.stringify({ csv_content: csvContent }),
  });
}

/** GET /api/admin/wheel/:id/stats — wheel stats */
export async function adminGetWheelStats(wheelId: string): Promise<{ ok: true; stats: unknown }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/stats`);
}

/** GET /api/admin/wheel/:id/recap — daily recap */
export async function adminGetDailyRecap(wheelId: string): Promise<{ ok: true; recap: unknown }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/recap`);
}

/** GET /api/admin/wheel/:id/export — export spins CSV */
export async function adminExportSpins(wheelId: string): Promise<Blob> {
  const adminHeaders = getAdminHeaders();
  const res = await fetch(`/api/admin/wheel/${encodeURIComponent(wheelId)}/export`, {
    headers: { ...adminHeaders },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new WheelApiError(msg, res.status, payload);
  }
  return res.blob();
}

/** POST /api/admin/wheel/:id/validate-probabilities — validate probabilities */
export async function adminValidateProbabilities(wheelId: string): Promise<{ ok: true; valid: boolean; errors?: string[] }> {
  return adminJson(`/api/admin/wheel/${encodeURIComponent(wheelId)}/validate-probabilities`, { method: "POST" });
}
