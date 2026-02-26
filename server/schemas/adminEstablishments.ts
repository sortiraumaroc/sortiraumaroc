/**
 * Zod Schemas for Admin Establishments Routes
 *
 * Validates admin-facing establishment management inputs: creation (basic & wizard),
 * status updates, flag toggles, reservation updates, and slot upserts.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :id/reservations/:reservationId */
export const EstablishmentReservationParams = z.object({
  id: zUuid,
  reservationId: zUuid,
});

/** :id/slots/:slotId */
export const EstablishmentSlotParams = z.object({
  id: zUuid,
  slotId: zUuid,
});

/** :id/contracts/:contractId */
export const EstablishmentContractParams = z.object({
  id: zUuid,
  contractId: zUuid,
});

/** :id/profile-updates/:draftId/changes/:changeId/(accept|reject) */
export const EstablishmentProfileChangeParams = z.object({
  id: zUuid,
  draftId: zUuid,
  changeId: zUuid,
});

/** :id/profile-updates/:draftId/(accept-all|reject-all) */
export const EstablishmentProfileDraftParams = z.object({
  id: zUuid,
  draftId: zUuid,
});

/** :establishmentId/pros/:proUserId */
export const EstablishmentProUserParams = z.object({
  establishmentId: zUuid,
  proUserId: zUuid,
});

/** :id/conversations/:conversationId/messages */
export const EstablishmentConversationParams = z.object({
  id: zUuid,
  conversationId: zUuid,
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/establishments/search */
export const SearchEstablishmentsByNameQuery = z.object({
  name: z.string().optional(),
});

/** GET /api/admin/establishments */
export const ListEstablishmentsQuery = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
});

/** GET /api/admin/waitlist */
export const ListAdminWaitlistQuery = z.object({
  establishment_id: z.string().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// =============================================================================
// Establishment Creation (basic)
// =============================================================================

/**
 * POST /api/admin/establishments
 * Handler: createEstablishment
 */
export const CreateEstablishmentSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  city: z.string().min(1, "Ville requise"),
  owner_email: z.string().min(1, "Email du propriétaire requis"),
  universe: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  extra: z.any().optional(),
});

// =============================================================================
// Establishment Wizard (7-step creation)
// =============================================================================

/**
 * POST /api/admin/establishments/wizard
 * Handler: createEstablishmentWizard
 */
export const CreateEstablishmentWizardSchema = z.object({
  // Step 1 — Identity
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  universe: z.string().min(1, "L'univers est requis"),
  category: z.string().optional().nullable(),
  subcategory: z.string().optional().nullable(),
  specialties: z.array(z.string()).optional(),
  // Step 2 — Location
  country: z.string().optional(),
  region: z.string().optional().nullable(),
  city: z.string().min(1, "La ville est requise"),
  postal_code: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  address: z.string().min(1, "L'adresse est requise"),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  // Step 3 — Contact
  phone: z.string().min(1, "Le téléphone est requis"),
  whatsapp: z.string().optional().nullable(),
  booking_email: z.string().optional().nullable(),
  google_maps_link: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  owner_email: z.string().optional(),
  // Step 4 — Descriptions
  short_description: z.string().optional().nullable(),
  long_description: z.string().optional().nullable(),
  // Step 6 — Hours
  hours: z.any().optional(),
  // Step 7 — Tags & extras
  ambiance_tags: z.array(z.string()).optional().nullable(),
  service_types: z.array(z.string()).optional().nullable(),
  general_tags: z.array(z.string()).optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  highlights: z.array(z.string()).optional().nullable(),
  social_links: z.any().optional(),
});

/**
 * PATCH /api/admin/establishments/wizard/:id
 * Handler: updateEstablishmentWizard
 */
export const UpdateEstablishmentWizardSchema = z.object({
  // Step 1 — Identity
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  universe: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  subcategory: z.string().optional().nullable(),
  specialties: z.array(z.string()).optional(),
  // Step 2 — Location
  country: z.string().optional(),
  region: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  // Step 3 — Contact
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  booking_email: z.string().optional().nullable(),
  google_maps_link: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  // Step 4 — Descriptions
  short_description: z.string().optional().nullable(),
  long_description: z.string().optional().nullable(),
  // Step 6 — Hours
  hours: z.any().optional(),
  // Step 7 — Tags & extras
  ambiance_tags: z.array(z.string()).optional().nullable(),
  service_types: z.array(z.string()).optional().nullable(),
  general_tags: z.array(z.string()).optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  highlights: z.array(z.string()).optional().nullable(),
  social_links: z.any().optional(),
});

// =============================================================================
// Establishment Status & Flags
// =============================================================================

/**
 * POST /api/admin/establishments/:id/status
 * Handler: updateEstablishmentStatus
 */
export const UpdateEstablishmentStatusSchema = z.object({
  status: z.string().min(1, "Statut requis"),
});

/**
 * POST /api/admin/establishments/batch-status
 * Handler: batchUpdateEstablishmentStatus
 */
export const BatchUpdateEstablishmentStatusSchema = z.object({
  ids: z.array(z.string()).min(1, "ids[] requis (au moins un)"),
  status: z.enum(["active", "pending", "suspended", "rejected"], {
    message: "Statut invalide",
  }),
});

/**
 * POST /api/admin/establishments/:id/flags
 * Handler: updateEstablishmentFlags
 */
export const UpdateEstablishmentFlagsSchema = z.object({
  verified: z.boolean().optional(),
  premium: z.boolean().optional(),
  curated: z.boolean().optional(),
  is_online: z.boolean().optional(),
});

// =============================================================================
// Establishment Reservations
// =============================================================================

/**
 * POST /api/admin/establishments/:id/reservations/:reservationId/update
 * Handler: updateAdminEstablishmentReservation
 */
export const UpdateAdminEstablishmentReservationSchema = z.object({
  status: z.string().optional(),
  payment_status: z.string().optional(),
  checked_in_at: z.string().optional().nullable(),
  starts_at: z.string().optional(),
  startsAt: z.string().optional(),
  meta_delete_keys: z.array(z.string()).optional(),
  metaDeleteKeys: z.array(z.string()).optional(),
});

// =============================================================================
// Establishment Slots
// =============================================================================

/**
 * PUT /api/admin/establishments/:id/slots/upsert
 * Handler: adminUpsertSlots
 */
export const AdminUpsertSlotsSchema = z.object({
  slots: z.array(
    z.object({
      starts_at: z.string().min(1, "starts_at is required"),
      ends_at: z.string().min(1, "ends_at is required"),
      capacity: z.coerce.number().positive("capacity must be > 0"),
      base_price: z.coerce.number().optional().nullable(),
      promo_type: z.string().optional().nullable(),
      promo_value: z.coerce.number().optional().nullable(),
      promo_label: z.string().optional().nullable(),
      service_label: z.string().optional().nullable(),
      active: z.boolean().optional(),
    }),
  ).min(1, "slots array is required"),
});
