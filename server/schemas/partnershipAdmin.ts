/**
 * Zod Schemas for Partnership Admin Routes
 *
 * Passthrough wrappers around existing partnership.ts schemas for zBody() middleware.
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";
import {
  createAgreementSchema,
  updateAgreementSchema,
  createAgreementLineSchema,
  updateAgreementLineSchema,
} from "./partnership";

// =============================================================================
// Param Schemas
// =============================================================================

/** Routes with :id and :lineId — e.g. /partnerships/:id/lines/:lineId */
export const AgreementLineParams = z.object({
  id: zUuid,
  lineId: zUuid,
});

// POST /api/admin/partnerships
export const PartnershipAdminCreateSchema = createAgreementSchema;

// PUT /api/admin/partnerships/:id
export const PartnershipAdminUpdateSchema = updateAgreementSchema;

// POST /api/admin/partnerships/:id/lines
export const PartnershipAdminCreateLineSchema = createAgreementLineSchema;

// PUT /api/admin/partnerships/:id/lines/:lineId
export const PartnershipAdminUpdateLineSchema = updateAgreementLineSchema;
