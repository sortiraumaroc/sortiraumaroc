/**
 * CE Pro Routes — Zod Validation Schemas
 *
 * Re-exports existing schemas from ce.ts with  wrappers.
 */

import { z } from "zod";
import {
  validateScanSchema,
  createAdvantageSchema,
  updateAdvantageSchema,
} from "./ce";

// Wrap existing schemas with  for zBody usage
export const validateScanBodySchema = validateScanSchema;
export const createAdvantageBodySchema = createAdvantageSchema;
export const updateAdvantageBodySchema = updateAdvantageSchema;

/** Generic body with establishment_id for advantage upsert */
export const advantageUpsertBodySchema = z.object({
  establishment_id: z.string().min(1),
});
