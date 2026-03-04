/**
 * Consumer TOTP Routes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// POST /api/consumer/totp/validate
export const ValidateConsumerTotpSchema = z.object({
  qrString: z.string().optional(),
  code: z.string().optional(),
  userId: z.string().optional(),
  establishmentId: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :userId param for user-info lookup (UUID) */
export const ConsumerUserIdParams = z.object({ userId: zUuid });
