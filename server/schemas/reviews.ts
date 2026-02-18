/**
 * Review System V2 — Zod Validation Schemas
 * Input validation for all review-related API endpoints
 */

import { z } from "zod";
import { uuidSchema, paginationSchema } from "./common";

// =============================================================================
// RATING SCHEMAS
// =============================================================================

const ratingCriterion = z.coerce
  .number()
  .int({ message: "La note doit être un entier" })
  .min(1, { message: "Note minimum 1" })
  .max(5, { message: "Note maximum 5" });

const optionalRatingCriterion = z.coerce
  .number()
  .int({ message: "La note doit être un entier" })
  .min(1, { message: "Note minimum 1" })
  .max(5, { message: "Note maximum 5" })
  .nullable()
  .optional();

// =============================================================================
// REVIEW SUBMISSION
// =============================================================================

export const submitReviewSchema = z.object({
  invitation_token: z.string().min(1, { message: "Token d'invitation requis" }),
  rating_welcome: ratingCriterion,
  rating_quality: ratingCriterion,
  rating_value: ratingCriterion,
  rating_ambiance: ratingCriterion,
  rating_hygiene: optionalRatingCriterion,
  rating_organization: optionalRatingCriterion,
  comment: z.string()
    .min(50, { message: "Le commentaire doit contenir au moins 50 caractères" })
    .max(1500, { message: "Le commentaire ne doit pas dépasser 1500 caractères" })
    .transform((v) => v.trim()),
  would_recommend: z.boolean().nullable().optional(),
  photos: z.array(z.string().url()).max(3, { message: "Maximum 3 photos" }).optional().default([]),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

// =============================================================================
// ADMIN MODERATION
// =============================================================================

export const moderateReviewSchema = z.object({
  action: z.enum(["approve", "reject", "request_modification"], {
    message: "Action invalide",
  }),
  moderation_note: z.string()
    .max(1000, { message: "Note de modération trop longue" })
    .optional()
    .transform((v) => v?.trim() || undefined),
});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

// =============================================================================
// ADMIN LIST REVIEWS
// =============================================================================

export const adminListReviewsSchema = paginationSchema.extend({
  status: z.enum([
    "pending_moderation",
    "approved",
    "rejected",
    "modification_requested",
    "pending_commercial_gesture",
    "resolved",
    "published",
    "all",
  ]).optional().default("all"),
  establishment_id: z.string().uuid().optional(),
  sort_by: z.enum(["created_at", "rating_overall", "updated_at"]).optional().default("created_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type AdminListReviewsInput = z.infer<typeof adminListReviewsSchema>;

// =============================================================================
// COMMERCIAL GESTURE (Pro → Client)
// =============================================================================

export const proposeGestureSchema = z.object({
  review_id: uuidSchema,
  message: z.string()
    .min(10, { message: "Le message doit contenir au moins 10 caractères" })
    .max(1000, { message: "Le message ne doit pas dépasser 1000 caractères" })
    .transform((v) => v.trim()),
  discount_bps: z.coerce
    .number()
    .int()
    .min(100, { message: "La réduction doit être d'au moins 1%" })
    .max(10000, { message: "La réduction ne peut pas dépasser 100%" }),
  promo_code: z.string().optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
});

export type ProposeGestureInput = z.infer<typeof proposeGestureSchema>;

// =============================================================================
// CLIENT GESTURE RESPONSE
// =============================================================================

export const respondGestureSchema = z.object({
  gesture_id: uuidSchema,
  action: z.enum(["accept", "refuse"], { message: "Action invalide" }),
});

export type RespondGestureInput = z.infer<typeof respondGestureSchema>;

// =============================================================================
// PRO PUBLIC RESPONSE
// =============================================================================

export const submitResponseSchema = z.object({
  review_id: uuidSchema,
  content: z.string()
    .min(10, { message: "La réponse doit contenir au moins 10 caractères" })
    .max(1500, { message: "La réponse ne doit pas dépasser 1500 caractères" })
    .transform((v) => v.trim()),
});

export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

// =============================================================================
// ADMIN MODERATE RESPONSE
// =============================================================================

export const moderateResponseSchema = z.object({
  action: z.enum(["approve", "reject"], { message: "Action invalide" }),
  moderation_note: z.string()
    .max(1000)
    .optional()
    .transform((v) => v?.trim() || undefined),
});

export type ModerateResponseInput = z.infer<typeof moderateResponseSchema>;

// =============================================================================
// VOTE
// =============================================================================

export const voteSchema = z.object({
  review_id: uuidSchema,
  vote: z.enum(["useful", "not_useful"], { message: "Vote invalide" }),
  fingerprint: z.string().min(1).max(200).optional(),
});

export type VoteInput = z.infer<typeof voteSchema>;

// =============================================================================
// REPORT REVIEW
// =============================================================================

export const reportReviewSchema = z.object({
  review_id: uuidSchema,
  reason: z.string()
    .min(10, { message: "La raison doit contenir au moins 10 caractères" })
    .max(500, { message: "La raison ne doit pas dépasser 500 caractères" })
    .transform((v) => v.trim()),
  reporter_type: z.enum(["user", "pro", "visitor"]).optional().default("visitor"),
});

export type ReportReviewInput = z.infer<typeof reportReviewSchema>;

// =============================================================================
// PUBLIC LIST REVIEWS
// =============================================================================

export const publicListReviewsSchema = paginationSchema.extend({
  sort_by: z.enum(["published_at", "rating_overall", "useful_count"]).optional().default("published_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
  min_rating: z.coerce.number().min(1).max(5).optional(),
  with_photos: z.coerce.boolean().optional(),
});

export type PublicListReviewsInput = z.infer<typeof publicListReviewsSchema>;

// =============================================================================
// PRO LIST REVIEWS
// =============================================================================

export const proListReviewsSchema = paginationSchema.extend({
  status: z.enum([
    "pending_commercial_gesture",
    "published",
    "resolved",
    "all",
  ]).optional().default("all"),
  sort_by: z.enum(["created_at", "rating_overall"]).optional().default("created_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type ProListReviewsInput = z.infer<typeof proListReviewsSchema>;

// =============================================================================
// ADMIN LIST REPORTS
// =============================================================================

export const adminListReportsSchema = paginationSchema.extend({
  status: z.enum(["pending", "reviewed", "dismissed", "all"]).optional().default("pending"),
});

export type AdminListReportsInput = z.infer<typeof adminListReportsSchema>;

// =============================================================================
// ADMIN RESOLVE REPORT
// =============================================================================

export const resolveReportSchema = z.object({
  action: z.enum(["reviewed", "dismissed"], { message: "Action invalide" }),
  review_note: z.string().max(1000).optional().transform((v) => v?.trim() || undefined),
});

export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
