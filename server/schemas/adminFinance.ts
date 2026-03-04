/**
 * Zod Schemas for Admin Finance Routes
 *
 * Validates admin-facing finance inputs: commission overrides, pro terms,
 * payout requests, bank details (RIB), contracts, and booking policies.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :establishmentId — commission overrides */
export const CommissionOverrideParams = z.object({
  establishmentId: zUuid,
});

// =============================================================================
// Commission Overrides
// =============================================================================

/**
 * POST /api/admin/commission-overrides
 * Handler: createAdminCommissionOverride
 */
export const CreateCommissionOverrideSchema = z.object({
  establishment_id: z.string().min(1, "Identifiant d'établissement requis"),
  active: z.boolean().optional(),
  commission_percent: z.coerce.number().optional().nullable(),
  commission_amount_cents: z.coerce.number().optional().nullable(),
  pack_commission_percent: z.coerce.number().optional().nullable(),
  pack_commission_amount_cents: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * PUT /api/admin/commission-overrides/:establishmentId
 * Handler: updateAdminCommissionOverride
 */
export const UpdateCommissionOverrideSchema = z.object({
  active: z.boolean().optional(),
  commission_percent: z.coerce.number().optional().nullable(),
  commission_amount_cents: z.coerce.number().optional().nullable(),
  pack_commission_percent: z.coerce.number().optional().nullable(),
  pack_commission_amount_cents: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// =============================================================================
// Pro Terms
// =============================================================================

/**
 * PUT /api/admin/pro-terms
 * Handler: updateAdminProTerms
 */
export const UpdateProTermsSchema = z.object({
  version: z.string().min(1, "Version requise"),
  title: z.string().min(1, "Titre requis"),
  body: z.string().optional(),
});

// =============================================================================
// Payout Requests
// =============================================================================

/**
 * PUT /api/admin/payout-requests/:id
 * Handler: updateAdminPayoutRequest
 */
export const UpdatePayoutRequestSchema = z.object({
  status: z.enum(["submitted", "approved", "rejected", "paid"]).optional(),
  admin_comment: z.string().optional().nullable(),
  paid_reference: z.string().optional().nullable(),
});

// =============================================================================
// Bank Details (RIB)
// =============================================================================

/**
 * PUT /api/admin/establishments/:id/bank-details
 * Handler: upsertAdminEstablishmentBankDetails
 *
 * Fields extracted by parseRibBody():
 *   bank_code, locality_code, branch_code, account_number, rib_key (RIB 24 parts)
 *   holder_name (required), holder_address, bank_address
 */
export const UpsertBankDetailsSchema = z.object({
  bank_code: z.string().optional(),
  locality_code: z.string().optional(),
  branch_code: z.string().optional(),
  account_number: z.string().optional(),
  rib_key: z.string().optional(),
  holder_name: z.string().min(1, "Nom du titulaire requis"),
  holder_address: z.string().optional().nullable(),
  bank_address: z.string().optional().nullable(),
});

// =============================================================================
// Establishment Contracts (metadata update only — upload is binary/raw)
// =============================================================================

/**
 * PUT /api/admin/establishments/:id/contracts/:contractId
 * Handler: updateAdminEstablishmentContract
 */
export const UpdateContractSchema = z.object({
  contract_type: z.string().optional(),
  contract_reference: z.string().optional().nullable(),
  signed_at: z.string().optional().nullable(),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

// =============================================================================
// Booking Policies
// =============================================================================

/**
 * PUT /api/admin/establishments/:id/booking-policy
 * Handler: updateAdminEstablishmentBookingPolicy
 */
export const UpdateBookingPolicySchema = z.object({
  cancellation_enabled: z.union([z.boolean(), z.string(), z.number()]).optional(),
  free_cancellation_hours: z.coerce.number().optional(),
  cancellation_penalty_percent: z.coerce.number().min(0).max(100).optional(),
  no_show_penalty_percent: z.coerce.number().min(0).max(100).optional(),
  no_show_always_100_guaranteed: z.union([z.boolean(), z.string(), z.number()]).optional(),
  cancellation_text_fr: z.string().optional(),
  cancellation_text_en: z.string().optional(),
  modification_enabled: z.union([z.boolean(), z.string(), z.number()]).optional(),
  modification_deadline_hours: z.coerce.number().optional(),
  require_guarantee_below_score: z.coerce.number().min(0).max(100).optional().nullable(),
  modification_text_fr: z.string().optional(),
  modification_text_en: z.string().optional(),
  protection_window_hours: z.coerce.number().optional(),
});
