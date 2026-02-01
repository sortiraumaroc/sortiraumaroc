/**
 * API Client pour le système publicitaire PRO
 */

import { apiUrl, requireProAccessToken, isStaleProAuthError, resetProAuth } from "./api";

// =============================================================================
// TYPES
// =============================================================================

export interface AdWallet {
  id: string;
  establishment_id: string;
  balance_cents: number;
  total_credited_cents: number;
  total_spent_cents: number;
  created_at: string;
  updated_at: string;
}

export interface AdWalletTransaction {
  id: string;
  wallet_id: string;
  type: "credit" | "debit" | "refund" | "adjustment";
  amount_cents: number;
  balance_after_cents: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface AdCampaignTargeting {
  keywords?: string[];
  categories?: string[];
  cities?: string[];
  radius_km?: number;
}

export interface AdCampaign {
  id: string;
  establishment_id: string;
  type: string;
  title: string;
  budget: number;
  bid_amount_cents: number | null;
  daily_budget_cents: number | null;
  daily_spent_cents: number;
  spent_cents: number;
  remaining_cents: number;
  billing_model: string;
  cpc_cents: number | null;
  cpm_cents: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  moderation_status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  targeting: AdCampaignTargeting;
  quality_score: number;
  ctr: number;
  impressions: number;
  clicks: number;
  created_at: string;
  updated_at: string;
}

export interface AdAuctionConfig {
  id: string;
  product_type: string;
  min_bid_cents: number;
  suggested_bid_cents: number;
  max_bid_cents: number | null;
  demand_multiplier: number;
  min_budget_cents: number;
  min_daily_budget_cents: number | null;
  max_positions: number | null;
  is_active: boolean;
  dynamic_suggested_bid_cents?: number;
  active_campaigns_count?: number;
}

export interface AdStats {
  wallet_balance_cents: number;
  total_spent_cents: number;
  monthly_spent_cents: number;
  active_campaigns: number;
  total_campaigns: number;
  total_impressions: number;
  total_clicks: number;
  average_ctr: string;
}

export interface CreateCampaignRequest {
  type: string;
  title: string;
  budget_cents: number;
  bid_amount_cents?: number;
  daily_budget_cents?: number;
  billing_model?: string;
  starts_at?: string;
  ends_at?: string;
  targeting?: AdCampaignTargeting;
  promoted_entity_type?: string;
  promoted_entity_id?: string;
}

export interface UpdateCampaignRequest {
  title?: string;
  budget_cents?: number;
  bid_amount_cents?: number;
  daily_budget_cents?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  targeting?: AdCampaignTargeting;
  status?: "paused" | "active" | "cancelled";
}

// =============================================================================
// HELPERS
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

async function handleResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `HTTP ${res.status}`;

    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }

    throw new Error(msg);
  }

  return payload as T;
}

// =============================================================================
// WALLET
// =============================================================================

export async function getAdWallet(establishmentId: string): Promise<{ ok: true; wallet: AdWallet }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/wallet`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

export async function getAdWalletTransactions(
  establishmentId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ ok: true; transactions: AdWalletTransaction[]; total: number }> {
  const token = await requireProAccessToken();

  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/wallet/transactions?${params}`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

export interface WalletRechargeResponse {
  ok: true;
  payment_url: string;
  session_id: string;
  order_id: string;
  external_reference: string;
  amount_mad: number;
  amount_cents: number;
}

export async function initiateWalletRecharge(
  establishmentId: string,
  amountMad: number
): Promise<WalletRechargeResponse> {
  const token = await requireProAccessToken();

  // Construire les URLs de retour
  const currentUrl = window.location.href.split("?")[0];
  const acceptUrl = `${currentUrl}?recharge=success`;
  const declineUrl = `${currentUrl}?recharge=failed`;

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/wallet/recharge`),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount_mad: amountMad,
        accept_url: acceptUrl,
        decline_url: declineUrl,
      }),
    }
  );

  return handleResponse(res);
}

// =============================================================================
// CAMPAIGNS
// =============================================================================

export async function listAdCampaigns(
  establishmentId: string,
  options?: { status?: string; type?: string }
): Promise<{ ok: true; campaigns: AdCampaign[]; wallet_balance_cents: number }> {
  const token = await requireProAccessToken();

  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.type) params.set("type", options.type);

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/campaigns?${params}`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

export async function getAdCampaign(
  establishmentId: string,
  campaignId: string
): Promise<{
  ok: true;
  campaign: AdCampaign;
  creatives: any[];
  stats: {
    impressions_30d: number;
    clicks_30d: number;
    conversions_30d: number;
    ctr_30d: string;
  };
}> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/campaigns/${encodeURIComponent(campaignId)}`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

export async function createAdCampaign(
  establishmentId: string,
  data: CreateCampaignRequest
): Promise<{ ok: true; campaign: AdCampaign }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/campaigns`),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  return handleResponse(res);
}

export async function updateAdCampaign(
  establishmentId: string,
  campaignId: string,
  data: UpdateCampaignRequest
): Promise<{ ok: true; campaign: AdCampaign }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/campaigns/${encodeURIComponent(campaignId)}`),
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  return handleResponse(res);
}

export async function submitAdCampaign(
  establishmentId: string,
  campaignId: string
): Promise<{ ok: true; campaign: AdCampaign }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/campaigns/${encodeURIComponent(campaignId)}/submit`),
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

export async function deleteAdCampaign(
  establishmentId: string,
  campaignId: string
): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/campaigns/${encodeURIComponent(campaignId)}`),
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

// =============================================================================
// CONFIG & STATS
// =============================================================================

export async function getAdAuctionConfig(
  establishmentId: string,
  campaignType?: string
): Promise<{ ok: true; configs: AdAuctionConfig | AdAuctionConfig[] }> {
  const token = await requireProAccessToken();

  const params = new URLSearchParams();
  if (campaignType) params.set("type", campaignType);

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/auction-config?${params}`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}

export async function getAdStats(establishmentId: string): Promise<{ ok: true; stats: AdStats }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(establishmentId)}/ads/stats`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );

  return handleResponse(res);
}
