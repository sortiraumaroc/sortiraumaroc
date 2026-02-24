/**
 * Social Routes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

/** POST /api/consumer/social/posts */
export const createPostSchema = z.object({
  content: z.string().optional(),
  postType: z.string().optional(),
  rating: z.number().optional(),
  establishmentId: z.string().optional(),
  images: z.array(z.string()).optional(),
});

/** POST /api/consumer/social/posts/:id/comments */
export const createCommentSchema = z.object({
  content: z.string().min(1),
  parentCommentId: z.string().optional(),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/consumer/social/feed */
export const SocialFeedQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/consumer/social/feed/discover */
export const SocialDiscoverFeedQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/consumer/social/posts/:id/comments */
export const SocialCommentsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/consumer/social/users/:id/posts */
export const SocialUserPostsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/consumer/social/users/:id/followers */
export const SocialUserFollowersQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/consumer/social/users/:id/following */
export const SocialUserFollowingQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/consumer/social/me/saved */
export const SocialSavedPostsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for social posts (UUID) */
export const SocialPostIdParams = z.object({ id: zUuid });

/** :id param for social users (UUID) */
export const SocialUserIdParams = z.object({ id: zUuid });
