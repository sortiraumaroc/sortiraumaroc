/**
 * API Client pour le système publicitaire ADMIN
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AdModerationQueueItem {
  id: string;
  establishment_id: string;
  establishment_name: string;
  type: string;
  title: string;
  budget: number;
  bid_amount_cents: number | null;
  targeting: any;
  moderation_status: string;
  submitted_at: string | null;
  created_at: string;
  creative_count: number;
}

export interface AdCampaignDetail {
  id: string;
  establishment_id: string;
  type: string;
  title: string;
  budget: number;
  bid_amount_cents: number | null;
  daily_budget_cents: number | null;
  spent_cents: number;
  remaining_cents: number;
  billing_model: string;
  status: string;
  moderation_status: string;
  targeting: any;
  rejection_reason: string | null;
  admin_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  establishment: {
    id: string;
    name: string;
    slug: string;
    cover_url: string | null;
    city: string;
  };
}

export interface AdModerationLog {
  id: string;
  campaign_id: string;
  admin_user_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: string;
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
  updated_at: string;
}

export interface AdRevenueStats {
  period: string;
  start_date: string;
  end_date: string;
  total_revenue_cents: number;
  total_clicks: number;
  by_campaign_type: {
    type: string;
    revenue_cents: number;
    clicks: number;
  }[];
  by_day: {
    date: string;
    revenue_cents: number;
    clicks: number;
  }[];
  top_advertisers: {
    establishment_id: string;
    establishment_name: string;
    spent_cents: number;
    campaign_count: number;
  }[];
}

export interface AdOverview {
  pending_moderation: number;
  active_campaigns: number;
  today_revenue_cents: number;
  month_revenue_cents: number;
  total_wallet_balance_cents: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function apiUrl(path: string): string {
  return path;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

async function handleResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload as T;
}

// =============================================================================
// MODÉRATION
// =============================================================================

export async function getAdModerationQueue(): Promise<{
  ok: true;
  queue: AdModerationQueueItem[];
  total: number;
}> {
  const res = await fetch(apiUrl("/api/admin/ads/moderation/queue"), {
    credentials: "include",
  });
  return handleResponse(res);
}

export async function getAdCampaignForModeration(campaignId: string): Promise<{
  ok: true;
  campaign: AdCampaignDetail;
  creatives: any[];
  moderation_logs: AdModerationLog[];
  wallet_balance_cents: number;
}> {
  const res = await fetch(apiUrl(`/api/admin/ads/campaigns/${encodeURIComponent(campaignId)}`), {
    credentials: "include",
  });
  return handleResponse(res);
}

export async function moderateAdCampaign(
  campaignId: string,
  data: {
    action: "approve" | "reject" | "request_changes";
    rejection_reason?: string;
    admin_notes?: string;
  }
): Promise<{ ok: true; campaign: AdCampaignDetail }> {
  const res = await fetch(apiUrl(`/api/admin/ads/campaigns/${encodeURIComponent(campaignId)}/moderate`), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// =============================================================================
// GESTION CAMPAGNES
// =============================================================================

export async function listAllAdCampaigns(options?: {
  status?: string;
  moderation_status?: string;
  type?: string;
  establishment_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ ok: true; campaigns: AdCampaignDetail[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.moderation_status) params.set("moderation_status", options.moderation_status);
  if (options?.type) params.set("type", options.type);
  if (options?.establishment_id) params.set("establishment_id", options.establishment_id);
  if (options?.search) params.set("search", options.search);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const res = await fetch(apiUrl(`/api/admin/ads/campaigns?${params}`), {
    credentials: "include",
  });
  return handleResponse(res);
}

export async function pauseAdCampaign(campaignId: string): Promise<{ ok: true; campaign: any }> {
  const res = await fetch(apiUrl(`/api/admin/ads/campaigns/${encodeURIComponent(campaignId)}/pause`), {
    method: "POST",
    credentials: "include",
  });
  return handleResponse(res);
}

export async function resumeAdCampaign(campaignId: string): Promise<{ ok: true; campaign: any }> {
  const res = await fetch(apiUrl(`/api/admin/ads/campaigns/${encodeURIComponent(campaignId)}/resume`), {
    method: "POST",
    credentials: "include",
  });
  return handleResponse(res);
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export async function getAdAuctionConfigs(): Promise<{ ok: true; configs: AdAuctionConfig[] }> {
  const res = await fetch(apiUrl("/api/admin/ads/auction-config"), {
    credentials: "include",
  });
  return handleResponse(res);
}

export async function updateAdAuctionConfig(
  productType: string,
  data: Partial<AdAuctionConfig>
): Promise<{ ok: true; config: AdAuctionConfig }> {
  const res = await fetch(apiUrl(`/api/admin/ads/auction-config/${encodeURIComponent(productType)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// =============================================================================
// DASHBOARD
// =============================================================================

export async function getAdRevenueStats(options?: {
  period?: "day" | "week" | "month";
  start_date?: string;
  end_date?: string;
}): Promise<{ ok: true; stats: AdRevenueStats }> {
  const params = new URLSearchParams();
  if (options?.period) params.set("period", options.period);
  if (options?.start_date) params.set("start_date", options.start_date);
  if (options?.end_date) params.set("end_date", options.end_date);

  const res = await fetch(apiUrl(`/api/admin/ads/revenue?${params}`), {
    credentials: "include",
  });
  return handleResponse(res);
}

export async function getAdOverview(): Promise<{ ok: true; overview: AdOverview }> {
  const res = await fetch(apiUrl("/api/admin/ads/overview"), {
    credentials: "include",
  });
  return handleResponse(res);
}
