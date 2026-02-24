/**
 * Ramadan Admin API — Helpers côté admin
 *
 * Utilise les headers admin (x-admin-key + x-admin-session).
 */

import type { RamadanOfferRow } from "../../shared/ramadanTypes";

// =============================================================================
// Auth admin
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
  const res = await fetch(path, {
    ...init,
    headers: {
      ...getAdminHeaders(),
      ...(init?.headers ?? {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const msg = (payload as any)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return res.json();
}

// =============================================================================
// Types
// =============================================================================

export type RamadanOfferWithEstablishment = RamadanOfferRow & {
  establishments?: {
    id: string;
    name: string;
    slug: string;
    city: string;
  } | null;
};

// =============================================================================
// API
// =============================================================================

/** GET /api/admin/ramadan/moderation */
export async function getRamadanModerationQueue(
  status?: string,
): Promise<{ offers: RamadanOfferWithEstablishment[] }> {
  const qs = status ? `?status=${status}` : "";
  return adminJson(`/api/admin/ramadan/moderation${qs}`);
}

/** GET /api/admin/ramadan/offers */
export async function listAllRamadanOffers(
  status?: string,
  type?: string,
): Promise<{ offers: RamadanOfferWithEstablishment[] }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const qs = params.toString();
  return adminJson(`/api/admin/ramadan/offers${qs ? `?${qs}` : ""}`);
}

/** GET /api/admin/ramadan/stats */
export async function getRamadanStats(): Promise<{
  stats: {
    total_offers: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    total_reservations: number;
    total_valid_scans: number;
  };
}> {
  return adminJson("/api/admin/ramadan/stats");
}

/** POST /api/admin/ramadan/:id/approve */
export async function approveRamadanOffer(
  offerId: string,
  note?: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/approve`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

/** POST /api/admin/ramadan/:id/reject */
export async function rejectRamadanOffer(
  offerId: string,
  reason: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** POST /api/admin/ramadan/:id/request-modification */
export async function requestRamadanOfferModification(
  offerId: string,
  note: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/request-modification`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

/** POST /api/admin/ramadan/:id/feature */
export async function featureRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/feature`, { method: "POST" });
}

/** POST /api/admin/ramadan/:id/unfeature */
export async function unfeatureRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/unfeature`, { method: "POST" });
}

/** POST /api/admin/ramadan/:id/suspend */
export async function suspendRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/suspend`, { method: "POST" });
}

/** POST /api/admin/ramadan/:id/resume */
export async function resumeRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/resume`, { method: "POST" });
}

/** DELETE /api/admin/ramadan/:id */
export async function deleteRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}`, { method: "DELETE" });
}
