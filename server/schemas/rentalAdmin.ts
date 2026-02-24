/**
 * Zod Schemas for Rental Admin Routes
 */

import { z } from "zod";

// POST /api/admin/rental/insurance-plans
export const CreateInsurancePlanSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  coverages: z.array(z.any()).optional(),
  price_per_day: z.number().optional(),
  franchise: z.number().optional(),
  partner_name: z.string().optional().nullable(),
  badge: z.string().optional().nullable(),
  sort_order: z.number().optional(),
});

// PUT /api/admin/rental/insurance-plans/:id
export const UpdateInsurancePlanSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  coverages: z.any().optional(),
  price_per_day: z.number().optional(),
  franchise: z.number().optional(),
  partner_name: z.string().optional().nullable(),
  badge: z.string().optional().nullable(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

// PUT /api/admin/rental/establishments/:id/commission
export const SetCommissionSchema = z.object({
  commission_percent: z.number(),
});

// PUT /api/admin/rental/vehicles/:id/moderate
export const ModerateVehicleSchema = z.object({
  action: z.enum(["approve", "reject"]),
});
