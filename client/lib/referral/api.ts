/**
 * API client pour le système de parrainage
 */

import { getConsumerAccessToken } from "@/lib/auth";

const API_BASE = "/api";

// =============================================================================
// TYPES
// =============================================================================

export type ReferralPartnerStatus = "pending" | "active" | "suspended" | "rejected";
export type ReferralPartnerType = "individual" | "influencer" | "business" | "taxi" | "hotel" | "concierge" | "other";
export type CommissionStatus = "pending" | "validated" | "cancelled" | "paid";
export type PayoutStatus = "pending" | "processing" | "paid" | "failed" | "cancelled";

export type ReferralPartner = {
  id: string;
  user_id: string;
  referral_code: string;
  status: ReferralPartnerStatus;
  partner_type: ReferralPartnerType;
  display_name: string | null;
  bio: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_rib: string | null;
  requested_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ReferralPartnerStats = {
  total_referrees: number;
  total_commissions: number;
  total_earned_cents: number;
  pending_cents: number;
  validated_cents: number;
  paid_cents: number;
  this_month_earned_cents: number;
  this_month_referrees: number;
};

export type ReferralLink = {
  id: string;
  referree_user_id: string;
  referral_code_used: string;
  source: string;
  created_at: string;
  referree_name: string | null;
  referree_email: string | null;
  commissions: {
    total: number;
    pending: number;
    validated: number;
    count: number;
  };
};

export type ReferralCommission = {
  id: string;
  reservation_id: string;
  reservation_amount_cents: number;
  deposit_amount_cents: number | null;
  commission_rate_percent: number | null;
  final_commission_cents: number;
  status: CommissionStatus;
  establishment_name: string | null;
  establishment_universe: string | null;
  reservation_date: string | null;
  validated_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

export type ReferralPayout = {
  id: string;
  partner_id: string;
  amount_cents: number;
  currency: string;
  period_start: string;
  period_end: string;
  commission_count: number;
  status: PayoutStatus;
  payment_method: string | null;
  payment_reference: string | null;
  requested_at: string;
  paid_at: string | null;
  admin_notes: string | null;
  created_at: string;
};

export type CodeValidationResult = {
  valid: boolean;
  partner_id?: string;
  partner_name?: string;
  error?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

// =============================================================================
// PUBLIC ENDPOINTS
// =============================================================================

/**
 * Valider un code de parrainage (public, pas besoin d'auth)
 */
export async function validateReferralCode(code: string): Promise<CodeValidationResult> {
  const res = await fetch(`${API_BASE}/public/referral/validate/${encodeURIComponent(code)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { valid: false, error: data.error || "Erreur de validation" };
  }
  return res.json();
}

// =============================================================================
// AUTHENTICATED ENDPOINTS (Consumer/Parrain)
// =============================================================================

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getConsumerAccessToken();
  if (!token) {
    throw new Error("Non authentifié");
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Demander un compte parrain
 */
export async function applyAsReferralPartner(data: {
  referral_code?: string;
  partner_type?: ReferralPartnerType;
  display_name?: string;
  bio?: string;
  bank_name?: string;
  bank_account_holder?: string;
  bank_rib?: string;
}): Promise<{
  ok: boolean;
  partner_id?: string;
  referral_code?: string;
  status?: ReferralPartnerStatus;
  message?: string;
  error?: string;
}> {
  const res = await authFetch("/referral/apply", {
    method: "POST",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la demande" };
  }

  return json;
}

/**
 * Obtenir mon profil parrain et mes stats
 */
export async function getReferralPartnerMe(): Promise<{
  partner: ReferralPartner | null;
  stats: ReferralPartnerStats;
  error?: string;
}> {
  const res = await authFetch("/referral/me");

  if (!res.ok) {
    if (res.status === 404) {
      return {
        partner: null,
        stats: {
          total_referrees: 0,
          total_commissions: 0,
          total_earned_cents: 0,
          pending_cents: 0,
          validated_cents: 0,
          paid_cents: 0,
          this_month_earned_cents: 0,
          this_month_referrees: 0,
        },
      };
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

/**
 * Mettre à jour mon profil parrain
 */
export async function updateReferralPartnerMe(data: {
  display_name?: string;
  bio?: string;
  bank_name?: string;
  bank_account_holder?: string;
  bank_rib?: string;
}): Promise<{ ok: boolean; partner?: ReferralPartner; error?: string }> {
  const res = await authFetch("/referral/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  const json = await res.json();

  if (!res.ok) {
    return { ok: false, error: json.error || "Erreur lors de la mise à jour" };
  }

  return json;
}

/**
 * Lister mes filleuls
 */
export async function listMyReferrees(params?: {
  page?: number;
  limit?: number;
}): Promise<{
  referrees: ReferralLink[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const res = await authFetch(`/referral/me/referrees${query ? `?${query}` : ""}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

/**
 * Lister mes commissions
 */
export async function listMyCommissions(params?: {
  status?: CommissionStatus;
  page?: number;
  limit?: number;
}): Promise<{
  commissions: ReferralCommission[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const res = await authFetch(`/referral/me/commissions${query ? `?${query}` : ""}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

/**
 * Lister mes paiements
 */
export async function listMyPayouts(params?: {
  page?: number;
  limit?: number;
}): Promise<{
  payouts: ReferralPayout[];
  pagination: Pagination;
}> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const res = await authFetch(`/referral/me/payouts${query ? `?${query}` : ""}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur serveur");
  }

  return res.json();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Formater un montant en centimes en MAD
 */
export function formatCentsToDH(cents: number): string {
  return `${(cents / 100).toFixed(2)} DH`;
}

/**
 * Générer l'URL de partage du parrainage
 */
export function getReferralShareUrl(code: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/register?ref=${encodeURIComponent(code)}`;
}

/**
 * Copier le code dans le presse-papier
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Statut badge color
 */
export function getStatusColor(status: CommissionStatus | PayoutStatus | ReferralPartnerStatus): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "validated":
    case "active":
    case "processing":
      return "bg-blue-100 text-blue-800";
    case "paid":
      return "bg-green-100 text-green-800";
    case "cancelled":
    case "failed":
    case "suspended":
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Statut label en français
 */
export function getStatusLabel(status: CommissionStatus | PayoutStatus | ReferralPartnerStatus): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "validated":
      return "Validée";
    case "paid":
      return "Payée";
    case "cancelled":
      return "Annulée";
    case "processing":
      return "En traitement";
    case "failed":
      return "Échoué";
    case "active":
      return "Actif";
    case "suspended":
      return "Suspendu";
    case "rejected":
      return "Refusé";
    default:
      return status;
  }
}
