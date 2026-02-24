/**
 * Partnership Pro Routes — Zod Validation Schemas
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :lineId */
export const LineIdParams = z.object({ lineId: zUuid });

// =============================================================================
// Body Schemas
// =============================================================================

/** POST /api/pro/partnership/accept */
export const acceptPartnershipSchema = z.object({
  establishment_id: z.string().min(1),
});

/** POST /api/pro/partnership/refuse */
export const refusePartnershipSchema = z.object({
  establishment_id: z.string().min(1),
  reason: z.string().optional(),
});

/** POST /api/pro/partnership/request-modification */
export const requestModificationSchema = z.object({
  establishment_id: z.string().min(1),
  comment: z.string().min(1),
});

/** PUT /api/pro/partnership/lines/:lineId/toggle */
export const togglePartnershipLineSchema = z.object({
  establishment_id: z.string().min(1),
});
