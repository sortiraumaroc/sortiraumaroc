/**
 * Zod Schemas for Wheel Admin Routes
 *
 * Validates admin-facing wheel of fortune inputs: create/update events,
 * prize management, and external code uploads.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zNonEmptyString, zUuid } from "../lib/validate";

// =============================================================================
// Query Schemas
// =============================================================================

/** GET /api/admin/wheel */
export const ListWheelEventsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// =============================================================================
// Param Schemas
// =============================================================================

/** Routes with :prizeId — e.g. /wheel/prizes/:prizeId */
export const WheelPrizeIdParams = z.object({
  prizeId: zUuid,
});

// =============================================================================
// Wheel Events
// =============================================================================

/**
 * POST /api/admin/wheel
 * Handler: createWheelEventRoute
 */
export const CreateWheelEventSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  welcome_message: z.string().optional(),
  already_played_message: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  max_spins_per_user: z.number().optional(),
  daily_spin_limit: z.number().optional(),
  is_active: z.boolean().optional(),
  theme: z.any().optional(),
});

/**
 * PUT /api/admin/wheel/:id
 * Handler: updateWheelEventRoute
 */
export const UpdateWheelEventSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  welcome_message: z.string().optional(),
  already_played_message: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  max_spins_per_user: z.number().optional(),
  daily_spin_limit: z.number().optional(),
  is_active: z.boolean().optional(),
  theme: z.any().optional(),
});

// =============================================================================
// Prizes
// =============================================================================

/**
 * POST /api/admin/wheel/:id/prizes
 * Handler: addPrizeRoute
 */
export const AddPrizeSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  conditions: z.string().optional(),
  type: z.string().optional(),
  value: z.any().optional(),
  probability: z.number().optional(),
  total_quantity: z.number().nullable().optional(),
  position: z.number().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * PUT /api/admin/wheel/prizes/:prizeId
 * Handler: updatePrizeRoute
 */
export const UpdatePrizeSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  conditions: z.string().optional(),
  type: z.string().optional(),
  value: z.any().optional(),
  probability: z.number().optional(),
  total_quantity: z.number().nullable().optional(),
  position: z.number().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * POST /api/admin/wheel/prizes/:prizeId/upload-codes
 * Handler: uploadExternalCodesRoute
 */
export const UploadExternalCodesSchema = z.object({
  csv_content: zNonEmptyString,
});
