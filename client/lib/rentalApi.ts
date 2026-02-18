/**
 * Rental — Client-side API helpers (public + consumer)
 *
 * Public endpoints (no auth): search, vehicle detail, cities, insurance plans, price quote
 * Consumer endpoints (auth required): reservations CRUD, KYC upload, cancel
 *
 * Uses same authedJson / publicJson pattern as packsV2Api.ts.
 */

import { getConsumerAccessToken } from "@/lib/auth";
import type {
  RentalVehicle,
  RentalInsurancePlan,
  RentalReservation,
  RentalKycDocument,
  RentalPriceQuote,
  RentalSearchParams,
  RentalKycDocumentType,
  RentalKycSide,
} from "../../shared/rentalTypes";

// =============================================================================
// Error class
// =============================================================================

export class RentalApiError extends Error {
  status: number;
  errorCode?: string;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown, errorCode?: string) {
    super(msg);
    this.name = "RentalApiError";
    this.status = status;
    this.payload = payload;
    this.errorCode = errorCode;
  }
}

// =============================================================================
// Authed fetch helper
// =============================================================================

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new RentalApiError("Not authenticated", 401);

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
  } catch (e) {
    throw new RentalApiError("Impossible de contacter le serveur.", 0, e);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    const code = typeof rec?.errorCode === "string" ? rec.errorCode : undefined;
    throw new RentalApiError(msg, res.status, payload, code);
  }

  return payload as T;
}

/** Public fetch (no auth required) */
async function publicJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch (e) {
    throw new RentalApiError("Impossible de contacter le serveur.", 0, e);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new RentalApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Response types
// =============================================================================

export type RentalSearchResponse = {
  vehicles: RentalVehicle[];
  total: number;
  page: number;
  per_page: number;
};

export type RentalVehicleDetailResponse = {
  vehicle: RentalVehicle & {
    establishment?: {
      id: string;
      name: string;
      city: string;
      logo?: string;
      avg_rating?: number;
    };
    options?: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      price_type: string;
      is_mandatory: boolean;
    }>;
  };
};

// =============================================================================
// Public endpoints (no auth)
// =============================================================================

/** GET /api/rental/search — Search rental vehicles */
export async function searchRentalVehicles(
  params: RentalSearchParams,
): Promise<RentalSearchResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const query = qs.toString();
  return publicJson<RentalSearchResponse>(`/api/rental/search${query ? `?${query}` : ""}`);
}

/** GET /api/rental/vehicles/:id — Vehicle detail */
export async function getRentalVehicle(vehicleId: string): Promise<RentalVehicleDetailResponse> {
  return publicJson<RentalVehicleDetailResponse>(`/api/rental/vehicles/${vehicleId}`);
}

/** GET /api/rental/cities — List cities with active rental establishments */
export async function getRentalCities(): Promise<{ cities: string[] }> {
  return publicJson<{ cities: string[] }>("/api/rental/cities");
}

/** GET /api/rental/insurance-plans — List active insurance plans */
export async function getInsurancePlans(): Promise<{ plans: RentalInsurancePlan[] }> {
  return publicJson<{ plans: RentalInsurancePlan[] }>("/api/rental/insurance-plans");
}

/** POST /api/rental/price-quote — Calculate price quote */
export async function getRentalPriceQuote(input: {
  vehicle_id: string;
  pickup_date: string;
  dropoff_date: string;
  selected_options?: string[];
  insurance_plan_id?: string;
}): Promise<RentalPriceQuote> {
  let res: Response;
  try {
    res = await fetch("/api/rental/price-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (e) {
    throw new RentalApiError("Impossible de contacter le serveur.", 0, e);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new RentalApiError(msg, res.status, payload);
  }

  return payload as RentalPriceQuote;
}

// =============================================================================
// Consumer endpoints (auth required)
// =============================================================================

export type CreateRentalReservationInput = {
  vehicle_id: string;
  pickup_city: string;
  pickup_date: string;
  pickup_time: string;
  dropoff_city: string;
  dropoff_date: string;
  dropoff_time: string;
  selected_options?: Array<{ option_id: string; quantity?: number }>;
  insurance_plan_id?: string;
  promo_code?: string;
};

/** POST /api/rental/reservations — Create reservation */
export async function createRentalReservation(
  input: CreateRentalReservationInput,
): Promise<{ reservation: RentalReservation }> {
  return authedJson<{ reservation: RentalReservation }>("/api/rental/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /api/rental/reservations — List my reservations */
export async function getMyRentalReservations(
  status?: string,
): Promise<{ reservations: RentalReservation[] }> {
  const qs = status ? `?status=${status}` : "";
  return authedJson<{ reservations: RentalReservation[] }>(`/api/rental/reservations${qs}`);
}

/** GET /api/rental/reservations/:id — Get reservation detail */
export async function getRentalReservation(
  reservationId: string,
): Promise<{ reservation: RentalReservation; kyc_documents?: RentalKycDocument[] }> {
  return authedJson<{ reservation: RentalReservation; kyc_documents?: RentalKycDocument[] }>(
    `/api/rental/reservations/${reservationId}`,
  );
}

/** POST /api/rental/reservations/:id/kyc — Upload KYC document */
export async function uploadKycDocument(
  reservationId: string,
  file: File,
  documentType: RentalKycDocumentType,
  side: RentalKycSide,
): Promise<{ document: RentalKycDocument }> {
  const token = await getConsumerAccessToken();
  if (!token) throw new RentalApiError("Not authenticated", 401);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("document_type", documentType);
  formData.append("side", side);

  let res: Response;
  try {
    res = await fetch(`/api/rental/reservations/${reservationId}/kyc`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch (e) {
    throw new RentalApiError("Impossible de contacter le serveur.", 0, e);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new RentalApiError(msg, res.status, payload);
  }

  return payload as { document: RentalKycDocument };
}

/** PUT /api/rental/reservations/:id/cancel — Cancel reservation */
export async function cancelRentalReservation(
  reservationId: string,
  reason?: string,
): Promise<{ reservation: RentalReservation }> {
  return authedJson<{ reservation: RentalReservation }>(
    `/api/rental/reservations/${reservationId}/cancel`,
    {
      method: "PUT",
      body: JSON.stringify({ reason }),
    },
  );
}

/** GET /api/rental/kyc/reuse — Check if recent KYC can be reused */
export async function checkReusableKyc(): Promise<{
  reusable: boolean;
  documents?: RentalKycDocument[];
}> {
  return authedJson<{ reusable: boolean; documents?: RentalKycDocument[] }>(
    "/api/rental/kyc/reuse",
  );
}
