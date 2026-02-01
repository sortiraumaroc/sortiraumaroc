/**
 * Shared notification definitions (client + server).
 *
 * Important: the app historically used free-form strings in DB columns.
 * This file centralizes the canonical list AND provides a normalization layer
 * so we don't break existing stored values.
 */

export type NotificationRoleScope = "user" | "pro" | "admin";
export type NotificationPriority = "low" | "normal" | "high";

export const NotificationEventType = {
  // USER events (canonical)
  booking_created: "booking_created",
  booking_confirmed: "booking_confirmed",
  booking_refused: "booking_refused",
  booking_waitlisted: "booking_waitlisted",

  booking_change_requested: "booking_change_requested",
  booking_change_proposed: "booking_change_proposed",
  booking_change_accepted: "booking_change_accepted",
  booking_change_declined: "booking_change_declined",

  booking_cancel_requested: "booking_cancel_requested",
  booking_cancelled: "booking_cancelled",
  booking_cancel_refused: "booking_cancel_refused",

  pack_purchased: "pack_purchased",

  payment_succeeded: "payment_succeeded",
  payment_failed: "payment_failed",
  refund_done: "refund_done",

  message_received: "message_received",
  noshow_marked: "noshow_marked",

  // PRO events (canonical)
  new_booking_request: "new_booking_request",
  new_change_request: "new_change_request",
  new_cancel_request: "new_cancel_request",
  waitlist_user_ready: "waitlist_user_ready",
  payment_received: "payment_received",
  review_received: "review_received",
  establishment_update_required: "establishment_update_required",

  // SUPERADMIN/ADMIN events (canonical)
  moderation_pending: "moderation_pending",
  finance_discrepancy_detected: "finance_discrepancy_detected",
  payout_requested: "payout_requested",
  payout_processed: "payout_processed",
  audit_alert: "audit_alert",
  user_suspended: "user_suspended",
  pro_suspended: "pro_suspended",

  // Legacy values already stored in DB (kept to avoid breaking history)
  new_reservation: "new_reservation",
  waitlist_request: "waitlist_request",
  waitlist_offer_sent: "waitlist_offer_sent",
  alternative_slot_proposed: "alternative_slot_proposed",
  profile_update_submitted: "profile_update_submitted",
  payment_refunded: "payment_refunded",
  payment_pending: "payment_pending",
  finance_discrepancy: "finance_discrepancy",
  payout_failed: "payout_failed",
} as const;

export type NotificationEventType = (typeof NotificationEventType)[keyof typeof NotificationEventType];

export function normalizeNotificationEventType(raw: unknown): NotificationEventType | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;

  // Exact match (canonical or legacy).
  if ((Object.values(NotificationEventType) as string[]).includes(value)) return value as NotificationEventType;

  // Map older action strings into canonical where helpful.
  // NOTE: do NOT remove legacy values from DB; this is presentation-layer only.
  const mapped: Record<string, NotificationEventType> = {
    new_reservation: NotificationEventType.new_booking_request,
    waitlist_request: NotificationEventType.booking_waitlisted,

    request_change: NotificationEventType.new_change_request,
    proposed_change_created: NotificationEventType.booking_change_proposed,
    accept_proposed_change: NotificationEventType.booking_change_accepted,
    decline_proposed_change: NotificationEventType.booking_change_declined,

    request_cancellation: NotificationEventType.new_cancel_request,

    waitlist_offer_sent: NotificationEventType.waitlist_user_ready,
    waitlist_offer_accepted: NotificationEventType.booking_confirmed,
    waitlist_offer_refused: NotificationEventType.booking_refused,

    payment_received: NotificationEventType.payment_received,
    payment_refunded: NotificationEventType.refund_done,
    payment_pending: NotificationEventType.payment_failed,

    finance_discrepancy: NotificationEventType.finance_discrepancy_detected,
  };

  return mapped[value] ?? null;
}

export function defaultPriorityForEventType(eventType: NotificationEventType | null): NotificationPriority {
  if (!eventType) return "normal";

  const high: Set<NotificationEventType> = new Set([
    NotificationEventType.booking_cancelled,
    NotificationEventType.booking_cancel_requested,
    NotificationEventType.booking_refused,
    NotificationEventType.noshow_marked,
    NotificationEventType.payment_failed,
    NotificationEventType.finance_discrepancy_detected,
    NotificationEventType.audit_alert,
    NotificationEventType.payout_failed,
  ]);

  const low: Set<NotificationEventType> = new Set([
    NotificationEventType.message_received,
    NotificationEventType.review_received,
    NotificationEventType.establishment_update_required,
  ]);

  if (high.has(eventType)) return "high";
  if (low.has(eventType)) return "low";
  return "normal";
}
