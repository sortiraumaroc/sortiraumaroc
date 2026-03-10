/**
 * Ambassador Program — Consumer-facing API helpers
 *
 * Uses consumer auth token (same pattern as menuVotesApi.ts / loyaltyV2Api.ts).
 */

import { getConsumerAccessToken } from "@/lib/auth";

// =============================================================================
// Error & Fetch
// =============================================================================

export class AmbassadorApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "AmbassadorApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new AmbassadorApiError("Non authentifié", 401);

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
    throw new AmbassadorApiError(msg, res.status, payload);
  }
  return payload as T;
}

// =============================================================================
// Types
// =============================================================================

export type PublicAmbassadorProgram = {
  id: string;
  establishment_id: string;
  reward_description: string;
  conversions_required: number;
  validity_days: number;
  confirmation_mode: "manual" | "qr";
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

export type MyApplicationStatus = {
  status: "pending" | "accepted" | "rejected";
  applied_at: string;
} | null;

export type MyAmbassadorProgram = {
  program: PublicAmbassadorProgram;
  application_status: "pending" | "accepted" | "rejected";
  applied_at: string;
  conversions_confirmed: number;
  conversions_required: number;
  establishment_name: string;
  establishment_id: string;
  reward_description: string;
};

export type MyAmbassadorConversion = {
  id: string;
  post_id: string | null;
  visitor_id: string;
  reservation_id: string;
  program_id: string;
  establishment_id: string;
  establishment_name: string;
  status: "pending" | "confirmed" | "rejected" | "expired";
  created_at: string;
  confirmed_at: string | null;
};

export type MyAmbassadorReward = {
  id: string;
  program_id: string;
  establishment_id: string;
  establishment_name: string;
  reward_description: string;
  unlocked_at: string;
  expires_at: string;
  claim_code: string;
  qr_reward_token: string;
  status: "active" | "claimed" | "expired";
  claimed_at: string | null;
};

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get an establishment's active ambassador program (public info + my application status)
 */
export async function getEstablishmentAmbassadorProgram(
  establishmentId: string,
): Promise<{
  ok: boolean;
  program: PublicAmbassadorProgram | null;
  my_application: MyApplicationStatus;
}> {
  return authedJson(
    `/api/consumer/ambassador/programs/${encodeURIComponent(establishmentId)}`,
  );
}

/**
 * Apply to a program
 */
export async function applyToAmbassadorProgram(
  programId: string,
  data?: { motivation?: string },
): Promise<{ ok: boolean; application: { id: string; status: string } }> {
  return authedJson(
    `/api/consumer/ambassador/programs/${encodeURIComponent(programId)}/apply`,
    {
      method: "POST",
      body: data ? JSON.stringify(data) : JSON.stringify({}),
    },
  );
}

/**
 * Get all my ambassador programs with progress
 */
export async function getMyAmbassadorPrograms(): Promise<{
  ok: boolean;
  programs: MyAmbassadorProgram[];
}> {
  return authedJson("/api/consumer/ambassador/my-programs");
}

/**
 * Get all my conversions
 */
export async function getMyAmbassadorConversions(): Promise<{
  ok: boolean;
  conversions: MyAmbassadorConversion[];
}> {
  return authedJson("/api/consumer/ambassador/my-conversions");
}

/**
 * Get all my rewards
 */
export async function getMyAmbassadorRewards(): Promise<{
  ok: boolean;
  rewards: MyAmbassadorReward[];
}> {
  return authedJson("/api/consumer/ambassador/my-rewards");
}

/**
 * Track a click on an ambassador post (attribution tracking)
 */
export async function trackAmbassadorPostClick(data: {
  post_id: string;
  establishment_id: string;
}): Promise<{ ok: boolean; token_id?: string }> {
  return authedJson("/api/consumer/ambassador/track-click", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
