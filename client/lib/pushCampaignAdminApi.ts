/**
 * Push Campaign Admin — API helpers
 *
 * Uses admin key + session token from sessionStorage.
 * Endpoints map 1:1 to server/routes/pushCampaignAdmin.ts.
 */

// =============================================================================
// Types
// =============================================================================

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";

export type Campaign = {
  id: string;
  title: string;
  body: string;
  image_url?: string | null;
  action_url?: string | null;
  audience_type: "all" | "segment";
  audience_filters: Record<string, unknown>;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  created_at: string;
  updated_at: string;
};

export type DeliverySummary = {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
};

export type CampaignDelivery = {
  id: string;
  campaign_id: string;
  user_id: string;
  fcm_token: string;
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
};

export type CampaignStats = {
  ok: true;
  stats: DeliverySummary & {
    openRate: number;
    clickRate: number;
  };
};

export type AudiencePreviewResult = {
  ok: true;
  count: number;
};

export type CreateCampaignInput = {
  title: string;
  body: string;
  image_url?: string;
  action_url?: string;
  audience_type: "all" | "segment";
  audience_filters?: Record<string, unknown>;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

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

export class PushCampaignAdminApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "PushCampaignAdminApiError";
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
    throw new PushCampaignAdminApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new PushCampaignAdminApiError(msg, res.status, payload);
  }

  return payload as T;
}

// =============================================================================
// Campaigns CRUD (4 endpoints)
// =============================================================================

/** GET /api/admin/campaigns */
export async function listCampaigns(
  opts?: { status?: string; page?: number; limit?: number },
): Promise<{ campaigns: Campaign[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return adminJson(`/api/admin/campaigns${qs}`);
}

/** GET /api/admin/campaigns/:id */
export async function getCampaign(
  campaignId: string,
): Promise<{ campaign: Campaign; deliverySummary: DeliverySummary }> {
  return adminJson(`/api/admin/campaigns/${campaignId}`);
}

/** POST /api/admin/campaigns */
export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ ok: true; campaignId: string }> {
  return adminJson("/api/admin/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT /api/admin/campaigns/:id */
export async function updateCampaign(
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/campaigns/${campaignId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// =============================================================================
// Campaign Actions (4 endpoints)
// =============================================================================

/** POST /api/admin/campaigns/:id/schedule */
export async function scheduleCampaign(
  campaignId: string,
  scheduledAt: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/campaigns/${campaignId}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduled_at: scheduledAt }),
  });
}

/** POST /api/admin/campaigns/:id/cancel */
export async function cancelCampaign(campaignId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/campaigns/${campaignId}/cancel`, { method: "POST" });
}

/** POST /api/admin/campaigns/:id/send */
export async function sendCampaign(
  campaignId: string,
): Promise<{ ok: true; sent: number }> {
  return adminJson(`/api/admin/campaigns/${campaignId}/send`, { method: "POST" });
}

/** POST /api/admin/campaigns/:id/test */
export async function sendTestCampaign(
  campaignId: string,
  testUserId: string,
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/campaigns/${campaignId}/test`, {
    method: "POST",
    body: JSON.stringify({ test_user_id: testUserId }),
  });
}

// =============================================================================
// Stats & Deliveries (2 endpoints)
// =============================================================================

/** GET /api/admin/campaigns/:id/stats */
export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  return adminJson(`/api/admin/campaigns/${campaignId}/stats`);
}

/** GET /api/admin/campaigns/:id/deliveries */
export async function listDeliveries(
  campaignId: string,
  opts?: { page?: number; limit?: number },
): Promise<{ deliveries: CampaignDelivery[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return adminJson(`/api/admin/campaigns/${campaignId}/deliveries${qs}`);
}

// =============================================================================
// Audience & Tracking (2 endpoints)
// =============================================================================

/** POST /api/admin/audience/preview */
export async function previewAudienceSize(
  audienceType: "all" | "segment",
  audienceFilters?: Record<string, unknown>,
): Promise<AudiencePreviewResult> {
  return adminJson("/api/admin/audience/preview", {
    method: "POST",
    body: JSON.stringify({ audience_type: audienceType, audience_filters: audienceFilters ?? {} }),
  });
}

/** POST /api/admin/campaigns/deliveries/:deliveryId/track */
export async function trackDelivery(
  deliveryId: string,
  action: "opened" | "clicked",
): Promise<{ ok: true }> {
  return adminJson(`/api/admin/campaigns/deliveries/${deliveryId}/track`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}
