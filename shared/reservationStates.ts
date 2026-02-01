export const OCCUPYING_RESERVATION_STATUSES = ["confirmed", "pending_pro_validation", "requested"] as const;
export type OccupyingReservationStatus = (typeof OCCUPYING_RESERVATION_STATUSES)[number];
export const OCCUPYING_RESERVATION_STATUS_SET = new Set<string>(OCCUPYING_RESERVATION_STATUSES);

export const ACTIVE_WAITLIST_ENTRY_STATUSES = ["waiting", "queued", "offer_sent"] as const;
export type ActiveWaitlistEntryStatus = (typeof ACTIVE_WAITLIST_ENTRY_STATUSES)[number];
export const ACTIVE_WAITLIST_ENTRY_STATUS_SET = new Set<string>(ACTIVE_WAITLIST_ENTRY_STATUSES);

export const CANCELLABLE_RESERVATION_STATUSES = ["confirmed", "pending_pro_validation", "requested", "waitlist"] as const;
export const CANCELLABLE_RESERVATION_STATUS_SET = new Set<string>(CANCELLABLE_RESERVATION_STATUSES);

export const MODIFIABLE_RESERVATION_STATUSES = ["confirmed", "pending_pro_validation", "requested"] as const;
export const MODIFIABLE_RESERVATION_STATUS_SET = new Set<string>(MODIFIABLE_RESERVATION_STATUSES);

export function isCancelledReservationStatus(status: string): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "cancelled" || s.startsWith("cancelled_");
}

export function canTransitionReservationStatus(args: { from: string; to: string }): boolean {
  const from = String(args.from ?? "").toLowerCase();
  const to = String(args.to ?? "").toLowerCase();

  if (!to) return false;
  if (from === to) return true;

  // Terminal states
  if (isCancelledReservationStatus(from) || from === "refused") return false;

  const allowed: Record<string, Set<string>> = {
    requested: new Set(["pending_pro_validation", "confirmed", "refused", "waitlist", "cancelled_pro", "cancelled_user", "cancelled"]),
    pending_pro_validation: new Set(["confirmed", "refused", "waitlist", "cancelled_pro", "cancelled_user", "cancelled"]),
    confirmed: new Set(["noshow", "cancelled_pro", "cancelled_user", "cancelled"]),
    waitlist: new Set(["cancelled_user", "cancelled_pro", "cancelled"]),
    noshow: new Set([]),
  };

  return allowed[from]?.has(to) ?? false;
}
