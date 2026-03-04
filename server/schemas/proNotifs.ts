/**
 * Pro Notifications — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :establishmentId + :invoiceId */
export const EstablishmentIdInvoiceIdParams = z.object({ establishmentId: zUuid, invoiceId: zUuid });

// =============================================================================
// Body Schemas
// =============================================================================

// PUT /api/pro/:establishmentId/permissions
export const UpdatePermissionsSchema = z.object({
  role: z.string().min(1),
  permissions: z.record(z.boolean()),
});

// PUT /api/pro/notification-preferences
export const UpdateProNotifPreferencesSchema = z.object({
  popupsEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});
