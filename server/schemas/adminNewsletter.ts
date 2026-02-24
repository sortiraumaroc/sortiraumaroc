/**
 * Zod Schemas for Admin Newsletter Routes
 */

import { z } from "zod";

// POST /api/admin/newsletter/templates/upsert
export const UpsertNewsletterTemplateSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string(),
  description: z.string().optional().nullable(),
  category: z.string().optional(),
  audience: z.string().optional(),
  subject_fr: z.string().optional(),
  subject_en: z.string().optional(),
  preheader_fr: z.string().optional().nullable(),
  preheader_en: z.string().optional().nullable(),
  blocks: z.array(z.any()).optional(),
  design_settings: z.any().optional(),
  is_template: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

// POST /api/admin/newsletter/preview
export const PreviewNewsletterSchema = z.object({
  subject: z.string().optional(),
  blocks: z.array(z.any()).optional(),
  design_settings: z.any().optional(),
  lang: z.string().optional(),
  variables: z.any().optional(),
});

// POST /api/admin/newsletter/campaigns
export const CreateNewsletterCampaignSchema = z.object({
  name: z.string(),
  template_id: z.string().optional().nullable(),
  subject_fr: z.string().optional(),
  subject_en: z.string().optional(),
  preheader_fr: z.string().optional().nullable(),
  preheader_en: z.string().optional().nullable(),
  blocks: z.array(z.any()).optional(),
  design_settings: z.any().optional(),
  audience: z.string().optional(),
  target_tags: z.array(z.string()).optional(),
  target_cities: z.array(z.string()).optional(),
  scheduled_at: z.string().optional().nullable(),
});

// POST /api/admin/newsletter/campaigns/:id/send
export const SendNewsletterCampaignSchema = z.object({
  limit: z.number().optional(),
  dry_run: z.boolean().optional(),
});

// PUT /api/admin/newsletter/subscribers/:id
export const UpdateSubscriberSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  age: z.number().optional(),
  gender: z.string().optional(),
  profession: z.string().optional(),
  csp: z.string().optional(),
  interests: z.array(z.string()).optional(),
  status: z.string().optional(),
});

// POST /api/admin/newsletter/subscribers/export
export const ExportSubscribersSchema = z.object({
  status: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

// POST /api/admin/newsletter/audiences
export const CreateAudienceSchema = z.object({
  name: z.string(),
  description: z.string().optional().nullable(),
  filters: z.any().optional(),
  is_dynamic: z.boolean().optional(),
});

// PUT /api/admin/newsletter/audiences/:id
export const UpdateAudienceSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  filters: z.any().optional(),
  is_dynamic: z.boolean().optional(),
});

// POST /api/admin/newsletter/preview-filters
export const PreviewFiltersSchema = z.object({
  filters: z.any().optional(),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/newsletter/templates */
export const ListNewsletterTemplatesQuery = z.object({
  category: z.string().optional(),
  audience: z.string().optional(),
  featured: z.string().optional(),
});

/** GET /api/admin/newsletter/campaigns */
export const ListNewsletterCampaignsQuery = z.object({
  status: z.string().optional(),
});

/** GET /api/admin/newsletter/subscribers */
export const ListNewsletterSubscribersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

/** GET /api/admin/newsletter/audiences/:id/members */
export const ListAudienceMembersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});
