/**
 * Zod Schemas for Loyalty V2 Admin Routes
 */

import { z } from "zod";

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/loyalty/programs */
export const ListAdminProgramsQuery = z.object({
  status: z.string().optional(),
  establishment_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** GET /api/admin/loyalty/alerts */
export const ListAdminAlertsQuery = z.object({
  status: z.string().optional(),
  alert_type: z.string().optional(),
  establishment_id: z.string().optional(),
});

/** GET /api/admin/gifts */
export const ListAdminGiftsQuery = z.object({
  status: z.string().optional(),
  establishment_id: z.string().optional(),
});

// POST /api/admin/loyalty/programs/:id/suspend
export const SuspendProgramSchema = z.object({
  reason: z.string().optional(),
  admin_id: z.string().optional(),
});

// POST /api/admin/loyalty/alerts/:id/review
export const ReviewAlertSchema = z.object({
  admin_id: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/admin/loyalty/alerts/:id/dismiss
export const DismissAlertSchema = z.object({
  admin_id: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/admin/gifts/:id/approve
export const ApproveGiftSchema = z.object({
  admin_id: z.string().optional(),
});

// POST /api/admin/gifts/:id/reject
export const RejectGiftSchema = z.object({
  admin_id: z.string().optional(),
  reason: z.string(),
});

// POST /api/admin/gifts/:id/distribute/manual
export const DistributeGiftManualSchema = z.object({
  admin_id: z.string().optional(),
  user_ids: z.array(z.string()),
});

// POST /api/admin/gifts/:id/distribute/criteria
export const DistributeGiftCriteriaSchema = z.object({
  admin_id: z.string().optional(),
  city: z.string().optional(),
  min_reservations: z.number().optional(),
  inactive_days: z.number().optional(),
  max_recipients: z.number().optional(),
});

// POST /api/admin/gifts/:id/distribute/public
export const DistributeGiftPublicSchema = z.object({
  admin_id: z.string().optional(),
});
