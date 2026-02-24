/**
 * Zod Schemas for Admin Users Routes
 *
 * Validates admin-facing user management inputs: Pro user creation,
 * memberships, suspension, bulk deletion, consumer user status/events/purchases.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :id/events/:eventId — consumer user event */
export const ConsumerUserEventParams = z.object({
  id: zUuid,
  eventId: zUuid,
});

/** :id/purchases/:purchaseId — consumer user purchase */
export const ConsumerUserPurchaseParams = z.object({
  id: zUuid,
  purchaseId: zUuid,
});

// =============================================================================
// Pro Users
// =============================================================================

/**
 * POST /api/admin/pros/users
 * Handler: createProUser
 */
export const CreateProUserSchema = z.object({
  email: z.string().min(1, "Email requis"),
  establishment_ids: z.array(z.string()).optional(),
  role: z.string().optional(),
});

/**
 * POST /api/admin/pros/users/:id/memberships
 * Handler: setProUserMemberships
 */
export const SetProUserMembershipsSchema = z.object({
  establishment_ids: z.array(z.string()).min(1, "Identifiants d'établissements requis"),
  role: z.string().optional(),
});

/**
 * POST /api/admin/pros/users/:id/suspend
 * Handler: suspendProUser
 */
export const SuspendProUserSchema = z.object({
  suspend: z.boolean(),
  reason: z.string().optional().nullable(),
  admin_user_id: z.string().optional().nullable(),
});

/**
 * POST /api/admin/pros/users/bulk-delete
 * Handler: bulkDeleteProUsers
 */
export const BulkDeleteProUsersSchema = z.object({
  ids: z.array(z.string()).min(1, "Aucun utilisateur sélectionné"),
  admin_user_id: z.string().optional().nullable(),
});

// =============================================================================
// Consumer Users
// =============================================================================

/**
 * POST /api/admin/users/:id/status
 * Handler: updateConsumerUserStatus
 */
export const UpdateConsumerUserStatusSchema = z.object({
  status: z.enum(["active", "suspended"], { message: "status must be active or suspended" }),
});

/**
 * POST /api/admin/users/:id/events/:eventId
 * Handler: updateConsumerUserEvent
 */
export const UpdateConsumerUserEventSchema = z.object({
  event_type: z.string().optional(),
  occurred_at: z.string().optional(),
  metadata: z.any().optional(),
});

/**
 * POST /api/admin/users/:id/purchases/:purchaseId
 * Handler: updateConsumerUserPurchase
 */
export const UpdateConsumerUserPurchaseSchema = z.object({
  status: z.string().optional(),
  currency: z.string().optional(),
  total_amount: z.coerce.number().optional(),
  purchased_at: z.string().optional(),
  items: z.any().optional(),
  metadata: z.any().optional(),
});

/**
 * POST /api/admin/users/delete
 * Handler: deleteConsumerUsers
 */
export const DeleteConsumerUsersSchema = z.object({
  ids: z.array(z.string()).min(1, "Aucun utilisateur sélectionné"),
});
