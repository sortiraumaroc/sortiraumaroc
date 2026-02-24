/**
 * CE Company Admin Routes — Zod Validation Schemas
 * (separate from server/schemas/ce.ts which has the main CE schemas)
 *
 * Note: The only PUT route (/api/ce/company/settings) already uses
 * updateCompanySettingsSchema from server/schemas/ce.ts via safeParse.
 * No additional schemas needed here — the zBody wiring will use
 * the existing schema directly.
 */

// Re-export updateCompanySettingsSchema for convenience
export { updateCompanySettingsSchema } from "./ce";
