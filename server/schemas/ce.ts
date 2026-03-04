/**
 * CE (Comité d'Entreprise) — Zod Validation Schemas
 */

import { z } from "zod";
import { uuidSchema } from "./common";

// ============================================
// Company Schemas
// ============================================

export const createCompanySchema = z.object({
  name: z.string().min(2, "Minimum 2 caractères").max(200).transform((v) => v.trim()),
  ice_siret: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  sector: z.string().max(100).nullable().optional(),
  estimated_employees: z.number().int().min(0).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email("Email invalide").nullable().optional(),
  contact_phone: z.string().max(20).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  contract_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)")
    .nullable()
    .optional(),
  contract_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)")
    .nullable()
    .optional(),
  auto_validate_employees: z.boolean().optional(),
  auto_validate_domain: z.string().max(100).nullable().optional(),
  welcome_message: z.string().max(2000).nullable().optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial().extend({
  status: z.enum(["active", "suspended", "expired"]).optional(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

// ============================================
// Advantage Schemas
// ============================================

export const createAdvantageSchema = z.object({
  establishment_id: uuidSchema,
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
  target_companies: z
    .union([z.literal("all"), z.array(uuidSchema)])
    .default("all"),
});

export type CreateAdvantageInput = z.infer<typeof createAdvantageSchema>;

export const updateAdvantageSchema = createAdvantageSchema
  .omit({ establishment_id: true })
  .partial()
  .extend({
    is_active: z.boolean().optional(),
  });

export type UpdateAdvantageInput = z.infer<typeof updateAdvantageSchema>;

// ============================================
// Employee Schemas
// ============================================

export const registerEmployeeSchema = z.object({
  registration_code: z.string().min(1, "Code requis").max(50),
});

export type RegisterEmployeeInput = z.infer<typeof registerEmployeeSchema>;

// ============================================
// Scan Schemas
// ============================================

export const validateScanSchema = z.object({
  qr_payload: z.string().min(1, "QR payload requis"),
  establishment_id: uuidSchema,
});

export type ValidateScanInput = z.infer<typeof validateScanSchema>;

// ============================================
// Company Settings Schemas
// ============================================

export const updateCompanySettingsSchema = z.object({
  auto_validate_employees: z.boolean().optional(),
  auto_validate_domain: z.string().max(100).nullable().optional(),
  welcome_message: z.string().max(2000).nullable().optional(),
});

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;

// ============================================
// Query Schemas
// ============================================

export const ceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const ceAdvantagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  universe: z.string().optional(),
  city: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export const ceScansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  employee_id: uuidSchema.optional(),
  establishment_id: uuidSchema.optional(),
  company_id: uuidSchema.optional(),
  status: z.enum(["validated", "refused", "expired"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
