/**
 * Reservation Schemas - SAM
 *
 * Schémas Zod pour la validation des réservations.
 */

import { z } from "zod";
import {
  uuidSchema,
  emailSchema,
  phoneMarocSchema,
  phoneInternationalSchema,
  dateTimeIsoSchema,
  nameSchema,
  guestsSchema,
  reservationStatusSchema,
} from "./common";

// ============================================
// CREATE RESERVATION
// ============================================

/**
 * Schéma pour créer une réservation (consumer)
 */
export const createReservationSchema = z
  .object({
    // Identifiants
    establishment_id: uuidSchema.optional(),
    establishmentId: uuidSchema.optional(),
    slot_id: uuidSchema.optional(),
    slotId: uuidSchema.optional(),
    booking_reference: z.string().min(1).max(50).optional(),
    bookingReference: z.string().min(1).max(50).optional(),

    // Dates
    starts_at: z.string().min(1, { message: "Date de début requise" }),
    startsAt: z.string().min(1).optional(),

    // Type et statut
    kind: z
      .enum(["restaurant", "hotel", "wellness", "loisir", "evenement", "pack"])
      .default("restaurant"),
    status: z
      .enum(["requested", "pending_pro_validation", "confirmed", "waitlist"])
      .default("requested"),

    // Nombre de personnes
    party_size: z.number().int().min(1).max(500).optional(),
    partySize: z.number().int().min(1).max(500).optional(),

    // Montants (informatifs, recalculés côté serveur)
    amount_total: z.number().int().min(0).optional(),
    amountTotal: z.number().int().min(0).optional(),
    amount_deposit: z.number().int().min(0).optional(),
    amountDeposit: z.number().int().min(0).optional(),

    // Métadonnées
    meta: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => data.establishment_id || data.establishmentId,
    { message: "establishment_id est requis", path: ["establishment_id"] }
  )
  .refine(
    (data) => data.starts_at || data.startsAt,
    { message: "starts_at est requis", path: ["starts_at"] }
  );

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/**
 * Schéma pour créer une réservation publique (sans auth)
 */
export const createPublicReservationSchema = z
  .object({
    // Identifiants
    establishment_id: uuidSchema.optional(),
    establishmentId: uuidSchema.optional(),
    slot_id: uuidSchema.optional(),
    slotId: uuidSchema.optional(),

    // Dates
    starts_at: z.string().min(1, { message: "Date de début requise" }),
    startsAt: z.string().min(1).optional(),

    // Type
    kind: z
      .enum(["restaurant", "hotel", "wellness", "loisir", "evenement", "pack"])
      .default("restaurant"),

    // Nombre de personnes
    party_size: z.number().int().min(1).max(500).optional(),
    partySize: z.number().int().min(1).max(500).optional(),
    guests: guestsSchema.optional(),

    // Informations client (requis pour réservation publique)
    customer_name: nameSchema,
    customerName: nameSchema.optional(),
    customer_first_name: nameSchema.optional(),
    customerFirstName: nameSchema.optional(),
    customer_phone: z.string().min(8).max(20),
    customerPhone: z.string().min(8).max(20).optional(),
    customer_email: emailSchema.optional(),
    customerEmail: emailSchema.optional(),

    // Notes
    special_requests: z.string().max(1000).optional(),
    specialRequests: z.string().max(1000).optional(),
    notes: z.string().max(1000).optional(),

    // Métadonnées
    meta: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => data.establishment_id || data.establishmentId,
    { message: "establishment_id est requis", path: ["establishment_id"] }
  )
  .refine(
    (data) => data.starts_at || data.startsAt,
    { message: "starts_at est requis", path: ["starts_at"] }
  )
  .refine(
    (data) => data.customer_name || data.customerName || data.customer_first_name || data.customerFirstName,
    { message: "Nom du client requis", path: ["customer_name"] }
  )
  .refine(
    (data) => data.customer_phone || data.customerPhone,
    { message: "Téléphone du client requis", path: ["customer_phone"] }
  );

export type CreatePublicReservationInput = z.infer<typeof createPublicReservationSchema>;

// ============================================
// UPDATE RESERVATION
// ============================================

/**
 * Schéma pour mettre à jour une réservation (consumer)
 */
export const updateReservationSchema = z.object({
  // Nouvelle date/heure
  starts_at: z.string().optional(),
  startsAt: z.string().optional(),
  slot_id: uuidSchema.optional(),
  slotId: uuidSchema.optional(),

  // Nombre de personnes
  party_size: z.number().int().min(1).max(500).optional(),
  partySize: z.number().int().min(1).max(500).optional(),

  // Statut (limité pour les consumers)
  status: z.enum(["cancelled"]).optional(),

  // Notes
  special_requests: z.string().max(1000).optional(),
  specialRequests: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

/**
 * Schéma pour mettre à jour une réservation (pro)
 */
export const updateReservationProSchema = z.object({
  // Statut
  status: reservationStatusSchema.optional(),

  // Dates
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),

  // Informations
  party_size: z.number().int().min(1).max(500).optional(),
  table_assignment: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  internal_notes: z.string().max(2000).optional(),

  // Montants
  amount_total: z.number().int().min(0).optional(),
  amount_deposit: z.number().int().min(0).optional(),
  payment_status: z.enum(["pending", "paid", "refunded", "partial"]).optional(),
});

export type UpdateReservationProInput = z.infer<typeof updateReservationProSchema>;

// ============================================
// QUERY PARAMS
// ============================================

/**
 * Paramètres de filtrage des réservations
 */
export const reservationFiltersSchema = z.object({
  establishment_id: uuidSchema.optional(),
  status: z.string().optional(), // peut être une liste séparée par virgule
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ReservationFilters = z.infer<typeof reservationFiltersSchema>;

// ============================================
// RESERVATION MESSAGE
// ============================================

/**
 * Schéma pour envoyer un message sur une réservation
 */
export const reservationMessageSchema = z.object({
  content: z
    .string()
    .min(1, { message: "Le message ne peut pas être vide" })
    .max(2000, { message: "Message trop long (max 2000 caractères)" }),
  attachment_url: z.string().url().optional(),
});

export type ReservationMessageInput = z.infer<typeof reservationMessageSchema>;

// ============================================
// PATH PARAMS
// ============================================

/**
 * Paramètre ID de réservation
 */
export const reservationIdParamSchema = z.object({
  id: uuidSchema,
});

export type ReservationIdParam = z.infer<typeof reservationIdParamSchema>;

/**
 * Paramètre ID de réservation (format alternatif)
 */
export const reservationIdAltParamSchema = z.object({
  reservationId: uuidSchema,
});

export type ReservationIdAltParam = z.infer<typeof reservationIdAltParamSchema>;
