/**
 * TOTP Routes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// ── Route Params ────────────────────────────────────────────────────────────

/** :reservationId */
export const ReservationIdParams = z.object({ reservationId: zUuid });

// ── Body Schemas ────────────────────────────────────────────────────────────

// POST /api/totp/validate
export const ValidateTotpSchema = z.object({
  code: z.string().optional(),
  qrString: z.string().optional(),
  reservationId: z.string().optional(),
  establishmentId: z.string().optional(),
});
