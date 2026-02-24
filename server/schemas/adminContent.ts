/**
 * Zod Schemas for Admin Content Routes
 *
 * Validates admin-facing CMS inputs: content pages, FAQ articles,
 * blog articles, blog authors, and block replacement.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

// =============================================================================
// Content Pages
// =============================================================================

export const CreateAdminContentPageSchema = z.object({
  slug: z.string().max(300),
  page_key: z.string().max(300).optional(),
  slug_fr: z.string().max(300).optional(),
  slug_en: z.string().max(300).optional(),

  // status
  is_published: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),

  // legacy
  title: z.string().max(500).optional(),
  body_markdown: z.string().optional(),

  // bilingual titles
  title_fr: z.string().max(500).optional(),
  title_en: z.string().max(500).optional(),
  page_subtitle_fr: z.string().max(500).optional(),
  page_subtitle_en: z.string().max(500).optional(),

  // bilingual body HTML
  body_html_fr: z.string().optional(),
  body_html_en: z.string().optional(),

  // SEO (preferred)
  seo_title_fr: z.string().max(300).optional(),
  seo_title_en: z.string().max(300).optional(),
  seo_description_fr: z.string().max(500).optional(),
  seo_description_en: z.string().max(500).optional(),

  // SEO legacy (compat)
  meta_title_fr: z.string().max(300).optional(),
  meta_title_en: z.string().max(300).optional(),
  meta_description_fr: z.string().max(500).optional(),
  meta_description_en: z.string().max(500).optional(),

  // Open Graph
  og_title_fr: z.string().max(300).optional(),
  og_title_en: z.string().max(300).optional(),
  og_description_fr: z.string().max(500).optional(),
  og_description_en: z.string().max(500).optional(),
  og_image_url: z.string().max(1000).optional().nullable(),

  // Canonical / robots
  canonical_url_fr: z.string().max(1000).optional(),
  canonical_url_en: z.string().max(1000).optional(),
  robots: z.string().max(200).optional(),

  // Misc
  show_toc: z.boolean().optional(),
  related_links: z.unknown().optional(),
  schema_jsonld_fr: z.unknown().optional(),
  schema_jsonld_en: z.unknown().optional(),
});

export const UpdateAdminContentPageSchema = z.object({
  slug: z.string().max(300).optional(),
  page_key: z.string().max(300).optional(),
  slug_fr: z.string().max(300).optional(),
  slug_en: z.string().max(300).optional(),

  // status
  is_published: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),

  // legacy
  title: z.string().max(500).optional(),
  body_markdown: z.string().optional(),

  // bilingual titles
  title_fr: z.string().max(500).optional(),
  title_en: z.string().max(500).optional(),
  page_subtitle_fr: z.string().max(500).optional(),
  page_subtitle_en: z.string().max(500).optional(),

  // bilingual body HTML
  body_html_fr: z.string().optional(),
  body_html_en: z.string().optional(),

  // SEO (preferred)
  seo_title_fr: z.string().max(300).optional(),
  seo_title_en: z.string().max(300).optional(),
  seo_description_fr: z.string().max(500).optional(),
  seo_description_en: z.string().max(500).optional(),

  // SEO legacy (compat)
  meta_title_fr: z.string().max(300).optional(),
  meta_title_en: z.string().max(300).optional(),
  meta_description_fr: z.string().max(500).optional(),
  meta_description_en: z.string().max(500).optional(),

  // Open Graph
  og_title_fr: z.string().max(300).optional(),
  og_title_en: z.string().max(300).optional(),
  og_description_fr: z.string().max(500).optional(),
  og_description_en: z.string().max(500).optional(),
  og_image_url: z.string().max(1000).optional().nullable(),

  // Canonical / robots
  canonical_url_fr: z.string().max(1000).optional(),
  canonical_url_en: z.string().max(1000).optional(),
  robots: z.string().max(200).optional(),

  // Misc
  show_toc: z.boolean().optional(),
  related_links: z.unknown().optional(),
  schema_jsonld_fr: z.unknown().optional(),
  schema_jsonld_en: z.unknown().optional(),
});

/**
 * replaceAdminContentPageBlocks accepts either a raw array or { blocks: [...] }.
 * We validate the array-of-records form; the handler also accepts the wrapper.
 */
export const ReplaceAdminContentPageBlocksSchema = z.array(
  z.record(z.unknown()),
);

// =============================================================================
// FAQ Articles
// =============================================================================

export const CreateAdminFaqArticleSchema = z.object({
  // legacy
  title: z.string().max(500).optional(),
  body: z.string().optional(),

  // bilingual
  question_fr: z.string().max(500).optional(),
  question_en: z.string().max(500).optional(),
  answer_html_fr: z.string().optional(),
  answer_html_en: z.string().optional(),

  category: z.string().max(100).optional(),
  display_order: z.coerce.number().optional(),
  is_published: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const UpdateAdminFaqArticleSchema = z.object({
  // legacy
  title: z.string().max(500).optional(),
  body: z.string().optional(),

  // bilingual
  question_fr: z.string().max(500).optional(),
  question_en: z.string().max(500).optional(),
  answer_html_fr: z.string().optional(),
  answer_html_en: z.string().optional(),

  category: z.string().max(100).optional(),
  display_order: z.coerce.number().optional(),
  is_published: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// CMS Blog Articles
// =============================================================================

export const CreateAdminCmsBlogArticleSchema = z.object({
  slug: z.string().max(300),

  // legacy fields
  title: z.string().max(500).optional(),
  description_google: z.string().max(500).optional(),
  short: z.string().max(1000).optional(),
  content: z.string().optional(),
  img: z.string().max(1000).optional(),
  miniature: z.string().max(1000).optional(),

  // bilingual
  title_fr: z.string().max(500).optional(),
  title_en: z.string().max(500).optional(),
  excerpt_fr: z.string().max(1000).optional(),
  excerpt_en: z.string().max(1000).optional(),
  body_html_fr: z.string().optional(),
  body_html_en: z.string().optional(),

  // SEO
  meta_title_fr: z.string().max(300).optional(),
  meta_title_en: z.string().max(300).optional(),
  meta_description_fr: z.string().max(500).optional(),
  meta_description_en: z.string().max(500).optional(),

  // author / category
  author_name: z.string().max(200).optional(),
  author_id: z.string().uuid().optional().nullable(),
  primary_category_id: z.string().uuid().optional().nullable(),
  secondary_category_ids: z.array(z.string().uuid()).optional(),

  show_read_count: z.boolean().optional(),
  published_at: z.string().optional(),
  category: z.string().max(200).optional(),
  is_published: z.boolean().optional(),
});

export const UpdateAdminCmsBlogArticleSchema = z.object({
  slug: z.string().max(300).optional(),

  // legacy fields
  title: z.string().max(500).optional(),
  description_google: z.string().max(500).optional(),
  short: z.string().max(1000).optional(),
  content: z.string().optional(),
  img: z.string().max(1000).optional(),
  miniature: z.string().max(1000).optional(),

  // bilingual
  title_fr: z.string().max(500).optional(),
  title_en: z.string().max(500).optional(),
  excerpt_fr: z.string().max(1000).optional(),
  excerpt_en: z.string().max(1000).optional(),
  body_html_fr: z.string().optional(),
  body_html_en: z.string().optional(),

  // SEO
  meta_title_fr: z.string().max(300).optional(),
  meta_title_en: z.string().max(300).optional(),
  meta_description_fr: z.string().max(500).optional(),
  meta_description_en: z.string().max(500).optional(),

  // author / category
  author_name: z.string().max(200).optional(),
  author_id: z.string().uuid().optional().nullable(),
  primary_category_id: z.string().uuid().optional().nullable(),
  secondary_category_ids: z.array(z.string().uuid()).optional(),

  show_read_count: z.boolean().optional(),
  published_at: z.string().optional(),
  category: z.string().max(200).optional(),
  is_published: z.boolean().optional(),

  // moderation (admin-only update fields)
  moderation_status: z.enum(["draft", "pending", "approved", "rejected"]).optional(),
  moderation_note: z.string().max(2000).optional(),
});

/**
 * replaceAdminCmsBlogArticleBlocks accepts either a raw array or { blocks: [...] }.
 * We validate the array-of-records form; the handler also accepts the wrapper.
 */
export const ReplaceAdminCmsBlogArticleBlocksSchema = z.array(
  z.record(z.unknown()),
);

// =============================================================================
// CMS Blog Authors
// =============================================================================

export const CreateAdminCmsBlogAuthorSchema = z.object({
  display_name: z.string().trim().min(1).max(200),
  bio_short: z.string().max(2000).optional(),
  avatar_url: z.string().max(1000).optional().nullable(),
  profile_url: z.string().max(1000).optional().nullable(),
  role: z.enum(["sam", "guest", "team", "editor"]).optional(),
  is_active: z.boolean().optional(),
});

export const UpdateAdminCmsBlogAuthorSchema = z.object({
  display_name: z.string().trim().max(200).optional(),
  bio_short: z.string().max(2000).optional(),
  avatar_url: z.string().max(1000).optional().nullable(),
  profile_url: z.string().max(1000).optional().nullable(),
  role: z.enum(["sam", "guest", "team", "editor"]).optional(),
  is_active: z.boolean().optional(),
});
