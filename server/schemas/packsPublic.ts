/**
 * Zod Schemas for Packs Public Routes
 *
 * Validates consumer-facing pack purchase inputs.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z, zUuid } from "../lib/validate";

// =============================================================================
// Purchase Pack
// =============================================================================

export const PurchasePackSchema = z.object({
  promo_code: z.string().max(50).optional().nullable(),
  payment_reference: z.string().max(200).optional().nullable(),
  payment_method: z.string().max(50).optional().nullable(),
});

// =============================================================================
// Validate Pack Promo
// =============================================================================

export const ValidatePackPromoSchema = z.object({
  code: z.string().min(1).max(50),
  pack_id: z.string().min(1),
  pack_price: z.coerce.number().optional().nullable(),
  establishment_id: z.string().optional().nullable(),
});

// =============================================================================
// Request Pack Refund
// =============================================================================

export const RequestPackRefundSchema = z.object({
  reason: z.string().max(500).optional(),
  prefer_credit: z.boolean().optional(),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/packs — List active packs */
export const ListActivePacksQuery = z.object({
  category: z.string().optional(),
  city: z.string().optional(),
  min_price: z.coerce.number().optional(),
  max_price: z.coerce.number().optional(),
  min_discount: z.coerce.number().optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  per_page: z.coerce.number().int().min(1).max(50).default(20).optional(),
});

/** GET /api/me/packs — My purchased packs */
export const ListMyPacksQuery = z.object({
  status: z.string().optional(),
});

/** GET /api/me/transactions — My transaction history */
export const ListMyTransactionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  per_page: z.coerce.number().int().min(1).max(50).default(20).optional(),
  type: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for packs (UUID) */
export const PackIdParams = z.object({ id: zUuid });

/** :purchaseId param for pack purchases (UUID) */
export const PurchaseIdParams = z.object({ purchaseId: zUuid });
