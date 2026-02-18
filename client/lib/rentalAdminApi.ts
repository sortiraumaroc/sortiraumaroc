/**
 * Rental — Admin-side API helpers
 *
 * Uses admin key + session token from sessionStorage.
 * Endpoints map 1:1 to server/routes/rentalAdmin.ts.
 */

import type { RentalInsurancePlan, RentalVehicle } from "../../shared/rentalTypes";

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

export class RentalAdminApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "RentalAdminApiError";
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
    throw new RentalAdminApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new RentalAdminApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Insurance Plans CRUD
// =============================================================================

/** GET /api/admin/rental/insurance-plans */
export async function listAdminInsurancePlans(): Promise<{ plans: RentalInsurancePlan[] }> {
  return adminJson<{ plans: RentalInsurancePlan[] }>("/api/admin/rental/insurance-plans");
}

/** POST /api/admin/rental/insurance-plans */
export async function createInsurancePlan(
  plan: Partial<RentalInsurancePlan> & { name: string },
): Promise<{ plan: RentalInsurancePlan }> {
  return adminJson<{ plan: RentalInsurancePlan }>("/api/admin/rental/insurance-plans", {
    method: "POST",
    body: JSON.stringify(plan),
  });
}

/** PUT /api/admin/rental/insurance-plans/:id */
export async function updateInsurancePlan(
  planId: string,
  updates: Partial<RentalInsurancePlan>,
): Promise<{ plan: RentalInsurancePlan }> {
  return adminJson<{ plan: RentalInsurancePlan }>(`/api/admin/rental/insurance-plans/${planId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

/** DELETE /api/admin/rental/insurance-plans/:id */
export async function deleteInsurancePlan(planId: string): Promise<{ success: boolean }> {
  return adminJson<{ success: boolean }>(`/api/admin/rental/insurance-plans/${planId}`, {
    method: "DELETE",
  });
}

// =============================================================================
// Commission
// =============================================================================

/** PUT /api/admin/rental/establishments/:id/commission */
export async function setEstablishmentCommission(
  establishmentId: string,
  commissionPercent: number,
): Promise<{ success: boolean; commission_percent: number }> {
  return adminJson<{ success: boolean; commission_percent: number }>(
    `/api/admin/rental/establishments/${establishmentId}/commission`,
    {
      method: "PUT",
      body: JSON.stringify({ commission_percent: commissionPercent }),
    },
  );
}

// =============================================================================
// Moderation
// =============================================================================

export type PendingVehicle = RentalVehicle & {
  establishments?: { id: string; name: string; city: string };
};

/** GET /api/admin/rental/vehicles/pending */
export async function listPendingVehicles(
  page?: number,
  perPage?: number,
): Promise<{ vehicles: PendingVehicle[]; total: number; page: number; per_page: number }> {
  const qs = new URLSearchParams();
  if (page) qs.set("page", String(page));
  if (perPage) qs.set("per_page", String(perPage));
  const query = qs.toString();
  return adminJson<{
    vehicles: PendingVehicle[];
    total: number;
    page: number;
    per_page: number;
  }>(`/api/admin/rental/vehicles/pending${query ? `?${query}` : ""}`);
}

/** PUT /api/admin/rental/vehicles/:id/moderate */
export async function moderateVehicle(
  vehicleId: string,
  action: "approve" | "reject",
): Promise<{ vehicle: RentalVehicle; action: string }> {
  return adminJson<{ vehicle: RentalVehicle; action: string }>(
    `/api/admin/rental/vehicles/${vehicleId}/moderate`,
    {
      method: "PUT",
      body: JSON.stringify({ action }),
    },
  );
}

// =============================================================================
// Stats
// =============================================================================

export type RentalAdminStats = {
  total_vehicles: number;
  active_vehicles: number;
  rental_establishments: number;
  total_reservations: number;
  confirmed_reservations: number;
  pending_kyc_reservations: number;
  completed_reservations: number;
  total_revenue: number;
  total_commission: number;
};

/** GET /api/admin/rental/stats */
export async function getAdminRentalStats(): Promise<{ stats: RentalAdminStats }> {
  return adminJson<{ stats: RentalAdminStats }>("/api/admin/rental/stats");
}
