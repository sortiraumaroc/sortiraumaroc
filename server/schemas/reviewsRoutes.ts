/**
 * Consumer Reviews Routes — Zod Validation Schemas
 * (separate from server/schemas/reviews.ts which covers V2 review system)
 */

import { z } from "../lib/validate";

// POST /api/consumer/reviews
export const SubmitReviewSchema = z.object({
  invitation_token: z.string().min(1),
  overall_rating: z.number().min(1).max(5),
  criteria_ratings: z.record(z.number().min(1).max(5)).optional(),
  title: z.string().optional(),
  comment: z.string().optional(),
  anonymous: z.boolean().optional(),
});

// POST /api/consumer/reports
export const SubmitReportSchema = z.object({
  establishment_id: z.string().min(1),
  reason_code: z.enum([
    "inappropriate_content",
    "false_information",
    "closed_permanently",
    "duplicate_listing",
    "spam_or_scam",
    "safety_concern",
    "harassment",
    "other",
  ]),
  reason_text: z.string().optional(),
  user_id: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for establishment reviews (slug or UUID) */
export const EstablishmentReviewIdParams = z.object({ id: z.string().min(1) });

/** :token param for review invitations */
export const ReviewInvitationTokenParams = z.object({ token: z.string().min(1) });
