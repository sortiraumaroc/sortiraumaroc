/**
 * Loyalty V2 — Pro-facing API helpers
 *
 * Uses proSupabase for auth tokens (same pattern as packsV2ProApi.ts).
 */

import { proSupabase } from "@/lib/pro/supabase";

// =============================================================================
// Error & Fetch
// =============================================================================

export class LoyaltyProApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.name = "LoyaltyProApiError";
    this.status = status;
  }
}

async function proAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await proSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new LoyaltyProApiError("Non authentifié", 401);

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
    throw new LoyaltyProApiError(msg, res.status);
  }
  return payload as T;
}

// =============================================================================
// Types
// =============================================================================

export type ProLoyaltyProgramResponse = {
  ok: boolean;
  programs: unknown[];
  stats: {
    total_cards: number;
    active_cards: number;
    completed_cards: number;
    completion_rate: number;
    avg_conditional_amount: number | null;
  };
};

export type ProLoyaltyStatsResponse = {
  ok: boolean;
  stats: {
    total_cards: number;
    active_cards: number;
    completed_cards: number;
    reward_used_cards: number;
    completion_rate: number;
    renewal_rate: number;
    rewards_this_month: number;
    avg_conditional_amount: number | null;
    total_conditional_stamps: number;
  };
};

export type ProLoyaltyClientsResponse = {
  ok: boolean;
  clients: Array<{
    user_id: string;
    full_name: string;
    cards: Array<{
      program_id: string;
      program_name: string;
      stamps_count: number;
      stamps_required: number;
      status: string;
      cycle_number: number;
    }>;
    total_stamps: number;
    total_cycles: number;
    last_visit: string | null;
  }>;
  page: number;
  per_page: number;
};

export type ScanLoyaltyResponse = {
  ok: boolean;
  loyalty: {
    cards: Array<{
      card_id: string;
      program_name: string;
      stamps_collected: number;
      stamps_required: number;
      status: string;
      is_conditional: boolean;
      minimum_amount: number | null;
    }>;
    loyalty_rewards: Array<{
      reward_id: string;
      card_id: string;
      description: string;
      reward_type: string;
      reward_value: string | null;
      expires_at: string;
    }>;
    platform_gifts: Array<{
      distribution_id: string;
      gift_description: string;
      gift_type: string;
      gift_value: number;
      establishment_name: string;
      expires_at: string;
    }>;
    auto_stamp_result: {
      success: boolean;
      stamp_number: number;
      stamps_remaining: number;
      message: string;
      reward_unlocked: boolean;
    } | null;
  };
};

export type ConditionalStampResponse = {
  ok: boolean;
  approved: boolean;
  card_id: string;
  stamp_number?: number;
  stamps_remaining?: number;
  amount_spent: number;
  minimum_required: number;
  message: string;
  reward_unlocked?: boolean;
};

export type CreateProgramInput = {
  name: string;
  description?: string;
  stamps_required?: number;
  reward_type: string;
  reward_value?: string;
  reward_description: string;
  reward_validity_days?: number;
  conditions?: string;
  card_design?: Record<string, unknown>;
  bonus_rules?: Record<string, unknown>;
  stamp_frequency?: string;
  stamp_requires_reservation?: boolean;
  stamp_conditional?: boolean;
  stamp_minimum_amount?: number;
  stamp_minimum_currency?: string;
  card_validity_days?: number;
  is_renewable?: boolean;
  [key: string]: unknown;
};

export type OfferGiftInput = {
  gift_type: string;
  description: string;
  value: number;
  total_quantity: number;
  conditions?: string;
  validity_start: string;
  validity_end: string;
};

// =============================================================================
// Helper for establishment_id query param
// =============================================================================

function withEst(path: string, estId: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}establishment_id=${encodeURIComponent(estId)}`;
}

// =============================================================================
// API Functions — Pro
// =============================================================================

// --- Programme fidélité ---

export async function getProLoyaltyProgram(estId: string): Promise<ProLoyaltyProgramResponse> {
  return proAuthedJson(withEst("/api/pro/loyalty", estId));
}

export async function createProLoyaltyProgram(
  estId: string,
  input: CreateProgramInput
): Promise<{ ok: boolean; program: unknown }> {
  return proAuthedJson(withEst("/api/pro/loyalty", estId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProLoyaltyProgram(
  estId: string,
  programId: string,
  updates: Partial<CreateProgramInput>
): Promise<{ ok: boolean; program: unknown }> {
  return proAuthedJson(withEst(`/api/pro/loyalty/${encodeURIComponent(programId)}`, estId), {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function activateProLoyaltyProgram(
  estId: string,
  programId: string
): Promise<{ ok: boolean; unfrozen_cards: number; message: string }> {
  return proAuthedJson(
    withEst(`/api/pro/loyalty/${encodeURIComponent(programId)}/activate`, estId),
    { method: "POST" }
  );
}

export async function deactivateProLoyaltyProgram(
  estId: string,
  programId: string
): Promise<{ ok: boolean; frozen_cards: number; message: string }> {
  return proAuthedJson(
    withEst(`/api/pro/loyalty/${encodeURIComponent(programId)}/deactivate`, estId),
    { method: "POST" }
  );
}

// --- Stats ---

export async function getProLoyaltyStats(estId: string): Promise<ProLoyaltyStatsResponse> {
  return proAuthedJson(withEst("/api/pro/loyalty/stats", estId));
}

// --- Clients fidèles ---

export async function getProLoyaltyClients(
  estId: string,
  opts?: { page?: number; per_page?: number; search?: string }
): Promise<ProLoyaltyClientsResponse> {
  let path = withEst("/api/pro/loyalty/clients", estId);
  if (opts?.page) path += `&page=${opts.page}`;
  if (opts?.per_page) path += `&per_page=${opts.per_page}`;
  if (opts?.search) path += `&search=${encodeURIComponent(opts.search)}`;
  return proAuthedJson(path);
}

export async function getProLoyaltyClientDetail(
  estId: string,
  userId: string
): Promise<{ ok: boolean; client: { user_id: string; full_name: string }; cards: unknown[]; rewards: unknown[] }> {
  return proAuthedJson(withEst(`/api/pro/loyalty/clients/${encodeURIComponent(userId)}`, estId));
}

// --- Scan QR fidélité ---

export async function scanLoyalty(
  estId: string,
  userId: string
): Promise<ScanLoyaltyResponse> {
  return proAuthedJson(withEst("/api/pro/scan/loyalty", estId), {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function confirmConditionalStamp(
  estId: string,
  cardId: string,
  input: { user_id: string; program_id: string; amount_spent: number }
): Promise<ConditionalStampResponse> {
  return proAuthedJson(
    withEst(`/api/pro/loyalty/stamp/${encodeURIComponent(cardId)}`, estId),
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function claimLoyaltyReward(
  estId: string,
  cardId: string
): Promise<{ ok: boolean; message: string; new_card_id?: string }> {
  return proAuthedJson(
    withEst(`/api/pro/loyalty/claim-reward/${encodeURIComponent(cardId)}`, estId),
    { method: "POST" }
  );
}

// --- Cadeaux sam.ma ---

export async function consumePlatformGift(
  distributionId: string
): Promise<{ ok: boolean; message: string }> {
  return proAuthedJson(`/api/pro/gifts/${encodeURIComponent(distributionId)}/consume`, {
    method: "POST",
  });
}

export async function offerPlatformGift(
  estId: string,
  input: OfferGiftInput
): Promise<{ ok: boolean; gift_id?: string; message: string }> {
  return proAuthedJson(withEst("/api/pro/gifts/offer", estId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getMyOfferedGifts(
  estId: string
): Promise<{ ok: boolean; gifts: unknown[] }> {
  return proAuthedJson(withEst("/api/pro/gifts/offered", estId));
}
