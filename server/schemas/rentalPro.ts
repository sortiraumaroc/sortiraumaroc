/**
 * Rental Pro Routes — Zod Validation Schemas
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :vehicleId + :blockId */
export const VehicleIdBlockIdParams = z.object({ vehicleId: zUuid, blockId: zUuid });

// =============================================================================
// Body Schemas
// =============================================================================

/** POST /api/pro/rental/vehicles */
export const createVehicleSchema = z.object({
  establishment_id: z.string().min(1),
  category: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().optional(),
  photos: z.array(z.string()).optional(),
  specs: z.any().optional(),
  mileage_policy: z.string().optional(),
  mileage_limit_per_day: z.number().optional(),
  extra_km_cost: z.number().optional(),
  pricing: z.any().optional(),
  high_season_dates: z.any().optional(),
  quantity: z.number().optional(),
  similar_vehicle: z.boolean().optional(),
  similar_models: z.any().optional(),
  status: z.string().optional(),
});

/** PUT /api/pro/rental/vehicles/:id */
export const updateVehicleSchema = z.object({
  establishment_id: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  photos: z.array(z.string()).optional(),
  specs: z.any().optional(),
  mileage_policy: z.string().optional(),
  mileage_limit_per_day: z.number().optional(),
  extra_km_cost: z.number().optional(),
  pricing: z.any().optional(),
  high_season_dates: z.any().optional(),
  quantity: z.number().optional(),
  similar_vehicle: z.boolean().optional(),
  similar_models: z.any().optional(),
  status: z.string().optional(),
  sort_order: z.number().optional(),
});

/** POST /api/pro/rental/vehicles/:id/blocks */
export const createVehicleBlockSchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().optional(),
});

/** POST /api/pro/rental/options */
export const createRentalOptionSchema = z.object({
  establishment_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number(),
  price_type: z.string().optional(),
  is_mandatory: z.boolean().optional(),
});

/** PUT /api/pro/rental/options/:id */
export const updateRentalOptionSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  price_type: z.string().optional(),
  is_mandatory: z.boolean().optional(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

/** PUT /api/pro/rental/reservations/:id/kyc-validate */
export const kycValidateSchema = z.object({
  action: z.enum(["validate", "refuse"]),
  refusal_reason: z.string().optional(),
});
