/**
 * Zod Schemas for Pro Reservation Routes
 *
 * Validates pro-facing reservation management inputs.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :establishmentId */
export const EstablishmentIdParams = z.object({ establishmentId: zUuid });

/** :establishmentId + :draftId */
export const EstablishmentIdDraftIdParams = z.object({ establishmentId: zUuid, draftId: zUuid });

/** :establishmentId + :reservationId */
export const EstablishmentIdReservationIdParams = z.object({ establishmentId: zUuid, reservationId: zUuid });

/** :establishmentId + :templateId */
export const EstablishmentIdTemplateIdParams = z.object({ establishmentId: zUuid, templateId: zUuid });

// =============================================================================
// Create Manual Reservation
// =============================================================================

export const CreateManualReservationSchema = z.object({
  starts_at: z.string().min(1, "starts_at est requis"),
  ends_at: z.string().optional(),
  status: z.string().optional(),
  party_size: z.coerce.number().optional(),
  amount_total: z.coerce.number().optional(),
  amount_deposit: z.coerce.number().optional(),
  currency: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
  kind: z.string().optional(),
});

// =============================================================================
// Reservation Message Templates
// =============================================================================

export const CreateReservationMessageTemplateSchema = z.object({
  code: z.string().max(100).default(""),
  label: z.string().max(200).default(""),
  body: z.string().max(5000).default(""),
  is_active: z.boolean().optional(),
});

export const UpdateReservationMessageTemplateSchema = z.object({
  code: z.string().max(100).optional(),
  label: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Update Pro Reservation (status transitions, etc.)
// =============================================================================

export const UpdateProReservationSchema = z.object({
  status: z.string().optional(),
  payment_status: z.string().optional(),
  checked_in_at: z.string().optional(),
  refusal_reason_code: z.string().optional(),
  refusalReasonCode: z.string().optional(),
  refusal_reason_custom: z.string().max(1000).optional(),
  refusalReasonCustom: z.string().max(1000).optional(),
  is_from_waitlist: z.boolean().optional(),
  isFromWaitlist: z.boolean().optional(),
  pro_message: z.string().max(2000).optional(),
  proMessage: z.string().max(2000).optional(),
  template_code: z.string().optional(),
  templateCode: z.string().optional(),
  starts_at: z.string().optional(),
  startsAt: z.string().optional(),
  party_size: z.coerce.number().optional(),
  partySize: z.coerce.number().optional(),
  slot_id: z.string().optional(),
  slotId: z.string().optional(),
  meta_patch: z.record(z.unknown()).optional(),
  metaPatch: z.record(z.unknown()).optional(),
  meta_delete_keys: z.array(z.string()).optional(),
  metaDeleteKeys: z.array(z.string()).optional(),
});

// =============================================================================
// QR Scanning & Check-in
// =============================================================================

export const ScanProQrCodeSchema = z.object({
  code: z.string().min(1, "code est requis"),
  holder_name: z.string().max(200).optional(),
});

export const CheckinByUserIdSchema = z.object({
  userId: z.string().min(1, "userId est requis"),
  reservationId: z.string().min(1, "reservationId est requis"),
});

// =============================================================================
// Waitlist
// =============================================================================

export const SendProWaitlistOfferSchema = z.object({
  slot_id: z.string().optional(),
  slotId: z.string().optional(),
});

export const CloseProWaitlistEntrySchema = z.object({
  reason: z.string().max(500).optional(),
  message: z.string().max(500).optional(),
});

// =============================================================================
// Reservation History / Timeline
// =============================================================================

export const LogReservationActionSchema = z.object({
  action: z.string().min(1, "action est requis"),
  action_label: z.string().min(1, "action_label est requis"),
  message: z.string().max(2000).optional(),
  previous_status: z.string().optional(),
  new_status: z.string().optional(),
  previous_data: z.record(z.unknown()).optional(),
  new_data: z.record(z.unknown()).optional(),
});

// =============================================================================
// Seed (dev only)
// =============================================================================

export const SeedFakeReservationsSchema = z.object({
  count_per_status: z.coerce.number().int().min(1).max(50).optional(),
});
