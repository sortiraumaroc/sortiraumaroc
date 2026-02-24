/**
 * Rental Consumer — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// POST /api/rental/reservations
export const CreateRentalReservationSchema = z.object({
  vehicle_id: z.string().min(1),
  pickup_city: z.string().min(1),
  pickup_date: z.string().min(1),
  pickup_time: z.string().min(1),
  dropoff_city: z.string().optional(),
  dropoff_date: z.string().min(1),
  dropoff_time: z.string().min(1),
  selected_options: z.array(z.any()).optional(),
  insurance_plan_id: z.string().optional().nullable(),
});

// POST /api/rental/reservations/:id/kyc
export const UploadKycDocumentSchema = z.object({
  document_type: z.enum(["permit", "cin", "passport"]),
  side: z.enum(["front", "back"]),
  photo_url: z.string().min(1),
});

// PUT /api/rental/reservations/:id/cancel
export const CancelRentalReservationSchema = z.object({
  reason: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for rental reservations (UUID) */
export const RentalReservationIdParams = z.object({ id: zUuid });
