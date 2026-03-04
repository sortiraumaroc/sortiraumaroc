/**
 * Referral Routes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// =============================================================================
// PUBLIC
// =============================================================================

/** POST /api/public/referral/link */
export const trackReferralLinkSchema = z.object({
  referral_code: z.string().min(1),
  referree_user_id: z.string().min(1),
  source: z.string().optional(),
  source_url: z.string().optional(),
});

// =============================================================================
// CONSUMER (authenticated)
// =============================================================================

/** POST /api/referral/apply */
export const applyReferralSchema = z.object({
  referral_code: z.string().optional(),
  partner_type: z.string().optional(),
  display_name: z.string().optional(),
  bio: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_holder: z.string().optional(),
  bank_rib: z.string().optional(),
});

/** PATCH /api/referral/me */
export const updateReferralProfileSchema = z.object({
  display_name: z.string().optional(),
  bio: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_holder: z.string().optional(),
  bank_rib: z.string().optional(),
});

// =============================================================================
// ADMIN
// =============================================================================

/** PATCH /api/admin/referral/partners/:id */
export const updateReferralPartnerSchema = z.object({
  status: z.string().min(1),
  rejection_reason: z.string().optional(),
  admin_notes: z.string().optional(),
});

/** PATCH /api/admin/referral/config */
export const updateReferralConfigSchema = z.object({
  default_commission_percent: z.number().optional(),
  default_commission_fixed_cents: z.number().optional(),
  commission_mode: z.string().optional(),
  commission_base: z.string().optional(),
  min_reservation_amount_cents: z.number().optional(),
  min_commission_amount_cents: z.number().optional(),
  is_active: z.boolean().optional(),
});

/** PUT /api/admin/referral/config/universes/:universe */
export const updateReferralUniverseConfigSchema = z.object({
  commission_percent: z.number().optional(),
  commission_fixed_cents: z.number().optional(),
  is_active: z.boolean().optional(),
});

/** POST /api/admin/referral/payouts */
export const createReferralPayoutSchema = z.object({
  partner_id: z.string().min(1),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
});

/** PATCH /api/admin/referral/payouts/:id */
export const updateReferralPayoutSchema = z.object({
  status: z.string().min(1),
  payment_method: z.string().optional(),
  payment_reference: z.string().optional(),
  admin_notes: z.string().optional(),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/referral/me/referrees */
export const ListMyReferreesQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/referral/me/commissions */
export const ListMyCommissionsQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/referral/me/payouts */
export const ListMyPayoutsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/admin/referral/partners */
export const ListReferralPartnersQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/admin/referral/commissions */
export const ListAllCommissionsQuery = z.object({
  status: z.string().optional(),
  partner_id: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :code param for referral codes */
export const ReferralCodeParams = z.object({ code: z.string().min(1) });

/** :id param for referral partners (UUID) */
export const ReferralPartnerIdParams = z.object({ id: zUuid });

/** :id param for referral payouts (UUID) */
export const ReferralPayoutIdParams = z.object({ id: zUuid });

/** :universe param for referral config */
export const ReferralUniverseParams = z.object({ universe: z.string().min(1) });
