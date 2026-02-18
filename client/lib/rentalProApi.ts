/**
 * Rental — Pro-side API helpers
 *
 * Uses proSupabase auth for Bearer token.
 * Endpoints map 1:1 to server/routes/rentalPro.ts.
 */

import { proSupabase } from "@/lib/pro/supabase";
import type {
  RentalVehicle,
  RentalVehicleDateBlock,
  RentalOption,
  RentalReservation,
  RentalVehicleCategory,
  RentalVehicleStatus,
  RentalKycDocument,
} from "../../shared/rentalTypes";

// =============================================================================
// Auth helper
// =============================================================================

async function getProToken(): Promise<string> {
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

// =============================================================================
// Generic fetch
// =============================================================================

export class RentalProApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "RentalProApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function proAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getProToken();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new RentalProApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new RentalProApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Vehicle Management
// =============================================================================

/** GET /api/pro/rental/vehicles */
export async function listProVehicles(filters?: {
  status?: RentalVehicleStatus;
  category?: RentalVehicleCategory;
}): Promise<{ vehicles: RentalVehicle[] }> {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set("status", filters.status);
  if (filters?.category) qs.set("category", filters.category);
  const query = qs.toString();
  return proAuthedJson<{ vehicles: RentalVehicle[] }>(
    `/api/pro/rental/vehicles${query ? `?${query}` : ""}`,
  );
}

/** POST /api/pro/rental/vehicles */
export async function createProVehicle(
  vehicle: Partial<RentalVehicle> & {
    establishment_id: string;
    category: string;
    brand: string;
    model: string;
  },
): Promise<RentalVehicle> {
  return proAuthedJson<RentalVehicle>("/api/pro/rental/vehicles", {
    method: "POST",
    body: JSON.stringify(vehicle),
  });
}

/** PUT /api/pro/rental/vehicles/:id */
export async function updateProVehicle(
  vehicleId: string,
  updates: Partial<RentalVehicle>,
): Promise<RentalVehicle> {
  return proAuthedJson<RentalVehicle>(`/api/pro/rental/vehicles/${vehicleId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

/** DELETE /api/pro/rental/vehicles/:id */
export async function deleteProVehicle(vehicleId: string): Promise<{ success: boolean }> {
  return proAuthedJson<{ success: boolean }>(`/api/pro/rental/vehicles/${vehicleId}`, {
    method: "DELETE",
  });
}

// =============================================================================
// Date Blocks
// =============================================================================

/** GET /api/pro/rental/vehicles/:id/blocks */
export async function listVehicleDateBlocks(
  vehicleId: string,
): Promise<{ blocks: RentalVehicleDateBlock[] }> {
  return proAuthedJson<{ blocks: RentalVehicleDateBlock[] }>(
    `/api/pro/rental/vehicles/${vehicleId}/blocks`,
  );
}

/** POST /api/pro/rental/vehicles/:id/blocks */
export async function createVehicleDateBlock(
  vehicleId: string,
  block: { start_date: string; end_date: string; reason?: string },
): Promise<RentalVehicleDateBlock> {
  return proAuthedJson<RentalVehicleDateBlock>(`/api/pro/rental/vehicles/${vehicleId}/blocks`, {
    method: "POST",
    body: JSON.stringify(block),
  });
}

/** DELETE /api/pro/rental/vehicles/:vehicleId/blocks/:blockId */
export async function deleteVehicleDateBlock(
  vehicleId: string,
  blockId: string,
): Promise<{ success: boolean }> {
  return proAuthedJson<{ success: boolean }>(
    `/api/pro/rental/vehicles/${vehicleId}/blocks/${blockId}`,
    { method: "DELETE" },
  );
}

// =============================================================================
// Options Management
// =============================================================================

/** GET /api/pro/rental/options */
export async function listProOptions(): Promise<{ options: RentalOption[] }> {
  return proAuthedJson<{ options: RentalOption[] }>("/api/pro/rental/options");
}

/** POST /api/pro/rental/options */
export async function createProOption(
  option: Partial<RentalOption> & {
    establishment_id: string;
    name: string;
    price: number;
  },
): Promise<RentalOption> {
  return proAuthedJson<RentalOption>("/api/pro/rental/options", {
    method: "POST",
    body: JSON.stringify(option),
  });
}

/** PUT /api/pro/rental/options/:id */
export async function updateProOption(
  optionId: string,
  updates: Partial<RentalOption>,
): Promise<RentalOption> {
  return proAuthedJson<RentalOption>(`/api/pro/rental/options/${optionId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

/** DELETE /api/pro/rental/options/:id */
export async function deleteProOption(optionId: string): Promise<{ success: boolean }> {
  return proAuthedJson<{ success: boolean }>(`/api/pro/rental/options/${optionId}`, {
    method: "DELETE",
  });
}

// =============================================================================
// Reservations
// =============================================================================

export type ProRentalReservation = RentalReservation & {
  rental_vehicles?: {
    brand: string;
    model: string;
    category: string;
    photos: string[];
  };
  rental_kyc_documents?: RentalKycDocument[];
};

/** GET /api/pro/rental/reservations */
export async function listProReservations(
  status?: string,
): Promise<{ reservations: ProRentalReservation[] }> {
  const qs = status ? `?status=${status}` : "";
  return proAuthedJson<{ reservations: ProRentalReservation[] }>(
    `/api/pro/rental/reservations${qs}`,
  );
}

/** PUT /api/pro/rental/reservations/:id/kyc-validate */
export async function validateReservationKyc(
  reservationId: string,
  action: "validate" | "refuse",
  refusalReason?: string,
): Promise<RentalReservation> {
  return proAuthedJson<RentalReservation>(
    `/api/pro/rental/reservations/${reservationId}/kyc-validate`,
    {
      method: "PUT",
      body: JSON.stringify({ action, refusal_reason: refusalReason }),
    },
  );
}

/** POST /api/pro/rental/reservations/:id/contract */
export async function generateReservationContract(
  reservationId: string,
): Promise<{ contract_data: Record<string, unknown> }> {
  return proAuthedJson<{ contract_data: Record<string, unknown> }>(
    `/api/pro/rental/reservations/${reservationId}/contract`,
    { method: "POST" },
  );
}

// =============================================================================
// Stats
// =============================================================================

export type RentalProStats = {
  total_vehicles: number;
  active_vehicles: number;
  total_reservations: number;
  reservations_by_status: Record<string, number>;
  total_revenue: number;
  total_commission: number;
};

/** GET /api/pro/rental/stats */
export async function getProRentalStats(): Promise<{ stats: RentalProStats }> {
  return proAuthedJson<{ stats: RentalProStats }>("/api/pro/rental/stats");
}
