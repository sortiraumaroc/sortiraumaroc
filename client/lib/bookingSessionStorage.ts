/**
 * Booking session storage utility.
 *
 * Persists the booking state to `sessionStorage` so that it survives a full-page
 * OAuth redirect (Google / Apple sign-in). When the user comes back to the
 * booking page after the OAuth round-trip, the state is restored automatically.
 *
 * `sessionStorage` is scoped to the browser tab — no cross-tab interference.
 */

import type { BookingType, HotelRoomSelection, ReservationMode, SelectedPack, ServiceType } from "@/hooks/useBooking";

// ---- Types ------------------------------------------------------------------

export interface BookingSessionData {
  // Step 1 — core selections
  bookingType: BookingType;
  establishmentId: string | null;
  partySize: number | null;
  selectedDate: string | null; // ISO string
  selectedTime: string | null;
  selectedService: ServiceType | null;
  selectedPack: SelectedPack | null;
  waitlistRequested: boolean;

  // Hotel-specific
  checkInDate: string | null; // ISO string
  checkOutDate: string | null; // ISO string
  hotelRoomSelection: HotelRoomSelection | null;

  // Step 2
  reservationMode: ReservationMode | null;

  // Step 3 — personal info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  promoCode: string;

  // Navigation
  pendingStep: number;
  referrerUrl: string;

  // Staleness guard
  savedAt: number;
}

// ---- Constants --------------------------------------------------------------

const STORAGE_KEY = "sam_booking_pending_auth";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// ---- Public API -------------------------------------------------------------

export function saveBookingSession(data: BookingSessionData): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private browsing, quota exceeded, etc. — silently ignore.
  }
}

export function getBookingSession(): BookingSessionData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as BookingSessionData;

    // Discard if older than MAX_AGE_MS
    if (typeof data.savedAt !== "number" || Date.now() - data.savedAt > MAX_AGE_MS) {
      clearBookingSession();
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function clearBookingSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
