/**
 * Ramadan API — Pro-side helpers
 *
 * Gestion des offres Ramadan par les professionnels.
 * Réutilise proApiFetch pour authentification + gestion erreurs.
 */

import type {
  RamadanOfferRow,
  RamadanOfferType,
  RamadanOfferTimeSlot,
} from "../../../shared/ramadanTypes";
import { proApiFetch } from "./api";

// =============================================================================
// CRUD Offres Ramadan
// =============================================================================

export interface CreateRamadanOfferParams {
  establishment_id: string;
  title: string;
  description_fr?: string;
  description_ar?: string;
  type: RamadanOfferType;
  price: number; // centimes
  original_price?: number;
  capacity_per_slot?: number;
  time_slots: RamadanOfferTimeSlot[];
  photos?: string[];
  cover_url?: string;
  conditions_fr?: string;
  conditions_ar?: string;
  valid_from: string;
  valid_to: string;
}

/** POST /api/pro/ramadan-offers — Créer une offre */
export async function createRamadanOffer(
  params: CreateRamadanOfferParams,
): Promise<{ ok: true; offer_id: string }> {
  return proApiFetch("/api/pro/ramadan-offers", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** GET /api/pro/ramadan-offers — Lister mes offres */
export async function listMyRamadanOffers(
  establishmentId?: string,
): Promise<{ offers: RamadanOfferRow[] }> {
  const qs = establishmentId ? `?establishment_id=${establishmentId}` : "";
  return proApiFetch(`/api/pro/ramadan-offers${qs}`);
}

/** GET /api/pro/ramadan-offers/:id — Détail */
export async function getRamadanOfferDetail(
  offerId: string,
): Promise<{ offer: RamadanOfferRow }> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}`);
}

/** PUT /api/pro/ramadan-offers/:id — Modifier */
export async function updateRamadanOffer(
  offerId: string,
  params: Partial<CreateRamadanOfferParams>,
): Promise<{ ok: true; requires_moderation: boolean }> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}`, {
    method: "PUT",
    body: JSON.stringify(params),
  });
}

/** POST /api/pro/ramadan-offers/:id/submit — Soumettre pour modération */
export async function submitRamadanOfferForModeration(
  offerId: string,
  establishmentId: string,
): Promise<{ ok: true }> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}/submit`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: establishmentId }),
  });
}

/** POST /api/pro/ramadan-offers/:id/suspend — Suspendre */
export async function suspendRamadanOffer(
  offerId: string,
  establishmentId: string,
): Promise<{ ok: true }> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}/suspend`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: establishmentId }),
  });
}

/** POST /api/pro/ramadan-offers/:id/resume — Reprendre */
export async function resumeRamadanOffer(
  offerId: string,
  establishmentId: string,
): Promise<{ ok: true }> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}/resume`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: establishmentId }),
  });
}

/** DELETE /api/pro/ramadan-offers/:id — Supprimer brouillon */
export async function deleteRamadanOffer(
  offerId: string,
): Promise<{ ok: true }> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}`, {
    method: "DELETE",
  });
}

// =============================================================================
// Réservations & Stats
// =============================================================================

/** GET /api/pro/ramadan-offers/:id/reservations */
export async function listRamadanOfferReservations(
  offerId: string,
): Promise<{
  reservations: Array<{
    id: string;
    user_id: string;
    starts_at: string;
    party_size: number;
    status: string;
    created_at: string;
    consumer_name?: string;
    consumer_phone?: string;
  }>;
}> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}/reservations`);
}

/** GET /api/pro/ramadan-offers/:id/stats */
export async function getRamadanOfferStats(
  offerId: string,
): Promise<{
  stats: {
    total_reservations: number;
    confirmed_reservations: number;
    total_scans: number;
    capacity_per_slot: number;
    total_clicks: number;
    total_impressions: number;
    unique_click_visitors: number;
    unique_impression_visitors: number;
  };
}> {
  return proApiFetch(`/api/pro/ramadan-offers/${offerId}/stats`);
}
