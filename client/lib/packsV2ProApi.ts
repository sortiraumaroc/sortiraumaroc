/**
 * Packs V2 — Pro-side API helpers
 *
 * Uses proSupabase auth for Bearer token.
 * Endpoints map 1:1 to server/routes/packsPro.ts.
 */

import { proSupabase } from "@/lib/pro/supabase";
import type {
  PackV2,
  PackModerationStatus,
  PackPromoCode,
  BillingPeriod,
  BillingDispute,
  Transaction,
} from "../../shared/packsBillingTypes";

// =============================================================================
// Auth helper
// =============================================================================

async function getProToken(): Promise<string> {
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifie");
  return data.session.access_token;
}

// =============================================================================
// Generic fetch
// =============================================================================

export class PacksProApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "PacksProApiError";
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
    throw new PacksProApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new PacksProApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Pack Management (10 endpoints)
// =============================================================================

/** GET /api/pro/packs */
export async function listProPacks(status?: PackModerationStatus): Promise<{ packs: PackV2[] }> {
  const qs = status ? `?status=${status}` : "";
  return proAuthedJson(`/api/pro/packs${qs}`);
}

export type CreatePackInput = {
  establishment_id: string;
  title: string;
  short_description?: string;
  detailed_description?: string;
  cover_url?: string;
  additional_photos?: string[];
  category?: string;
  price: number;
  original_price?: number;
  party_size?: number;
  items?: Array<{ name: string; description?: string; quantity: number; unit?: string }>;
  inclusions?: Array<{ label: string; description?: string }>;
  exclusions?: Array<{ label: string; description?: string }>;
  conditions?: string;
  valid_days?: number[];
  valid_time_start?: string;
  valid_time_end?: string;
  sale_start_date?: string;
  sale_end_date?: string;
  validity_start_date?: string;
  validity_end_date?: string;
  stock?: number;
  limit_per_client?: number;
  is_multi_use?: boolean;
  total_uses?: number;
};

/** POST /api/pro/packs */
export async function createProPack(input: CreatePackInput): Promise<{ packId: string }> {
  return proAuthedJson("/api/pro/packs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/pro/packs/:id */
export async function updateProPack(packId: string, input: Partial<CreatePackInput>): Promise<unknown> {
  return proAuthedJson(`/api/pro/packs/${packId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** POST /api/pro/packs/:id/submit */
export async function submitPackForModeration(packId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/packs/${packId}/submit`, { method: "POST" });
}

/** POST /api/pro/packs/:id/suspend */
export async function suspendPack(packId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/packs/${packId}/suspend`, { method: "POST" });
}

/** POST /api/pro/packs/:id/resume */
export async function resumePack(packId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/packs/${packId}/resume`, { method: "POST" });
}

/** POST /api/pro/packs/:id/close */
export async function closePack(packId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/packs/${packId}/close`, { method: "POST" });
}

/** DELETE /api/pro/packs/:id — supprimer un brouillon/rejeté */
export async function deletePack(packId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/packs/${packId}`, { method: "DELETE" });
}

/** POST /api/pro/packs/:id/duplicate */
export async function duplicatePack(packId: string): Promise<{ newPackId: string }> {
  return proAuthedJson(`/api/pro/packs/${packId}/duplicate`, { method: "POST" });
}

export type PackStats = {
  packId: string;
  title: string;
  stock: number | null;
  soldCount: number;
  consumedCount: number;
  remaining: number | null;
  totalRevenue: number;
  refundCount: number;
};

/** GET /api/pro/packs/:id/stats */
export async function getPackStats(packId: string): Promise<PackStats> {
  return proAuthedJson(`/api/pro/packs/${packId}/stats`);
}

export type ScanResult =
  | { purchases: Array<{ id: string; pack_title: string; uses_remaining: number; expires_at: string }> }
  | { consumptionId: string; usesRemaining: number; newStatus: string };

/** POST /api/pro/packs/scan */
export async function scanQrAndConsume(
  qrCodeToken: string,
  establishmentId: string,
  purchaseId?: string,
): Promise<ScanResult> {
  return proAuthedJson("/api/pro/packs/scan", {
    method: "POST",
    body: JSON.stringify({
      qr_code_token: qrCodeToken,
      establishment_id: establishmentId,
      purchase_id: purchaseId,
    }),
  });
}

// =============================================================================
// Promo Codes (4 endpoints)
// =============================================================================

/** GET /api/pro/pack-promos */
export async function listProPackPromos(): Promise<{ promos: PackPromoCode[] }> {
  return proAuthedJson("/api/pro/pack-promos");
}

export type CreatePromoInput = {
  establishment_id: string;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  pack_ids?: string[];
  max_uses?: number;
  max_uses_per_user?: number;
  valid_from?: string;
  valid_to?: string;
};

/** POST /api/pro/pack-promos */
export async function createProPackPromo(input: CreatePromoInput): Promise<PackPromoCode> {
  return proAuthedJson("/api/pro/pack-promos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/pro/pack-promos/:id */
export async function updateProPackPromo(promoId: string, input: Partial<CreatePromoInput>): Promise<PackPromoCode> {
  return proAuthedJson(`/api/pro/pack-promos/${promoId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** DELETE /api/pro/pack-promos/:id */
export async function deleteProPackPromo(promoId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/pack-promos/${promoId}`, { method: "DELETE" });
}

// =============================================================================
// Billing (12 endpoints)
// =============================================================================

/** GET /api/pro/billing/current-period */
export async function getCurrentBillingPeriod(
  establishmentId: string,
): Promise<{ period: BillingPeriod; transactions: Transaction[] }> {
  return proAuthedJson(`/api/pro/billing/current-period?establishment_id=${establishmentId}`);
}

/** GET /api/pro/billing/periods */
export async function listBillingPeriods(
  establishmentId: string,
): Promise<{ periods: BillingPeriod[] }> {
  return proAuthedJson(`/api/pro/billing/periods?establishment_id=${establishmentId}`);
}

/** GET /api/pro/billing/periods/:id */
export async function getBillingPeriodDetail(
  periodId: string,
): Promise<{ period: BillingPeriod; transactions: Transaction[] }> {
  return proAuthedJson(`/api/pro/billing/periods/${periodId}`);
}

/** POST /api/pro/billing/periods/:id/call-to-invoice */
export async function callToInvoice(periodId: string): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/billing/periods/${periodId}/call-to-invoice`, { method: "POST" });
}

/** GET /api/pro/billing/invoices */
export async function listProInvoices(): Promise<{ invoices: BillingPeriod[] }> {
  return proAuthedJson("/api/pro/billing/invoices");
}

/** Download invoice PDF URL */
export function getInvoiceDownloadUrl(invoiceId: string): string {
  return `/api/pro/billing/invoices/${invoiceId}/download`;
}

/** POST /api/pro/billing/disputes */
export async function createBillingDispute(input: {
  billing_period_id: string;
  reason: string;
  disputed_transactions?: string[];
  evidence?: Array<{ url: string; type: string; description?: string }>;
}): Promise<BillingDispute> {
  return proAuthedJson("/api/pro/billing/disputes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /api/pro/billing/disputes */
export async function listProBillingDisputes(): Promise<{ disputes: BillingDispute[] }> {
  return proAuthedJson("/api/pro/billing/disputes");
}

export type ProBillingStats = {
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  packSalesCount: number;
  transactionCount: number;
};

/** GET /api/pro/billing/stats */
export async function getProBillingStats(establishmentId: string): Promise<ProBillingStats> {
  return proAuthedJson(`/api/pro/billing/stats?establishment_id=${establishmentId}`);
}

export type WalletInfo = {
  balance: number;
  wallet: unknown;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    payment_reference: string | null;
    created_at: string;
  }>;
};

/** GET /api/pro/wallet */
export async function getProWallet(establishmentId: string): Promise<WalletInfo> {
  return proAuthedJson(`/api/pro/wallet?establishment_id=${establishmentId}`);
}

/** POST /api/pro/wallet/topup */
export async function topupProWallet(
  establishmentId: string,
  amount: number,
  paymentReference?: string,
): Promise<{ ok: true; newBalance: number }> {
  return proAuthedJson("/api/pro/wallet/topup", {
    method: "POST",
    body: JSON.stringify({
      establishment_id: establishmentId,
      amount,
      payment_reference: paymentReference,
    }),
  });
}

/** GET /api/pro/receipts */
export async function getProReceipts(): Promise<{
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
  return proAuthedJson("/api/pro/receipts");
}
