/**
 * Zod Schemas for Banners Admin Routes
 */
import { z } from "zod";

// POST /api/admin/banners — create banner
// PUT /api/admin/banners/:id — update banner
// Both share the same flexible shape (delegated to bannerLogic for deep validation)
export const BannerCreateSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  cta_text: z.string().optional(),
  cta_url: z.string().optional(),
  secondary_cta_text: z.string().optional(),
  secondary_cta_url: z.string().optional(),
  internal_name: z.string().optional(),
  image_url: z.string().optional(),
  type: z.string().optional(),
  platform: z.string().optional(),
  status: z.string().optional(),
  priority: z.number().optional(),
  display_rules: z.any().optional(),
  form_config: z.any().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  target_pages: z.any().optional(),
  target_cities: z.any().optional(),
  target_universes: z.any().optional(),
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
