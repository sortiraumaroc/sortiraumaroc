/**
 * Rental Public Routes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// POST /api/rental/price-quote
export const RentalPriceQuoteSchema = z.object({
  vehicle_id: z.string().min(1),
  pickup_date: z.string().min(1),
  dropoff_date: z.string().min(1),
  selected_options: z.array(z.any()).optional(),
  insurance_plan_id: z.string().optional(),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/rental/search */
export const SearchVehiclesQuery = z.object({
  pickup_city: z.string().optional(),
  dropoff_city: z.string().optional(),
  pickup_date: z.string().optional(),
  pickup_time: z.string().optional(),
  dropoff_date: z.string().optional(),
  dropoff_time: z.string().optional(),
  category: z.string().optional(),
  transmission: z.string().optional(),
  fuel_type: z.string().optional(),
  min_seats: z.coerce.number().int().min(1).optional(),
  doors: z.coerce.number().int().min(1).optional(),
  ac: z.string().optional(),
  mileage_policy: z.string().optional(),
  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),
  establishment_id: z.string().optional(),
  sort_by: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(50).optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for vehicles (UUID) */
export const VehicleIdParams = z.object({ id: zUuid });
