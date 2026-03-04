/**
 * Banners — Combined consumer + admin API helpers
 *
 * Consumer endpoints map to server/routes/bannersPublic.ts (anonymous-friendly).
 * Admin endpoints map to server/routes/bannersAdmin.ts.
 */

import type {
  Banner,
  BannerStats,
  BannerFormResponse,
} from "../../shared/notificationsBannersWheelTypes";

// =============================================================================
// Error class
// =============================================================================

export class BannersApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "BannersApiError";
    this.status = status;
    this.payload = payload;
  }
}

// =============================================================================
// Generic fetch helpers
// =============================================================================

async function publicJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new BannersApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new BannersApiError(msg, res.status, payload);
  }

  return payload as T;
}

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
    throw new BannersApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new BannersApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Consumer endpoints (bannersPublic.ts)
// =============================================================================

/** GET /api/banners/eligible */
export async function getEligibleBanner(opts: {
  platform?: "web" | "mobile";
  trigger?: string;
  page?: string;
  session_id?: string;
}): Promise<{ ok: true; banner: Banner | null }> {
  const params = new URLSearchParams();
  if (opts.platform) params.set("platform", opts.platform);
  if (opts.trigger) params.set("trigger", opts.trigger);
  if (opts.page) params.set("page", opts.page);
  if (opts.session_id) params.set("session_id", opts.session_id);
  const qs = params.toString();
  return publicJson(`/api/banners/eligible${qs ? `?${qs}` : ""}`);
}

/** POST /api/banners/:id/view */
export async function trackBannerView(
  bannerId: string,
  sessionId: string,
): Promise<{ ok: true }> {
  return publicJson(`/api/banners/${encodeURIComponent(bannerId)}/view`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** POST /api/banners/:id/click */
export async function trackBannerClick(
  bannerId: string,
  sessionId: string,
): Promise<{ ok: true }> {
  return publicJson(`/api/banners/${encodeURIComponent(bannerId)}/click`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** POST /api/banners/:id/form-submit */
export async function submitBannerForm(
  bannerId: string,
  formData: Record<string, unknown>,
): Promise<{ ok: true }> {
  return publicJson(`/api/banners/${encodeURIComponent(bannerId)}/form-submit`, {
    method: "POST",
    body: JSON.stringify(formData),
  });
}

// =============================================================================
// Admin endpoints (bannersAdmin.ts)
// =============================================================================

/** GET /api/admin/banners */
export async function listBanners(opts?: {
  status?: string;
  type?: string;
  platform?: string;
  page?: number;
  limit?: number;
}): Promise<{ banners: Banner[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.platform) params.set("platform", opts.platform);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return adminJson(`/api/admin/banners${qs ? `?${qs}` : ""}`);
}

/** GET /api/admin/banners/:id */
export async function getBanner(
  bannerId: string,
): Promise<{ banner: Banner; stats: BannerStats | null }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}`);
}

/** POST /api/admin/banners */
export async function createBanner(
  input: Partial<Omit<Banner, "id" | "created_at" | "updated_at">>,
): Promise<{ ok: true; bannerId: string }> {
  return adminJson("/api/admin/banners", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/admin/banners/:id */
export async function updateBanner(
  bannerId: string,
  input: Partial<Omit<Banner, "id" | "created_at" | "updated_at">>,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** POST /api/admin/banners/:id/duplicate */
export async function duplicateBanner(
  bannerId: string,
): Promise<{ ok: true; bannerId: string }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}/duplicate`, {
    method: "POST",
  });
}

/** POST /api/admin/banners/:id/activate */
export async function activateBanner(bannerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}/activate`, {
    method: "POST",
  });
}

/** POST /api/admin/banners/:id/pause */
export async function pauseBanner(bannerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}/pause`, {
    method: "POST",
  });
}

/** POST /api/admin/banners/:id/disable */
export async function disableBanner(bannerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}/disable`, {
    method: "POST",
  });
}

/** GET /api/admin/banners/:id/stats */
export async function getBannerStats(
  bannerId: string,
): Promise<{ ok: true; stats: BannerStats }> {
  return adminJson(`/api/admin/banners/${encodeURIComponent(bannerId)}/stats`);
}

/** GET /api/admin/banners/:id/form-responses */
export async function listFormResponses(
  bannerId: string,
  opts?: { page?: number; limit?: number },
): Promise<{ responses: BannerFormResponse[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return adminJson(
    `/api/admin/banners/${encodeURIComponent(bannerId)}/form-responses${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/admin/banners/:id/form-responses/export — returns CSV blob URL */
export async function exportFormResponses(bannerId: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(
      `/api/admin/banners/${encodeURIComponent(bannerId)}/form-responses/export`,
      { headers: { ...getAdminHeaders() } },
    );
  } catch {
    throw new BannersApiError("Impossible de contacter le serveur.", 0);
  }
  if (!res.ok) {
    throw new BannersApiError(`HTTP ${res.status}`, res.status);
  }
  return res.blob();
}

/** GET /api/admin/banners/active-count */
export async function getActiveBannerCount(): Promise<{ count: number }> {
  return adminJson("/api/admin/banners/active-count");
}
