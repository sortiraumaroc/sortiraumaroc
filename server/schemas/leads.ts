/**
 * Leads Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST /api/leads/establishment */
export const establishmentLeadSchema = z.object({
  full_name: z.string().min(1),
  establishment_name: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().min(1),
  whatsapp: z.string().min(1),
  email: z.string().min(1),
  category: z.string().min(1),
});

/** POST /api/leads/pro-demo */
export const proDemoLeadSchema = z.object({
  full_name: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().min(1),
  company: z.string().min(1),
  phone: z.string().optional(),
  city: z.string().optional(),
  message: z.string().optional(),
});
