// =============================================================================
// REVIEWS SYSTEM V2 — Shared TypeScript Types
// Used by both server and client
// =============================================================================

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/** Universe → criteria mapping */
export const UNIVERSE_CRITERIA_MAP = {
  restaurant: ["welcome", "quality", "value", "ambiance", "hygiene"],
  hotel: ["welcome", "quality", "value", "ambiance", "hygiene"],
  wellness: ["welcome", "quality", "value", "ambiance", "hygiene"],
  loisir: ["welcome", "quality", "value", "ambiance", "organization"],
  evenement: ["welcome", "quality", "value", "ambiance", "organization"],
} as const;

export type EstablishmentUniverse = keyof typeof UNIVERSE_CRITERIA_MAP;

/** All possible criteria keys */
export const ALL_REVIEW_CRITERIA = [
  "welcome",
  "quality",
  "value",
  "ambiance",
  "hygiene",
  "organization",
] as const;

export type ReviewCriterionKey = (typeof ALL_REVIEW_CRITERIA)[number];

/** Common criteria present for all universes */
export const COMMON_CRITERIA: readonly ReviewCriterionKey[] = [
  "welcome",
  "quality",
  "value",
  "ambiance",
];

/** Criteria labels (FR) */
export const CRITERIA_LABELS_FR: Record<ReviewCriterionKey, string> = {
  welcome: "Accueil",
  quality: "Qualité",
  value: "Rapport qualité-prix",
  ambiance: "Ambiance",
  hygiene: "Hygiène",
  organization: "Organisation",
};

/** Criteria labels (EN) */
export const CRITERIA_LABELS_EN: Record<ReviewCriterionKey, string> = {
  welcome: "Welcome",
  quality: "Quality",
  value: "Value for money",
  ambiance: "Ambiance",
  hygiene: "Hygiene",
  organization: "Organization",
};

// =============================================================================
// REVIEW STATUS & WORKFLOW
// =============================================================================

export const REVIEW_STATUSES = [
  "pending_moderation",
  "approved",
  "rejected",
  "modification_requested",
  "pending_commercial_gesture",
  "resolved",
  "published",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Statuses where the review is visible to the public */
export const PUBLIC_REVIEW_STATUSES: readonly ReviewStatus[] = ["published"];

/** Statuses where the review is considered "active" (not terminal) */
export const ACTIVE_REVIEW_STATUSES: readonly ReviewStatus[] = [
  "pending_moderation",
  "approved",
  "modification_requested",
  "pending_commercial_gesture",
];

// =============================================================================
// COMMERCIAL GESTURE
// =============================================================================

export const GESTURE_STATUSES = [
  "none",
  "proposed",
  "accepted",
  "refused",
  "expired",
] as const;

export type GestureStatus = (typeof GESTURE_STATUSES)[number];

export const GESTURE_TABLE_STATUSES = [
  "pending",
  "accepted",
  "refused",
  "expired",
] as const;

export type GestureTableStatus = (typeof GESTURE_TABLE_STATUSES)[number];

// =============================================================================
// REVIEW INVITATION
// =============================================================================

export const INVITATION_STATUSES = [
  "pending",
  "sent",
  "reminder_3d",
  "reminder_7d",
  "clicked",
  "completed",
  "expired",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// =============================================================================
// REVIEW RESPONSE (pro public response)
// =============================================================================

export const RESPONSE_STATUSES = [
  "pending_moderation",
  "approved",
  "rejected",
] as const;

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

// =============================================================================
// REVIEW VOTE
// =============================================================================

export const VOTE_TYPES = ["useful", "not_useful"] as const;
export type VoteType = (typeof VOTE_TYPES)[number];

// =============================================================================
// REVIEW REPORT
// =============================================================================

export const REPORT_STATUSES = ["pending", "reviewed", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORTER_TYPES = ["user", "pro", "visitor"] as const;
export type ReporterType = (typeof REPORTER_TYPES)[number];

// =============================================================================
// TIMING CONSTANTS
// =============================================================================

/** Hours after check-in before invitation becomes eligible */
export const INVITATION_DELAY_HOURS = 8;

/** Days before first reminder after invitation sent */
export const REMINDER_1_DAYS = 3;

/** Days before second reminder after invitation sent */
export const REMINDER_2_DAYS = 7;

/** Days before invitation expires after eligible_at */
export const INVITATION_EXPIRY_DAYS = 14;

/** Hours given to pro to propose gesture after admin approval (note < 4) */
export const GESTURE_PRO_DEADLINE_HOURS = 24;

/** Hours given to client to respond to gesture after pro proposes */
export const GESTURE_CLIENT_DEADLINE_HOURS = 48;

/** Maximum gestures per establishment per client per quarter */
export const MAX_GESTURES_PER_QUARTER = 2;

/** Rating threshold: below this, commercial gesture workflow applies */
export const NEGATIVE_REVIEW_THRESHOLD = 4;

// =============================================================================
// ROW TYPES (matching DB schema)
// =============================================================================

export interface ReviewRow {
  id: string;
  reservation_id: string;
  user_id: string;
  establishment_id: string;

  // Ratings
  rating_welcome: number;
  rating_quality: number;
  rating_value: number;
  rating_ambiance: number;
  rating_hygiene: number | null;
  rating_organization: number | null;
  rating_overall: number;

  // Content
  comment: string;
  would_recommend: boolean | null;
  photos: string[];

  // Status
  status: ReviewStatus;

  // Moderation
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;

  // Gesture tracking
  commercial_gesture_status: GestureStatus;
  gesture_deadline: string | null;
  client_gesture_deadline: string | null;

  // Publication
  published_at: string | null;
  gesture_mention: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ReviewInvitationRow {
  id: string;
  reservation_id: string;
  user_id: string;
  establishment_id: string;
  token: string;
  status: InvitationStatus;
  eligible_at: string;
  sent_at: string | null;
  reminder_3d_sent_at: string | null;
  reminder_7d_sent_at: string | null;
  expires_at: string;
  clicked_at: string | null;
  completed_at: string | null;
  review_id: string | null;
  last_email_attempt_at: string | null;
  email_attempts: number;
  last_email_error: string | null;
  created_at: string;
}

export interface ReviewResponseRow {
  id: string;
  review_id: string;
  establishment_id: string;
  content: string;
  status: ResponseStatus;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ReviewVoteRow {
  id: string;
  review_id: string;
  user_id: string | null;
  fingerprint: string | null;
  vote: VoteType;
  created_at: string;
  updated_at: string;
}

export interface ReviewReportRow {
  id: string;
  review_id: string;
  reporter_id: string | null;
  reporter_type: ReporterType;
  reason: string;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface CommercialGestureRow {
  id: string;
  review_id: string;
  establishment_id: string;
  promo_code_id: string | null;
  message: string;
  status: GestureTableStatus;
  proposed_at: string;
  responded_at: string | null;
  created_at: string;
}

// =============================================================================
// SUMMARY VIEW TYPE
// =============================================================================

export interface EstablishmentReviewSummary {
  establishment_id: string;
  total_reviews: number;
  avg_overall: number;
  avg_welcome: number;
  avg_quality: number;
  avg_value: number;
  avg_ambiance: number;
  avg_hygiene: number | null;
  avg_organization: number | null;
  stars_5: number;
  stars_4: number;
  stars_3: number;
  stars_2: number;
  stars_1: number;
  recommendation_rate: number | null;
  reviews_with_photos: number;
}

// =============================================================================
// API PAYLOAD TYPES
// =============================================================================

/** Payload for submitting a review */
export interface SubmitReviewPayload {
  invitation_token: string;
  rating_welcome: number;
  rating_quality: number;
  rating_value: number;
  rating_ambiance: number;
  rating_hygiene?: number | null;
  rating_organization?: number | null;
  comment: string;
  would_recommend?: boolean | null;
  photos?: string[];
}

/** Payload for admin moderation action */
export interface ModerateReviewPayload {
  action: "approve" | "reject" | "request_modification";
  moderation_note?: string;
}

/** Payload for pro submitting a commercial gesture */
export interface ProposeGesturePayload {
  review_id: string;
  message: string;
  discount_bps: number;
  promo_code?: string; // optional manual code
  starts_at?: string | null;
  ends_at?: string | null;
}

/** Payload for client responding to a gesture */
export interface RespondGesturePayload {
  gesture_id: string;
  action: "accept" | "refuse";
}

/** Payload for pro submitting a public response */
export interface SubmitResponsePayload {
  review_id: string;
  content: string;
}

/** Payload for voting on a review */
export interface VotePayload {
  review_id: string;
  vote: VoteType;
  fingerprint?: string;
}

/** Payload for reporting a review */
export interface ReportReviewPayload {
  review_id: string;
  reason: string;
  reporter_type?: ReporterType;
}

// =============================================================================
// HELPERS (pure functions, no dependencies)
// =============================================================================

/**
 * Get applicable criteria keys for an establishment universe
 */
export function getCriteriaForUniverse(universe: string): ReviewCriterionKey[] {
  const u = universe as EstablishmentUniverse;
  return [...(UNIVERSE_CRITERIA_MAP[u] ?? UNIVERSE_CRITERIA_MAP.restaurant)];
}

/**
 * Check if a universe uses the "hygiene" criterion
 */
export function universeUsesHygiene(universe: string): boolean {
  return getCriteriaForUniverse(universe).includes("hygiene");
}

/**
 * Check if a universe uses the "organization" criterion
 */
export function universeUsesOrganization(universe: string): boolean {
  return getCriteriaForUniverse(universe).includes("organization");
}

/**
 * Compute overall rating from individual criteria ratings
 * Returns a number rounded to 1 decimal place
 */
export function computeOverallRating(ratings: {
  welcome: number;
  quality: number;
  value: number;
  ambiance: number;
  hygiene?: number | null;
  organization?: number | null;
}): number {
  let total = ratings.welcome + ratings.quality + ratings.value + ratings.ambiance;
  let count = 4;

  if (ratings.hygiene != null) {
    total += ratings.hygiene;
    count++;
  }

  if (ratings.organization != null) {
    total += ratings.organization;
    count++;
  }

  return Math.round((total / count) * 10) / 10;
}

/**
 * Determine if a review rating qualifies as "negative" (triggers gesture workflow)
 */
export function isNegativeRating(overallRating: number): boolean {
  return overallRating < NEGATIVE_REVIEW_THRESHOLD;
}

/**
 * Get star category (1-5) from overall rating
 */
export function getStarCategory(overallRating: number): 1 | 2 | 3 | 4 | 5 {
  if (overallRating >= 4.5) return 5;
  if (overallRating >= 3.5) return 4;
  if (overallRating >= 2.5) return 3;
  if (overallRating >= 1.5) return 2;
  return 1;
}
