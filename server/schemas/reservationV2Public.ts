/**
 * Zod Schemas for Reservation V2 Public Routes
 *
 * Validates consumer-facing reservation inputs.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Create Reservation
// =============================================================================

export const CreateReservationV2Schema = z.object({
  establishment_id: z.string().min(1),
  starts_at: z.string().min(1),
  party_size: z.coerce.number().int().min(1).max(100),
  payment_type: z.string().optional(),
  slot_id: z.string().optional().nullable(),
  promo_code_id: z.string().optional().nullable(),
  meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// Modify Reservation
// =============================================================================

export const ModifyReservationV2Schema = z.object({
  starts_at: z.string().optional(),
  party_size: z.coerce.number().int().min(1).optional(),
  slot_id: z.string().optional().nullable(),
});

// =============================================================================
// Cancel Reservation
// =============================================================================

export const CancelReservationV2Schema = z.object({
  reason: z.string().max(500).optional(),
});

// =============================================================================
// Validate Promo Code
// =============================================================================

export const ValidateReservationPromoSchema = z.object({
  code: z.string().min(1),
  establishment_id: z.string().min(1),
  date: z.string().optional(),
});

// =============================================================================
// Join Waitlist
// =============================================================================

export const JoinWaitlistV2Schema = z.object({
  establishment_id: z.string().min(1),
  starts_at: z.string().min(1),
  slot_id: z.string().optional().nullable(),
  party_size: z.coerce.number().optional(),
});

// =============================================================================
// Submit Quote
// =============================================================================

export const SubmitQuoteSchema = z.object({
  establishment_id: z.string().min(1),
  party_size: z.coerce.number().int().min(1),
  preferred_date: z.string().optional(),
  preferred_time_slot: z.string().optional(),
  is_date_flexible: z.boolean().optional(),
  event_type: z.string().max(100).optional(),
  event_type_other: z.string().max(200).optional(),
  requirements: z.string().max(2000).optional(),
  budget_indication: z.string().max(100).optional(),
  contact_phone: z.string().max(20).optional(),
  contact_email: z.string().max(100).optional(),
});

// =============================================================================
// Post Quote Message
// =============================================================================

export const PostQuoteMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  attachments: z.array(z.unknown()).optional(),
});

// =============================================================================
// Respond to No-Show Dispute
// =============================================================================

export const RespondToNoShowDisputeSchema = z.object({
  response: z.enum(["confirms_absence", "disputes"]),
  evidence: z.array(z.unknown()).optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for reservations, waitlist entries, quotes, disputes (UUID) */
export const ReservationIdParams = z.object({ id: zUuid });

/** :id + :date params for availability */
export const AvailabilityDateParams = z.object({
  id: zUuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (attendu: YYYY-MM-DD)"),
});

/** :id param for establishments (UUID) — availability routes */
export const EstablishmentAvailabilityParams = z.object({ id: zUuid });
