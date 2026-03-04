/**
 * Audit Log V2 — Structured logging for sensitive reservation actions.
 *
 * Logs to:
 *   1. Console (structured JSON for server logs / log aggregator)
 *   2. Supabase `audit_logs_v2` table (persistent, queryable by admin)
 *
 * Used for: arbitration, sanctions, deactivations, pro cancellations,
 * suspension lifting, score overrides, and other admin/pro sensitive actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("auditLogV2");

// =============================================================================
// Types
// =============================================================================

export type AuditAction =
  // Admin actions
  | "admin.dispute.arbitrate"
  | "admin.establishment.deactivate"
  | "admin.establishment.reactivate"
  | "admin.client.lift_suspension"
  | "admin.client.manual_score_override"
  // Pro actions
  | "pro.reservation.accept"
  | "pro.reservation.refuse"
  | "pro.reservation.cancel"
  | "pro.reservation.declare_no_show"
  | "pro.reservation.confirm_venue"
  | "pro.reservation.scan_qr"
  | "pro.quote.send_offer"
  | "pro.quote.decline"
  | "pro.capacity.update"
  // Client actions
  | "client.reservation.create"
  | "client.reservation.cancel"
  | "client.reservation.upgrade"
  | "client.dispute.respond"
  | "client.quote.accept"
  // System / cron actions
  | "system.reservation.expire"
  | "system.reservation.auto_validate"
  | "system.dispute.expire"
  | "system.client.auto_lift_suspension"
  | "system.pro.auto_lift_deactivation"
  | "system.sanction.apply"
  | "system.pattern.detected"
  // Packs — Client actions
  | "client.pack.purchase"
  | "client.pack.refund_request"
  // Packs — Pro actions
  | "pro.pack.create"
  | "pro.pack.update"
  | "pro.pack.submit"
  | "pro.pack.suspend"
  | "pro.pack.resume"
  | "pro.pack.close"
  | "pro.pack.scan_consume"
  | "pro.billing.call_to_invoice"
  | "pro.billing.dispute_create"
  // Loyalty V2 — Pro actions
  | "pro.loyalty.create_program"
  | "pro.loyalty.update_program"
  | "pro.loyalty.activate_program"
  | "pro.loyalty.deactivate_program"
  | "pro.loyalty.scan"
  | "pro.loyalty.stamp_conditional"
  | "pro.loyalty.claim_reward"
  | "pro.loyalty.consume_gift"
  | "pro.loyalty.offer_gift"
  // Loyalty V2 — Client actions
  | "client.loyalty.claim_gift"
  // Loyalty V2 — Admin actions
  | "admin.loyalty.suspend_program"
  | "admin.loyalty.unsuspend_program"
  | "admin.loyalty.review_alert"
  | "admin.loyalty.dismiss_alert"
  | "admin.loyalty.approve_gift"
  | "admin.loyalty.reject_gift"
  | "admin.loyalty.distribute_gift"
  // Packs — Admin actions
  | "admin.pack.approve"
  | "admin.pack.reject"
  | "admin.pack.request_modification"
  | "admin.pack.feature"
  | "admin.billing.validate_invoice"
  | "admin.billing.execute_payment"
  | "admin.billing.respond_dispute"
  | "admin.billing.approve_refund"
  | "admin.billing.reject_refund"
  | "admin.module.toggle"
  | "admin.commission.update"
  // Notifications / Push Marketing — Admin actions
  | "admin.campaign.create"
  | "admin.campaign.send"
  | "admin.campaign.cancel"
  // Banners — Admin actions
  | "admin.banner.create"
  | "admin.banner.activate"
  | "admin.banner.pause"
  | "admin.banner.disable"
  // Wheel — Admin actions
  | "admin.wheel.create"
  | "admin.wheel.activate"
  | "admin.wheel.pause"
  | "admin.wheel.end"
  | "admin.wheel.add_prize"
  | "admin.wheel.upload_codes"
  // Wheel — Client actions
  | "client.wheel.spin"
  // Wheel — System actions
  | "system.wheel.fraud_alert";

export interface AuditLogEntry {
  action: AuditAction;
  actorType: "admin" | "pro" | "client" | "system";
  actorId?: string; // user_id or "cron"
  targetType?: "reservation" | "establishment" | "user" | "dispute" | "quote" | "sanction" | "pack" | "pack_purchase" | "billing_period" | "billing_dispute" | "refund" | "module" | "commission" | "loyalty_program" | "loyalty_card" | "loyalty_alert" | "platform_gift" | "gift_distribution" | "push_campaign" | "banner" | "wheel_event" | "wheel_prize" | "wheel_spin";
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

// =============================================================================
// Core logger
// =============================================================================

/**
 * Write an audit log entry — console + DB (best effort for DB).
 */
export async function writeAuditLog(
  entry: AuditLogEntry,
  supabase?: SupabaseClient,
): Promise<void> {
  const timestamp = new Date().toISOString();

  // 1. Always log to console (structured JSON)
  const logLine = {
    level: "audit",
    ts: timestamp,
    action: entry.action,
    actor: `${entry.actorType}:${entry.actorId ?? "unknown"}`,
    target: entry.targetType ? `${entry.targetType}:${entry.targetId ?? "?"}` : undefined,
    details: entry.details,
    ip: entry.ip,
  };
  log.info(logLine, "Audit event");

  // 2. Best-effort write to DB
  void (async () => {
    try {
      const db = supabase ?? getAdminSupabase();
      await db.from("audit_logs_v2").insert({
        action: entry.action,
        actor_type: entry.actorType,
        actor_id: entry.actorId ?? null,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        details: entry.details ?? {},
        ip_address: entry.ip ?? null,
        created_at: timestamp,
      });
    } catch (err) {
      // Never fail the parent operation for audit logging
      log.error({ err }, "DB write failed");
    }
  })();
}

// =============================================================================
// Convenience helpers
// =============================================================================

export function auditAdminAction(
  action: AuditAction,
  opts: { adminId?: string; targetType?: AuditLogEntry["targetType"]; targetId?: string; details?: Record<string, unknown>; ip?: string },
  supabase?: SupabaseClient,
): Promise<void> {
  return writeAuditLog({
    action,
    actorType: "admin",
    actorId: opts.adminId,
    targetType: opts.targetType,
    targetId: opts.targetId,
    details: opts.details,
    ip: opts.ip,
  }, supabase);
}

export function auditProAction(
  action: AuditAction,
  opts: { proUserId: string; targetType?: AuditLogEntry["targetType"]; targetId?: string; details?: Record<string, unknown>; ip?: string },
  supabase?: SupabaseClient,
): Promise<void> {
  return writeAuditLog({
    action,
    actorType: "pro",
    actorId: opts.proUserId,
    targetType: opts.targetType,
    targetId: opts.targetId,
    details: opts.details,
    ip: opts.ip,
  }, supabase);
}

export function auditClientAction(
  action: AuditAction,
  opts: { userId: string; targetType?: AuditLogEntry["targetType"]; targetId?: string; details?: Record<string, unknown>; ip?: string },
  supabase?: SupabaseClient,
): Promise<void> {
  return writeAuditLog({
    action,
    actorType: "client",
    actorId: opts.userId,
    targetType: opts.targetType,
    targetId: opts.targetId,
    details: opts.details,
    ip: opts.ip,
  }, supabase);
}

export function auditSystemAction(
  action: AuditAction,
  opts: { targetType?: AuditLogEntry["targetType"]; targetId?: string; details?: Record<string, unknown> },
  supabase?: SupabaseClient,
): Promise<void> {
  return writeAuditLog({
    action,
    actorType: "system",
    actorId: "cron",
    targetType: opts.targetType,
    targetId: opts.targetId,
    details: opts.details,
  }, supabase);
}
