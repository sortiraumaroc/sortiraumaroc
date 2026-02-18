/**
 * Reservation V2 — Admin-side API helpers
 *
 * Uses admin key + session token from sessionStorage.
 * Endpoints map 1:1 to server/routes/reservationV2Admin.ts.
 */

import type {
  NoShowDisputeRow,
  EstablishmentSanctionRow,
  ProTrustScoreRow,
} from "../../shared/reservationTypesV2";

// =============================================================================
// Admin auth
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

// =============================================================================
// Generic fetch
// =============================================================================

export class AdminV2ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "AdminV2ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...getAdminHeaders(),
        ...(init?.headers ?? {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new AdminV2ApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) payload = await res.json().catch(() => null);
  else payload = await res.text().catch(() => null);

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new AdminV2ApiError(msg, res.status, payload);
  }
  return payload as T;
}

// =============================================================================
// Reservations overview
// =============================================================================

export interface AdminReservationRow {
  id: string;
  user_id: string;
  establishment_id: string;
  starts_at: string;
  party_size: number;
  status: string;
  type: string;
  payment_type: string;
  stock_type: string | null;
  booking_reference: string | null;
  created_at: string;
  establishments?: { name: string | null; city: string | null } | null;
  consumer_users?: { full_name: string | null; email: string | null } | null;
}

export async function adminListReservationsV2(
  opts?: { status?: string; establishment_id?: string; from?: string; to?: string; limit?: number; offset?: number },
): Promise<{ ok: true; reservations: AdminReservationRow[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.establishment_id) params.set("establishment_id", opts.establishment_id);
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return adminJson(`/api/admin/reservations/v2${qs ? `?${qs}` : ""}`);
}

// =============================================================================
// Disputes
// =============================================================================

export async function adminListDisputes(
  opts?: { status?: string; limit?: number },
): Promise<{ ok: true; disputes: NoShowDisputeRow[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  return adminJson(`/api/admin/reservations/v2/disputes?${params}`);
}

export async function adminArbitrateDispute(
  disputeId: string,
  decision: "favor_client" | "favor_pro" | "indeterminate",
  notes?: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/reservations/v2/disputes/${encodeURIComponent(disputeId)}/arbitrate`, {
    method: "POST",
    body: JSON.stringify({ decision, notes }),
  });
}

// =============================================================================
// Sanctions
// =============================================================================

export async function adminListSanctions(
  opts?: { establishment_id?: string; active_only?: boolean },
): Promise<{ ok: true; sanctions: EstablishmentSanctionRow[] }> {
  const params = new URLSearchParams();
  if (opts?.establishment_id) params.set("establishment_id", opts.establishment_id);
  if (opts?.active_only) params.set("active_only", "true");
  return adminJson(`/api/admin/reservations/v2/sanctions?${params}`);
}

export async function adminDeactivateEstablishment(
  establishmentId: string,
  reason: string,
  durationDays: number,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/reservations/v2/establishments/${encodeURIComponent(establishmentId)}/deactivate`, {
    method: "POST",
    body: JSON.stringify({ reason, duration_days: durationDays }),
  });
}

export async function adminReactivateEstablishment(
  establishmentId: string,
  reason: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/reservations/v2/establishments/${encodeURIComponent(establishmentId)}/reactivate`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// =============================================================================
// Client management
// =============================================================================

export async function adminListSuspendedClients(): Promise<{
  ok: true;
  clients: Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
    score_v2: number | null;
    is_suspended: boolean;
    suspended_until: string | null;
    no_shows_count: number;
    consecutive_no_shows: number;
  }>;
}> {
  return adminJson(`/api/admin/reservations/v2/clients/suspended`);
}

export async function adminLiftClientSuspension(
  userId: string,
  reason: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/reservations/v2/clients/${encodeURIComponent(userId)}/lift-suspension`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// =============================================================================
// Pro trust scores
// =============================================================================

export async function adminListProTrustScores(
  opts?: { limit?: number; sort?: string },
): Promise<{ ok: true; scores: ProTrustScoreRow[] }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.sort) params.set("sort", opts.sort);
  return adminJson(`/api/admin/reservations/v2/pro-trust-scores?${params}`);
}

// =============================================================================
// Global stats
// =============================================================================

export interface AdminReservationGlobalStats {
  totalReservations: number;
  totalByStatus: Record<string, number>;
  freeCount: number;
  paidCount: number;
  bufferCount: number;
  noShowRate: number;
  avgOccupancyRate: number;
  pendingDisputes: number;
  activeSanctions: number;
  suspendedClients: number;
}

export async function adminGetReservationGlobalStats(
  period?: string,
): Promise<{ ok: true; stats: AdminReservationGlobalStats }> {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  return adminJson(`/api/admin/reservations/v2/stats?${params}`);
}
