/**
 * Zod Schemas for Packs Pro Routes
 *
 * Validates pro-facing pack management inputs (packs, promos, billing, wallet).
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :id (pack, purchase, or promo) */
export const PackIdParams = z.object({ id: zUuid });

// =============================================================================
// Pack Management
// =============================================================================

export const CreatePackSchema = z.object({
  establishment_id: z.string().min(1),
  title: z.string().optional(),
  short_description: z.string().optional(),
  detailed_description: z.string().optional(),
  cover_url: z.string().optional(),
  additional_photos: z.array(z.string()).optional(),
  category: z.string().optional(),
  price: z.coerce.number().optional(),
  original_price: z.coerce.number().optional(),
  party_size: z.coerce.number().optional(),
  items: z.array(z.record(z.unknown())).optional(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  conditions: z.string().optional(),
  valid_days: z.array(z.coerce.number()).optional(),
  valid_time_start: z.string().optional(),
  valid_time_end: z.string().optional(),
  sale_start_date: z.string().optional(),
  sale_end_date: z.string().optional(),
  validity_start_date: z.string().optional(),
  validity_end_date: z.string().optional(),
  stock: z.coerce.number().optional(),
  limit_per_client: z.coerce.number().optional(),
  is_multi_use: z.boolean().optional(),
  total_uses: z.coerce.number().optional(),
});

export const UpdatePackSchema = z.object({
  title: z.string().optional(),
  short_description: z.string().optional(),
  detailed_description: z.string().optional(),
  cover_url: z.string().optional(),
  additional_photos: z.array(z.string()).optional(),
  category: z.string().optional(),
  price: z.coerce.number().optional(),
  original_price: z.coerce.number().optional(),
  party_size: z.coerce.number().optional(),
  items: z.array(z.record(z.unknown())).optional(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  conditions: z.string().optional(),
  valid_days: z.array(z.coerce.number()).optional(),
  valid_time_start: z.string().optional(),
  valid_time_end: z.string().optional(),
  sale_start_date: z.string().optional(),
  sale_end_date: z.string().optional(),
  validity_start_date: z.string().optional(),
  validity_end_date: z.string().optional(),
  stock: z.coerce.number().optional(),
  limit_per_client: z.coerce.number().optional(),
  is_multi_use: z.boolean().optional(),
  total_uses: z.coerce.number().optional(),
});

// =============================================================================
// QR Scan & Consume
// =============================================================================

export const ScanAndConsumeSchema = z.object({
  qr_code_token: z.string().min(1),
  establishment_id: z.string().min(1),
  purchase_id: z.string().optional(),
});

// =============================================================================
// Promo Codes
// =============================================================================

export const CreatePromoSchema = z.object({
  establishment_id: z.string().min(1),
  code: z.string().optional(),
  discount_type: z.string().optional(),
  discount_value: z.coerce.number().optional(),
  pack_ids: z.array(z.string()).nullable().optional(),
  max_uses: z.coerce.number().nullable().optional(),
  max_uses_per_user: z.coerce.number().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
});

export const UpdatePromoSchema = z.object({
  code: z.string().optional(),
  discount_type: z.string().optional(),
  discount_value: z.coerce.number().optional(),
  pack_ids: z.array(z.string()).nullable().optional(),
  max_uses: z.coerce.number().nullable().optional(),
  max_uses_per_user: z.coerce.number().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Billing Disputes
// =============================================================================

export const CreateBillingDisputeSchema = z.object({
  billing_period_id: z.string().min(1),
  reason: z.string().min(1),
  disputed_transactions: z.array(z.string()).nullable().optional(),
  evidence: z.record(z.unknown()).optional(),
});

// =============================================================================
// Wallet Top-up
// =============================================================================

export const TopupWalletSchema = z.object({
  establishment_id: z.string().min(1),
  amount: z.coerce.number().min(1),
  payment_reference: z.string().optional(),
});
