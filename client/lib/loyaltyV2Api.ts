/**
 * Loyalty V2 — Consumer-facing API helpers
 *
 * Uses same authedJson pattern as packsV2Api.ts.
 */

import { getConsumerAccessToken } from "@/lib/auth";

// =============================================================================
// Error class
// =============================================================================

export class LoyaltyApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.name = "LoyaltyApiError";
    this.status = status;
  }
}

// =============================================================================
// Fetch helpers
// =============================================================================

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new LoyaltyApiError("Not authenticated", 401);

  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new LoyaltyApiError(msg, res.status);
  }
  return payload as T;
}

async function publicJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new LoyaltyApiError(msg, res.status);
  }
  return payload as T;
}

// =============================================================================
// Types
// =============================================================================

export type MyLoyaltyResponse = {
  ok: boolean;
  active_cards: unknown[];
  completed_cards: unknown[];
  frozen_cards: unknown[];
  pending_rewards: unknown[];
};

export type MyLoyaltyCardResponse = {
  ok: boolean;
  card: Record<string, unknown> & {
    active_reward: unknown;
    previous_card: unknown;
    is_loyal_customer: boolean;
  };
};

export type MyRewardsResponse = {
  ok: boolean;
  active: unknown[];
  used: unknown[];
  expired: unknown[];
};

export type MyGiftsResponse = {
  ok: boolean;
  distributed: unknown[];
  consumed: unknown[];
  expired: unknown[];
};

export type EstablishmentLoyaltyResponse = {
  ok: boolean;
  programs: unknown[];
  my_cards: unknown[] | null;
};

export type AvailableGiftsResponse = {
  ok: boolean;
  gifts: Array<{
    id: string;
    description: string;
    gift_type: string;
    value: number;
    conditions: string | null;
    remaining: number;
    validity_end: string;
    establishment_name: string;
    establishment_logo: string | null;
  }>;
};

export type ClaimGiftResponse = {
  ok: boolean;
  distribution_id?: string;
  message: string;
};

// =============================================================================
// API Functions — Consumer
// =============================================================================

/** Mes cartes de fidélité (actives, complétées, gelées) */
export async function getMyLoyalty(): Promise<MyLoyaltyResponse> {
  return authedJson("/api/me/loyalty");
}

/** Détail d'une carte */
export async function getMyLoyaltyCard(cardId: string): Promise<MyLoyaltyCardResponse> {
  return authedJson(`/api/me/loyalty/${encodeURIComponent(cardId)}`);
}

/** Mes cadeaux fidélité */
export async function getMyLoyaltyRewards(): Promise<MyRewardsResponse> {
  return authedJson("/api/me/loyalty/rewards");
}

/** Mes cadeaux sam.ma */
export async function getMyGifts(): Promise<MyGiftsResponse> {
  return authedJson("/api/me/gifts");
}

/** Info programme fidélité d'un établissement (public) */
export async function getEstablishmentLoyalty(
  establishmentId: string
): Promise<EstablishmentLoyaltyResponse> {
  // Essayer avec auth, sinon public
  try {
    return await authedJson(
      `/api/establishments/${encodeURIComponent(establishmentId)}/loyalty`
    );
  } catch {
    return publicJson(
      `/api/establishments/${encodeURIComponent(establishmentId)}/loyalty`
    );
  }
}

/** Cadeaux sam.ma disponibles (public) */
export async function getAvailableGifts(): Promise<AvailableGiftsResponse> {
  return publicJson("/api/gifts/available");
}

/** Récupérer un cadeau sam.ma (premier arrivé) */
export async function claimGift(giftId: string): Promise<ClaimGiftResponse> {
  return authedJson(`/api/gifts/${encodeURIComponent(giftId)}/claim`, {
    method: "POST",
  });
}
