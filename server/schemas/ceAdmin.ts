/**
 * Zod Schemas for CE Admin Routes
 *
 * Passthrough wrappers around existing ce.ts schemas for zBody() middleware.
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";
import {
  createCompanySchema,
  updateCompanySchema,
  createAdvantageSchema,
  updateAdvantageSchema,
} from "./ce";

// =============================================================================
// Param Schemas
// =============================================================================

/** Routes with :companyId — e.g. /ce/export/employees/:companyId */
export const CeCompanyIdParams = z.object({
  companyId: zUuid,
});

// POST /api/admin/ce/companies
export const CeAdminCreateCompanySchema = createCompanySchema;

// PUT /api/admin/ce/companies/:id
export const CeAdminUpdateCompanySchema = updateCompanySchema;

// POST /api/admin/ce/establishments/:id/advantages
export const CeAdminCreateAdvantageSchema = createAdvantageSchema;

// PUT /api/admin/ce/advantages/:id
export const CeAdminUpdateAdvantageSchema = updateAdvantageSchema;
