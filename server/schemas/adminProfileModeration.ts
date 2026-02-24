/**
 * Zod Schemas for Admin Profile Moderation Routes
 *
 * Validates admin-facing profile moderation inputs: moderation item
 * rejection (with required reason), and profile change accept/reject
 * with optional corrected values.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

// =============================================================================
// Moderation Queue
// =============================================================================

/**
 * POST /api/admin/moderation/:id/reject
 * Handler: rejectModerationItem
 *
 * Note: approveModerationItem does NOT read req.body, so no schema needed.
 */
export const RejectModerationItemSchema = z.object({
  reason: z.string().min(1, "Raison requise"),
});

// =============================================================================
// Per-field Profile Change Review
// =============================================================================

/**
 * POST /api/admin/establishments/:id/profile-updates/:draftId/changes/:changeId/accept
 * Handler: acceptAdminEstablishmentProfileChange
 *
 * The handler checks for `correctedValue` in the body for optional corrections.
 */
export const AcceptProfileChangeSchema = z.object({
  correctedValue: z.any().optional(),
});

/**
 * POST /api/admin/establishments/:id/profile-updates/:draftId/changes/:changeId/reject
 * Handler: rejectAdminEstablishmentProfileChange
 */
export const RejectProfileChangeSchema = z.object({
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/establishments/:id/profile-updates/:draftId/reject-all
 * Handler: rejectAllAdminEstablishmentProfileUpdates
 */
export const RejectAllProfileUpdatesSchema = z.object({
  reason: z.string().optional().nullable(),
});
