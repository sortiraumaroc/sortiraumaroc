/**
 * Zod Schemas for Pro Inventory Routes
 *
 * Validates pro-facing inventory management inputs.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :establishmentId + :categoryId */
export const EstablishmentIdCategoryIdParams = z.object({ establishmentId: zUuid, categoryId: zUuid });

/** :establishmentId + :itemId */
export const EstablishmentIdItemIdParams = z.object({ establishmentId: zUuid, itemId: zUuid });

/** :establishmentId + :labelId */
export const EstablishmentIdLabelIdParams = z.object({ establishmentId: zUuid, labelId: z.string().min(1) });

// =============================================================================
// Inventory variant shape (shared)
// =============================================================================

const InventoryVariantSchema = z.object({
  title: z.string().max(200).optional(),
  price: z.coerce.number().optional().nullable(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Categories
// =============================================================================

export const CreateInventoryCategorySchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  parent_id: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  sort_order: z.coerce.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const UpdateInventoryCategorySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  sort_order: z.coerce.number().int().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Items
// =============================================================================

export const CreateInventoryItemSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  category_id: z.string().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  labels: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
  base_price: z.coerce.number().optional().nullable(),
  currency: z.string().max(5).optional(),
  is_active: z.boolean().optional(),
  visible_when_unavailable: z.boolean().optional(),
  scheduled_reactivation_at: z.string().optional().nullable(),
  meta: z.record(z.unknown()).optional(),
  variants: z.array(InventoryVariantSchema).optional(),
});

export const UpdateInventoryItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category_id: z.string().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  labels: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
  base_price: z.coerce.number().optional().nullable(),
  currency: z.string().max(5).optional(),
  is_active: z.boolean().optional(),
  visible_when_unavailable: z.boolean().optional(),
  scheduled_reactivation_at: z.string().optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable(),
  variants: z.array(InventoryVariantSchema).optional(),
});
