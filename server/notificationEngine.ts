/**
 * Notification Engine — Centralized notification dispatch for sam.ma
 *
 * All modules (Reservation, Loyalty, Packs, Reviews, Account, Marketing, Wheel)
 * call this engine to send notifications. The engine:
 *   1. Resolves the template (event_type × channel × lang)
 *   2. Checks user preferences (skip if disabled, unless critical)
 *   3. Interpolates variables into subject/body
 *   4. Dispatches to the appropriate provider (email, SMS, push, in-app)
 *   5. Logs everything to notification_logs
 *
 * Existing services are WRAPPED, not replaced:
 *   - Email   → sendTemplateEmail() from emailService.ts
 *   - SMS     → sendTransactionalSms() from smsService.ts
 *   - Push    → sendPushToConsumerUser() / sendPushToProUser() from pushNotifications.ts
 *   - In-app  → emitConsumerUserEvent() / notifyProMembers() / emitAdminNotification()
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { sendTemplateEmail } from "./emailService";
import { sendTransactionalSms } from "./smsService";
import { sendPushToConsumerUser, sendPushToProUser } from "./pushNotifications";
import { emitConsumerUserEvent } from "./consumerNotifications";
import { notifyProMembers } from "./proNotifications";
import { emitAdminNotification } from "./adminNotifications";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("notificationEngine");
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationResult,
  NotificationStatus,
  RecipientType,
  NotificationPreferences,
} from "../shared/notificationsBannersWheelTypes";
import {
  CRITICAL_EVENT_TYPES,
  NOTIFICATION_PREFERENCE_MAP,
} from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types internes
// =============================================================================

interface TemplateRow {
  id: string;
  event_type: string;
  channel: NotificationChannel;
  lang: string;
  subject: string | null;
  body: string;
  cta_url: string | null;
  cta_label: string | null;
  is_critical: boolean;
  module: string;
}

interface DispatchContext {
  event: NotificationEvent;
  channel: NotificationChannel;
  template: TemplateRow | null;
  subject: string;
  body: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientLang: string;
  establishmentId?: string;
}

// =============================================================================
// Template cache (5 min TTL)
// =============================================================================

const templateCache = new Map<string, { row: TemplateRow | null; ts: number }>();
const TEMPLATE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function templateCacheKey(eventType: string, channel: string, lang: string): string {
  return `${eventType}:${channel}:${lang}`;
}

async function resolveTemplate(
  eventType: string,
  channel: NotificationChannel,
  lang: string,
): Promise<TemplateRow | null> {
  const key = templateCacheKey(eventType, channel, lang);
  const cached = templateCache.get(key);
  if (cached && Date.now() - cached.ts < TEMPLATE_CACHE_TTL) {
    return cached.row;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("notification_templates")
    .select("id, event_type, channel, lang, subject, body, cta_url, cta_label, is_critical, module")
    .eq("event_type", eventType)
    .eq("channel", channel)
    .eq("lang", lang)
    .eq("enabled", true)
    .maybeSingle();

  const row = error || !data ? null : (data as TemplateRow);
  templateCache.set(key, { row, ts: Date.now() });

  // Fallback: try 'fr' if requested lang not found
  if (!row && lang !== "fr") {
    return resolveTemplate(eventType, channel, "fr");
  }

  return row;
}

// =============================================================================
// Interpolation
// =============================================================================

function interpolate(
  text: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const val = variables[varName];
    return val != null ? String(val) : "";
  });
}

// =============================================================================
// Preference check
// =============================================================================

async function getUserPreferencesFromDb(userId: string): Promise<NotificationPreferences | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as NotificationPreferences;
}

function isChannelAllowed(
  prefs: NotificationPreferences | null,
  eventType: string,
  channel: NotificationChannel,
  isCritical: boolean,
): boolean {
  // Critical notifications are always allowed
  if (isCritical || CRITICAL_EVENT_TYPES.includes(eventType)) {
    return true;
  }

  // No preferences row = all defaults (all enabled)
  if (!prefs) return true;

  // Channel-level checks
  if (channel === "email" && !prefs.email_transactional) return false;
  if (channel === "sms" && !prefs.sms_enabled) return false;
  if (channel === "push" && !prefs.push_enabled) return false;

  // Category-level checks
  const prefKey = NOTIFICATION_PREFERENCE_MAP[eventType];
  if (prefKey) {
    const prefValue = prefs[prefKey];
    if (typeof prefValue === "boolean") {
      return prefValue;
    }
  }

  return true;
}

// =============================================================================
// Recipient info resolution
// =============================================================================

interface RecipientInfo {
  email?: string;
  phone?: string;
  lang: string;
  establishmentId?: string;
}

async function resolveRecipientInfo(
  recipientId: string,
  recipientType: RecipientType,
): Promise<RecipientInfo> {
  const supabase = getAdminSupabase();
  const info: RecipientInfo = { lang: "fr" };

  if (recipientType === "consumer") {
    // Get email + phone from auth.users
    try {
      const { data } = await supabase.auth.admin.getUserById(recipientId);
      if (data?.user) {
        info.email = data.user.email ?? undefined;
        info.phone = data.user.phone ?? undefined;
        const meta = data.user.user_metadata as Record<string, unknown> | undefined;
        if (meta?.lang && typeof meta.lang === "string") {
          info.lang = meta.lang;
        }
      }
    } catch (err) {
      log.warn({ err, recipientId }, "Failed to resolve consumer recipient info");
    }
  } else if (recipientType === "pro") {
    try {
      const { data } = await supabase.auth.admin.getUserById(recipientId);
      if (data?.user) {
        info.email = data.user.email ?? undefined;
        info.phone = data.user.phone ?? undefined;
      }
    } catch (err) {
      log.warn({ err, recipientId }, "Failed to resolve pro recipient info");
    }
  }

  return info;
}

// =============================================================================
// Logging
// =============================================================================

async function logNotification(args: {
  eventType: string;
  channel: NotificationChannel;
  recipientId: string;
  recipientType: RecipientType;
  templateId?: string;
  subject?: string;
  bodyPreview?: string;
  status: NotificationStatus;
  providerMessageId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  campaignId?: string;
}): Promise<string | null> {
  const supabase = getAdminSupabase();
  try {
    const { data, error } = await supabase
      .from("notification_logs")
      .insert({
        event_type: args.eventType,
        channel: args.channel,
        recipient_id: args.recipientId,
        recipient_type: args.recipientType,
        template_id: args.templateId ?? null,
        subject: args.subject ?? null,
        body_preview: args.bodyPreview ? args.bodyPreview.slice(0, 200) : null,
        status: args.status,
        provider_message_id: args.providerMessageId ?? null,
        error_message: args.errorMessage ?? null,
        metadata: args.metadata ?? {},
        campaign_id: args.campaignId ?? null,
        sent_at: args.status === "sent" || args.status === "delivered" ? new Date().toISOString() : null,
      })
      .select("id")
      .maybeSingle();

    return error ? null : (data?.id ?? null);
  } catch (err) {
    log.warn({ err, eventType: args.eventType, channel: args.channel }, "Failed to log notification");
    return null;
  }
}

async function updateLogStatus(
  logId: string,
  status: NotificationStatus,
  providerMessageId?: string,
  errorMessage?: string,
): Promise<void> {
  const supabase = getAdminSupabase();
  const update: Record<string, unknown> = { status };
  if (providerMessageId) update.provider_message_id = providerMessageId;
  if (errorMessage) update.error_message = errorMessage;
  if (status === "sent") update.sent_at = new Date().toISOString();
  if (status === "delivered") update.delivered_at = new Date().toISOString();

  try {
    await supabase.from("notification_logs").update(update).eq("id", logId);
  } catch (err) {
    log.warn({ err, logId, status }, "Failed to update notification log status");
  }
}

// =============================================================================
// Channel dispatchers
// =============================================================================

async function dispatchEmail(ctx: DispatchContext): Promise<NotificationResult> {
  if (!ctx.recipientEmail) {
    return { ok: false, channel: "email", error: "no_email_address" };
  }

  // Try email_templates first (existing template system), fallback to interpolated body
  const templateKey = ctx.event.event_type.replace(/\./g, "_");
  const lang = (ctx.recipientLang === "en" ? "en" : "fr") as "fr" | "en";

  const result = await sendTemplateEmail({
    templateKey,
    lang,
    fromKey: "noreply",
    to: [ctx.recipientEmail],
    variables: ctx.event.data as Record<string, string | number | null | undefined>,
    meta: {
      source: "notificationEngine",
      event_type: ctx.event.event_type,
    },
  });

  if (result.ok) {
    return {
      ok: true,
      channel: "email",
      provider_message_id: result.messageId,
    };
  }

  // Discriminated union: access error only when ok === false
  const errorMsg = result.ok === false ? result.error : "unknown_email_error";

  // Fallback: if template not found in email_templates, send with interpolated content
  if (errorMsg.includes("Template not found") && ctx.template) {
    // The notification_templates table has content — we could send it directly
    // For now, log as failed with "no_email_template" to be handled later
    return { ok: false, channel: "email", error: "no_email_template_fallback" };
  }

  return { ok: false, channel: "email", error: errorMsg };
}

async function dispatchSms(ctx: DispatchContext): Promise<NotificationResult> {
  if (!ctx.recipientPhone) {
    return { ok: false, channel: "sms", error: "no_phone_number" };
  }

  const result = await sendTransactionalSms(ctx.recipientPhone, ctx.body);

  return {
    ok: result.ok,
    channel: "sms",
    provider_message_id: result.messageSid,
    error: result.error,
  };
}

async function dispatchPush(ctx: DispatchContext): Promise<NotificationResult> {
  const recipientType = ctx.event.recipient_type;
  const data: Record<string, string> = {
    event_type: ctx.event.event_type,
  };
  // Convert event data to string values for FCM
  for (const [k, v] of Object.entries(ctx.event.data)) {
    if (v != null) data[k] = String(v);
  }

  if (recipientType === "consumer") {
    const result = await sendPushToConsumerUser({
      userId: ctx.event.recipient_id,
      title: ctx.subject,
      body: ctx.body,
      data,
    });
    return {
      ok: result.ok,
      channel: "push",
      error: result.errors?.join(", "),
    };
  }

  if (recipientType === "pro") {
    const result = await sendPushToProUser({
      userId: ctx.event.recipient_id,
      title: ctx.subject,
      body: ctx.body,
      data,
    });
    return {
      ok: result.ok,
      channel: "push",
      error: result.errors?.join(", "),
    };
  }

  return { ok: false, channel: "push", error: "unsupported_recipient_type_for_push" };
}

async function dispatchInApp(ctx: DispatchContext): Promise<NotificationResult> {
  const supabase = getAdminSupabase();
  const recipientType = ctx.event.recipient_type;

  if (recipientType === "consumer") {
    await emitConsumerUserEvent({
      supabase,
      userId: ctx.event.recipient_id,
      eventType: ctx.event.event_type,
      metadata: {
        title: ctx.subject,
        body: ctx.body,
        cta_url: ctx.template?.cta_url ?? null,
        ...ctx.event.data,
      },
    });
    return { ok: true, channel: "in_app" };
  }

  if (recipientType === "pro" && ctx.establishmentId) {
    await notifyProMembers({
      supabase,
      establishmentId: ctx.establishmentId,
      category: ctx.event.event_type,
      title: ctx.subject,
      body: ctx.body,
      data: ctx.event.data as Record<string, unknown>,
    });
    return { ok: true, channel: "in_app" };
  }

  if (recipientType === "admin") {
    await emitAdminNotification({
      type: ctx.event.event_type,
      title: ctx.subject,
      body: ctx.body,
      data: ctx.event.data as Record<string, unknown>,
    });
    return { ok: true, channel: "in_app" };
  }

  return { ok: false, channel: "in_app", error: "unsupported_recipient_type" };
}

// =============================================================================
// Main public API
// =============================================================================

/**
 * Send a notification to a single recipient on a single channel.
 */
export async function sendNotification(
  event: NotificationEvent,
  channel: NotificationChannel,
): Promise<NotificationResult> {
  const isCritical = event.is_critical || CRITICAL_EVENT_TYPES.includes(event.event_type);

  // 1. Get user preferences
  const prefs = await getUserPreferencesFromDb(event.recipient_id);
  const lang = prefs?.preferred_lang ?? "fr";

  // 2. Check preferences
  if (!isChannelAllowed(prefs, event.event_type, channel, isCritical)) {
    return { ok: false, channel, error: "channel_disabled_by_user" };
  }

  // 3. Resolve template
  const template = await resolveTemplate(event.event_type, channel, lang);

  // 4. Build subject + body
  const subject = template?.subject
    ? interpolate(template.subject, event.data)
    : (event.data.title as string) || event.event_type;
  const body = template?.body
    ? interpolate(template.body, event.data)
    : (event.data.body as string) || event.event_type;

  // 5. Resolve recipient info
  const recipientInfo = await resolveRecipientInfo(event.recipient_id, event.recipient_type);

  // 6. Build dispatch context
  const ctx: DispatchContext = {
    event,
    channel,
    template,
    subject,
    body,
    recipientEmail: recipientInfo.email,
    recipientPhone: recipientInfo.phone,
    recipientLang: lang,
    establishmentId: recipientInfo.establishmentId || (event.data.establishment_id as string),
  };

  // 7. Log as pending
  const logId = await logNotification({
    eventType: event.event_type,
    channel,
    recipientId: event.recipient_id,
    recipientType: event.recipient_type,
    templateId: template?.id,
    subject,
    bodyPreview: body,
    status: "pending",
    metadata: event.data as Record<string, unknown>,
    campaignId: event.campaign_id,
  });

  // 8. Dispatch
  let result: NotificationResult;
  try {
    switch (channel) {
      case "email":
        result = await dispatchEmail(ctx);
        break;
      case "sms":
        result = await dispatchSms(ctx);
        break;
      case "push":
        result = await dispatchPush(ctx);
        break;
      case "in_app":
        result = await dispatchInApp(ctx);
        break;
      default:
        result = { ok: false, channel, error: "unknown_channel" };
    }
  } catch (err) {
    result = {
      ok: false,
      channel,
      error: err instanceof Error ? err.message : "dispatch_error",
    };
  }

  // 9. Update log
  if (logId) {
    const status: NotificationStatus = result.ok ? "sent" : "failed";
    void updateLogStatus(logId, status, result.provider_message_id, result.error);
    result.log_id = logId;
  }

  return result;
}

/**
 * Send a notification to a recipient on multiple channels in parallel.
 * This is the main entry point for the notification engine.
 */
export async function sendMultiChannelNotification(
  event: NotificationEvent,
): Promise<NotificationResult[]> {
  const channels = event.channels;
  if (!channels.length) return [];

  // Apply Email→SMS escalation rule:
  // If reservation reminder and < 3h before, add SMS channel
  const shouldEscalateToSms =
    event.event_type.includes("reminder") &&
    event.data.hours_before != null &&
    Number(event.data.hours_before) <= 3;

  const finalChannels = new Set(channels);
  if (shouldEscalateToSms && !finalChannels.has("sms")) {
    finalChannels.add("sms");
  }

  // Send all channels in parallel
  const results = await Promise.all(
    Array.from(finalChannels).map((ch) => sendNotification(event, ch)),
  );

  return results;
}

/**
 * Convenience: fire-and-forget notification (best-effort, no awaiting).
 * Used for non-critical notifications where the caller doesn't need the result.
 */
export function fireNotification(event: NotificationEvent): void {
  void (async () => {
    try {
      await sendMultiChannelNotification(event);
    } catch (err) {
      log.error({ err }, "fireNotification error");
    }
  })();
}

/**
 * Invalidate the template cache (e.g., after admin edits templates).
 */
export function invalidateTemplateCache(): void {
  templateCache.clear();
}
