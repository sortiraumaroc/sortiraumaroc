/**
 * Push Campaign Sender — Batch delivery via FCM, Email, In-App
 *
 * Handles the actual sending of push campaign messages to batches of users.
 * Supports 3 channels: push (FCM), in_app, email.
 *
 * - FCM: batches of 500 tokens max per call
 * - In-app: consumer_notifications insert
 * - Email: via sendTemplateEmail (marketing template)
 *
 * Creates push_campaign_deliveries rows + notification_logs entries.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { sendPushNotification } from "./pushNotifications";
import { sendTemplateEmail } from "./emailService";
import { emitConsumerUserEvent } from "./consumerNotifications";
import type { PushCampaignPriority, PushCampaignType } from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types
// =============================================================================

export interface CampaignPayload {
  title: string;
  message: string;
  image_url?: string;
  cta_url: string;
  priority: PushCampaignPriority;
  campaign_type: PushCampaignType;
}

export interface BatchResult {
  sent: number;
  failed: number;
}

// =============================================================================
// Main sender
// =============================================================================

/**
 * Send a campaign to a batch of users across selected channels.
 *
 * For each user × channel:
 *   1. Create a `push_campaign_deliveries` row (status=pending)
 *   2. Send via the appropriate provider
 *   3. Update delivery status (sent/failed)
 *   4. Log in notification_logs
 */
export async function sendCampaignBatch(
  campaignId: string,
  userIds: string[],
  channels: string[],
  payload: CampaignPayload,
): Promise<BatchResult> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  let totalSent = 0;
  let totalFailed = 0;

  // Process each channel
  for (const channel of channels) {
    switch (channel) {
      case "push": {
        const result = await sendViaPush(campaignId, userIds, payload);
        totalSent += result.sent;
        totalFailed += result.failed;
        break;
      }
      case "in_app": {
        const result = await sendViaInApp(campaignId, userIds, payload);
        totalSent += result.sent;
        totalFailed += result.failed;
        break;
      }
      case "email": {
        const result = await sendViaEmail(campaignId, userIds, payload);
        totalSent += result.sent;
        totalFailed += result.failed;
        break;
      }
      default:
        console.warn(`[CampaignSender] Unknown channel: ${channel}`);
    }
  }

  return { sent: totalSent, failed: totalFailed };
}

// =============================================================================
// Channel: Push (FCM)
// =============================================================================

async function sendViaPush(
  campaignId: string,
  userIds: string[],
  payload: CampaignPayload,
): Promise<BatchResult> {
  const supabase = getAdminSupabase();
  let sent = 0;
  let failed = 0;

  // Fetch all FCM tokens for these users
  const tokenBatchSize = 5000;
  const userTokenMap = new Map<string, string[]>();

  for (let i = 0; i < userIds.length; i += tokenBatchSize) {
    const batch = userIds.slice(i, i + tokenBatchSize);

    const { data: tokenRows } = await supabase
      .from("consumer_fcm_tokens")
      .select("user_id, token")
      .in("user_id", batch)
      .eq("active", true);

    if (tokenRows) {
      for (const row of tokenRows as { user_id: string; token: string }[]) {
        if (!userTokenMap.has(row.user_id)) {
          userTokenMap.set(row.user_id, []);
        }
        userTokenMap.get(row.user_id)!.push(row.token);
      }
    }
  }

  // Collect all tokens grouped for batch sending (max 500 per FCM call)
  const allTokenEntries: { userId: string; token: string }[] = [];
  for (const [userId, tokens] of userTokenMap) {
    for (const token of tokens) {
      allTokenEntries.push({ userId, token });
    }
  }

  // Send in batches of 500 tokens
  const fcmBatchSize = 500;

  for (let i = 0; i < allTokenEntries.length; i += fcmBatchSize) {
    const batch = allTokenEntries.slice(i, i + fcmBatchSize);
    const tokens = batch.map((e) => e.token);

    const result = await sendPushNotification({
      tokens,
      notification: {
        title: payload.title,
        body: payload.message,
        imageUrl: payload.image_url,
        data: {
          type: "push_campaign",
          campaign_id: campaignId,
          campaign_type: payload.campaign_type,
          cta_url: payload.cta_url,
        },
      },
    });

    if (result.ok) {
      sent += result.successCount ?? 0;
      failed += result.failureCount ?? 0;
    } else {
      failed += batch.length;
    }
  }

  // Users without tokens → count as failed
  const usersWithoutTokens = userIds.filter((id) => !userTokenMap.has(id));
  failed += usersWithoutTokens.length;

  // Create delivery rows (batch insert)
  const now = new Date().toISOString();
  const deliveryRows = userIds.map((userId) => ({
    campaign_id: campaignId,
    user_id: userId,
    channel: "push",
    status: userTokenMap.has(userId) ? "sent" : "failed",
    sent_at: userTokenMap.has(userId) ? now : null,
    error_message: userTokenMap.has(userId) ? null : "no_fcm_tokens",
  }));

  // Insert in batches (Supabase has row limits)
  const insertBatchSize = 500;
  for (let i = 0; i < deliveryRows.length; i += insertBatchSize) {
    const batch = deliveryRows.slice(i, i + insertBatchSize);
    const { error: insErr } = await supabase.from("push_campaign_deliveries").insert(batch);
    if (insErr) console.error("[CampaignSender] Delivery insert error:", insErr.message);
  }

  // Log in notification_logs (batch)
  const logRows = userIds.slice(0, 1000).map((userId) => ({
    event_type: "marketing.push_campaign",
    channel: "push",
    recipient_id: userId,
    recipient_type: "consumer",
    subject: payload.title,
    body_preview: payload.message.substring(0, 200),
    status: userTokenMap.has(userId) ? "sent" : "failed",
    campaign_id: campaignId,
    created_at: now,
    sent_at: userTokenMap.has(userId) ? now : null,
  }));

  for (let i = 0; i < logRows.length; i += insertBatchSize) {
    const batch = logRows.slice(i, i + insertBatchSize);
    const { error: logErr } = await supabase.from("notification_logs").insert(batch);
    if (logErr) console.error("[CampaignSender] Notification log insert error:", logErr.message);
  }

  return { sent, failed };
}

// =============================================================================
// Channel: In-App
// =============================================================================

async function sendViaInApp(
  campaignId: string,
  userIds: string[],
  payload: CampaignPayload,
): Promise<BatchResult> {
  const supabase = getAdminSupabase();
  let sent = 0;
  let failed = 0;
  const now = new Date().toISOString();

  // Send in-app notifications (best-effort, batch)
  for (const userId of userIds) {
    try {
      await emitConsumerUserEvent({
        supabase,
        userId,
        eventType: "push_campaign",
        metadata: {
          campaign_id: campaignId,
          title: payload.title,
          message: payload.message,
          image_url: payload.image_url ?? null,
          cta_url: payload.cta_url,
          campaign_type: payload.campaign_type,
        },
      });
      sent++;
    } catch {
      failed++;
    }
  }

  // Create delivery rows
  const deliveryRows = userIds.map((userId) => ({
    campaign_id: campaignId,
    user_id: userId,
    channel: "in_app",
    status: "sent",
    sent_at: now,
  }));

  const insertBatchSize = 500;
  for (let i = 0; i < deliveryRows.length; i += insertBatchSize) {
    const batch = deliveryRows.slice(i, i + insertBatchSize);
    const { error: insErr } = await supabase.from("push_campaign_deliveries").insert(batch);
    if (insErr) console.error("[CampaignSender] In-app delivery insert error:", insErr.message);
  }

  return { sent, failed };
}

// =============================================================================
// Channel: Email
// =============================================================================

async function sendViaEmail(
  campaignId: string,
  userIds: string[],
  payload: CampaignPayload,
): Promise<BatchResult> {
  const supabase = getAdminSupabase();
  let sent = 0;
  let failed = 0;
  const now = new Date().toISOString();

  // Fetch user emails in batches
  const emailMap = new Map<string, string>();
  const batchSize = 1000;

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    const { data } = await supabase
      .from("consumer_users")
      .select("id, email")
      .in("id", batch);

    if (data) {
      for (const row of data as { id: string; email: string }[]) {
        if (row.email) emailMap.set(row.id, row.email);
      }
    }
  }

  // Send emails in controlled batches (avoid overwhelming SES)
  const emailBatchSize = 50; // 50 emails per batch to stay within SES limits
  const usersWithEmail = userIds.filter((id) => emailMap.has(id));

  for (let i = 0; i < usersWithEmail.length; i += emailBatchSize) {
    const batch = usersWithEmail.slice(i, i + emailBatchSize);

    const promises = batch.map(async (userId) => {
      const email = emailMap.get(userId)!;
      try {
        const result = await sendTemplateEmail({
          templateKey: "push_campaign_email",
          lang: "fr",
          fromKey: "noreply",
          to: [email],
          variables: {
            title: payload.title,
            message: payload.message,
            image_url: payload.image_url ?? "",
            cta_url: payload.cta_url,
            campaign_type: payload.campaign_type,
          },
        });

        if (result.ok) {
          sent++;
          return { userId, status: "sent" as const, messageId: result.messageId };
        } else {
          failed++;
          const errorMsg = result.ok === false ? result.error : "unknown_email_error";
          return { userId, status: "failed" as const, error: errorMsg };
        }
      } catch {
        failed++;
        return { userId, status: "failed" as const, error: "email_exception" };
      }
    });

    await Promise.all(promises);

    // Small delay between batches to avoid rate limiting
    if (i + emailBatchSize < usersWithEmail.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Users without email
  const usersWithoutEmail = userIds.filter((id) => !emailMap.has(id));
  failed += usersWithoutEmail.length;

  // Create delivery rows
  const deliveryRows = userIds.map((userId) => ({
    campaign_id: campaignId,
    user_id: userId,
    channel: "email",
    status: emailMap.has(userId) ? "sent" : "failed",
    sent_at: emailMap.has(userId) ? now : null,
    error_message: emailMap.has(userId) ? null : "no_email",
  }));

  const insertBatchSize = 500;
  for (let i = 0; i < deliveryRows.length; i += insertBatchSize) {
    const batch = deliveryRows.slice(i, i + insertBatchSize);
    const { error: insErr } = await supabase.from("push_campaign_deliveries").insert(batch);
    if (insErr) console.error("[CampaignSender] Email delivery insert error:", insErr.message);
  }

  // Log in notification_logs
  const logRows = usersWithEmail.slice(0, 1000).map((userId) => ({
    event_type: "marketing.push_campaign",
    channel: "email",
    recipient_id: userId,
    recipient_type: "consumer",
    subject: payload.title,
    body_preview: payload.message.substring(0, 200),
    status: "sent",
    campaign_id: campaignId,
    created_at: now,
    sent_at: now,
  }));

  for (let i = 0; i < logRows.length; i += insertBatchSize) {
    const batch = logRows.slice(i, i + insertBatchSize);
    const { error: logErr } = await supabase.from("notification_logs").insert(batch);
    if (logErr) console.error("[CampaignSender] Email log insert error:", logErr.message);
  }

  return { sent, failed };
}
