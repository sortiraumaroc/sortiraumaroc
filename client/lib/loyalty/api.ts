// =============================================================================
// SAM LOYALTY SYSTEM - Client API
// =============================================================================

import type {
  LoyaltyProgram,
  LoyaltyProgramCreate,
  LoyaltyProgramUpdate,
  LoyaltyCardFull,
  LoyaltyStampResponse,
  LoyaltyRewardRedeemResponse,
  LoyaltyMember,
  LoyaltyReward,
  StampType,
  StampSource,
} from "./types";
import { proSupabase } from "@/lib/pro/supabase";
import { consumerSupabase } from "@/lib/supabase";

// =============================================================================
// HELPERS
// =============================================================================

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

async function getProAccessToken(): Promise<string> {
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

async function getConsumerAccessToken(): Promise<string> {
  const { data, error } = await consumerSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

// =============================================================================
// PRO API: PROGRAMS
// =============================================================================

export async function listLoyaltyPrograms(establishmentId: string): Promise<LoyaltyProgram[]> {
  const token = await getProAccessToken();

  const res = await fetch(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/programs`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return (payload as { programs: LoyaltyProgram[] }).programs;
}

export async function createLoyaltyProgram(
  establishmentId: string,
  data: LoyaltyProgramCreate
): Promise<LoyaltyProgram> {
  const token = await getProAccessToken();

  const res = await fetch(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/programs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return (payload as { program: LoyaltyProgram }).program;
}

export async function updateLoyaltyProgram(
  establishmentId: string,
  programId: string,
  data: LoyaltyProgramUpdate
): Promise<LoyaltyProgram> {
  const token = await getProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/programs/${encodeURIComponent(programId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return (payload as { program: LoyaltyProgram }).program;
}

export async function deleteLoyaltyProgram(establishmentId: string, programId: string): Promise<void> {
  const token = await getProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/programs/${encodeURIComponent(programId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }
}

// =============================================================================
// PRO API: MEMBERS
// =============================================================================

export async function getLoyaltyMembers(
  establishmentId: string,
  options?: { page?: number; perPage?: number }
): Promise<{ members: LoyaltyMember[]; total: number; page: number; per_page: number }> {
  const token = await getProAccessToken();

  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.perPage) params.set("per_page", String(options.perPage));

  const url = `/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/members?${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as { members: LoyaltyMember[]; total: number; page: number; per_page: number };
}

// =============================================================================
// PRO API: DASHBOARD STATS
// =============================================================================

export type LoyaltyDashboardStats = {
  programs: LoyaltyProgram[];
  total_active_cards: number;
  total_rewards_pending: number;
  total_rewards_used_this_month: number;
  recent_activity: Array<{
    type: "stamp" | "reward_created" | "reward_used";
    user_name: string;
    program_name: string;
    timestamp: string;
  }>;
};

export async function getLoyaltyDashboardStats(establishmentId: string): Promise<LoyaltyDashboardStats> {
  const token = await getProAccessToken();

  const res = await fetch(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return (payload as { stats: LoyaltyDashboardStats }).stats;
}

// =============================================================================
// PRO API: STAMPS
// =============================================================================

export async function addLoyaltyStamp(
  establishmentId: string,
  data: {
    user_id: string;
    program_id?: string;
    stamp_type?: StampType;
    source?: StampSource;
    offline_id?: string;
    notes?: string;
  }
): Promise<LoyaltyStampResponse> {
  const token = await getProAccessToken();

  const res = await fetch(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/stamps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as LoyaltyStampResponse;
}

// =============================================================================
// PRO API: REWARDS
// =============================================================================

export async function redeemLoyaltyReward(
  establishmentId: string,
  rewardId: string
): Promise<LoyaltyRewardRedeemResponse> {
  const token = await getProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/rewards/${encodeURIComponent(rewardId)}/redeem`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as LoyaltyRewardRedeemResponse;
}

// =============================================================================
// PRO API: USER LOYALTY INFO (for scanner)
// =============================================================================

export type UserLoyaltyInfo = {
  cards: LoyaltyCardFull[];
  active_rewards: LoyaltyReward[];
  available_programs: Array<{
    id: string;
    name: string;
    stamps_required: number;
    reward_description: string;
    card_design: unknown;
  }>;
};

export async function getUserLoyaltyInfo(establishmentId: string, userId: string): Promise<UserLoyaltyInfo> {
  const token = await getProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/users/${encodeURIComponent(userId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as UserLoyaltyInfo;
}

// =============================================================================
// PRO API: RETROACTIVE STAMPS
// =============================================================================

export async function applyRetroactiveStamps(
  establishmentId: string,
  programId: string
): Promise<{ stamps_added: number; users_processed: number; message: string }> {
  const token = await getProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/loyalty/programs/${encodeURIComponent(programId)}/retroactive`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as { stamps_added: number; users_processed: number; message: string };
}

// =============================================================================
// CONSUMER API: MY CARDS
// =============================================================================

export type MyLoyaltyCardsResponse = {
  active_cards: LoyaltyCardFull[];
  completed_cards: LoyaltyCardFull[];
  pending_rewards: LoyaltyReward[];
};

export async function getMyLoyaltyCards(): Promise<MyLoyaltyCardsResponse> {
  const token = await getConsumerAccessToken();

  const res = await fetch("/api/consumer/loyalty/cards", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as MyLoyaltyCardsResponse;
}

export async function getMyLoyaltyCardDetails(cardId: string): Promise<LoyaltyCardFull> {
  const token = await getConsumerAccessToken();

  const res = await fetch(`/api/consumer/loyalty/cards/${encodeURIComponent(cardId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return (payload as { card: LoyaltyCardFull }).card;
}

// =============================================================================
// CONSUMER API: MY REWARDS
// =============================================================================

export type MyLoyaltyRewardsResponse = {
  active: LoyaltyReward[];
  used: LoyaltyReward[];
  expired: LoyaltyReward[];
};

export async function getMyLoyaltyRewards(): Promise<MyLoyaltyRewardsResponse> {
  const token = await getConsumerAccessToken();

  const res = await fetch("/api/consumer/loyalty/rewards", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return payload as MyLoyaltyRewardsResponse;
}

// =============================================================================
// PUBLIC API: ESTABLISHMENT PROGRAMS
// =============================================================================

export type PublicLoyaltyProgram = {
  id: string;
  name: string;
  description: string | null;
  stamps_required: number;
  reward_description: string;
  card_design: unknown;
  conditions: string | null;
};

export async function getPublicLoyaltyPrograms(establishmentId: string): Promise<PublicLoyaltyProgram[]> {
  const res = await fetch(`/api/public/establishments/${encodeURIComponent(establishmentId)}/loyalty/programs`);

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
  }

  return (payload as { programs: PublicLoyaltyProgram[] }).programs;
}

// =============================================================================
// OFFLINE SYNC UTILITIES
// =============================================================================

const OFFLINE_STAMPS_KEY = "sam_loyalty_offline_stamps";

export type OfflineStamp = {
  offline_id: string;
  establishment_id: string;
  user_id: string;
  program_id?: string;
  stamp_type: StampType;
  created_at: string;
  synced: boolean;
};

export function saveOfflineStamp(stamp: Omit<OfflineStamp, "offline_id" | "synced">): OfflineStamp {
  const offlineStamp: OfflineStamp = {
    ...stamp,
    offline_id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    synced: false,
  };

  const existing = getOfflineStamps();
  existing.push(offlineStamp);
  localStorage.setItem(OFFLINE_STAMPS_KEY, JSON.stringify(existing));

  return offlineStamp;
}

export function getOfflineStamps(): OfflineStamp[] {
  try {
    const raw = localStorage.getItem(OFFLINE_STAMPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineStamp[];
  } catch {
    return [];
  }
}

export function markOfflineStampSynced(offlineId: string): void {
  const stamps = getOfflineStamps();
  const updated = stamps.map((s) => (s.offline_id === offlineId ? { ...s, synced: true } : s));
  localStorage.setItem(OFFLINE_STAMPS_KEY, JSON.stringify(updated));
}

export function clearSyncedOfflineStamps(): void {
  const stamps = getOfflineStamps();
  const unsyncedOnly = stamps.filter((s) => !s.synced);
  localStorage.setItem(OFFLINE_STAMPS_KEY, JSON.stringify(unsyncedOnly));
}

export async function syncOfflineStamps(establishmentId: string): Promise<{ synced: number; failed: number }> {
  const stamps = getOfflineStamps().filter((s) => !s.synced && s.establishment_id === establishmentId);

  let synced = 0;
  let failed = 0;

  for (const stamp of stamps) {
    try {
      await addLoyaltyStamp(establishmentId, {
        user_id: stamp.user_id,
        program_id: stamp.program_id,
        stamp_type: stamp.stamp_type,
        source: "offline_sync",
        offline_id: stamp.offline_id,
      });
      markOfflineStampSynced(stamp.offline_id);
      synced++;
    } catch {
      failed++;
    }
  }

  clearSyncedOfflineStamps();

  return { synced, failed };
}
