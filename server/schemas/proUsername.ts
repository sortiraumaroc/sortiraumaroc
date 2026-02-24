/**
 * Pro Username — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :establishmentId + :requestId */
export const EstablishmentIdRequestIdParams = z.object({ establishmentId: zUuid, requestId: zUuid });

// =============================================================================
// Body Schemas
// =============================================================================

// POST — submitUsernameRequest
export const SubmitUsernameRequestSchema = z.object({
  username: z.string().min(1),
});
