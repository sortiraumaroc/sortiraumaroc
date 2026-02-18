/**
 * Push Campaign Logic — CRUD, scheduling, sending, tracking
 *
 * Used by admin dashboard to manage push marketing campaigns.
 * Integrates with:
 *   - audienceSegmentService for audience resolution
 *   - pushCampaignSender for batch FCM delivery
 *   - notificationEngine for logging
 *
 * Rules:
 *   - Quiet hours: 21h–9h GMT+1 (Morocco) — no push sending
 *   - Max 1 push marketing / day / user
 *   - Channels: push, in_app, email (combinable)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { countAudienceSize, getAudienceUserIds } from "./audienceSegmentService";
import { sendCampaignBatch } from "./pushCampaignSender";
import { emitAdminNotification } from "./adminNotifications";
import type {
  PushCampaign,
  PushCampaignStatus,
  PushCampaignType,
  PushCampaignPriority,
  AudienceFilters,
} from "../shared/notificationsBannersWheelTypes";
import { LIMITS } from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types
// =============================================================================

export interface CreateCampaignInput {
  title: string;
  message: string;
  type: PushCampaignType;
  image_url?: string;
  cta_url: string;
  channels: string[];
  audience_type: "all" | "segment";
  audience_filters?: AudienceFilters;
  priority?: PushCampaignPriority;
  created_by?: string;
}

export interface UpdateCampaignInput {
  title?: string;
  message?: string;
  type?: PushCampaignType;
  image_url?: string | null;
  cta_url?: string;
  channels?: string[];
  audience_type?: "all" | "segment";
  audience_filters?: AudienceFilters;
  priority?: PushCampaignPriority;
}

export interface CampaignSendResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create a new push campaign (draft status).
 */
export async function createCampaign(input: CreateCampaignInput): Promise<{ ok: boolean; campaign?: PushCampaign; error?: string }> {
  const supabase = getAdminSupabase();

  // Validate title length
  if (!input.title || input.title.length > LIMITS.CAMPAIGN_TITLE_MAX) {
    return { ok: false, error: `Le titre doit faire entre 1 et ${LIMITS.CAMPAIGN_TITLE_MAX} caractères` };
  }

  // Validate message
  if (!input.message || input.message.length > LIMITS.CAMPAIGN_MESSAGE_MAX_PUSH) {
    return { ok: false, error: `Le message doit faire entre 1 et ${LIMITS.CAMPAIGN_MESSAGE_MAX_PUSH} caractères` };
  }

  // Validate CTA URL
  if (!input.cta_url) {
    return { ok: false, error: "L'URL CTA est obligatoire" };
  }

  // Validate channels
  const validChannels = ["push", "in_app", "email"];
  if (!input.channels || input.channels.length === 0) {
    return { ok: false, error: "Au moins un canal est requis" };
  }
  for (const ch of input.channels) {
    if (!validChannels.includes(ch)) {
      return { ok: false, error: `Canal invalide : ${ch}` };
    }
  }

  // Count audience size (snapshot)
  const filters: AudienceFilters = input.audience_type === "segment" && input.audience_filters
    ? input.audience_filters
    : {};
  const audienceCount = await countAudienceSize(filters, { requirePushMarketing: true });

  const { data, error } = await supabase
    .from("push_campaigns")
    .insert({
      title: input.title,
      message: input.message,
      type: input.type,
      image_url: input.image_url ?? null,
      cta_url: input.cta_url,
      channels: input.channels,
      audience_type: input.audience_type,
      audience_filters: input.audience_type === "segment" ? (input.audience_filters ?? {}) : {},
      audience_count: audienceCount,
      priority: input.priority ?? "normal",
      status: "draft" as PushCampaignStatus,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[PushCampaign] createCampaign error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, campaign: data as PushCampaign };
}

/**
 * Update a draft campaign.
 */
export async function updateCampaign(
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<{ ok: boolean; campaign?: PushCampaign; error?: string }> {
  const supabase = getAdminSupabase();

  // Only drafts can be updated
  const { data: existing, error: fetchErr } = await supabase
    .from("push_campaigns")
    .select("status")
    .eq("id", campaignId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Campagne introuvable" };
  if (existing.status !== "draft") return { ok: false, error: "Seules les campagnes brouillon peuvent être modifiées" };

  // Validate if provided
  if (input.title !== undefined && (input.title.length === 0 || input.title.length > LIMITS.CAMPAIGN_TITLE_MAX)) {
    return { ok: false, error: `Le titre doit faire entre 1 et ${LIMITS.CAMPAIGN_TITLE_MAX} caractères` };
  }
  if (input.message !== undefined && (input.message.length === 0 || input.message.length > LIMITS.CAMPAIGN_MESSAGE_MAX_PUSH)) {
    return { ok: false, error: `Le message doit faire entre 1 et ${LIMITS.CAMPAIGN_MESSAGE_MAX_PUSH} caractères` };
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  if (input.title !== undefined) updatePayload.title = input.title;
  if (input.message !== undefined) updatePayload.message = input.message;
  if (input.type !== undefined) updatePayload.type = input.type;
  if (input.image_url !== undefined) updatePayload.image_url = input.image_url;
  if (input.cta_url !== undefined) updatePayload.cta_url = input.cta_url;
  if (input.channels !== undefined) updatePayload.channels = input.channels;
  if (input.audience_type !== undefined) updatePayload.audience_type = input.audience_type;
  if (input.audience_filters !== undefined) updatePayload.audience_filters = input.audience_filters;
  if (input.priority !== undefined) updatePayload.priority = input.priority;
  updatePayload.updated_at = new Date().toISOString();

  // Re-count audience if filters changed
  if (input.audience_type !== undefined || input.audience_filters !== undefined) {
    const filters = (input.audience_type === "segment" || input.audience_type === undefined)
      ? (input.audience_filters ?? {})
      : {};
    updatePayload.audience_count = await countAudienceSize(filters, { requirePushMarketing: true });
  }

  const { data, error } = await supabase
    .from("push_campaigns")
    .update(updatePayload)
    .eq("id", campaignId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, campaign: data as PushCampaign };
}

/**
 * Schedule a campaign for future sending.
 * Validates quiet hours (9h-21h GMT+1).
 */
export async function scheduleCampaign(
  campaignId: string,
  scheduledAt: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("push_campaigns")
    .select("status")
    .eq("id", campaignId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Campagne introuvable" };
  if (existing.status !== "draft") return { ok: false, error: "Seules les campagnes brouillon peuvent être programmées" };

  // Validate scheduled time
  const schedDate = new Date(scheduledAt);
  if (isNaN(schedDate.getTime())) return { ok: false, error: "Date de programmation invalide" };
  if (schedDate.getTime() < Date.now()) return { ok: false, error: "La date doit être dans le futur" };

  // Enforce quiet hours — adjust if needed
  const adjusted = enforceQuietHours(schedDate);

  const { error } = await supabase
    .from("push_campaigns")
    .update({
      status: "scheduled" as PushCampaignStatus,
      scheduled_at: adjusted.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cancel a scheduled or draft campaign.
 */
export async function cancelCampaign(campaignId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("push_campaigns")
    .select("status")
    .eq("id", campaignId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Campagne introuvable" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, error: "Seules les campagnes brouillon ou programmées peuvent être annulées" };
  }

  const { error } = await supabase
    .from("push_campaigns")
    .update({
      status: "cancelled" as PushCampaignStatus,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// Sending
// =============================================================================

/**
 * Send a campaign now.
 * Flow:
 *   1. Resolve audience → user IDs
 *   2. For each user: verify 1 push/day max
 *   3. Batch-send via selected channels
 *   4. Create push_campaign_deliveries rows
 *   5. Log in notification_logs (campaign_id)
 *   6. Update campaign stats
 */
export async function sendCampaign(campaignId: string): Promise<CampaignSendResult> {
  const supabase = getAdminSupabase();

  // 1. Fetch campaign
  const { data: campaign, error: fetchErr } = await supabase
    .from("push_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (fetchErr || !campaign) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: "Campagne introuvable" };
  }

  const camp = campaign as PushCampaign;

  // Only draft or scheduled can be sent
  if (camp.status !== "draft" && camp.status !== "scheduled") {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: `Statut invalide: ${camp.status}` };
  }

  // Check quiet hours
  if (isInQuietHours(new Date())) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: "Les push ne peuvent pas être envoyés entre 21h et 9h" };
  }

  // 2. Mark as sending
  await supabase
    .from("push_campaigns")
    .update({ status: "sending" as PushCampaignStatus, updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  try {
    // 3. Resolve audience
    const filters: AudienceFilters = camp.audience_type === "segment"
      ? (camp.audience_filters as AudienceFilters)
      : {};
    const userIds = await getAudienceUserIds(filters, { requirePushMarketing: true });

    if (userIds.length === 0) {
      // No users → mark sent with 0
      await supabase
        .from("push_campaigns")
        .update({
          status: "sent" as PushCampaignStatus,
          sent_at: new Date().toISOString(),
          stats_sent: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);

      return { ok: true, sent: 0, failed: 0, skipped: 0 };
    }

    // 4. Filter out users who already received a push marketing today
    const eligibleUserIds = await filterDailyPushLimit(userIds);

    const skipped = userIds.length - eligibleUserIds.length;

    // 5. Send batch
    const result = await sendCampaignBatch(campaignId, eligibleUserIds, camp.channels, {
      title: camp.title,
      message: camp.message,
      image_url: camp.image_url ?? undefined,
      cta_url: camp.cta_url,
      priority: camp.priority,
      campaign_type: camp.type,
    });

    // 6. Update campaign stats + status
    await supabase
      .from("push_campaigns")
      .update({
        status: "sent" as PushCampaignStatus,
        sent_at: new Date().toISOString(),
        stats_sent: result.sent,
        stats_failed: result.failed,
        audience_count: userIds.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    // 7. Notify admin
    void emitAdminNotification({
      type: "push_campaign_sent",
      title: "Campagne envoyée",
      body: `« ${camp.title} » — ${result.sent} envoyé(s), ${result.failed} échec(s), ${skipped} ignoré(s) (limite 1/jour)`,
      data: { campaignId },
    });

    return { ok: true, sent: result.sent, failed: result.failed, skipped };
  } catch (err) {
    // Revert to draft on failure
    console.error("[PushCampaign] sendCampaign error:", err);
    await supabase
      .from("push_campaigns")
      .update({ status: "draft" as PushCampaignStatus, updated_at: new Date().toISOString() })
      .eq("id", campaignId);

    return { ok: false, sent: 0, failed: 0, skipped: 0, error: err instanceof Error ? err.message : "Erreur interne" };
  }
}

/**
 * Send a test campaign to a single admin user (for preview).
 */
export async function sendTestCampaign(
  campaignId: string,
  testUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  const { data: campaign, error: fetchErr } = await supabase
    .from("push_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (fetchErr || !campaign) return { ok: false, error: "Campagne introuvable" };

  const camp = campaign as PushCampaign;

  // Send to single user (bypass daily limit for test)
  const result = await sendCampaignBatch(
    campaignId,
    [testUserId],
    camp.channels,
    {
      title: `[TEST] ${camp.title}`,
      message: camp.message,
      image_url: camp.image_url ?? undefined,
      cta_url: camp.cta_url,
      priority: camp.priority,
      campaign_type: camp.type,
    },
  );

  return { ok: result.sent > 0 || result.failed === 0 };
}

// =============================================================================
// Tracking
// =============================================================================

/**
 * Track delivery action (open/click) for a specific delivery.
 */
export async function trackDelivery(
  deliveryId: string,
  action: "opened" | "clicked",
): Promise<{ ok: boolean }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {};
  if (action === "opened") {
    updatePayload.opened_at = now;
  } else if (action === "clicked") {
    updatePayload.clicked_at = now;
    // Also mark as opened if not already
    updatePayload.opened_at = now;
  }

  const { error } = await supabase
    .from("push_campaign_deliveries")
    .update(updatePayload)
    .eq("id", deliveryId);

  if (error) return { ok: false };

  // Increment campaign stats
  const { data: delivery } = await supabase
    .from("push_campaign_deliveries")
    .select("campaign_id")
    .eq("id", deliveryId)
    .single();

  if (delivery) {
    if (action === "opened") {
      try {
        await supabase.rpc("increment_counter", {
          table_name: "push_campaigns",
          column_name: "stats_opened",
          row_id: delivery.campaign_id,
        });
      } catch {
        // Fallback: direct update (RPC may not exist)
        void incrementCampaignStat(delivery.campaign_id, "stats_opened");
      }
    } else if (action === "clicked") {
      try {
        await supabase.rpc("increment_counter", {
          table_name: "push_campaigns",
          column_name: "stats_clicked",
          row_id: delivery.campaign_id,
        });
      } catch {
        void incrementCampaignStat(delivery.campaign_id, "stats_clicked");
      }
    }
  }

  return { ok: true };
}

/**
 * Track unsubscribe action — user disables push marketing.
 */
export async function trackUnsubscribe(
  campaignId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const supabase = getAdminSupabase();

  // Disable push marketing for user
  await supabase
    .from("consumer_users")
    .update({ push_marketing_enabled: false })
    .eq("id", userId);

  // Also update notification_preferences
  await supabase
    .from("notification_preferences")
    .upsert({
      user_id: userId,
      user_type: "consumer",
      marketing_push: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  // Increment stats
  void incrementCampaignStat(campaignId, "stats_unsubscribed");

  return { ok: true };
}

// =============================================================================
// Scheduled campaigns (cron)
// =============================================================================

/**
 * Process all scheduled campaigns whose time has arrived.
 * Called by cron every 5 minutes.
 */
export async function processScheduledCampaigns(): Promise<{ processed: number; errors: number }> {
  const supabase = getAdminSupabase();
  const now = new Date();

  // Don't process during quiet hours
  if (isInQuietHours(now)) {
    console.log("[PushCampaign] Skipping scheduled campaigns: quiet hours");
    return { processed: 0, errors: 0 };
  }

  // Find campaigns that should be sent now
  const { data: campaigns, error } = await supabase
    .from("push_campaigns")
    .select("id, title")
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10); // Max 10 per run

  if (error || !campaigns) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  for (const camp of campaigns as { id: string; title: string }[]) {
    console.log(`[PushCampaign] Processing scheduled campaign: ${camp.id} "${camp.title}"`);
    const result = await sendCampaign(camp.id);
    if (result.ok) {
      processed++;
    } else {
      errors++;
      console.error(`[PushCampaign] Failed to send scheduled campaign ${camp.id}:`, result.error);
    }
  }

  return { processed, errors };
}

// =============================================================================
// Campaign Stats
// =============================================================================

/**
 * Get detailed stats for a campaign.
 */
export async function getCampaignStats(campaignId: string): Promise<{
  ok: boolean;
  campaign?: PushCampaign;
  deliveries_summary?: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
  };
  error?: string;
}> {
  const supabase = getAdminSupabase();

  const { data: campaign, error: campErr } = await supabase
    .from("push_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) return { ok: false, error: "Campagne introuvable" };

  // Count deliveries by status
  const { data: deliveries } = await supabase
    .from("push_campaign_deliveries")
    .select("status, opened_at, clicked_at")
    .eq("campaign_id", campaignId);

  const rows = (deliveries ?? []) as { status: string; opened_at: string | null; clicked_at: string | null }[];

  return {
    ok: true,
    campaign: campaign as PushCampaign,
    deliveries_summary: {
      total: rows.length,
      sent: rows.filter((d) => d.status === "sent" || d.status === "delivered").length,
      delivered: rows.filter((d) => d.status === "delivered").length,
      failed: rows.filter((d) => d.status === "failed").length,
      opened: rows.filter((d) => d.opened_at != null).length,
      clicked: rows.filter((d) => d.clicked_at != null).length,
    },
  };
}

/**
 * Preview audience size for given filters (real-time).
 */
export async function previewAudienceSize(
  audienceType: "all" | "segment",
  filters?: AudienceFilters,
): Promise<{ ok: boolean; count: number }> {
  const f = audienceType === "segment" && filters ? filters : {};
  const count = await countAudienceSize(f, { requirePushMarketing: true });
  return { ok: true, count };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Enforce quiet hours: if scheduled_at falls in 21h-9h GMT+1, shift to 9h00.
 */
export function enforceQuietHours(date: Date): Date {
  // Morocco is GMT+1
  const moroccoOffset = 1;
  const moroccoHour = (date.getUTCHours() + moroccoOffset) % 24;

  if (moroccoHour >= LIMITS.PUSH_QUIET_HOUR_START || moroccoHour < LIMITS.PUSH_QUIET_HOUR_END) {
    // In quiet hours — shift to next 9h00 Morocco time (8h00 UTC)
    const adjusted = new Date(date);
    adjusted.setUTCHours(LIMITS.PUSH_QUIET_HOUR_END - moroccoOffset, 0, 0, 0);

    // If we're past 21h, move to next day
    if (moroccoHour >= LIMITS.PUSH_QUIET_HOUR_START) {
      adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    }

    return adjusted;
  }

  return date;
}

/**
 * Check if current time is in quiet hours (21h-9h Morocco time).
 */
function isInQuietHours(date: Date): boolean {
  const moroccoOffset = 1;
  const moroccoHour = (date.getUTCHours() + moroccoOffset) % 24;
  return moroccoHour >= LIMITS.PUSH_QUIET_HOUR_START || moroccoHour < LIMITS.PUSH_QUIET_HOUR_END;
}

/**
 * Filter out users who already received a push marketing today.
 * Enforces max 1 push marketing per day per user.
 */
async function filterDailyPushLimit(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const supabase = getAdminSupabase();

  // Get today's start in UTC
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Find users who already received a push campaign delivery today
  const batchSize = 1000;
  const alreadyReceived = new Set<string>();

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    const { data } = await supabase
      .from("push_campaign_deliveries")
      .select("user_id")
      .in("user_id", batch)
      .eq("channel", "push")
      .in("status", ["sent", "delivered"])
      .gte("sent_at", todayStart.toISOString());

    if (data) {
      for (const row of data as { user_id: string }[]) {
        alreadyReceived.add(row.user_id);
      }
    }
  }

  return userIds.filter((id) => !alreadyReceived.has(id));
}

/**
 * Increment a campaign stat column (fallback if RPC doesn't exist).
 */
async function incrementCampaignStat(
  campaignId: string,
  column: "stats_opened" | "stats_clicked" | "stats_unsubscribed",
): Promise<void> {
  const supabase = getAdminSupabase();

  // Read current value
  const { data } = await supabase
    .from("push_campaigns")
    .select(column)
    .eq("id", campaignId)
    .single();

  if (!data) return;

  const currentVal = typeof (data as Record<string, unknown>)[column] === "number"
    ? (data as Record<string, unknown>)[column] as number
    : 0;

  await supabase
    .from("push_campaigns")
    .update({ [column]: currentVal + 1 })
    .eq("id", campaignId);
}
