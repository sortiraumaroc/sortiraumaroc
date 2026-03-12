/**
 * Push Campaign Admin Routes — 12 endpoints
 *
 *  - GET    /api/admin/campaigns                        — list campaigns
 *  - GET    /api/admin/campaigns/:id                    — get single campaign
 *  - POST   /api/admin/campaigns                        — create campaign
 *  - PUT    /api/admin/campaigns/:id                    — update campaign
 *  - POST   /api/admin/campaigns/:id/schedule           — schedule campaign
 *  - POST   /api/admin/campaigns/:id/cancel             — cancel campaign
 *  - POST   /api/admin/campaigns/:id/send               — send immediately
 *  - POST   /api/admin/campaigns/:id/test               — send test
 *  - GET    /api/admin/campaigns/:id/stats              — campaign stats
 *  - GET    /api/admin/campaigns/:id/deliveries         — list deliveries
 *  - POST   /api/admin/audience/preview                 — preview audience size
 *  - POST   /api/admin/campaigns/deliveries/:deliveryId/track — track delivery action
 */

import type { Router, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./adminHelpers";
import { zBody, zParams, zQuery, zIdParam } from "../lib/validate";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  ScheduleCampaignSchema,

  PreviewAudienceSchema,
  TrackDeliverySchema,
  DeliveryIdParams,
  ListCampaignsQuery,
  ListDeliveriesQuery,
} from "../schemas/pushCampaignAdmin";
import {
  createCampaign,
  updateCampaign,
  deleteCampaign,
  scheduleCampaign,
  cancelCampaign,
  sendCampaign,
  sendTestCampaign,
  getCampaignStats,
  trackDelivery,
  previewAudienceSize,
} from "../pushCampaignLogic";
import { sendPushNotification } from "../pushNotifications";
import { auditAdminAction } from "../auditLogV2";
import { isValidUUID, sanitizeText } from "../sanitizeV2";
import { pushCampaignAdminRateLimiter } from "../middleware/rateLimiter";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("pushCampaignAdmin");

// =============================================================================
// Helpers
// =============================================================================

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// =============================================================================
// Handlers
// =============================================================================

// 1. GET /api/admin/campaigns
async function listCampaigns(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const supabase = getAdminSupabase();
    const statusFilter = typeof req.query.status === "string" && req.query.status.trim()
      ? req.query.status.trim()
      : undefined;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("push_campaigns")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error, count } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ campaigns: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    log.error({ err }, "listCampaigns error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 2. GET /api/admin/campaigns/:id
async function getCampaign(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data: campaign, error } = await supabase
      .from("push_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (error || !campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    // Get deliveries summary
    const { data: deliveries } = await supabase
      .from("push_campaign_deliveries")
      .select("status")
      .eq("campaign_id", campaignId);

    const deliverySummary = {
      total: deliveries?.length ?? 0,
      sent: deliveries?.filter((d: any) => d.status === "sent").length ?? 0,
      delivered: deliveries?.filter((d: any) => d.status === "delivered").length ?? 0,
      opened: deliveries?.filter((d: any) => d.status === "opened").length ?? 0,
      clicked: deliveries?.filter((d: any) => d.status === "clicked").length ?? 0,
      failed: deliveries?.filter((d: any) => d.status === "failed").length ?? 0,
    };

    res.json({ campaign, deliverySummary });
  } catch (err) {
    log.error({ err }, "getCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 3. POST /api/admin/campaigns
async function createCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const body = req.body ?? {};
    // Sanitize text fields
    if (typeof body.title === "string") body.title = sanitizeText(body.title, 60);
    if (typeof body.message === "string") body.message = sanitizeText(body.message, 2000);

    const result = await createCampaign(body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.status(201).json(result);

    void auditAdminAction("admin.campaign.create", {
      targetType: "push_campaign",
      targetId: (result as any).campaignId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "createCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 4. PUT /api/admin/campaigns/:id
async function updateCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const body = req.body ?? {};
    // Sanitize text fields
    if (typeof body.title === "string") body.title = sanitizeText(body.title, 60);
    if (typeof body.message === "string") body.message = sanitizeText(body.message, 2000);

    const result = await updateCampaign(campaignId, body);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "updateCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 4b. DELETE /api/admin/campaigns/:id
async function deleteCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const result = await deleteCampaign(campaignId);

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.campaign.delete", {
      targetType: "push_campaign",
      targetId: campaignId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "deleteCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 5. POST /api/admin/campaigns/:id/schedule
async function scheduleCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const scheduledAt = req.body?.scheduled_at;
    if (!scheduledAt || typeof scheduledAt !== "string") {
      res.status(400).json({ error: "scheduled_at is required" });
      return;
    }

    const result = await scheduleCampaign(campaignId, scheduledAt);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.campaign.create", {
      targetType: "push_campaign",
      targetId: campaignId,
      details: { scheduled_at: scheduledAt },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "scheduleCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 6. POST /api/admin/campaigns/:id/cancel
async function cancelCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const result = await cancelCampaign(campaignId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });

    void auditAdminAction("admin.campaign.cancel", {
      targetType: "push_campaign",
      targetId: campaignId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "cancelCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 7. POST /api/admin/campaigns/:id/send
async function sendCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const result = await sendCampaign(campaignId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true, sent: (result as any).sent });

    void auditAdminAction("admin.campaign.send", {
      targetType: "push_campaign",
      targetId: campaignId,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "sendCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 8. POST /api/admin/push-campaigns/:id/test
async function sendTestCampaignRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    // test_user_id is optional — if not provided, auto-detect a user with push token
    let testUserId: string | undefined = req.body?.test_user_id;

    if (!testUserId || !isValidUUID(testUserId)) {
      // Auto-find any user that has an active FCM token (for test)
      const supabase = getAdminSupabase();
      const { data: tokenRow } = await supabase
        .from("consumer_fcm_tokens")
        .select("user_id, token")
        .eq("active", true)
        .limit(1)
        .single();

      if (tokenRow?.user_id) {
        testUserId = tokenRow.user_id;
      } else if (tokenRow?.token) {
        // Anonymous token (user_id IS NULL) — send directly via FCM
        const { data: campaign } = await supabase
          .from("push_campaigns")
          .select("*")
          .eq("id", campaignId)
          .single();

        if (!campaign) {
          res.status(404).json({ error: "Campagne introuvable" });
          return;
        }

        const pushResult = await sendPushNotification({
          tokens: [tokenRow.token],
          notification: {
            title: `[TEST] ${campaign.title}`,
            body: campaign.message,
            imageUrl: campaign.image_url ?? undefined,
            data: {
              type: "push_campaign",
              campaign_id: campaignId,
              campaign_type: campaign.type,
              cta_url: campaign.cta_url,
            },
          },
        });

        if (!pushResult.ok || (pushResult.successCount ?? 0) === 0) {
          res.status(400).json({ error: "Le push n'a pas pu être envoyé. Vérifiez que le token est valide." });
          return;
        }

        res.json({ ok: true, test_user_id: null, anonymous_token: true });
        return;
      } else {
        res.status(400).json({
          error: "Aucun token push trouvé. Ouvrez sam.ma dans votre navigateur, acceptez les notifications push, puis réessayez.",
        });
        return;
      }
    }

    const result = await sendTestCampaign(campaignId, testUserId!);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true, test_user_id: testUserId });
  } catch (err) {
    log.error({ err }, "sendTestCampaign error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 9. GET /api/admin/campaigns/:id/stats
async function getCampaignStatsRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const result = await getCampaignStats(campaignId);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, "getCampaignStats error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 10. GET /api/admin/campaigns/:id/deliveries
async function listDeliveries(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const campaignId = req.params.id;
    if (!isValidUUID(campaignId)) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;

    const supabase = getAdminSupabase();
    const { data, error, count } = await supabase
      .from("push_campaign_deliveries")
      .select("*", { count: "exact" })
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ deliveries: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    log.error({ err }, "listDeliveries error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 11. POST /api/admin/audience/preview
async function previewAudience(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const { audience_type, audience_filters } = req.body ?? {};
    if (!audience_type || typeof audience_type !== "string") {
      res.status(400).json({ error: "audience_type is required" });
      return;
    }

    const result = await previewAudienceSize(audience_type as "all" | "segment", audience_filters ?? {});

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, "previewAudience error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 12. POST /api/admin/campaigns/deliveries/:deliveryId/track
async function trackDeliveryRoute(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const deliveryId = req.params.deliveryId;
    if (!isValidUUID(deliveryId)) {
      res.status(400).json({ error: "Invalid delivery ID" });
      return;
    }

    const action = req.body?.action;
    if (!action || (action !== "opened" && action !== "clicked")) {
      res.status(400).json({ error: "action must be 'opened' or 'clicked'" });
      return;
    }

    const result = await trackDelivery(deliveryId, action);

    if (!result.ok) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "trackDelivery error");
    res.status(500).json({ error: "internal_error" });
  }
}

// 13. GET /api/admin/push-campaigns/stats — global push stats
async function getGlobalStats(req: Request, res: Response) {
  try {
    if (!requireAdminKey(req, res)) return;

    const supabase = getAdminSupabase();

    // Aggregate stats across all sent campaigns
    const { data: campaigns } = await supabase
      .from("push_campaigns")
      .select("stats_sent, stats_failed, stats_opened, stats_clicked, stats_unsubscribed")
      .eq("status", "sent");

    const rows = (campaigns ?? []) as {
      stats_sent: number | null;
      stats_failed: number | null;
      stats_opened: number | null;
      stats_clicked: number | null;
      stats_unsubscribed: number | null;
    }[];

    const total_sent = rows.reduce((s, r) => s + (r.stats_sent ?? 0), 0);
    const total_delivered = total_sent; // FCM doesn't differentiate sent vs delivered
    const total_opened = rows.reduce((s, r) => s + (r.stats_opened ?? 0), 0);
    const total_clicked = rows.reduce((s, r) => s + (r.stats_clicked ?? 0), 0);
    const unsubscribe_count = rows.reduce((s, r) => s + (r.stats_unsubscribed ?? 0), 0);

    res.json({
      stats: {
        total_sent,
        total_delivered,
        delivery_rate: total_sent > 0 ? 100 : 0,
        open_rate: total_sent > 0 ? Math.round((total_opened / total_sent) * 100) : 0,
        click_rate: total_sent > 0 ? Math.round((total_clicked / total_sent) * 100) : 0,
        unsubscribe_count,
      },
    });
  } catch (err) {
    log.error({ err }, "getGlobalStats error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerPushCampaignAdminRoutes(app: Router): void {
  const P = "/api/admin/push-campaigns";

  // Static paths FIRST (before /:id to avoid matching "stats" as an id)
  app.get(P, zQuery(ListCampaignsQuery), pushCampaignAdminRateLimiter, listCampaigns);
  app.post(P, pushCampaignAdminRateLimiter, zBody(CreateCampaignSchema), createCampaignRoute);
  app.get(`${P}/stats`, pushCampaignAdminRateLimiter, getGlobalStats);
  app.post(`${P}/preview-audience`, pushCampaignAdminRateLimiter, zBody(PreviewAudienceSchema), previewAudience);
  app.post(`${P}/deliveries/:deliveryId/track`, zParams(DeliveryIdParams), pushCampaignAdminRateLimiter, zBody(TrackDeliverySchema), trackDeliveryRoute);

  // Dynamic /:id paths
  app.get(`${P}/:id`, zParams(zIdParam), pushCampaignAdminRateLimiter, getCampaign);
  app.put(`${P}/:id`, zParams(zIdParam), pushCampaignAdminRateLimiter, zBody(UpdateCampaignSchema), updateCampaignRoute);
  app.delete(`${P}/:id`, zParams(zIdParam), pushCampaignAdminRateLimiter, deleteCampaignRoute);
  app.post(`${P}/:id/schedule`, zParams(zIdParam), pushCampaignAdminRateLimiter, zBody(ScheduleCampaignSchema), scheduleCampaignRoute);
  app.post(`${P}/:id/cancel`, zParams(zIdParam), pushCampaignAdminRateLimiter, cancelCampaignRoute);
  app.post(`${P}/:id/send`, zParams(zIdParam), pushCampaignAdminRateLimiter, sendCampaignRoute);
  app.post(`${P}/:id/test`, zParams(zIdParam), pushCampaignAdminRateLimiter, sendTestCampaignRoute);
  app.get(`${P}/:id/stats`, zParams(zIdParam), pushCampaignAdminRateLimiter, getCampaignStatsRoute);
  app.get(`${P}/:id/deliveries`, zParams(zIdParam), zQuery(ListDeliveriesQuery), pushCampaignAdminRateLimiter, listDeliveries);

  // Backward-compat aliases (old paths)
  app.get("/api/admin/campaigns", zQuery(ListCampaignsQuery), pushCampaignAdminRateLimiter, listCampaigns);
  app.get("/api/admin/campaigns/:id", zParams(zIdParam), pushCampaignAdminRateLimiter, getCampaign);
  app.post("/api/admin/campaigns/:id/test", zParams(zIdParam), pushCampaignAdminRateLimiter, sendTestCampaignRoute);
  app.post("/api/admin/audience/preview", pushCampaignAdminRateLimiter, zBody(PreviewAudienceSchema), previewAudience);
}
