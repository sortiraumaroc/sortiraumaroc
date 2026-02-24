/**
 * Zod Schemas for Reservation V2 Pro Routes
 */
import { z } from "zod";

// =============================================================================
// (Param schemas — uses zIdParam from validate.ts directly)
// =============================================================================

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** Shared schema for routes that only read establishment_id from query */
export const ProEstablishmentQuery = z.object({
  establishment_id: z.string().optional(),
});

/** GET /api/pro/reservations */
export const ListProReservationsQuery = z.object({
  establishment_id: z.string().optional(),
  status: z.string().optional(),
  date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** GET /api/pro/reservations/calendar */
export const GetProCalendarQuery = z.object({
  establishment_id: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

/** GET /api/pro/occupancy-stats */
export const GetProOccupancyStatsQuery = z.object({
  establishment_id: z.string().optional(),
  date: z.string().optional(),
});

// ── Shared establishment_id body (for actions that also read it from body) ────

export const ProActionAcceptSchema = z.object({
  establishment_id: z.string().optional(),
  message: z.string().optional(),
});

export const ProActionRefuseSchema = z.object({
  establishment_id: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
});

export const ProActionHoldSchema = z.object({
  establishment_id: z.string().optional(),
  message: z.string().optional(),
});

export const ProActionCancelSchema = z.object({
  establishment_id: z.string().optional(),
  reason: z.string().optional(),
});

export const ProActionEstablishmentOnlySchema = z.object({
  establishment_id: z.string().optional(),
});

// ── Capacity ─────────────────────────────────────────────────────────────────

export const UpdateProCapacitySchema = z.object({
  establishment_id: z.string().optional(),
  configs: z.array(z.object({
    day_of_week: z.number().nullable().optional(),
    specific_date: z.string().nullable().optional(),
    time_slot_start: z.string().optional(),
    time_slot_end: z.string().optional(),
    slot_interval_minutes: z.number().optional(),
    total_capacity: z.number().optional(),
    occupation_duration_minutes: z.number().optional(),
    paid_stock_percentage: z.number().optional(),
    free_stock_percentage: z.number().optional(),
    buffer_percentage: z.number().optional(),
    is_closed: z.boolean().optional(),
  })),
});

// ── Discounts ────────────────────────────────────────────────────────────────

export const CreateProDiscountSchema = z.object({
  establishment_id: z.string().optional(),
  applies_to: z.string().optional(),
  day_of_week: z.number().nullable().optional(),
  specific_date: z.string().nullable().optional(),
  time_slot_start: z.string().nullable().optional(),
  time_slot_end: z.string().nullable().optional(),
  discount_type: z.string().optional(),
  discount_value: z.number().optional(),
  label: z.string().optional(),
  is_active: z.boolean().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export const UpdateProDiscountSchema = z.object({
  establishment_id: z.string().optional(),
  applies_to: z.string().optional(),
  day_of_week: z.number().nullable().optional(),
  specific_date: z.string().nullable().optional(),
  time_slot_start: z.string().nullable().optional(),
  time_slot_end: z.string().nullable().optional(),
  discount_type: z.string().optional(),
  discount_value: z.number().optional(),
  label: z.string().optional(),
  is_active: z.boolean().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

// ── Auto-accept rules ────────────────────────────────────────────────────────

export const UpdateAutoAcceptRulesSchema = z.object({
  establishment_id: z.string().optional(),
  rules: z.array(z.object({
    is_global: z.boolean().optional(),
    min_client_score: z.number().nullable().optional(),
    max_party_size: z.number().nullable().optional(),
    applicable_time_slots: z.any().optional(),
    applicable_days: z.any().optional(),
    auto_request_deposit_below_score: z.number().nullable().optional(),
    is_active: z.boolean().optional(),
  })).optional(),
});

// ── Quotes ───────────────────────────────────────────────────────────────────

export const ProSendQuoteSchema = z.object({
  establishment_id: z.string().optional(),
  message: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

export const ProSendQuoteMessageSchema = z.object({
  establishment_id: z.string().optional(),
  content: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});
