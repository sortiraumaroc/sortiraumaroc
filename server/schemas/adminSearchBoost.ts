/**
 * Zod Schemas for Admin Search Boost Routes
 *
 * Validates admin-facing search boost inputs: create and update event rules
 * for contextual boosting.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zNonEmptyString } from "../lib/validate";

// =============================================================================
// Boost Events
// =============================================================================

/**
 * POST /api/admin/search/boost-events
 * Handler: inline (create event rule)
 */
export const CreateBoostEventSchema = z.object({
  name: zNonEmptyString.pipe(z.string().max(100, "name max 100 chars")),
  date_from: zNonEmptyString,
  date_to: zNonEmptyString,
  boost_config: z.record(z.any()),
  priority: z.number().min(1).max(100).optional(),
});

/**
 * PUT /api/admin/search/boost-events/:id
 * Handler: inline (update event rule)
 */
export const UpdateBoostEventSchema = z.object({
  name: z.string().max(100).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  boost_config: z.record(z.any()).optional(),
  priority: z.number().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});
