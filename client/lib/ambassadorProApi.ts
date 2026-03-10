/**
 * Ambassador Program — Pro-facing API helpers
 *
 * Uses proSupabase for auth tokens (same pattern as loyaltyV2ProApi.ts).
 */

import { proSupabase } from "@/lib/pro/supabase";

// =============================================================================
// Error & Fetch
// =============================================================================

export class AmbassadorProApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "AmbassadorProApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function proAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await proSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AmbassadorProApiError("Non authentifié", 401);

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
    throw new AmbassadorProApiError(msg, res.status, payload);
  }
  return payload as T;
}

// =============================================================================
// Helper for establishment_id query param
// =============================================================================

function withEst(path: string, estId: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}establishment_id=${encodeURIComponent(estId)}`;
}

// =============================================================================
// Types
// =============================================================================

export type AmbassadorProgram = {
  id: string;
  establishment_id: string;
  reward_description: string;
  conversions_required: number;
  validity_days: number;
  max_beneficiaries_per_month: number | null;
  confirmation_mode: "manual" | "qr";
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AmbassadorQuickStats = {
  total_ambassadors: number;
  pending_applications: number;
  conversions_this_month: number;
  active_rewards: number;
};

export type AmbassadorProgramResponse = {
  ok: boolean;
  program: AmbassadorProgram | null;
  stats: AmbassadorQuickStats;
};

export type AmbassadorApplication = {
  id: string;
  program_id: string;
  user_id: string;
  full_name: string;
  status: "pending" | "accepted" | "rejected";
  motivation: string | null;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
};

export type AmbassadorConversion = {
  id: string;
  token_id: string;
  post_id: string | null;
  ambassador_id: string;
  ambassador_name: string;
  visitor_id: string;
  visitor_name: string;
  reservation_id: string;
  program_id: string;
  establishment_id: string;
  status: "pending" | "confirmed" | "rejected" | "expired";
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmation_mode: string | null;
  is_suspicious: boolean;
  suspicious_reason: string | null;
  created_at: string;
};

export type AmbassadorReward = {
  id: string;
  program_id: string;
  ambassador_id: string;
  ambassador_name: string;
  establishment_id: string;
  unlocked_at: string;
  expires_at: string;
  claim_code: string;
  qr_reward_token: string;
  claimed_at: string | null;
  claim_confirmed_by: string | null;
  status: "active" | "claimed" | "expired";
};

export type AmbassadorDetailedStats = {
  ok: boolean;
  stats: {
    total_ambassadors: number;
    total_conversions: number;
    conversion_rate: number;
    rewards_distributed: number;
    rewards_claimed: number;
    top_ambassadors: Array<{
      user_id: string;
      full_name: string;
      confirmed_conversions: number;
    }>;
  };
};

export type PaginatedResponse<T> = {
  ok: boolean;
  total: number;
  page: number;
  limit: number;
} & Record<string, T[] | unknown>;

export type CreateProgramInput = {
  reward_description: string;
  conversions_required: number;
  validity_days: number;
  max_beneficiaries_per_month?: number | null;
  confirmation_mode?: "manual" | "qr";
  expires_at?: string | null;
};

// =============================================================================
// API Functions — Program CRUD
// =============================================================================

export async function getAmbassadorProgram(
  estId: string,
): Promise<AmbassadorProgramResponse> {
  return proAuthedJson(withEst("/api/pro/ambassador", estId));
}

export async function createAmbassadorProgram(
  estId: string,
  input: CreateProgramInput,
): Promise<{ ok: boolean; program: AmbassadorProgram }> {
  return proAuthedJson(withEst("/api/pro/ambassador", estId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAmbassadorProgram(
  estId: string,
  programId: string,
  updates: Partial<CreateProgramInput & { is_active: boolean }>,
): Promise<{ ok: boolean; program: AmbassadorProgram }> {
  return proAuthedJson(
    withEst(`/api/pro/ambassador/${encodeURIComponent(programId)}`, estId),
    { method: "PUT", body: JSON.stringify(updates) },
  );
}

export async function activateAmbassadorProgram(
  estId: string,
  programId: string,
): Promise<{ ok: boolean; message: string }> {
  return proAuthedJson(
    withEst(`/api/pro/ambassador/${encodeURIComponent(programId)}/activate`, estId),
    { method: "POST" },
  );
}

export async function deactivateAmbassadorProgram(
  estId: string,
  programId: string,
): Promise<{ ok: boolean; message: string }> {
  return proAuthedJson(
    withEst(`/api/pro/ambassador/${encodeURIComponent(programId)}/deactivate`, estId),
    { method: "POST" },
  );
}

// =============================================================================
// API Functions — Applications
// =============================================================================

export async function listAmbassadorApplications(
  estId: string,
  opts?: { status?: string; page?: number; limit?: number },
): Promise<{
  ok: boolean;
  applications: AmbassadorApplication[];
  total: number;
  page: number;
  limit: number;
}> {
  let path = withEst("/api/pro/ambassador/applications", estId);
  if (opts?.status) path += `&status=${opts.status}`;
  if (opts?.page) path += `&page=${opts.page}`;
  if (opts?.limit) path += `&limit=${opts.limit}`;
  return proAuthedJson(path);
}

export async function reviewAmbassadorApplication(
  estId: string,
  applicationId: string,
  data: { status: "accepted" | "rejected"; rejection_reason?: string },
): Promise<{ ok: boolean; application: AmbassadorApplication }> {
  return proAuthedJson(
    withEst(`/api/pro/ambassador/applications/${encodeURIComponent(applicationId)}`, estId),
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

// =============================================================================
// API Functions — Conversions
// =============================================================================

export async function listAmbassadorConversions(
  estId: string,
  opts?: { status?: string; ambassador_id?: string; page?: number; limit?: number },
): Promise<{
  ok: boolean;
  conversions: AmbassadorConversion[];
  total: number;
  page: number;
  limit: number;
}> {
  let path = withEst("/api/pro/ambassador/conversions", estId);
  if (opts?.status) path += `&status=${opts.status}`;
  if (opts?.ambassador_id) path += `&ambassador_id=${encodeURIComponent(opts.ambassador_id)}`;
  if (opts?.page) path += `&page=${opts.page}`;
  if (opts?.limit) path += `&limit=${opts.limit}`;
  return proAuthedJson(path);
}

export async function confirmAmbassadorConversion(
  estId: string,
  conversionId: string,
  data: { status: "confirmed" | "rejected"; confirmation_mode?: "manual" | "qr" },
): Promise<{ ok: boolean; conversion: AmbassadorConversion; reward_unlocked: boolean }> {
  return proAuthedJson(
    withEst(`/api/pro/ambassador/conversions/${encodeURIComponent(conversionId)}`, estId),
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

// =============================================================================
// API Functions — Rewards
// =============================================================================

export async function listAmbassadorRewards(
  estId: string,
  opts?: { status?: string; page?: number; limit?: number },
): Promise<{
  ok: boolean;
  rewards: AmbassadorReward[];
  total: number;
  page: number;
  limit: number;
}> {
  let path = withEst("/api/pro/ambassador/rewards", estId);
  if (opts?.status) path += `&status=${opts.status}`;
  if (opts?.page) path += `&page=${opts.page}`;
  if (opts?.limit) path += `&limit=${opts.limit}`;
  return proAuthedJson(path);
}

export async function claimAmbassadorReward(
  estId: string,
  rewardId: string,
  data?: { qr_reward_token?: string; claim_code?: string },
): Promise<{ ok: boolean; reward: AmbassadorReward; message: string }> {
  return proAuthedJson(
    withEst(`/api/pro/ambassador/rewards/${encodeURIComponent(rewardId)}/claim`, estId),
    { method: "POST", body: data ? JSON.stringify(data) : undefined },
  );
}

// =============================================================================
// API Functions — Stats
// =============================================================================

export async function getAmbassadorStats(estId: string): Promise<AmbassadorDetailedStats> {
  return proAuthedJson(withEst("/api/pro/ambassador/stats", estId));
}
