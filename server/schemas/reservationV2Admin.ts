/**
 * Reservation V2 Admin Routes — Zod Validation Schemas
 */

import { z } from "zod";

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/reservations */
export const ListAdminReservationsQuery = z.object({
  status: z.string().optional(),
  establishment_id: z.string().optional(),
  date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** GET /api/admin/disputes */
export const ListAdminDisputesQuery = z.object({
  status: z.string().optional(),
});

/** GET /api/admin/clients/low-score */
export const GetAdminLowScoreClientsQuery = z.object({
  threshold: z.coerce.number().int().min(0).max(100).optional(),
});

/** GET /api/admin/stats/reservations */
export const GetAdminReservationStatsQuery = z.object({
  period: z.string().optional(),
});

/** POST /api/admin/disputes/:id/arbitrate */
export const arbitrateDisputeSchema = z.object({
  decision: z.enum(["favor_client", "favor_pro", "indeterminate"]),
  notes: z.string().optional(),
});

/** POST /api/admin/establishments/:id/deactivate */
export const deactivateEstablishmentSchema = z.object({
  days: z.number().optional(),
  reason: z.string().optional(),
});

/** POST /api/admin/establishments/:id/reactivate */
export const reactivateEstablishmentSchema = z.object({
  reason: z.string().optional(),
});

/** POST /api/admin/sanctions/:id/lift */
export const liftSanctionSchema = z.object({
  reason: z.string().optional(),
});
