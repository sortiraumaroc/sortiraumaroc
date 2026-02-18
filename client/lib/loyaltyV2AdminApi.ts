/**
 * Loyalty V2 — Admin-facing API helpers
 *
 * Uses session storage for admin auth (same pattern as packsV2AdminApi.ts).
 */

// =============================================================================
// Error & Fetch
// =============================================================================

export class LoyaltyAdminApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.name = "LoyaltyAdminApiError";
    this.status = status;
  }
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
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...getAdminHeaders(),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new LoyaltyAdminApiError(msg, res.status);
  }
  return payload as T;
}

// =============================================================================
// Types
// =============================================================================

export type AdminLoyaltyStatsResponse = {
  ok: boolean;
  stats: {
    programs_active: number;
    programs_total: number;
    cards_active: number;
    cards_completed: number;
    rewards_active: number;
    rewards_used: number;
    alerts_pending: number;
    gifts_total: number;
    gifts_distributed: number;
    gifts_consumed: number;
  };
};

export type AdminAlertItem = {
  id: string;
  alert_type: string;
  establishment_id: string;
  user_id: string | null;
  details: string;
  metadata: Record<string, unknown>;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  establishment?: { id: string; name: string };
};

export type AdminGiftStatsResponse = {
  ok: boolean;
  stats: {
    total_quantity: number;
    distributed_count: number;
    consumed_count: number;
    remaining: number;
    expired_count: number;
  };
};

// =============================================================================
// API Functions — Admin
// =============================================================================

// --- Programmes ---

export async function listAdminPrograms(
  opts?: { status?: string; establishment_id?: string; limit?: number; offset?: number }
): Promise<{ ok: boolean; programs: unknown[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.establishment_id) params.set("establishment_id", opts.establishment_id);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return adminJson(`/api/admin/loyalty/programs${qs ? `?${qs}` : ""}`);
}

export async function getAdminProgramDetail(
  programId: string
): Promise<{ ok: boolean; program: unknown; stats: unknown }> {
  return adminJson(`/api/admin/loyalty/programs/${encodeURIComponent(programId)}`);
}

export async function suspendProgram(
  programId: string,
  reason: string
): Promise<{ ok: boolean; frozen_cards: number; message: string }> {
  return adminJson(`/api/admin/loyalty/programs/${encodeURIComponent(programId)}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function unsuspendProgram(
  programId: string
): Promise<{ ok: boolean; unfrozen_cards: number; message: string }> {
  return adminJson(`/api/admin/loyalty/programs/${encodeURIComponent(programId)}/unsuspend`, {
    method: "POST",
  });
}

export async function getAdminLoyaltyStats(): Promise<AdminLoyaltyStatsResponse> {
  return adminJson("/api/admin/loyalty/stats");
}

// --- Alertes ---

export async function listAdminAlerts(
  opts?: { status?: string; alert_type?: string; establishment_id?: string }
): Promise<{ ok: boolean; alerts: AdminAlertItem[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.alert_type) params.set("alert_type", opts.alert_type);
  if (opts?.establishment_id) params.set("establishment_id", opts.establishment_id);
  const qs = params.toString();
  return adminJson(`/api/admin/loyalty/alerts${qs ? `?${qs}` : ""}`);
}

export async function reviewAdminAlert(
  alertId: string,
  notes?: string
): Promise<{ ok: boolean }> {
  return adminJson(`/api/admin/loyalty/alerts/${encodeURIComponent(alertId)}/review`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export async function dismissAdminAlert(
  alertId: string,
  notes?: string
): Promise<{ ok: boolean }> {
  return adminJson(`/api/admin/loyalty/alerts/${encodeURIComponent(alertId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

// --- Cadeaux sam.ma ---

export async function listAdminGifts(
  opts?: { status?: string; establishment_id?: string }
): Promise<{ ok: boolean; gifts: unknown[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.establishment_id) params.set("establishment_id", opts.establishment_id);
  const qs = params.toString();
  return adminJson(`/api/admin/gifts${qs ? `?${qs}` : ""}`);
}

export async function approveAdminGift(giftId: string): Promise<{ ok: boolean; message: string }> {
  return adminJson(`/api/admin/gifts/${encodeURIComponent(giftId)}/approve`, {
    method: "POST",
  });
}

export async function rejectAdminGift(
  giftId: string,
  reason: string
): Promise<{ ok: boolean; message: string }> {
  return adminJson(`/api/admin/gifts/${encodeURIComponent(giftId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function distributeGiftManual(
  giftId: string,
  userIds: string[]
): Promise<{ ok: boolean; distributed: number; message: string }> {
  return adminJson(`/api/admin/gifts/${encodeURIComponent(giftId)}/distribute/manual`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function distributeGiftByCriteria(
  giftId: string,
  criteria: { city?: string; min_reservations?: number; inactive_days?: number; max_recipients?: number }
): Promise<{ ok: boolean; distributed: number; message: string }> {
  return adminJson(`/api/admin/gifts/${encodeURIComponent(giftId)}/distribute/criteria`, {
    method: "POST",
    body: JSON.stringify(criteria),
  });
}

export async function distributeGiftPublic(
  giftId: string
): Promise<{ ok: boolean; message: string }> {
  return adminJson(`/api/admin/gifts/${encodeURIComponent(giftId)}/distribute/public`, {
    method: "POST",
  });
}

export async function getAdminGiftStats(giftId: string): Promise<AdminGiftStatsResponse> {
  return adminJson(`/api/admin/gifts/${encodeURIComponent(giftId)}/stats`);
}
