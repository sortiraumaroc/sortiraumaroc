/**
 * Zod Schemas for Admin Taxonomy Routes
 *
 * Validates admin-facing taxonomy inputs: category images (Level 3),
 * categories (Level 2), and universes management.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

// =============================================================================
// Category Images (Subcategories - Level 3)
// =============================================================================

const validCategoryImageUniverses = [
  "restaurants",
  "sport",
  "loisirs",
  "hebergement",
  "culture",
  "shopping",
] as const;

export const CreateAdminCategoryImageSchema = z.object({
  universe: z.enum(validCategoryImageUniverses),
  category_id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  image_url: z.string().trim().min(1).max(1000),
  display_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
});

export const UpdateAdminCategoryImageSchema = z.object({
  name: z.string().trim().max(200).optional(),
  image_url: z.string().trim().max(1000).optional(),
  display_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Categories (Level 2)
// =============================================================================

export const CreateAdminCategoryLevel2Schema = z.object({
  universe_slug: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100),
  name_fr: z.string().trim().min(1).max(200),
  name_en: z.string().max(200).optional().nullable(),
  description_fr: z.string().max(2000).optional().nullable(),
  description_en: z.string().max(2000).optional().nullable(),
  icon_name: z.string().max(100).optional().nullable(),
  image_url: z.string().max(1000).optional().nullable(),
  display_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  requires_booking: z.boolean().optional(),
  supports_packs: z.boolean().optional(),
});

export const UpdateAdminCategoryLevel2Schema = z.object({
  name_fr: z.string().trim().max(200).optional(),
  name_en: z.string().max(200).optional().nullable(),
  description_fr: z.string().max(2000).optional().nullable(),
  description_en: z.string().max(2000).optional().nullable(),
  icon_name: z.string().max(100).optional().nullable(),
  image_url: z.string().max(1000).optional().nullable(),
  display_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  requires_booking: z.boolean().optional(),
  supports_packs: z.boolean().optional(),
});

// =============================================================================
// Universes
// =============================================================================

export const CreateAdminUniverseSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/),
  label_fr: z.string().trim().min(1).max(200),
  label_en: z.string().trim().min(1).max(200),
  icon_name: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().max(1000).optional().nullable(),
});

export const UpdateAdminUniverseSchema = z.object({
  slug: z.string().trim().max(100).regex(/^[a-z0-9_-]+$/).optional(),
  label_fr: z.string().trim().max(200).optional(),
  label_en: z.string().trim().max(200).optional(),
  icon_name: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().max(1000).optional().nullable(),
});

export const ReorderAdminUniversesSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});
