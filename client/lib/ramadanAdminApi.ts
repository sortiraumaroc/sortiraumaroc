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

/** POST /api/admin/ramadan/:id/activate — Publier immédiatement */
export async function activateRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/activate`, { method: "POST" });
}

/** DELETE /api/admin/ramadan/:id */
export async function deleteRamadanOffer(offerId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}`, { method: "DELETE" });
}

/** PATCH /api/admin/ramadan/:id/cover — Mettre à jour la photo de couverture */
export async function updateRamadanOfferCover(
  offerId: string,
  coverUrl: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/${offerId}/cover`, {
    method: "PATCH",
    body: JSON.stringify({ cover_url: coverUrl }),
  });
}

// =============================================================================
// Ftour Slot bulk actions
// =============================================================================

/** POST /api/admin/ramadan/slots/bulk-action — Action groupée sur slots Ftour */
export async function bulkFtourSlotAction(
  slotIds: string[],
  action: "approve" | "reject" | "suspend" | "resume" | "delete",
  reason?: string,
): Promise<{ ok: true }> {
  return adminJson("/api/admin/ramadan/slots/bulk-action", {
    method: "POST",
    body: JSON.stringify({ slot_ids: slotIds, action, reason }),
  });
}

// =============================================================================
// Ftour Slot update (admin correction)
// =============================================================================

/** PATCH /api/admin/ramadan/slot/:id — Modifier un créneau Ftour */
export async function updateFtourSlot(
  slotId: string,
  data: {
    base_price?: number;
    capacity?: number;
    promo_type?: string | null;
    promo_value?: number | null;
    promo_label?: string | null;
  },
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/slot/${slotId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** POST /api/admin/ramadan/slots/feature — Mettre en avant un groupe ftour */
export async function featureFtourGroup(
  slotIds: string[],
  featured: boolean,
): Promise<{ ok: true }> {
  return adminJson("/api/admin/ramadan/slots/feature", {
    method: "POST",
    body: JSON.stringify({ slot_ids: slotIds, featured }),
  });
}

/** PATCH /api/admin/ramadan/slots/cover — Mettre à jour la cover d'un groupe ftour */
export async function updateFtourGroupCover(
  slotIds: string[],
  coverUrl: string,
): Promise<{ ok: true }> {
  return adminJson("/api/admin/ramadan/slots/cover", {
    method: "PATCH",
    body: JSON.stringify({ slot_ids: slotIds, cover_url: coverUrl }),
  });
}

// =============================================================================
// Ftour Slot individual actions (backward compat)
// =============================================================================

/** POST /api/admin/ramadan/slot/:id/approve */
export async function approveFtourSlot(slotId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/slot/${slotId}/approve`, { method: "POST" });
}

/** POST /api/admin/ramadan/slot/:id/reject */
export async function rejectFtourSlot(slotId: string, reason?: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/slot/${slotId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** POST /api/admin/ramadan/slot/:id/suspend */
export async function suspendFtourSlot(slotId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/slot/${slotId}/suspend`, { method: "POST" });
}

/** POST /api/admin/ramadan/slot/:id/resume */
export async function resumeFtourSlot(slotId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/slot/${slotId}/resume`, { method: "POST" });
}

/** DELETE /api/admin/ramadan/slot/:id */
export async function deleteFtourSlot(slotId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ramadan/slot/${slotId}`, { method: "DELETE" });
}

/** Upload image via l'endpoint gallery admin (réutilisé) */
export async function uploadRamadanOfferImage(args: {
  establishmentId: string;
  file: File;
}): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("image", args.file);
  formData.append("type", "gallery");

  const res = await fetch(
    `/api/admin/establishments/${encodeURIComponent(args.establishmentId)}/gallery/upload`,
    {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData,
    },
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error((payload as any)?.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}
