/**
 * Zod Schemas for Pro Offers Routes
 *
 * Validates pro-facing offers management inputs (slots, packs, booking policy,
 * promo codes, labels, inventory images, promo templates).
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :establishmentId + :slotId */
export const EstablishmentIdSlotIdParams = z.object({ establishmentId: zUuid, slotId: zUuid });

/** :establishmentId + :packId */
export const EstablishmentIdPackIdParams = z.object({ establishmentId: zUuid, packId: zUuid });

/** :establishmentId + :orderId */
export const EstablishmentIdOrderIdParams = z.object({ establishmentId: zUuid, orderId: zUuid });

/** :establishmentId + :id (promo code) */
export const EstablishmentIdPromoCodeIdParams = z.object({ establishmentId: zUuid, id: zUuid });

/** :establishmentId + :templateId (promo template) */
export const EstablishmentIdPromoTemplateIdParams = z.object({ establishmentId: zUuid, templateId: zUuid });

// =============================================================================
// Slot shape (used inside UpsertProSlots)
// =============================================================================

const SlotInputSchema = z.object({
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  capacity: z.coerce.number().optional(),
  base_price: z.coerce.number().optional().nullable(),
  promo_type: z.string().optional().nullable(),
  promo_value: z.coerce.number().optional().nullable(),
  promo_label: z.string().optional().nullable(),
  service_label: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

// =============================================================================
// Slots
// =============================================================================

export const UpsertProSlotsSchema = z.object({
  slots: z.array(SlotInputSchema),
});

// =============================================================================
// Packs
// =============================================================================

export const UpdateProPackSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  label: z.string().max(200).optional().nullable(),
  price: z.coerce.number().optional(),
  original_price: z.coerce.number().optional().nullable(),
  is_limited: z.boolean().optional(),
  stock: z.coerce.number().optional().nullable(),
  availability: z.string().max(100).optional(),
  active: z.boolean().optional(),
  valid_from: z.string().optional().nullable(),
  valid_to: z.string().optional().nullable(),
  conditions: z.string().max(5000).optional().nullable(),
  cover_url: z.string().max(2000).optional().nullable(),
});

// =============================================================================
// Booking Policy
// =============================================================================

export const UpdateProBookingPolicySchema = z.object({
  cancellation_enabled: z.boolean().optional(),
  free_cancellation_hours: z.coerce.number().optional(),
  cancellation_penalty_percent: z.coerce.number().optional(),
  no_show_penalty_percent: z.coerce.number().optional(),
  no_show_always_100_guaranteed: z.boolean().optional(),
  cancellation_text_fr: z.string().max(5000).optional(),
  cancellation_text_en: z.string().max(5000).optional(),
  modification_enabled: z.boolean().optional(),
  modification_deadline_hours: z.coerce.number().optional(),
  require_guarantee_below_score: z.coerce.number().optional().nullable(),
  modification_text_fr: z.string().max(5000).optional(),
  modification_text_en: z.string().max(5000).optional(),
  deposit_per_person: z.coerce.number().optional().nullable(),
});

// =============================================================================
// Consumer Promo Codes
// =============================================================================

export const CreateProConsumerPromoCodeSchema = z.object({
  code: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  discount_bps: z.coerce.number(),
  active: z.boolean().optional(),
  is_public: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  max_uses_total: z.coerce.number().optional().nullable(),
  max_uses_per_user: z.coerce.number().optional().nullable(),
});

export const UpdateProConsumerPromoCodeSchema = z.object({
  description: z.string().max(2000).optional(),
  discount_bps: z.coerce.number().optional(),
  active: z.boolean().optional(),
  is_public: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  max_uses_total: z.coerce.number().optional().nullable(),
  max_uses_per_user: z.coerce.number().optional().nullable(),
});

// =============================================================================
// Inventory Image Delete
// =============================================================================

export const DeleteProInventoryImageSchema = z.object({
  url: z.string().min(1).max(2000),
});

// =============================================================================
// Custom Inventory Labels
// =============================================================================

export const CreateProCustomLabelSchema = z.object({
  label_id: z.string().min(1).max(100),
  emoji: z.string().max(20).optional(),
  title: z.string().min(1).max(200),
  title_ar: z.string().max(200).optional(),
  color: z.string().max(50).optional(),
  sort_order: z.coerce.number().optional(),
});

export const UpdateProCustomLabelSchema = z.object({
  emoji: z.string().max(20).optional(),
  title: z.string().max(200).optional(),
  title_ar: z.string().max(200).optional(),
  color: z.string().max(50).optional(),
  sort_order: z.coerce.number().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Inventory Items Reorder
// =============================================================================

export const ReorderProInventoryItemsSchema = z.object({
  item_ids: z.array(z.string()),
});

// =============================================================================
// Promo Templates
// =============================================================================

export const CreateProPromoTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  discount_bps: z.coerce.number(),
  is_public: z.boolean().optional(),
  max_uses_total: z.coerce.number().optional().nullable(),
  max_uses_per_user: z.coerce.number().optional().nullable(),
  min_cart_amount: z.coerce.number().optional().nullable(),
  valid_days_of_week: z.array(z.unknown()).optional().nullable(),
  valid_hours_start: z.string().max(20).optional().nullable(),
  valid_hours_end: z.string().max(20).optional().nullable(),
  first_purchase_only: z.boolean().optional(),
  new_customers_only: z.boolean().optional(),
  applies_to_pack_ids: z.array(z.string()).optional().nullable(),
  applies_to_slot_ids: z.array(z.string()).optional().nullable(),
});

export const UpdateProPromoTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  discount_bps: z.coerce.number().optional(),
  is_public: z.boolean().optional(),
  max_uses_total: z.coerce.number().optional().nullable(),
  max_uses_per_user: z.coerce.number().optional().nullable(),
  min_cart_amount: z.coerce.number().optional().nullable(),
  valid_days_of_week: z.array(z.unknown()).optional().nullable(),
  valid_hours_start: z.string().max(20).optional().nullable(),
  valid_hours_end: z.string().max(20).optional().nullable(),
  first_purchase_only: z.boolean().optional(),
  new_customers_only: z.boolean().optional(),
  applies_to_pack_ids: z.array(z.string()).optional().nullable(),
  applies_to_slot_ids: z.array(z.string()).optional().nullable(),
});

// =============================================================================
// Create Promo from Template
// =============================================================================

export const CreatePromoFromTemplateSchema = z.object({
  code: z.string().max(100).optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
});
