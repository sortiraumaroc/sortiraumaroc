/**
 * Zod Schemas for Admin Homepage Routes
 *
 * Validates admin-facing homepage management inputs: home curation,
 * home settings, hero images, cities, videos, countries, and universes.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

// =============================================================================
// Valid curation kinds (mirrored from adminHomepage.ts)
// =============================================================================

const VALID_CURATION_KINDS = [
  "best_deals",
  "selected_for_you",
  "near_you",
  "most_booked",
  "open_now",
  "trending",
  "new_establishments",
  "top_rated",
  "deals",
  "themed",
  "by_service_buffet",
  "by_service_table",
  "by_service_carte",
] as const;

// =============================================================================
// HOME CURATION
// =============================================================================

export const CreateHomeCurationItemSchema = z.object({
  universe: z.string().min(1),
  kind: z.enum(VALID_CURATION_KINDS),
  city: z.string().nullable().optional(),
  establishment_id: z.string().uuid(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  weight: z.coerce.number().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const UpdateHomeCurationItemSchema = z.object({
  universe: z.string().min(1).optional(),
  kind: z.enum(VALID_CURATION_KINDS).optional(),
  city: z.string().nullable().optional(),
  establishment_id: z.string().uuid().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  weight: z.coerce.number().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

// =============================================================================
// HOME SETTINGS
// =============================================================================

export const UpdateHomeSettingsSchema = z.object({
  key: z.string().trim().min(1),
  value: z.any(),
});

// =============================================================================
// HERO IMAGES (base64 upload)
// =============================================================================

export const UploadHeroImageSchema = z.object({
  image: z.string().min(1),
  mime_type: z.string().optional(),
});

export const UploadMobileHeroImageSchema = z.object({
  image: z.string().min(1),
  mime_type: z.string().optional(),
});

// =============================================================================
// HOME CITIES
// =============================================================================

export const CreateHomeCitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
  image_url: z.string().max(2000).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  country_code: z.string().max(10).optional(),
});

export const UpdateHomeCitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  image_url: z.string().max(2000).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  country_code: z.string().max(10).optional(),
});

export const ReorderHomeCitiesSchema = z.object({
  order: z.array(z.string().min(1)),
});

export const UploadHomeCityImageSchema = z.object({
  image: z.string().min(1),
  mime_type: z.string().optional(),
});

export const UpdateHomeCityCountrySchema = z.object({
  country_code: z.string().min(1).max(10),
});

// =============================================================================
// HOME VIDEOS
// =============================================================================

export const CreateHomeVideoSchema = z.object({
  youtube_url: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(2000).optional(),
  thumbnail_url: z.string().max(2000).optional(),
  establishment_id: z.string().optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
});

export const UpdateHomeVideoSchema = z.object({
  youtube_url: z.string().trim().min(1).max(500).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  thumbnail_url: z.string().max(2000).optional(),
  establishment_id: z.string().optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
});

export const ReorderHomeVideosSchema = z.object({
  order: z.array(z.string().min(1)),
});

// =============================================================================
// COUNTRIES
// =============================================================================

export const CreateCountrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  name_en: z.string().max(200).optional(),
  code: z.string().min(1).max(10),
  flag_emoji: z.string().max(10).optional(),
  currency_code: z.string().max(10).optional(),
  phone_prefix: z.string().max(10).optional(),
  default_locale: z.string().max(10).optional(),
  timezone: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  sort_order: z.coerce.number().optional(),
});

export const UpdateCountrySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  name_en: z.string().max(200).optional(),
  code: z.string().min(1).max(10).optional(),
  flag_emoji: z.string().max(10).optional(),
  currency_code: z.string().max(10).optional(),
  phone_prefix: z.string().max(10).optional(),
  default_locale: z.string().max(10).optional(),
  timezone: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  sort_order: z.coerce.number().optional(),
});

export const ReorderCountriesSchema = z.object({
  order: z.array(z.string().min(1)),
});

// =============================================================================
// UNIVERSES
// =============================================================================

export const CreateUniverseSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  label_fr: z.string().trim().min(1).max(200),
  label_en: z.string().trim().min(1).max(200),
  icon_name: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().max(2000).optional(),
});

export const UpdateUniverseSchema = z.object({
  slug: z.string().trim().min(1).max(100).optional(),
  label_fr: z.string().trim().min(1).max(200).optional(),
  label_en: z.string().trim().min(1).max(200).optional(),
  icon_name: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().max(2000).optional(),
});

export const ReorderUniversesSchema = z.object({
  order: z.array(z.string().min(1)),
});
