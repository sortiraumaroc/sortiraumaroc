/**
 * Zod Schemas for Misc Pro Routes
 *
 * Validates pro-facing inputs for messaging, visibility, team management,
 * dashboard, notifications, and reviews.
 * All schemas use  to avoid breaking handlers.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :establishmentId + :conversationId */
export const EstablishmentIdConversationIdParams = z.object({ establishmentId: zUuid, conversationId: zUuid });

/** :establishmentId + :clientUserId */
export const EstablishmentIdClientUserIdParams = z.object({ establishmentId: zUuid, clientUserId: zUuid });

/** :establishmentId + :membershipId */
export const EstablishmentIdMembershipIdParams = z.object({ establishmentId: zUuid, membershipId: zUuid });

/** :establishmentId + :notificationId */
export const EstablishmentIdNotificationIdParams = z.object({ establishmentId: zUuid, notificationId: zUuid });

/** :establishmentId + :campaignId */
export const EstablishmentIdCampaignIdParams = z.object({ establishmentId: zUuid, campaignId: zUuid });

// =============================================================================
// proMessaging.ts
// =============================================================================

/** POST .../conversations/:conversationId/messages — sendProConversationMessage */
export const SendProConversationMessageSchema = z.object({
  body: z.string().min(1),
});

/** POST .../conversations/for-reservation — getOrCreateProConversationForReservation */
export const GetOrCreateProConversationForReservationSchema = z.object({
  reservation_id: z.string().min(1),
  subject: z.string().optional(),
});

/** POST .../auto-reply — updateProAutoReplySettings */
export const UpdateProAutoReplySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  message: z.string().max(1000).optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  days_of_week: z.array(z.number()).optional(),
  is_on_vacation: z.boolean().optional(),
  vacation_start: z.string().nullable().optional(),
  vacation_end: z.string().nullable().optional(),
  vacation_message: z.string().max(1000).optional(),
});

// =============================================================================
// proVisibility.ts
// =============================================================================

/** POST .../visibility/promo/validate — validateProVisibilityPromoCode */
export const ValidateProVisibilityPromoCodeSchema = z.object({
  items: z.array(z.unknown()).min(1),
  promo_code: z.string().min(1),
});

/** POST .../visibility/cart/checkout — checkoutProVisibilityCart */
export const CheckoutProVisibilityCartSchema = z.object({
  items: z.array(z.unknown()).min(1),
  promo_code: z.string().optional(),
});

/** POST .../finance/terms/accept — acceptProTerms */
export const AcceptProTermsSchema = z.object({
  terms_version: z.string().min(1),
});

/** POST .../finance/payout-request — createProPayoutRequest */
export const CreateProPayoutRequestSchema = z.object({
  payout_id: z.string().min(1),
  pro_comment: z.string().optional(),
});

// =============================================================================
// proTeam.ts
// =============================================================================

/** POST .../team/create-user — createProTeamUser */
export const CreateProTeamUserSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(6),
  role: z.string().optional(),
});

/** POST .../team/:membershipId/update — updateProTeamMemberRole */
export const UpdateProTeamMemberRoleSchema = z.object({
  role: z.string().min(1),
});

/** POST .../team/:membershipId/email — updateProTeamMemberEmail */
export const UpdateProTeamMemberEmailSchema = z.object({
  email: z.string().min(1),
});

/** POST .../team/:membershipId/toggle-active — toggleProTeamMemberActive */
export const ToggleProTeamMemberActiveSchema = z.object({
  active: z.boolean(),
});

// =============================================================================
// proDashboard.ts
// =============================================================================

/** POST .../toggle-online — toggleProOnlineStatus */
export const ToggleProOnlineStatusSchema = z.object({
  is_online: z.boolean(),
});

/** POST .../campaigns — createProCampaign */
export const CreateProCampaignSchema = z.object({
  type: z.string().optional(),
  title: z.string().min(2),
  budget: z.coerce.number().positive(),
  billing_model: z.string().optional(),
  billingModel: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
});

/** POST .../toggle-google-reviews — toggleGoogleReviews */
export const ToggleGoogleReviewsSchema = z.object({
  hide_google_reviews: z.boolean(),
});

// =============================================================================
// proNotifs.ts
// =============================================================================

/** PUT /api/pro/notification-preferences — updateProNotificationPreferences */
export const UpdateProNotificationPreferencesSchema = z.object({
  popupsEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});

/** PUT .../permissions — updateEstablishmentPermissions */
export const UpdateEstablishmentPermissionsSchema = z.object({
  role: z.string().min(1),
  permissions: z.record(z.boolean()),
});

// =============================================================================
// proReviews.ts (self-registered)
// =============================================================================

/** POST /api/pro/reviews/:id/respond — respondToReview */
export const RespondToReviewSchema = z.object({
  response_type: z.enum(["promo", "publish"]),
  promo_code_id: z.string().optional(),
  publish: z.boolean().optional(),
});

/** POST /api/pro/reviews/:id/public-response — addPublicResponse */
export const AddPublicResponseSchema = z.object({
  response: z.string().min(1).max(2000),
});

// =============================================================================
// proReviewsV2.ts (self-registered)
// =============================================================================

/** :eid (establishment id) */
export const EidParams = z.object({ eid: zUuid });

/** :eid + :id (establishment id + review id) */
export const EidIdParams = z.object({ eid: zUuid, id: zUuid });

/** POST .../reviews/:id/gesture — proposeGestureV2 (body-only, review_id comes from params) */
export const ProposeGestureV2BodySchema = z.object({
  message: z.string().min(1),
  discount_bps: z.coerce.number().int().min(100).max(10000),
  promo_code: z.string().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

/** POST .../reviews/:id/response — submitProResponseV2 (body-only, review_id comes from params) */
export const SubmitProResponseV2BodySchema = z.object({
  content: z.string().min(1).max(1500),
});
