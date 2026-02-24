/**
 * Ramadan API — Client-side helpers (public + authenticated)
 *
 * Routes publiques pour les offres Ramadan.
 */

import type { RamadanOfferRow, RamadanOfferType } from "../../shared/ramadanTypes";

// =============================================================================
// Types de réponse
// =============================================================================

export type RamadanOfferWithEstablishment = RamadanOfferRow & {
  establishments?: {
    id: string;
    name: string;
    slug: string;
    city: string;
    cover_url?: string | null;
    logo_url?: string | null;
    universe?: string | null;
  } | null;
  reservation_count?: number;
};

// =============================================================================
// Offres publiques
// =============================================================================

/** GET /api/public/ramadan-offers */
export async function listPublicRamadanOffers(filters?: {
  type?: RamadanOfferType;
  city?: string;
  featured?: boolean;
  limit?: number;
  min_price?: number;
  max_price?: number;
  sort?: "featured" | "price_asc" | "price_desc" | "newest";
  page?: number;
  per_page?: number;
}): Promise<{ offers: RamadanOfferWithEstablishment[]; total: number; page: number; per_page: number }> {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.city) params.set("city", filters.city);
  if (filters?.featured) params.set("featured", "true");
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.min_price) params.set("min_price", String(filters.min_price));
  if (filters?.max_price) params.set("max_price", String(filters.max_price));
  if (filters?.sort) params.set("sort", filters.sort);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.per_page) params.set("per_page", String(filters.per_page));

  const qs = params.toString();
  const res = await fetch(`/api/public/ramadan-offers${qs ? `?${qs}` : ""}`);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** GET /api/public/ramadan-offers/:id */
export async function getRamadanOfferDetails(
  offerId: string,
): Promise<{ offer: RamadanOfferWithEstablishment }> {
  const res = await fetch(`/api/public/ramadan-offers/${offerId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** GET /api/public/ramadan-offers/establishment/:id */
export async function getEstablishmentRamadanOffers(
  establishmentId: string,
): Promise<{ offers: RamadanOfferRow[] }> {
  const res = await fetch(`/api/public/ramadan-offers/establishment/${establishmentId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// =============================================================================
// Tracking
// =============================================================================

/** POST /api/public/ramadan-offers/:id/track — fire-and-forget */
export function trackRamadanOfferEvent(offerId: string, eventType: "impression" | "click"): void {
  void fetch(`/api/public/ramadan-offers/${offerId}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType }),
  }).catch(() => { /* ignore */ });
}
