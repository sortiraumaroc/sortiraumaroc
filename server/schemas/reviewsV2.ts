/**
 * Reviews V2 Routes — Zod Validation Schemas
 *
 * Re-exports existing schemas from reviews.ts with  wrappers.
 */

import { z, zUuid } from "../lib/validate";
import {
  submitReviewSchema,
  respondGestureSchema,
  voteSchema,
  reportReviewSchema,
} from "./reviews";

// Wrap existing schemas with  for zBody usage
export const submitReviewBodySchema = submitReviewSchema;
export const respondGestureBodySchema = respondGestureSchema;
export const voteBodySchema = voteSchema;
export const reportReviewBodySchema = reportReviewSchema;

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :token param for review invitations */
export const ReviewInvitationTokenParams = z.object({ token: z.string().min(1) });

/** :gestureId param for commercial gestures (UUID) */
export const GestureIdParams = z.object({ gestureId: zUuid });
