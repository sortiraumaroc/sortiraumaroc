/**
 * Suspicious Activity — Module central de détection
 *
 * Fonction principale : reportSuspiciousActivity()
 * 1. Déduplification (optionnelle)
 * 2. INSERT DB dans suspicious_activity_alerts
 * 3. Notification in-app admin (emitAdminNotification)
 * 4. Email admin pour warning + critical (sendSAMEmail)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import { sendSAMEmail } from "./email";
import { getPublicBaseUrl } from "./lib/publicBaseUrl";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("suspiciousActivity");

// =============================================================================
// Types
// =============================================================================

export type ActorType = "consumer" | "pro" | "system";

export type AlertSeverity = "info" | "warning" | "critical";

export type SuspiciousAlertType =
  // Consumer
  | "consumer_excessive_no_shows"
  | "consumer_multi_account"
  | "consumer_cancel_rebook_abuse"
  | "consumer_concurrent_slot_abuse"
  | "consumer_review_spam"
  | "consumer_vote_bombing"
  | "consumer_loyalty_stamping_abuse"
  | "consumer_suspension_triggered"
  // Pro
  | "pro_excessive_rejections"
  | "pro_mass_cancellations"
  | "pro_inactivity_drop"
  | "pro_suspicious_data_change"
  | "pro_pack_refund_abuse"
  | "pro_fake_review_suspicion"
  | "pro_loyalty_amount_pattern"
  | "pro_loyalty_abnormal_frequency"
  // Cross-system
  | "wheel_multi_account_fraud"
  | "ads_click_fraud_spike"
  | "loyalty_high_value_reward"
  | "loyalty_suspicious_stamping"
  | "loyalty_program_created";

export interface SuspiciousActivityInput {
  actorType: ActorType;
  actorId: string;
  alertType: SuspiciousAlertType;
  severity: AlertSeverity;
  title: string;
  details: string;
  context?: Record<string, unknown>;
  establishmentId?: string;
  /** Clé de déduplification — empêche les alertes identiques dans la fenêtre */
  deduplicationKey?: string;
  /** Fenêtre de déduplification en heures (défaut: 24) */
  deduplicationWindowHours?: number;
}

export interface SuspiciousActivityResult {
  ok: boolean;
  alertId?: string;
  deduplicated?: boolean;
}

// =============================================================================
// Config
// =============================================================================

const DEFAULT_DEDUP_HOURS = 24;

function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL || "admin@sam.ma";
}

// =============================================================================
// Main function
// =============================================================================

export async function reportSuspiciousActivity(
  input: SuspiciousActivityInput,
): Promise<SuspiciousActivityResult> {
  const supabase = getAdminSupabase();

  try {
    // 1. Déduplification
    if (input.deduplicationKey) {
      const windowHours = input.deduplicationWindowHours ?? DEFAULT_DEDUP_HOURS;
      const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

      const { data: existing } = await supabase
        .from("suspicious_activity_alerts")
        .select("id")
        .eq("deduplication_key", input.deduplicationKey)
        .gte("created_at", cutoff)
        .maybeSingle();

      if (existing) {
        return { ok: true, deduplicated: true };
      }
    }

    // 2. INSERT DB
    const { data: inserted, error } = await supabase
      .from("suspicious_activity_alerts")
      .insert({
        actor_type: input.actorType,
        actor_id: input.actorId,
        alert_type: input.alertType,
        severity: input.severity,
        title: input.title,
        details: input.details,
        context: input.context ?? {},
        establishment_id: input.establishmentId ?? null,
        deduplication_key: input.deduplicationKey ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      log.error({ err: error.message }, "Failed to insert suspicious activity alert");
      return { ok: false };
    }

    const alertId = (inserted as any)?.id ?? "unknown";

    // 3. Notification in-app (admin)
    void emitAdminNotification({
      type: `suspicious_${input.alertType}`,
      title: `${severityEmoji(input.severity)} ${input.title}`,
      body: input.details,
      data: {
        alert_id: alertId,
        actor_type: input.actorType,
        actor_id: input.actorId,
        alert_type: input.alertType,
        severity: input.severity,
        establishment_id: input.establishmentId ?? null,
      },
      category: "alert",
      severity: input.severity === "critical" ? "critical" : input.severity === "warning" ? "warning" : "info",
    });

    // 4. Email admin pour warning + critical uniquement
    if (input.severity !== "info") {
      void sendAdminAlertEmail(input, alertId);
    }

    log.info(
      { alertType: input.alertType, severity: input.severity, actorType: input.actorType, alertId },
      "Suspicious activity reported",
    );

    return { ok: true, alertId };
  } catch (err) {
    log.error({ err }, "reportSuspiciousActivity crashed");
    return { ok: false };
  }
}

// =============================================================================
// Email helper
// =============================================================================

async function sendAdminAlertEmail(
  input: SuspiciousActivityInput,
  alertId: string,
): Promise<void> {
  try {
    const baseUrl = getPublicBaseUrl();
    const adminEmail = getAdminEmail();

    const subject = `[SAM] ${severityLabel(input.severity)} — ${input.title}`;
    const bodyLines = [
      `Type : ${input.alertType}`,
      `Acteur : ${input.actorType} (${input.actorId})`,
      input.establishmentId ? `Établissement : ${input.establishmentId}` : null,
      `Sévérité : ${severityLabel(input.severity)}`,
      "",
      input.details,
    ]
      .filter((l): l is string => l != null)
      .join("\n");

    await sendSAMEmail({
      emailId: `suspicious-alert-${alertId}`,
      fromKey: "noreply",
      to: [adminEmail],
      subject,
      bodyText: bodyLines,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${baseUrl}/admin/suspicious-activity`,
    });
  } catch (err) {
    log.warn({ err }, "Failed to send suspicious activity admin email (best-effort)");
  }
}

// =============================================================================
// Helpers
// =============================================================================

function severityEmoji(severity: AlertSeverity): string {
  switch (severity) {
    case "critical":
      return "\u{1F6A8}";
    case "warning":
      return "\u26A0\uFE0F";
    case "info":
      return "\u2139\uFE0F";
  }
}

function severityLabel(severity: AlertSeverity): string {
  switch (severity) {
    case "critical":
      return "CRITIQUE";
    case "warning":
      return "ATTENTION";
    case "info":
      return "INFO";
  }
}
