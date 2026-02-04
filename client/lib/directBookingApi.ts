/**
 * Direct Booking API
 *
 * API client for the direct booking feature (book.sam.ma/:username).
 * These endpoints set the booking attribution cookie for commission-free reservations.
 */

import type { PublicEstablishment, PublicDateSlots, PublicBookingPolicy } from "./publicApi";

export class DirectBookingApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "DirectBookingApiError";
    this.status = status;
    this.payload = payload;
  }
}

export type DirectBookingEstablishment = PublicEstablishment & {
  username?: string | null;
  avg_rating?: number | null;
  review_count?: number;
};

export type DirectBookingSlot = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  base_price: number | null;
  promo_type: string | null;
  promo_value: number | null;
  promo_label: string | null;
  service_label: string | null;
};

export type DirectBookingPack = {
  id: string;
  title: string;
  description: string | null;
  label: string | null;
  items: unknown;
  price: number;
  original_price: number | null;
  is_limited: boolean;
  stock: number | null;
  availability: string;
  valid_from: string | null;
  valid_to: string | null;
  conditions: string | null;
  max_reservations: number | null;
};

export type DirectBookingResponse = {
  ok: true;
  establishment: DirectBookingEstablishment;
  slots: DirectBookingSlot[];
  slotsByDate: Record<string, DirectBookingSlot[]>;
  packs: DirectBookingPack[];
  bookingPolicy: PublicBookingPolicy | null;
  attributionSet: boolean;
};

/**
 * Get establishment by username for direct booking.
 * This endpoint sets the HTTPOnly attribution cookie for 48 hours.
 *
 * @param username - The establishment's username (e.g., "riad-atlas")
 * @returns Establishment data with slots and packs
 */
export async function getDirectBookingEstablishment(
  username: string
): Promise<DirectBookingResponse> {
  const normalizedUsername = username.toLowerCase().trim();

  if (!normalizedUsername || normalizedUsername.length < 3) {
    throw new DirectBookingApiError("Invalid username", 400);
  }

  const res = await fetch(
    `/api/public/establishments/by-username/${encodeURIComponent(normalizedUsername)}`,
    {
      method: "GET",
      credentials: "include", // Important: include cookies for attribution
      headers: {
        Accept: "application/json",
      },
    }
  );

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const errorMsg =
      (payload as any)?.error ||
      (payload as any)?.message ||
      `HTTP ${res.status}`;
    throw new DirectBookingApiError(errorMsg, res.status, payload);
  }

  return payload as DirectBookingResponse;
}

/**
 * Convert slots to DateSlots format for the booking calendar
 */
export function convertSlotsToDateSlots(
  slotsByDate: Record<string, DirectBookingSlot[]>
): PublicDateSlots[] {
  const result: PublicDateSlots[] = [];

  for (const [date, slots] of Object.entries(slotsByDate)) {
    // Group by service label
    const serviceMap: Record<string, string[]> = {};
    const promos: Record<string, number | null> = {};
    const slotIds: Record<string, string> = {};
    const remaining: Record<string, number | null> = {};

    for (const slot of slots) {
      const time = slot.starts_at.split("T")[1]?.substring(0, 5) || "";
      const service = slot.service_label || "Disponible";

      if (!serviceMap[service]) {
        serviceMap[service] = [];
      }
      serviceMap[service].push(time);

      // Track promos, slotIds, and remaining capacity
      if (slot.promo_type === "percent" && slot.promo_value) {
        promos[time] = slot.promo_value;
      }
      slotIds[time] = slot.id;
      remaining[time] = slot.capacity;
    }

    const services = Object.entries(serviceMap).map(([service, times]) => ({
      service,
      times: times.sort(),
    }));

    result.push({
      date,
      services,
      promos,
      slotIds,
      remaining,
    });
  }

  // Sort by date
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}
