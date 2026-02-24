/**
 * Zod Schemas for Reservation Routes
 *
 * Validates consumer-facing reservation creation and modification inputs.
 */

import { z } from "zod";
import { zUuid, zIsoDate, zNonEmptyString, zPhone, zEmail } from "../lib/validate";

// =============================================================================
// Create Reservation
// =============================================================================

export const CreateReservationSchema = z.object({
  establishmentId: zUuid,
  date: zIsoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/, "Format d'heure invalide (attendu: HH:MM)"),
  people: z.number().int().min(1, "Minimum 1 personne").max(100, "Maximum 100 personnes"),
  slotId: zUuid.optional(),
  firstName: zNonEmptyString.max(100, "Prénom trop long"),
  lastName: zNonEmptyString.max(100, "Nom trop long"),
  email: zEmail,
  phone: zPhone,
  notes: z.string().max(1000, "Notes trop longues").optional().default(""),
  occasionType: z.string().max(50).optional(),
  promoCode: z.string().max(50).optional(),
});

// =============================================================================
// Cancel Reservation
// =============================================================================

export const CancelReservationSchema = z.object({
  reservationId: zUuid,
  reason: z.string().max(500, "Raison trop longue").optional().default(""),
});

// =============================================================================
// Modify Reservation Request
// =============================================================================

export const RequestModificationSchema = z.object({
  reservationId: zUuid,
  newDate: zIsoDate.optional(),
  newTime: z.string().regex(/^\d{2}:\d{2}$/, "Format d'heure invalide").optional(),
  newPeople: z.number().int().min(1).max(100).optional(),
  message: z.string().max(500).optional(),
}).refine(
  (data) => data.newDate || data.newTime || data.newPeople,
  { message: "Au moins une modification est requise (date, heure ou nombre de personnes)" },
);

// =============================================================================
// Inferred Types
// =============================================================================

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
export type CancelReservationInput = z.infer<typeof CancelReservationSchema>;
export type RequestModificationInput = z.infer<typeof RequestModificationSchema>;
