/**
 * MySQL Content Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST updateAdminFixedPage */
export const updateFixedPageSchema = z.object({
  titre: z.string().optional(),
  contenu: z.string().optional(),
});

/** POST createAdminBlogArticle */
export const createBlogArticleSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description_google: z.string().optional(),
  short: z.string().optional(),
  content: z.string().optional(),
  img: z.string().optional(),
  miniature: z.string().optional(),
  place_id: z.any().optional(),
  blog_category_id: z.any().optional(),
  blog_author_id: z.any().optional(),
  active: z.any().optional(),
});

/** POST updateAdminBlogArticle */
export const updateBlogArticleSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  description_google: z.string().optional(),
  short: z.string().optional(),
  content: z.string().optional(),
  img: z.string().optional(),
  miniature: z.string().optional(),
  place_id: z.any().optional(),
  blog_category_id: z.any().optional(),
  blog_author_id: z.any().optional(),
  active: z.any().optional(),
});

/** POST votePublicBlogPoll */
export const voteBlogPollSchema = z.object({
  option_index: z.number(),
  session_id: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :slug param for blog articles & authors */
export const BlogSlugParams = z.object({ slug: z.string().min(1) });

/** :slug + :pollId params for blog polls */
export const BlogPollParams = z.object({
  slug: z.string().min(1),
  pollId: z.string().min(1),
});

/** :key param for fixed content pages */
export const ContentKeyParams = z.object({ key: z.string().min(1) });

/** :id param for blog articles (numeric) */
export const BlogArticleIdParams = z.object({ id: z.string().min(1) });
