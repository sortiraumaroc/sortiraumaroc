/**
 * Packs V2 — Admin-side API helpers
 *
 * Uses admin key + session token from sessionStorage.
 * Endpoints map 1:1 to server/routes/packsAdmin.ts.
 */

import type {
  PackV2,
  BillingPeriod,
  BillingDispute,
  PackRefund,
  PlatformModule,
  PackPromoCode,
} from "../../shared/packsBillingTypes";

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

export class PacksAdminApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "PacksAdminApiError";
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
    throw new PacksAdminApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new PacksAdminApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Pack Moderation (6 endpoints)
// =============================================================================

/** GET /api/admin/packs/moderation */
export async function getModerationQueue(
  status?: string,
): Promise<{ packs: PackV2[] }> {
  const qs = status ? `?status=${status}` : "";
  return adminJson(`/api/admin/packs/moderation${qs}`);
}

/** POST /api/admin/packs/:id/approve */
export async function approvePack(packId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/packs/${packId}/approve`, { method: "POST" });
}

/** POST /api/admin/packs/:id/reject */
export async function rejectPack(packId: string, reason: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/packs/${packId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** POST /api/admin/packs/:id/request-modification */
export async function requestPackModification(packId: string, note: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/packs/${packId}/request-modification`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

/** POST /api/admin/packs/:id/feature */
export async function featurePack(packId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/packs/${packId}/feature`, { method: "POST" });
}

/** POST /api/admin/packs/:id/unfeature */
export async function unfeaturePack(packId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/packs/${packId}/unfeature`, { method: "POST" });
}

// =============================================================================
// Modules (3 endpoints)
// =============================================================================

export type ModuleInfo = {
  module: PlatformModule;
  isGloballyActive: boolean;
  activatedAt: string | null;
  deactivatedAt: string | null;
  updatedBy: string | null;
};

/** GET /api/admin/modules */
export async function listModules(): Promise<{ modules: ModuleInfo[] }> {
  return adminJson("/api/admin/modules");
}

/** POST /api/admin/modules/:module/toggle-global */
export async function toggleGlobalModule(
  moduleName: PlatformModule,
  activate: boolean,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/modules/${moduleName}/toggle-global`, {
    method: "POST",
    body: JSON.stringify({ activate }),
  });
}

/** POST /api/admin/modules/:module/toggle-establishment/:id */
export async function toggleEstablishmentModule(
  moduleName: PlatformModule,
  establishmentId: string,
  activate: boolean,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/modules/${moduleName}/toggle-establishment/${establishmentId}`, {
    method: "POST",
    body: JSON.stringify({ activate }),
  });
}

// =============================================================================
// Commissions (5 endpoints)
// =============================================================================

export type CommissionsConfig = {
  defaults: Array<{ id: string; type: string; rate: number; min_fee: number | null; max_fee: number | null }>;
  categories: Array<{ id: string; type: string; category: string; rate: number }>;
  custom: Array<{
    id: string;
    establishment_id: string;
    type: string;
    rate: number;
    establishments?: { id: string; name: string; slug: string; city: string };
  }>;
};

/** GET /api/admin/commissions */
export async function listCommissions(): Promise<CommissionsConfig> {
  return adminJson("/api/admin/commissions");
}

/** PUT /api/admin/commissions/:id */
export async function updateCommission(
  id: string,
  input: { rate?: number; min_fee?: number; max_fee?: number },
): Promise<unknown> {
  return adminJson(`/api/admin/commissions/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** POST /api/admin/commissions/establishment */
export async function createCustomCommission(input: {
  establishment_id: string;
  rate: number;
  type?: string;
  min_fee?: number;
  max_fee?: number;
}): Promise<unknown> {
  return adminJson("/api/admin/commissions/establishment", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/admin/commissions/establishment/:id */
export async function updateCustomCommission(
  id: string,
  input: { rate?: number; min_fee?: number; max_fee?: number },
): Promise<unknown> {
  return adminJson(`/api/admin/commissions/establishment/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** DELETE /api/admin/commissions/establishment/:id */
export async function deleteCustomCommission(id: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/commissions/establishment/${id}`, { method: "DELETE" });
}

// =============================================================================
// Billing (9 endpoints)
// =============================================================================

/** GET /api/admin/billing/invoices */
export async function listAdminInvoices(
  status?: string,
): Promise<{ invoices: BillingPeriod[] }> {
  const qs = status ? `?status=${status}` : "";
  return adminJson(`/api/admin/billing/invoices${qs}`);
}

/** POST /api/admin/billing/invoices/:id/validate */
export async function validateInvoice(periodId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/billing/invoices/${periodId}/validate`, { method: "POST" });
}

/** POST /api/admin/billing/invoices/:id/contest */
export async function contestInvoice(periodId: string, message: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/billing/invoices/${periodId}/contest`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/** GET /api/admin/billing/payments */
export async function listPayments(status?: string): Promise<{ payments: BillingPeriod[] }> {
  const qs = status ? `?status=${status}` : "";
  return adminJson(`/api/admin/billing/payments${qs}`);
}

/** POST /api/admin/billing/payments/:id/execute */
export async function executePayment(periodId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/billing/payments/${periodId}/execute`, { method: "POST" });
}

/** POST /api/admin/billing/payments/batch-execute */
export async function batchExecutePayments(
  periodIds: string[],
): Promise<{ succeeded: number; failed: number; total: number }> {
  return adminJson("/api/admin/billing/payments/batch-execute", {
    method: "POST",
    body: JSON.stringify({ period_ids: periodIds }),
  });
}

/** GET /api/admin/billing/disputes */
export async function listAdminDisputes(
  status?: string,
): Promise<{ disputes: BillingDispute[] }> {
  const qs = status ? `?status=${status}` : "";
  return adminJson(`/api/admin/billing/disputes${qs}`);
}

/** POST /api/admin/billing/disputes/:id/respond */
export async function respondToDispute(
  disputeId: string,
  accepted: boolean,
  response: string,
  correctionAmount?: number,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/billing/disputes/${disputeId}/respond`, {
    method: "POST",
    body: JSON.stringify({ accepted, response, correction_amount: correctionAmount }),
  });
}

export type ReconciliationSummary = {
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  totalRefunds: number;
  periodCount: number;
  byStatus: Record<string, number>;
};

/** GET /api/admin/billing/reconciliation */
export async function getReconciliation(period?: string): Promise<ReconciliationSummary> {
  const qs = period ? `?period=${period}` : "";
  return adminJson(`/api/admin/billing/reconciliation${qs}`);
}

// =============================================================================
// Platform Promos (4 endpoints)
// =============================================================================

/** GET /api/admin/pack-promos */
export async function listPlatformPromos(): Promise<{ promos: PackPromoCode[] }> {
  return adminJson("/api/admin/pack-promos");
}

/** POST /api/admin/pack-promos */
export async function createPlatformPromo(input: {
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  pack_ids?: string[];
  max_uses?: number;
  max_uses_per_user?: number;
  valid_from?: string;
  valid_to?: string;
}): Promise<PackPromoCode> {
  return adminJson("/api/admin/pack-promos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/admin/pack-promos/:id */
export async function updatePlatformPromo(
  promoId: string,
  input: Partial<{
    code: string;
    discount_type: string;
    discount_value: number;
    pack_ids: string[];
    max_uses: number;
    max_uses_per_user: number;
    valid_from: string;
    valid_to: string;
    is_active: boolean;
  }>,
): Promise<PackPromoCode> {
  return adminJson(`/api/admin/pack-promos/${promoId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** DELETE /api/admin/pack-promos/:id */
export async function deletePlatformPromo(promoId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/pack-promos/${promoId}`, { method: "DELETE" });
}

// =============================================================================
// Stats (3 endpoints)
// =============================================================================

export type PacksGlobalStats = {
  activePacks: number;
  totalPacks: number;
  totalSold: number;
  totalConsumed: number;
  totalRevenue: number;
  totalRefunded: number;
  totalPurchases: number;
  totalRefunds: number;
};

/** GET /api/admin/packs/stats */
export async function getPacksStats(): Promise<PacksGlobalStats> {
  return adminJson("/api/admin/packs/stats");
}

export type BillingGlobalStats = {
  totalPeriods: number;
  paidPeriods: number;
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  totalRefunds: number;
  paidGross: number;
  paidCommission: number;
};

/** GET /api/admin/billing/stats */
export async function getBillingStats(): Promise<BillingGlobalStats> {
  return adminJson("/api/admin/billing/stats");
}

export type RevenueBySource = {
  revenueBySource: Record<
    string,
    { count: number; gross: number; commission: number; net: number }
  >;
};

/** GET /api/admin/billing/revenue */
export async function getRevenueBySource(): Promise<RevenueBySource> {
  return adminJson("/api/admin/billing/revenue");
}

// =============================================================================
// Refunds (3 endpoints)
// =============================================================================

/** GET /api/admin/refunds */
export async function listRefunds(status?: string): Promise<{ refunds: PackRefund[] }> {
  const qs = status ? `?status=${status}` : "";
  return adminJson(`/api/admin/refunds${qs}`);
}

/** POST /api/admin/refunds/:id/approve */
export async function approveRefund(refundId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/refunds/${refundId}/approve`, { method: "POST" });
}

/** POST /api/admin/refunds/:id/reject */
export async function rejectRefund(refundId: string, reason?: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/refunds/${refundId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
