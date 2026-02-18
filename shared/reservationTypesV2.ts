// =============================================================================
// RESERVATION SYSTEM V2 — Shared TypeScript Types
// Used by both server and client
// =============================================================================

// =============================================================================
// RESERVATION STATUSES
// =============================================================================

/** All valid reservation statuses (V1 + V2) */
export const RESERVATION_STATUSES = [
  // V1 (existing)
  "requested",
  "pending_pro_validation",
  "confirmed",
  "waitlist",
  "pending_waitlist",
  "cancelled",
  "cancelled_user",
  "cancelled_pro",
  "cancelled_waitlist_expired",
  "refused",
  "noshow",
  // V2 (new)
  "on_hold",
  "deposit_requested",
  "deposit_paid",
  "expired",
  "consumed",
  "consumed_default",
  "no_show_confirmed",
  "no_show_disputed",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that occupy capacity (count towards availability) */
export const OCCUPYING_STATUSES = [
  "requested",
  "pending_pro_validation",
  "confirmed",
  "deposit_paid",
] as const;
export type OccupyingStatus = (typeof OCCUPYING_STATUSES)[number];
export const OCCUPYING_STATUS_SET = new Set<string>(OCCUPYING_STATUSES);

/** Statuses that allow cancellation */
export const CANCELLABLE_STATUSES = [
  "requested",
  "pending_pro_validation",
  "confirmed",
  "waitlist",
  "on_hold",
  "deposit_requested",
  "deposit_paid",
] as const;
export const CANCELLABLE_STATUS_SET = new Set<string>(CANCELLABLE_STATUSES);

/** Terminal statuses (no further transitions) */
export const TERMINAL_STATUSES = [
  "cancelled",
  "cancelled_user",
  "cancelled_pro",
  "cancelled_waitlist_expired",
  "refused",
  "consumed",
  "consumed_default",
  "no_show_confirmed",
  "expired",
] as const;
export const TERMINAL_STATUS_SET = new Set<string>(TERMINAL_STATUSES);

/** Statuses that qualify for review invitation */
export const REVIEW_ELIGIBLE_STATUSES = [
  "consumed",
  "consumed_default",
] as const;
export const REVIEW_ELIGIBLE_STATUS_SET = new Set<string>(
  REVIEW_ELIGIBLE_STATUSES,
);

// =============================================================================
// RESERVATION TYPES & PAYMENT
// =============================================================================

export const RESERVATION_TYPES = ["standard", "group_quote"] as const;
export type ReservationType = (typeof RESERVATION_TYPES)[number];

export const PAYMENT_TYPES = ["free", "paid"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const STOCK_TYPES = ["paid_stock", "free_stock", "buffer"] as const;
export type StockType = (typeof STOCK_TYPES)[number];

// =============================================================================
// PRO VENUE RESPONSE
// =============================================================================

export const PRO_VENUE_RESPONSES = [
  "client_came",
  "client_no_show",
] as const;
export type ProVenueResponse = (typeof PRO_VENUE_RESPONSES)[number];

// =============================================================================
// CAPACITY & QUOTAS
// =============================================================================

/** Default quota percentages (paid / free / buffer) */
export const DEFAULT_QUOTA = {
  paid_stock_percentage: 88,
  free_stock_percentage: 6,
  buffer_percentage: 6,
} as const;

/** Valid slot intervals in minutes */
export const SLOT_INTERVALS = [15, 30, 60, 90, 120] as const;
export type SlotInterval = (typeof SLOT_INTERVALS)[number];

// =============================================================================
// NO-SHOW DISPUTE
// =============================================================================

export const DISPUTE_STATUSES = [
  "pending_client_response",
  "no_show_confirmed",
  "disputed_pending_arbitration",
  "resolved_favor_client",
  "resolved_favor_pro",
  "resolved_indeterminate",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_DECLARED_BY = ["pro", "system"] as const;
export type DisputeDeclaredBy = (typeof DISPUTE_DECLARED_BY)[number];

export const CLIENT_DISPUTE_RESPONSES = [
  "confirms_absence",
  "disputes",
] as const;
export type ClientDisputeResponse = (typeof CLIENT_DISPUTE_RESPONSES)[number];

// =============================================================================
// PRO TRUST SCORE & SANCTIONS
// =============================================================================

export const SANCTION_TYPES = [
  "none",
  "warning",
  "deactivated_7d",
  "deactivated_30d",
  "permanently_excluded",
] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

export const SANCTION_ACTION_TYPES = [
  "warning",
  "deactivation_7d",
  "deactivation_30d",
  "permanent_exclusion",
] as const;
export type SanctionActionType = (typeof SANCTION_ACTION_TYPES)[number];

// =============================================================================
// QUOTE REQUEST
// =============================================================================

export const QUOTE_STATUSES = [
  "submitted",
  "acknowledged",
  "quote_sent",
  "quote_accepted",
  "quote_declined",
  "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const EVENT_TYPES = [
  "birthday",
  "wedding",
  "seminar",
  "team_building",
  "business_meal",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const QUOTE_SENDER_TYPES = ["client", "pro"] as const;
export type QuoteSenderType = (typeof QUOTE_SENDER_TYPES)[number];

// =============================================================================
// CLIENT SCORING V2
// =============================================================================

/** Score scale: 0-100, displayed as stars = score / 20 (0-5.0) */
export const SCORE_SCALE = {
  MIN: 0,
  MAX: 100,
  BASE: 60, // 3.0 stars
  STARS_DIVISOR: 20, // score / 20 = stars
} as const;

/** Scoring weights */
export const SCORING_WEIGHTS = {
  HONORED: 5, // +5 pts per honored reservation (= +0.25 stars)
  NO_SHOW: -15, // -15 pts per no-show (= -0.75 stars)
  LATE_CANCEL: -5, // -5 pts per late cancel 12-24h (= -0.25 stars)
  VERY_LATE_CANCEL: -10, // -10 pts per very late cancel <12h (= -0.5 stars)
  REVIEW_POSTED: 1, // +1 pt per review (= +0.05 stars)
  FREE_TO_PAID: 2, // +2 pts per upgrade (= +0.1 stars)
  SENIORITY_5: 5, // +5 pts after 5 reservations (= +0.25 stars)
  SENIORITY_20: 10, // +10 pts after 20 reservations (= +0.5 stars)
} as const;

/** Suspension thresholds */
export const SUSPENSION_RULES = {
  /** Auto-suspend after N consecutive no-shows */
  CONSECUTIVE_NO_SHOWS_THRESHOLD: 3,
  /** First suspension duration in days */
  FIRST_SUSPENSION_DAYS: 7,
  /** Second suspension duration in days */
  SECOND_SUSPENSION_DAYS: 30,
  /** Third = permanent */
  PERMANENT_THRESHOLD: 3,
  /** Rehabilitation: consecutive honored to reset no-show streak */
  REHABILITATION_CONSECUTIVE: 5,
} as const;

// =============================================================================
// TIMING CONSTANTS
// =============================================================================

export const RESERVATION_TIMINGS = {
  /** Hours before reservation time when cancellation is blocked (H-3) */
  PROTECTION_WINDOW_HOURS: 3,

  /** Deadline for pro to accept/refuse same-day reservation (hours) */
  PRO_SAME_DAY_DEADLINE_HOURS: 2,

  /** Deadline for pro to accept/refuse next-day+ reservation (hours) */
  PRO_NORMAL_DEADLINE_HOURS: 12,

  /** Hours after reservation time to request pro venue confirmation (H+12) */
  VENUE_CONFIRMATION_REQUEST_HOURS: 12,

  /** Hours after reservation time — second nudge (H+18) */
  VENUE_CONFIRMATION_REMINDER_HOURS: 18,

  /** Hours after reservation time — auto-validation deadline (H+24) */
  VENUE_AUTO_VALIDATION_HOURS: 24,

  /** Hours given to client to respond to no-show dispute */
  DISPUTE_CLIENT_RESPONSE_HOURS: 48,

  /** Hours for pro to acknowledge quote request */
  QUOTE_ACKNOWLEDGE_HOURS: 48,

  /** Days for pro to send quote after acknowledgement */
  QUOTE_RESPONSE_DAYS: 7,
} as const;

// =============================================================================
// ROW TYPES (matching DB schema)
// =============================================================================

/** Extended reservations row with V2 fields */
export interface ReservationV2Fields {
  type: ReservationType;
  payment_type: PaymentType;
  promo_code_id: string | null;
  loyalty_points_earned: number;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  qr_code_token: string | null;
  qr_scanned_at: string | null;
  protection_window_start: string | null;
  pro_confirmation_requested_at: string | null;
  pro_confirmation_deadline: string | null;
  pro_venue_response: ProVenueResponse | null;
  pro_venue_responded_at: string | null;
  auto_validated_at: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  pro_custom_message: string | null;
  stock_type: StockType | null;
  converted_from_free_at: string | null;
  pro_processing_deadline: string | null;
  consumed_at: string | null;
}

/** Establishment capacity configuration */
export interface EstablishmentCapacityRow {
  id: string;
  establishment_id: string;
  day_of_week: number | null; // 0-6 (Sun-Sat)
  specific_date: string | null; // ISO date
  time_slot_start: string; // HH:MM
  time_slot_end: string;
  slot_interval_minutes: SlotInterval;
  total_capacity: number;
  occupation_duration_minutes: number;
  paid_stock_percentage: number;
  free_stock_percentage: number;
  buffer_percentage: number;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

/** Slot discount / promotion */
export interface EstablishmentSlotDiscountRow {
  id: string;
  establishment_id: string;
  applies_to: "specific_date" | "day_of_week" | "time_range";
  day_of_week: number | null;
  specific_date: string | null;
  time_slot_start: string | null;
  time_slot_end: string | null;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  label: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

/** No-show dispute row */
export interface NoShowDisputeRow {
  id: string;
  reservation_id: string;
  user_id: string;
  establishment_id: string;
  declared_by: DisputeDeclaredBy;
  declared_at: string;
  client_notified_at: string | null;
  client_response: ClientDisputeResponse | null;
  client_responded_at: string | null;
  client_response_deadline: string;
  dispute_status: DisputeStatus;
  arbitrated_by: string | null;
  arbitrated_at: string | null;
  arbitration_notes: string | null;
  evidence_client: Array<{
    url: string;
    type: string;
    description?: string;
  }>;
  evidence_pro: Array<{ url: string; type: string; description?: string }>;
  created_at: string;
  updated_at: string;
}

/** Pro trust score per establishment */
export interface ProTrustScoreRow {
  id: string;
  establishment_id: string;
  trust_score: number; // 0-100
  response_rate: number; // 0-100%
  avg_response_time_minutes: number;
  false_no_show_count: number;
  total_disputes: number;
  cancellation_rate: number; // 0-100%
  sanctions_count: number;
  current_sanction: SanctionType;
  deactivated_until: string | null;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

/** Quote request for group bookings */
export interface QuoteRequestRow {
  id: string;
  user_id: string;
  establishment_id: string;
  party_size: number;
  preferred_date: string | null;
  preferred_time_slot: string | null;
  is_date_flexible: boolean;
  event_type: EventType;
  event_type_other: string | null;
  requirements: string | null;
  budget_indication: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: QuoteStatus;
  acknowledged_at: string | null;
  acknowledge_deadline: string | null;
  quote_deadline: string | null;
  converted_to_reservation_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Quote message in negotiation thread */
export interface QuoteMessageRow {
  id: string;
  quote_request_id: string;
  sender_type: QuoteSenderType;
  sender_id: string;
  content: string;
  attachments: Array<{
    url: string;
    filename: string;
    type: string;
    size: number;
  }>;
  created_at: string;
}

/** Pro auto-accept rules */
export interface ProAutoAcceptRuleRow {
  id: string;
  establishment_id: string;
  is_global: boolean;
  min_client_score: number | null; // 0-100
  max_party_size: number | null;
  applicable_time_slots: Array<{ start: string; end: string }> | null;
  applicable_days: number[] | null; // 0-6
  auto_request_deposit_below_score: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Establishment sanction record */
export interface EstablishmentSanctionRow {
  id: string;
  establishment_id: string;
  type: SanctionActionType;
  reason: string;
  related_dispute_id: string | null;
  imposed_by: string;
  imposed_at: string;
  lifted_by: string | null;
  lifted_at: string | null;
  lift_reason: string | null;
  deactivation_start: string | null;
  deactivation_end: string | null;
  created_at: string;
}

/** Consumer user stats V2 extension */
export interface ConsumerUserStatsV2Fields {
  honored_reservations: number;
  late_cancellations: number;
  very_late_cancellations: number;
  reviews_posted: number;
  consecutive_honored: number;
  consecutive_no_shows: number;
  free_to_paid_conversions: number;
  is_suspended: boolean;
  suspended_until: string | null;
  suspension_reason: string | null;
  total_reservations: number;
  scoring_version: number; // 1 = V1, 2 = V2
}

// =============================================================================
// SLOT AVAILABILITY (returned by calculate_slot_availability function)
// =============================================================================

export interface SlotAvailability {
  total_capacity: number;
  paid_total: number;
  free_total: number;
  buffer_total: number;
  paid_occupied: number;
  free_occupied: number;
  buffer_occupied: number;
  paid_available: number;
  free_available: number;
  buffer_available: number;
  occupation_rate: number; // 0-100%
}

// =============================================================================
// V2 STATE MACHINE — Extended transitions
// =============================================================================

/**
 * Check if a reservation status is terminal (no further transitions allowed)
 */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUS_SET.has(status);
}

/**
 * Check if a reservation status qualifies for review invitation
 */
export function isReviewEligible(status: string): boolean {
  return REVIEW_ELIGIBLE_STATUS_SET.has(status);
}

/**
 * V2 state machine: allowed transitions
 * Extends V1 (shared/reservationStates.ts) with new statuses
 */
const ALLOWED_TRANSITIONS_V2: Record<string, Set<string>> = {
  // V1 transitions (preserved)
  requested: new Set([
    "pending_pro_validation",
    "confirmed",
    "refused",
    "waitlist",
    "on_hold",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ]),
  pending_pro_validation: new Set([
    "confirmed",
    "refused",
    "waitlist",
    "on_hold",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ]),
  confirmed: new Set([
    "consumed",
    "consumed_default",
    "noshow",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
    "deposit_requested",
  ]),
  waitlist: new Set([
    "requested",
    "confirmed",
    "cancelled_user",
    "cancelled_pro",
    "cancelled_waitlist_expired",
    "cancelled",
  ]),
  pending_waitlist: new Set(["waitlist", "cancelled_user", "cancelled"]),

  // V2 new statuses
  on_hold: new Set([
    "confirmed",
    "refused",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ]),
  deposit_requested: new Set([
    "deposit_paid",
    "expired",
    "cancelled_user",
    "cancelled_pro",
    "cancelled",
  ]),
  deposit_paid: new Set([
    "confirmed",
    "consumed",
    "consumed_default",
    "noshow",
    "cancelled_pro",
    "cancelled",
  ]),
  noshow: new Set(["no_show_confirmed", "no_show_disputed"]),
  no_show_disputed: new Set([
    "no_show_confirmed",
    "consumed", // arbitration ruled in favor of client → they were there
  ]),
};

/**
 * Check if a transition is valid in V2 state machine
 */
export function canTransitionV2(from: string, to: string): boolean {
  if (!to) return false;
  if (from === to) return true;
  if (isTerminalStatus(from)) return false;
  return ALLOWED_TRANSITIONS_V2[from]?.has(to) ?? false;
}

// =============================================================================
// CANCELLATION CLASSIFICATION
// =============================================================================

export type CancellationType = "free" | "late" | "very_late" | "blocked";

/**
 * Classify a cancellation based on how far in advance it happens
 * @param startsAt - reservation start time
 * @param cancelAt - time of cancellation (defaults to now)
 * @returns cancellation type for scoring purposes
 */
export function classifyCancellation(
  startsAt: Date,
  cancelAt: Date = new Date(),
): CancellationType {
  const hoursUntil =
    (startsAt.getTime() - cancelAt.getTime()) / (1000 * 60 * 60);

  if (hoursUntil <= RESERVATION_TIMINGS.PROTECTION_WINDOW_HOURS) {
    return "blocked"; // H-3: cannot cancel
  }
  if (hoursUntil <= 12) {
    return "very_late"; // < 12h: -10 pts
  }
  if (hoursUntil <= 24) {
    return "late"; // 12h-24h: -5 pts
  }
  return "free"; // > 24h: no penalty
}

// =============================================================================
// SCORE HELPERS
// =============================================================================

/**
 * Convert score (0-100) to stars (0-5.0)
 * @example scoreToStars(60) → 3.0
 * @example scoreToStars(85) → 4.25
 */
export function scoreToStars(score: number): number {
  return (
    Math.round(
      (Math.max(SCORE_SCALE.MIN, Math.min(SCORE_SCALE.MAX, score)) /
        SCORE_SCALE.STARS_DIVISOR) *
        100,
    ) / 100
  );
}

/**
 * Convert stars (0-5.0) to score (0-100)
 * @example starsToScore(3.0) → 60
 * @example starsToScore(4.25) → 85
 */
export function starsToScore(stars: number): number {
  return Math.round(
    Math.max(0, Math.min(5, stars)) * SCORE_SCALE.STARS_DIVISOR,
  );
}

/**
 * Compute client score V2 (TypeScript mirror of SQL function)
 */
export function computeClientScoreV2(stats: {
  honored: number;
  noShows: number;
  lateCancellations: number;
  veryLateCancellations: number;
  totalReservations: number;
  reviewsPosted: number;
  freeToPaidConversions: number;
}): number {
  let score = SCORE_SCALE.BASE;

  score += stats.honored * SCORING_WEIGHTS.HONORED;
  score += stats.noShows * SCORING_WEIGHTS.NO_SHOW; // negative weight
  score += stats.lateCancellations * SCORING_WEIGHTS.LATE_CANCEL;
  score += stats.veryLateCancellations * SCORING_WEIGHTS.VERY_LATE_CANCEL;
  score += stats.reviewsPosted * SCORING_WEIGHTS.REVIEW_POSTED;
  score += stats.freeToPaidConversions * SCORING_WEIGHTS.FREE_TO_PAID;

  // Seniority bonus
  if (stats.totalReservations >= 20) {
    score += SCORING_WEIGHTS.SENIORITY_20;
  } else if (stats.totalReservations >= 5) {
    score += SCORING_WEIGHTS.SENIORITY_5;
  }

  return Math.max(SCORE_SCALE.MIN, Math.min(SCORE_SCALE.MAX, Math.round(score)));
}
