/**
 * Capacity Manager
 *
 * Handles real-time availability calculation using overlap-based occupation,
 * quota allocation (paid/free/buffer), and stock management.
 *
 * Key concepts:
 *   - 3-zone quota: paid_stock + free_stock + buffer = 100%
 *   - Overlap-based occupation: available = total - sum(reservations overlapping time window)
 *   - Buffer redistribution rules (priority-based)
 *   - Availability color indicator: green (>50%), orange (20-50%), red (<20%), grey (closed/full)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OCCUPYING_RESERVATION_STATUS_V2_SET } from "../shared/reservationStates";
import type { StockType, SlotAvailability } from "../shared/reservationTypesV2";
import { RESERVATION_TIMINGS } from "../shared/reservationTypesV2";

// =============================================================================
// Types
// =============================================================================

export type AvailabilityColor = "green" | "orange" | "red" | "grey";

export interface SlotAvailabilityResult extends SlotAvailability {
  /** Availability color indicator */
  color: AvailabilityColor;
  /** Whether the slot is closed */
  isClosed: boolean;
  /** Time slot info */
  timeSlotStart: string;
  timeSlotEnd: string;
  /** Occupation duration in minutes */
  occupationDurationMinutes: number;
}

export interface DayAvailability {
  date: string;
  isClosed: boolean;
  slots: SlotAvailabilityResult[];
  /** Aggregate color for the day (worst slot color) */
  dayColor: AvailabilityColor;
}

export interface BufferAllocationResult {
  allowed: boolean;
  stockType: StockType;
  reason?: string;
}

// =============================================================================
// Core: Slot Availability (via SQL function or TS fallback)
// =============================================================================

/**
 * Get real-time availability for a specific establishment, date, and time.
 * Prefers the SQL function `calculate_slot_availability` for performance.
 */
export async function getSlotAvailability(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}): Promise<SlotAvailabilityResult> {
  const { supabase, establishmentId, date, time } = args;

  // Use the SQL function for performance (overlap-based, index-optimized)
  const { data, error } = await supabase.rpc("calculate_slot_availability", {
    p_establishment_id: establishmentId,
    p_date: date,
    p_time: time,
  });

  if (error) {
    console.error("[getSlotAvailability] RPC error:", error);
    return emptySlotResult(time);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.total_capacity === 0) {
    return emptySlotResult(time);
  }

  const r = row as Record<string, unknown>;
  const totalCap = toInt(r.total_capacity);
  const paidOccupied = toInt(r.paid_occupied);
  const freeOccupied = toInt(r.free_occupied);
  const bufferOccupied = toInt(r.buffer_occupied);
  const totalOccupied = paidOccupied + freeOccupied + bufferOccupied;
  const occupationRate = totalCap > 0 ? (totalOccupied / totalCap) * 100 : 0;

  const result: SlotAvailabilityResult = {
    total_capacity: totalCap,
    paid_total: toInt(r.paid_total),
    free_total: toInt(r.free_total),
    buffer_total: toInt(r.buffer_total),
    paid_occupied: paidOccupied,
    free_occupied: freeOccupied,
    buffer_occupied: bufferOccupied,
    paid_available: toInt(r.paid_available),
    free_available: toInt(r.free_available),
    buffer_available: toInt(r.buffer_available),
    occupation_rate: Math.round(occupationRate * 100) / 100,
    color: occupationRateToColor(occupationRate),
    isClosed: false,
    timeSlotStart: time,
    timeSlotEnd: "", // Will be filled by caller if needed
    occupationDurationMinutes: 90, // default
  };

  return result;
}

/**
 * Get availability for an entire day: all time slots.
 */
export async function getDayAvailability(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  date: string; // YYYY-MM-DD
}): Promise<DayAvailability> {
  const { supabase, establishmentId, date } = args;

  // Get capacity configs for this day
  const dow = new Date(date + "T00:00:00Z").getUTCDay();

  const { data: configs, error } = await supabase
    .from("establishment_capacity")
    .select("*")
    .eq("establishment_id", establishmentId)
    .or(
      `specific_date.eq.${date},` +
      `and(specific_date.is.null,day_of_week.eq.${dow}),` +
      `and(specific_date.is.null,day_of_week.is.null)`,
    )
    .order("specific_date", { ascending: false, nullsFirst: false });

  if (error || !configs || configs.length === 0) {
    return { date, isClosed: true, slots: [], dayColor: "grey" };
  }

  // Priority: specific_date > day_of_week > null (default)
  // Group by time_slot_start, prefer most specific config
  const configMap = new Map<string, Record<string, unknown>>();
  for (const c of configs as Record<string, unknown>[]) {
    const key = String(c.time_slot_start ?? "");
    if (!configMap.has(key)) {
      configMap.set(key, c);
    }
  }

  // Check if day is closed (all configs marked as closed)
  const allClosed = Array.from(configMap.values()).every((c) => c.is_closed === true);
  if (allClosed) {
    return { date, isClosed: true, slots: [], dayColor: "grey" };
  }

  // Generate time slots from each config
  const slots: SlotAvailabilityResult[] = [];

  for (const [, config] of configMap) {
    if (config.is_closed === true) continue;

    const slotStart = String(config.time_slot_start ?? "");
    const slotEnd = String(config.time_slot_end ?? "");
    const interval = toInt(config.slot_interval_minutes) || 30;
    const occDuration = toInt(config.occupation_duration_minutes) || 90;

    // Generate individual time slots within the range
    const startMinutes = parseTimeToMinutes(slotStart);
    const endMinutes = parseTimeToMinutes(slotEnd);

    for (let m = startMinutes; m < endMinutes; m += interval) {
      const timeStr = minutesToTime(m);
      const availability = await getSlotAvailability({
        supabase,
        establishmentId,
        date,
        time: timeStr,
      });

      availability.timeSlotStart = timeStr;
      availability.timeSlotEnd = minutesToTime(m + interval);
      availability.occupationDurationMinutes = occDuration;

      slots.push(availability);
    }
  }

  // Aggregate day color (worst color wins)
  const dayColor = aggregateDayColor(slots);

  return {
    date,
    isClosed: false,
    slots,
    dayColor,
  };
}

// =============================================================================
// Buffer Allocation Logic
// =============================================================================

/**
 * Determine which stock type to allocate for a new reservation.
 * Implements the 3-zone quota system with buffer redistribution rules.
 *
 * Rules:
 *   - Priority 1: paid stock full + paid request → buffer gives to paid
 *   - Priority 2: free stock full + free request + slot > 24h → buffer gives to free
 *   - Priority 3: slot < 3h → buffer NEVER gives free places
 *   - Absolute: assigned seats never reassigned
 */
export async function allocateStock(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  date: string;
  time: string;
  paymentType: "free" | "paid";
  partySize: number;
}): Promise<BufferAllocationResult> {
  const { supabase, establishmentId, date, time, paymentType, partySize } = args;

  const availability = await getSlotAvailability({
    supabase,
    establishmentId,
    date,
    time,
  });

  if (availability.isClosed || availability.total_capacity === 0) {
    return { allowed: false, stockType: "free_stock", reason: "slot_closed_or_no_capacity" };
  }

  // Calculate hours until slot
  const slotDateTime = new Date(`${date}T${time}:00`);
  const hoursUntil = (slotDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (paymentType === "paid") {
    // Try paid stock first
    if (availability.paid_available >= partySize) {
      return { allowed: true, stockType: "paid_stock" };
    }

    // Try buffer (Priority 1: paid request always gets buffer priority)
    if (availability.buffer_available >= partySize) {
      return { allowed: true, stockType: "buffer" };
    }

    return { allowed: false, stockType: "paid_stock", reason: "no_paid_or_buffer_capacity" };
  }

  // Free reservation
  // Try free stock first
  if (availability.free_available >= partySize) {
    return { allowed: true, stockType: "free_stock" };
  }

  // Priority 3: slot < 3h → NO buffer allocation for free
  if (hoursUntil < RESERVATION_TIMINGS.PROTECTION_WINDOW_HOURS) {
    return { allowed: false, stockType: "free_stock", reason: "buffer_frozen_within_3h" };
  }

  // Priority 2: slot > 24h → buffer CAN give to free
  if (hoursUntil > 24 && availability.buffer_available >= partySize) {
    return { allowed: true, stockType: "buffer" };
  }

  // Between 3h and 24h: buffer doesn't allocate to free
  if (hoursUntil <= 24) {
    return { allowed: false, stockType: "free_stock", reason: "buffer_unavailable_within_24h_for_free" };
  }

  return { allowed: false, stockType: "free_stock", reason: "no_free_or_buffer_capacity" };
}

// =============================================================================
// Discount Lookup
// =============================================================================

/**
 * Get applicable discounts for a specific establishment, date, and time slot.
 */
export async function getSlotDiscounts(args: {
  supabase: SupabaseClient;
  establishmentId: string;
  date: string;
  time?: string;
}): Promise<Array<{
  id: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  label: string;
}>> {
  const { supabase, establishmentId, date, time } = args;
  const dow = new Date(date + "T00:00:00Z").getUTCDay();

  let query = supabase
    .from("establishment_slot_discounts")
    .select("id, discount_type, discount_value, label, applies_to, day_of_week, specific_date, time_slot_start, time_slot_end")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .or(`start_date.is.null,start_date.lte.${date}`)
    .or(`end_date.is.null,end_date.gte.${date}`);

  const { data, error } = await query;
  if (error || !data) return [];

  const results: Array<{
    id: string;
    discount_type: "percentage" | "fixed_amount";
    discount_value: number;
    label: string;
  }> = [];

  for (const d of data as Record<string, unknown>[]) {
    const appliesTo = String(d.applies_to ?? "");

    let matches = false;
    if (appliesTo === "specific_date" && String(d.specific_date ?? "") === date) {
      matches = true;
    } else if (appliesTo === "day_of_week" && toInt(d.day_of_week) === dow) {
      matches = true;
    } else if (appliesTo === "time_range" && time) {
      const start = String(d.time_slot_start ?? "00:00");
      const end = String(d.time_slot_end ?? "23:59");
      matches = time >= start && time < end;
    }

    if (matches) {
      results.push({
        id: String(d.id ?? ""),
        discount_type: String(d.discount_type ?? "percentage") as "percentage" | "fixed_amount",
        discount_value: Number(d.discount_value ?? 0),
        label: String(d.label ?? ""),
      });
    }
  }

  return results;
}

// =============================================================================
// Helpers
// =============================================================================

function occupationRateToColor(rate: number): AvailabilityColor {
  if (rate >= 100) return "grey"; // full
  if (rate >= 80) return "red"; // < 20% free
  if (rate >= 50) return "orange"; // 20-50% free
  return "green"; // > 50% free
}

function aggregateDayColor(slots: SlotAvailabilityResult[]): AvailabilityColor {
  if (slots.length === 0) return "grey";

  const priorities: Record<AvailabilityColor, number> = {
    grey: 0,
    red: 1,
    orange: 2,
    green: 3,
  };

  let worst: AvailabilityColor = "green";
  for (const slot of slots) {
    if (priorities[slot.color] < priorities[worst]) {
      worst = slot.color;
    }
  }
  return worst;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = (time || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function emptySlotResult(time: string): SlotAvailabilityResult {
  return {
    total_capacity: 0,
    paid_total: 0,
    free_total: 0,
    buffer_total: 0,
    paid_occupied: 0,
    free_occupied: 0,
    buffer_occupied: 0,
    paid_available: 0,
    free_available: 0,
    buffer_available: 0,
    occupation_rate: 0,
    color: "grey",
    isClosed: true,
    timeSlotStart: time,
    timeSlotEnd: "",
    occupationDurationMinutes: 0,
  };
}

function toInt(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
