// =============================================================================
// RESERVATION STATE MACHINE — V1 + V2 COMBINED
// =============================================================================

// ---------------------------------------------------------------------------
// V1 occupying statuses (backward compat — used by existing capacity checks)
// ---------------------------------------------------------------------------
export const OCCUPYING_RESERVATION_STATUSES = ["confirmed", "pending_pro_validation", "requested"] as const;
export type OccupyingReservationStatus = (typeof OCCUPYING_RESERVATION_STATUSES)[number];
export const OCCUPYING_RESERVATION_STATUS_SET = new Set<string>(OCCUPYING_RESERVATION_STATUSES);

// ---------------------------------------------------------------------------
// V2 occupying statuses (adds deposit_paid)
// ---------------------------------------------------------------------------
export const OCCUPYING_RESERVATION_STATUSES_V2 = ["confirmed", "pending_pro_validation", "requested", "deposit_paid"] as const;
export const OCCUPYING_RESERVATION_STATUS_V2_SET = new Set<string>(OCCUPYING_RESERVATION_STATUSES_V2);

export const ACTIVE_WAITLIST_ENTRY_STATUSES = ["waiting", "queued", "offer_sent"] as const;
export type ActiveWaitlistEntryStatus = (typeof ACTIVE_WAITLIST_ENTRY_STATUSES)[number];
export const ACTIVE_WAITLIST_ENTRY_STATUS_SET = new Set<string>(ACTIVE_WAITLIST_ENTRY_STATUSES);

export const CANCELLABLE_RESERVATION_STATUSES = ["confirmed", "pending_pro_validation", "requested", "waitlist"] as const;
export const CANCELLABLE_RESERVATION_STATUS_SET = new Set<string>(CANCELLABLE_RESERVATION_STATUSES);

// V2: extended cancellable statuses
export const CANCELLABLE_RESERVATION_STATUSES_V2 = [
  "confirmed", "pending_pro_validation", "requested", "waitlist",
  "on_hold", "deposit_requested", "deposit_paid",
] as const;
export const CANCELLABLE_RESERVATION_STATUS_V2_SET = new Set<string>(CANCELLABLE_RESERVATION_STATUSES_V2);

export const MODIFIABLE_RESERVATION_STATUSES = ["confirmed", "pending_pro_validation", "requested"] as const;
export const MODIFIABLE_RESERVATION_STATUS_SET = new Set<string>(MODIFIABLE_RESERVATION_STATUSES);

export function isCancelledReservationStatus(status: string): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "cancelled" || s.startsWith("cancelled_");
}

// ---------------------------------------------------------------------------
// Terminal statuses: no further transitions allowed
// ---------------------------------------------------------------------------
const TERMINAL_STATUSES = new Set<string>([
  "cancelled", "cancelled_user", "cancelled_pro", "cancelled_waitlist_expired",
  "refused",
  "consumed",
  "consumed_default",
  "no_show_confirmed",
  "expired",
]);

export function isTerminalReservationStatus(status: string): boolean {
  const s = String(status ?? "").toLowerCase();
  return TERMINAL_STATUSES.has(s) || isCancelledReservationStatus(s);
}

// ---------------------------------------------------------------------------
// Statuses that qualify for review invitation (client showed up)
// ---------------------------------------------------------------------------
export const REVIEW_ELIGIBLE_STATUSES = ["consumed", "consumed_default"] as const;
export const REVIEW_ELIGIBLE_STATUS_SET = new Set<string>(REVIEW_ELIGIBLE_STATUSES);

// ---------------------------------------------------------------------------
// V1 transition function (PRESERVED for backward compat)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// V2 transition function — superset of V1 with new statuses
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS_V2: Record<string, Set<string>> = {
  // V1 transitions (extended with V2 targets)
  requested: new Set([
    "pending_pro_validation", "confirmed", "refused", "waitlist",
    "on_hold", "expired",
    "cancelled_pro", "cancelled_user", "cancelled",
  ]),
  pending_pro_validation: new Set([
    "confirmed", "refused", "waitlist",
    "on_hold", "expired",
    "cancelled_pro", "cancelled_user", "cancelled",
  ]),
  confirmed: new Set([
    "consumed", "consumed_default", "noshow",
    "deposit_requested",
    "cancelled_pro", "cancelled_user", "cancelled",
  ]),
  waitlist: new Set([
    "requested", "confirmed",
    "cancelled_user", "cancelled_pro", "cancelled_waitlist_expired", "cancelled",
  ]),
  pending_waitlist: new Set([
    "waitlist",
    "cancelled_user", "cancelled",
  ]),

  // V2 new source statuses
  on_hold: new Set([
    "confirmed", "refused", "expired",
    "cancelled_pro", "cancelled_user", "cancelled",
  ]),
  deposit_requested: new Set([
    "deposit_paid", "expired",
    "cancelled_user", "cancelled_pro", "cancelled",
  ]),
  deposit_paid: new Set([
    "confirmed",
    "consumed", "consumed_default", "noshow",
    "cancelled_pro", "cancelled",
  ]),
  noshow: new Set([
    "no_show_confirmed",
    "no_show_disputed",
  ]),
  no_show_disputed: new Set([
    "no_show_confirmed",
    "consumed", // arbitration ruled client was there
  ]),
};

/**
 * V2 state machine: check if transition is valid.
 * Use this for all new V2 code paths.
 */
export function canTransitionReservationStatusV2(args: { from: string; to: string }): boolean {
  const from = String(args.from ?? "").toLowerCase();
  const to = String(args.to ?? "").toLowerCase();

  if (!to) return false;
  if (from === to) return true;
  if (isTerminalReservationStatus(from)) return false;

  return ALLOWED_TRANSITIONS_V2[from]?.has(to) ?? false;
}
