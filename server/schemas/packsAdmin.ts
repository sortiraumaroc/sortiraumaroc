/**
 * Zod Schemas for Packs Admin Routes
 *
 * Validates admin-facing pack inputs: moderation, modules, commissions,
 * billing, platform promos, and refunds.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zNonEmptyString, zUuid } from "../lib/validate";

// =============================================================================
// Param Schemas
// =============================================================================

/** Routes with :module and :id — e.g. /modules/:module/toggle-establishment/:id */
export const ModuleToggleParams = z.object({
  module: z.string().min(1, "Module requis"),
  id: zUuid,
});

/** Routes with :module only — e.g. /modules/:module/toggle-global */
export const ModuleParams = z.object({
  module: z.string().min(1, "Module requis"),
});

// =============================================================================
// Pack Moderation
// =============================================================================

/**
 * POST /api/admin/packs/:id/reject
 * Handler: rejectPackRoute
 */
export const RejectPackSchema = z.object({
  reason: z.string().min(5, "Le motif de rejet est obligatoire (min 5 caracteres)"),
});

/**
 * POST /api/admin/packs/:id/request-modification
 * Handler: requestModificationRoute
 */
export const RequestPackModificationSchema = z.object({
  note: z.string().min(5, "La note de modification est obligatoire (min 5 caracteres)"),
});

// =============================================================================
// Modules
// =============================================================================

/**
 * POST /api/admin/modules/:module/toggle-global
 * POST /api/admin/modules/:module/toggle-establishment/:id
 * Handlers: toggleGlobalModuleRoute, toggleEstablishmentModuleRoute
 */
export const ToggleModuleSchema = z.object({
  activate: z.boolean(),
});

// =============================================================================
// Commissions
// =============================================================================

/**
 * PUT /api/admin/commissions/:id
 * Handler: updateCommission
 */
export const UpdateCommissionSchema = z.object({
  rate: z.number().optional(),
  min_fee: z.number().nullable().optional(),
  max_fee: z.number().nullable().optional(),
});

/**
 * POST /api/admin/commissions/establishment
 * Handler: createCustomCommission
 */
export const CreateCustomCommissionSchema = z.object({
  establishment_id: zNonEmptyString,
  rate: z.number(),
  min_fee: z.number().nullable().optional(),
  max_fee: z.number().nullable().optional(),
  type: z.string().optional(),
});

/**
 * PUT /api/admin/commissions/establishment/:id
 * Handler: updateCustomCommission
 */
export const UpdateCustomCommissionSchema = z.object({
  rate: z.number().optional(),
  min_fee: z.number().nullable().optional(),
  max_fee: z.number().nullable().optional(),
});

// =============================================================================
// Billing
// =============================================================================

/**
 * POST /api/admin/billing/invoices/:id/contest
 * Handler: contestInvoiceRoute
 */
export const ContestInvoiceSchema = z.object({
  message: z.string().optional(),
});

/**
 * POST /api/admin/billing/payments/batch-execute
 * Handler: batchExecutePayments
 */
export const BatchExecutePaymentsSchema = z.object({
  period_ids: z.array(z.string()).min(1, "missing_period_ids"),
});

/**
 * POST /api/admin/billing/disputes/:id/respond
 * Handler: respondToDisputeRoute
 */
export const RespondToDisputeSchema = z.object({
  accepted: z.boolean(),
  response: zNonEmptyString,
  correction_amount: z.number().optional(),
});

// =============================================================================
// Platform Promos
// =============================================================================

/**
 * POST /api/admin/pack-promos
 * Handler: createPlatformPromo
 */
export const CreatePlatformPromoSchema = z.object({
  code: z.string().optional(),
  discount_type: z.enum(["percentage", "fixed"]).optional(),
  discount_value: z.number(),
  pack_ids: z.array(z.string()).nullable().optional(),
  max_uses: z.number().nullable().optional(),
  max_uses_per_user: z.number().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
});

/**
 * PUT /api/admin/pack-promos/:id
 * Handler: updatePlatformPromo
 */
export const UpdatePlatformPromoSchema = z.object({
  code: z.string().optional(),
  discount_type: z.enum(["percentage", "fixed"]).optional(),
  discount_value: z.number().optional(),
  pack_ids: z.array(z.string()).nullable().optional(),
  max_uses: z.number().nullable().optional(),
  max_uses_per_user: z.number().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Refunds
// =============================================================================

/**
 * POST /api/admin/refunds/:id/reject
 * Handler: rejectRefund
 */
export const RejectRefundSchema = z.object({
  reason: z.string().optional(),
});
