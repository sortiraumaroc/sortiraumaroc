/**
 * Conciergerie Pro Inbox — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// POST /api/pro/conciergerie/requests/:id/accept
export const AcceptRequestSchema = z.object({
  proposed_price: z.number().optional().nullable(),
  response_note: z.string().optional(),
});

// POST /api/pro/conciergerie/requests/:id/refuse
export const RefuseRequestSchema = z.object({
  response_note: z.string().optional(),
});

// POST /api/pro/conciergerie/scan
export const ConciergerieScanSchema = z.object({
  payload: z.string().min(1),
  establishment_id: z.string().min(1),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for conciergerie requests (UUID) */
export const ConciergerieRequestIdParams = z.object({ id: zUuid });
