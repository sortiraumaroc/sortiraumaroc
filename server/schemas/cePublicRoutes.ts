/**
 * CE Public Routes — Zod Validation Schemas
 * (separate from server/schemas/ce.ts which has the main CE schemas)
 *
 * Note: The only POST route (/api/ce/register) already uses
 * registerEmployeeSchema from server/schemas/ce.ts via safeParse.
 * No additional schemas needed here — the zBody wiring will use
 * the existing schema directly.
 */

import { z, zUuid } from "../lib/validate";

// Re-export registerEmployeeSchema for convenience
export { registerEmployeeSchema } from "./ce";

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :code param for registration info lookup */
export const RegistrationCodeParams = z.object({ code: z.string().min(1) });

/** :establishmentId param (UUID) for CE advantages */
export const CeEstablishmentIdParams = z.object({ establishmentId: zUuid });
