/**
 * Packs V2 — Client-side API helpers
 *
 * Consumer-facing endpoints for Packs & Billing system.
 * Uses same authedJson pattern as reservationV2Api.ts.
 */

import { getConsumerAccessToken } from "@/lib/auth";
import type {
  PackV2,
  PackPurchaseV2,
  Transaction,
  PackRefundType,
} from "../../shared/packsBillingTypes";

// =============================================================================
// Error class
// =============================================================================

export class PacksApiError extends Error {
  status: number;
  errorCode?: string;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown, errorCode?: string) {
    super(msg);
    this.name = "PacksApiError";
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
  if (!token) throw new PacksApiError("Not authenticated", 401);

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
    throw new PacksApiError("Impossible de contacter le serveur.", 0, e);
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
    throw new PacksApiError(msg, res.status, payload, code);
  }

  return payload as T;
}

/** Public fetch (no auth required) */
async function publicJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch (e) {
    throw new PacksApiError("Impossible de contacter le serveur.", 0, e);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new PacksApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Public endpoints (no auth)
// =============================================================================

export type PacksListResponse = {
  packs: PackV2[];
  total: number;
  page: number;
  perPage: number;
};

export type PackListFilters = {
  category?: string;
  city?: string;
  min_price?: number;
  max_price?: number;
  min_discount?: number;
  sort?: "popularity" | "discount" | "newest" | "price_asc" | "price_desc";
  page?: number;
  per_page?: number;
};

/** GET /api/packs — List active packs (public) */
export async function listActivePacks(filters?: PackListFilters): Promise<PacksListResponse> {
  const qs = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
  }
  const query = qs.toString();
  return publicJson<PacksListResponse>(`/api/packs${query ? `?${query}` : ""}`);
}

/** GET /api/packs/:id — Pack detail (public) */
export async function getPackDetail(packId: string): Promise<{ pack: PackV2 }> {
  return publicJson<{ pack: PackV2 }>(`/api/packs/${packId}`);
}

/** GET /api/establishments/:id/packs — Packs for an establishment (public) */
export async function getEstablishmentPacks(establishmentId: string): Promise<{ packs: PackV2[] }> {
  return publicJson<{ packs: PackV2[] }>(`/api/establishments/${establishmentId}/packs`);
}

// =============================================================================
// Authenticated consumer endpoints
// =============================================================================

export type PurchasePackInput = {
  promo_code?: string;
  payment_reference?: string;
  payment_method?: "card" | "wallet" | "mobile_payment";
};

export type PurchaseResult = {
  purchaseId: string;
  totalPriceCents: number;
  discountCents: number;
  commissionCents: number;
  qrCodeToken: string;
};

/** POST /api/packs/:id/purchase */
export async function purchasePack(packId: string, input?: PurchasePackInput): Promise<PurchaseResult> {
  return authedJson<PurchaseResult>(`/api/packs/${packId}/purchase`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export type PromoValidationResult = {
  valid: boolean;
  promoCodeId?: string;
  discountType?: "percentage" | "fixed_amount";
  discountValue?: number;
  discountCents?: number;
  isPlatformCode?: boolean;
  error?: string;
};

/** POST /api/packs/validate-promo */
export async function validatePromoCode(
  packId: string,
  code: string,
  packPrice?: number,
  establishmentId?: string,
): Promise<PromoValidationResult> {
  return authedJson<PromoValidationResult>("/api/packs/validate-promo", {
    method: "POST",
    body: JSON.stringify({
      pack_id: packId,
      code,
      pack_price: packPrice,
      establishment_id: establishmentId,
    }),
  });
}

/** GET /api/me/packs — My purchased packs */
export async function getMyPacks(status?: string): Promise<{ purchases: PackPurchaseV2[] }> {
  const qs = status ? `?status=${status}` : "";
  return authedJson<{ purchases: PackPurchaseV2[] }>(`/api/me/packs${qs}`);
}

/** GET /api/me/packs/:purchaseId — Purchased pack detail */
export async function getMyPackDetail(purchaseId: string): Promise<{ purchase: PackPurchaseV2 }> {
  return authedJson<{ purchase: PackPurchaseV2 }>(`/api/me/packs/${purchaseId}`);
}

/** POST /api/me/packs/:purchaseId/refund — Request refund */
export async function requestPackRefund(
  purchaseId: string,
  reason: string,
  preferCredit?: boolean,
): Promise<{ refundId: string; type: PackRefundType; amount: number }> {
  return authedJson(`/api/me/packs/${purchaseId}/refund`, {
    method: "POST",
    body: JSON.stringify({ reason, prefer_credit: preferCredit }),
  });
}

/** GET /api/me/transactions */
export async function getMyTransactions(
  page?: number,
  perPage?: number,
  type?: string,
): Promise<{ transactions: Transaction[]; total: number; page: number; perPage: number }> {
  const qs = new URLSearchParams();
  if (page) qs.set("page", String(page));
  if (perPage) qs.set("per_page", String(perPage));
  if (type) qs.set("type", type);
  const query = qs.toString();
  return authedJson(`/api/me/transactions${query ? `?${query}` : ""}`);
}

/** GET /api/me/receipts */
export async function getMyReceipts(): Promise<{
  receipts: Array<{
    id: string;
    type: string;
    reference_type: string;
    reference_id: string;
    gross_amount: number;
    receipt_id: string;
    created_at: string;
  }>;
}> {
  return authedJson("/api/me/receipts");
}

/** GET /api/me/receipts/:id/download — Returns redirect URL */
export function getReceiptDownloadUrl(receiptId: string): string {
  return `/api/me/receipts/${receiptId}/download`;
}
