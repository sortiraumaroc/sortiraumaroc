/**
 * Zod Schemas for Banners Admin Routes
 */
import { z } from "zod";

// POST /api/admin/banners — create banner
// PUT /api/admin/banners/:id — update banner
// Both share the same flexible shape (delegated to bannerLogic for deep validation)
export const BannerCreateSchema = z.object({
  internal_name: z.string().optional(),
  title: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  type: z.string().optional(),
  status: z.string().optional(),
  media_url: z.string().optional().nullable(),
  media_type: z.string().optional().nullable(),
  // CTA
  cta_text: z.string().optional().nullable(),
  cta_url: z.string().optional().nullable(),
  cta_target: z.string().optional(),
  cta_bg_color: z.string().optional().nullable(),
  cta_text_color: z.string().optional().nullable(),
  secondary_cta_text: z.string().optional().nullable(),
  secondary_cta_url: z.string().optional().nullable(),
  // Display
  display_format: z.string().optional(),
  animation: z.string().optional(),
  overlay_color: z.string().optional().nullable(),
  overlay_opacity: z.number().optional(),
  close_behavior: z.string().optional(),
  close_delay_seconds: z.number().optional(),
  appear_delay_type: z.string().optional(),
  appear_delay_value: z.number().optional(),
  // Content
  carousel_slides: z.any().optional().nullable(),
  countdown_target: z.string().optional().nullable(),
  form_fields: z.any().optional().nullable(),
  form_confirmation_message: z.string().optional().nullable(),
  form_notify_email: z.string().optional().nullable(),
  // Targeting
  audience_type: z.string().optional(),
  audience_filters: z.any().optional(),
  trigger: z.string().optional(),
  trigger_page: z.string().optional().nullable(),
  frequency: z.string().optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  priority: z.number().optional(),
  platform: z.string().optional(),
  target_cities: z.any().optional().nullable(),
  target_pages: z.any().optional(),
  target_universes: z.any().optional(),
  // Legacy
  image_url: z.string().optional(),
  display_rules: z.any().optional(),
  form_config: z.any().optional(),
});

export const BannerUpdateSchema = BannerCreateSchema;

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/banners — list banners */
export const ListBannersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  platform: z.string().optional(),
});

/** GET /api/admin/banners/:id/form-responses — list form responses */
export const ListBannerFormResponsesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

/** GET /api/admin/banners/:id/views — list banner views */
export const ListBannerViewsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});
