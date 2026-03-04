/**
 * Zod Schemas for Admin Reviews V2 Routes
 *
 * Passthrough wrappers around existing reviews.ts schemas for zBody() middleware.
 */
import {
  moderateReviewSchema,
  moderateResponseSchema,
  resolveReportSchema,
} from "./reviews";

// POST /api/admin/v2/reviews/:id/moderate
export const AdminModerateReviewSchema = moderateReviewSchema;

// POST /api/admin/v2/reviews/responses/:id/moderate
export const AdminModerateResponseSchema = moderateResponseSchema;

// POST /api/admin/v2/reviews/reports/:id/resolve
export const AdminResolveReportSchema = resolveReportSchema;
