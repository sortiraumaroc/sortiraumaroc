/**
 * Partner Agreements (Accords Partenaires) — Zod Validation Schemas
 */

import { z } from "zod";
import { uuidSchema } from "./common";

// ============================================
// Agreement Schemas
// ============================================

export const createAgreementSchema = z.object({
  establishment_id: uuidSchema,
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email("Email invalide").nullable().optional(),
  contact_phone: z.string().max(20).nullable().optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)")
    .nullable()
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)")
    .nullable()
    .optional(),
  commission_rate: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  lines: z.array(z.lazy(() => createAgreementLineSchema)).optional(),
});

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;

export const updateAgreementSchema = createAgreementSchema
  .omit({ establishment_id: true, lines: true })
  .partial()
  .extend({
    status: z
      .enum(["draft", "proposal_sent", "in_negotiation", "active", "suspended", "expired", "refused"])
      .optional(),
  });

export type UpdateAgreementInput = z.infer<typeof updateAgreementSchema>;

// ============================================
// Agreement Line Schemas
// ============================================

export const createAgreementLineSchema = z.object({
  module: z.enum(["ce", "conciergerie", "both"]).default("ce"),
  advantage_type: z.enum(["percentage", "fixed", "special_offer", "gift", "pack"]),
  advantage_value: z.number().min(0).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  conditions: z.string().max(2000).nullable().optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide")
    .nullable()
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide")
    .nullable()
    .optional(),
  max_uses_per_employee: z.number().int().min(0).default(0),
  max_uses_total: z.number().int().min(0).default(0),
  target_companies: z.union([z.literal("all"), z.array(uuidSchema)]).default("all"),
  sam_commission_type: z.enum(["percentage", "fixed"]).nullable().optional(),
  sam_commission_value: z.number().min(0).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

export type CreateAgreementLineInput = z.infer<typeof createAgreementLineSchema>;

export const updateAgreementLineSchema = createAgreementLineSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type UpdateAgreementLineInput = z.infer<typeof updateAgreementLineSchema>;

// ============================================
// Query Schemas
// ============================================

export const partnershipListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  module: z.enum(["ce", "conciergerie", "both"]).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type PartnershipListQuery = z.infer<typeof partnershipListQuerySchema>;
