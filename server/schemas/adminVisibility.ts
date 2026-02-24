/**
 * Zod Schemas for Admin Visibility Routes
 *
 * Validates admin-facing visibility module inputs: offers, promo codes
 * (visibility & consumer), order status, and order item meta updates.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :orderId/items/:itemId — visibility order item */
export const VisibilityOrderItemParams = z.object({
  orderId: zUuid,
  itemId: zUuid,
});

/** :invoiceId — visibility invoices */
export const VisibilityInvoiceParams = z.object({
  invoiceId: zUuid,
});

// =============================================================================
// Visibility Offers
// =============================================================================

/**
 * POST /api/admin/visibility/offers
 * Handler: createAdminVisibilityOffer
 */
export const CreateAdminVisibilityOfferSchema = z.object({
  title: z.string().min(1, "Titre requis"),
  description: z.string().optional().nullable(),
  type: z.string().min(1, "Type requis"),
  deliverables: z.array(z.string()).optional(),
  duration_days: z.coerce.number().optional().nullable(),
  price_cents: z.coerce.number().optional().nullable(),
  currency: z.string().optional(),
  active: z.boolean().optional(),
  allow_quantity: z.boolean().optional(),
  tax_rate_bps: z.coerce.number().optional(),
  tax_label: z.string().optional().nullable(),
  display_order: z.coerce.number().optional(),
});

/**
 * POST /api/admin/visibility/offers/:id/update
 * Handler: updateAdminVisibilityOffer
 */
export const UpdateAdminVisibilityOfferSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  type: z.string().optional(),
  deliverables: z.array(z.string()).optional(),
  duration_days: z.coerce.number().optional().nullable(),
  price_cents: z.coerce.number().optional().nullable(),
  currency: z.string().optional(),
  active: z.boolean().optional(),
  allow_quantity: z.boolean().optional(),
  tax_rate_bps: z.coerce.number().optional(),
  tax_label: z.string().optional().nullable(),
  display_order: z.coerce.number().optional(),
});

// =============================================================================
// Visibility Promo Codes
// =============================================================================

/**
 * POST /api/admin/visibility/promo-codes
 * Handler: createAdminVisibilityPromoCode
 */
export const CreateAdminVisibilityPromoCodeSchema = z.object({
  code: z.string().min(1, "Code requis"),
  description: z.string().optional().nullable(),
  discount_bps: z.coerce.number().min(1, "La remise doit être supérieure à 0"),
  applies_to_type: z.string().optional().nullable(),
  applies_to_offer_id: z.string().optional().nullable(),
  applies_to_establishment_ids: z.array(z.string()).optional().nullable(),
  active: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
});

/**
 * POST /api/admin/visibility/promo-codes/:id/update
 * Handler: updateAdminVisibilityPromoCode
 */
export const UpdateAdminVisibilityPromoCodeSchema = z.object({
  code: z.string().optional(),
  description: z.string().optional().nullable(),
  discount_bps: z.coerce.number().optional(),
  applies_to_type: z.string().optional().nullable(),
  applies_to_offer_id: z.string().optional().nullable(),
  applies_to_establishment_ids: z.array(z.string()).optional().nullable(),
  active: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
});

// =============================================================================
// Consumer Promo Codes
// =============================================================================

/**
 * POST /api/admin/consumer/promo-codes
 * Handler: createAdminConsumerPromoCode
 */
export const CreateAdminConsumerPromoCodeSchema = z.object({
  code: z.string().min(1, "Code requis"),
  description: z.string().optional().nullable(),
  discount_bps: z.coerce.number().min(1, "La remise doit être supérieure à 0"),
  applies_to_pack_id: z.string().optional().nullable(),
  applies_to_establishment_ids: z.array(z.string()).optional().nullable(),
  active: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
});

/**
 * POST /api/admin/consumer/promo-codes/:id/update
 * Handler: updateAdminConsumerPromoCode
 */
export const UpdateAdminConsumerPromoCodeSchema = z.object({
  code: z.string().optional(),
  description: z.string().optional().nullable(),
  discount_bps: z.coerce.number().optional(),
  applies_to_pack_id: z.string().optional().nullable(),
  applies_to_establishment_ids: z.array(z.string()).optional().nullable(),
  active: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
});

// =============================================================================
// Visibility Orders
// =============================================================================

/**
 * POST /api/admin/visibility/orders/:id/update-status
 * Handler: updateAdminVisibilityOrderStatus
 */
export const UpdateAdminVisibilityOrderStatusSchema = z.object({
  status: z.enum(
    ["pending", "in_progress", "delivered", "cancelled", "refunded"],
    { message: "invalid_status" },
  ),
});

/**
 * POST /api/admin/visibility/orders/:orderId/items/:itemId/update-meta
 * Handler: updateAdminVisibilityOrderItemMeta
 */
export const UpdateAdminVisibilityOrderItemMetaSchema = z.object({
  meta: z.record(z.unknown()).refine((v) => v !== null && typeof v === "object", {
    message: "Les métadonnées doivent être un objet",
  }),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/visibility/offers */
export const ListVisibilityOffersQuery = z.object({
  include_deleted: z.string().optional(),
});

/** GET /api/admin/visibility/promo-codes */
export const ListVisibilityPromoCodesQuery = z.object({
  include_deleted: z.string().optional(),
});

/** GET /api/admin/consumer/promo-codes */
export const ListConsumerPromoCodesQuery = z.object({
  include_deleted: z.string().optional(),
});

/** GET /api/admin/visibility/orders */
export const ListVisibilityOrdersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100).optional(),
  payment_status: z.string().optional(),
  status: z.string().optional(),
});
