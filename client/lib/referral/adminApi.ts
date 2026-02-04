/**
 * API client admin pour le système de parrainage
 */

import { loadAdminSessionToken } from "@/lib/adminApi";
import type {
  ReferralPartner,
  ReferralPartnerStatus,
  ReferralCommission,
  ReferralPayout,
  Pagination,
  CommissionStatus,
  PayoutStatus,
} from "./api";

const API_BASE = "/api/admin/referral";

// =============================================================================
// ADDITIONAL TYPES FOR ADMIN
// =============================================================================

export type ReferralPartnerWithStats = ReferralPartner & {
  referree_count: number;
  total_earned_cents: number;
  pending_cents: number;
  validated_cents: number;
  // Enriched user info
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
};

export type ReferralConfig = {
  id: number;
  default_commission_percent: number | null;
  default_commission_fixed_cents: number | null;
  commission_mode: "percent" | "fixed" | "both_max" | "both_min";
  commission_base: "deposit" | "total";
  min_reservation_amount_cents: number;
  min_commission_amount_cents: number;
  eligible_reservation_statuses: string[];
  validating_statuses: string[];
  cancelling_statuses: string[];
  is_active: boolean;
  updated_at: string;
};

export type ReferralConfigUniverse = {
  id: string;
  universe: string;
  commission_percent: number | null;
  commission_fixed_cents: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReferralStats = {
  partners: {
    total: number;
    by_status: Record<string, number>;
    this_month: number;
  };
  referrees: {
    total: number;
    this_month: number;
  };
  commissions: {
    total_count: number;
    by_status: Record<string, { count: number; total: number }>;
    this_month_total_cents: number;
  };
  payouts: {
    by_status: Record<string, { count: number; total: number }>;
  };
};

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const sessionToken = loadAdminSessionToken();
  if (!sessionToken) {
    throw new Error("Non authentifié");
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "omit",
    headers: {
      ...options.headers,
      "x-admin-session": sessionToken,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Lister les parrains avec leurs stats
 */
export async function listReferralPartners(params?: {
  status?: ReferralPartnerStatus;
  page?: number;
  limit?: number;
}): Promise<{
  partners: ReferralPartnerWithStats[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const res = await adminFetch(`/partners${query ? `?${query}` : ""}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

/**
 * Mettre à jour le statut d'un parrain
 */
export async function updateReferralPartnerStatus(
  partnerId: string,
  data: {
    status: "active" | "suspended" | "rejected";
    rejection_reason?: string;
    admin_notes?: string;
  }
): Promise<{ ok: boolean; partner?: ReferralPartner; error?: string }> {
  const res = await adminFetch(`/partners/${partnerId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la mise à jour" };
  }

  return { ok: true, partner: json.partner };
}

/**
 * Obtenir la configuration du parrainage
 */
export async function getReferralConfig(): Promise<{
  config: ReferralConfig;
  universes: ReferralConfigUniverse[];
}> {
  const res = await adminFetch("/config");

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

/**
 * Mettre à jour la configuration globale
 */
export async function updateReferralConfig(data: {
  default_commission_percent?: number | null;
  default_commission_fixed_cents?: number | null;
  commission_mode?: "percent" | "fixed" | "both_max" | "both_min";
  commission_base?: "deposit" | "total";
  min_reservation_amount_cents?: number;
  min_commission_amount_cents?: number;
  is_active?: boolean;
}): Promise<{ ok: boolean; config?: ReferralConfig; error?: string }> {
  const res = await adminFetch("/config", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la mise à jour" };
  }

  return { ok: true, config: json.config };
}

/**
 * Mettre à jour la configuration d'un univers
 */
export async function upsertReferralConfigUniverse(
  universe: string,
  data: {
    commission_percent?: number | null;
    commission_fixed_cents?: number | null;
    is_active?: boolean;
  }
): Promise<{ ok: boolean; universe_config?: ReferralConfigUniverse; error?: string }> {
  const res = await adminFetch(`/config/universes/${encodeURIComponent(universe)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la mise à jour" };
  }

  return { ok: true, universe_config: json.universe_config };
}

/**
 * Lister toutes les commissions
 */
export async function listAllCommissions(params?: {
  status?: CommissionStatus;
  partner_id?: string;
  page?: number;
  limit?: number;
}): Promise<{
  commissions: (ReferralCommission & {
    referral_partners: {
      id: string;
      referral_code: string;
      display_name: string | null;
      user_id: string;
    };
  })[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.partner_id) searchParams.set("partner_id", params.partner_id);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const res = await adminFetch(`/commissions${query ? `?${query}` : ""}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

/**
 * Créer un payout pour un parrain
 */
export async function createReferralPayout(data: {
  partner_id: string;
  period_start: string;
  period_end: string;
}): Promise<{ ok: boolean; payout?: ReferralPayout; error?: string }> {
  const res = await adminFetch("/payouts", {
    method: "POST",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la création" };
  }

  return { ok: true, payout: json.payout };
}

/**
 * Mettre à jour un payout
 */
export async function updateReferralPayout(
  payoutId: string,
  data: {
    status: "processing" | "paid" | "failed" | "cancelled";
    payment_method?: string;
    payment_reference?: string;
    admin_notes?: string;
  }
): Promise<{ ok: boolean; payout?: ReferralPayout; error?: string }> {
  const res = await adminFetch(`/payouts/${payoutId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la mise à jour" };
  }

  return { ok: true, payout: json.payout };
}

/**
 * Obtenir les statistiques du programme
 */
export async function getReferralStats(): Promise<ReferralStats> {
  const res = await adminFetch("/stats");

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}
