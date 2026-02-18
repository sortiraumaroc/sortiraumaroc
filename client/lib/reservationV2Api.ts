/**
 * Reservation V2 — Client-side API helpers
 *
 * Mirrors the same `requestAuthedJson` pattern used by consumerReservationsApi.ts.
 * Endpoints map 1:1 to server/routes/reservationV2Public.ts & reservationV2Pro.ts.
 */

import { getConsumerAccessToken } from "@/lib/auth";
import type {
  ReservationStatus,
  PaymentType,
  ClientDisputeResponse,
  EventType,
  SlotAvailability,
  QuoteStatus,
  EstablishmentCapacityRow,
  EstablishmentSlotDiscountRow,
  NoShowDisputeRow,
  QuoteRequestRow,
  QuoteMessageRow,
} from "../../shared/reservationTypesV2";

// =============================================================================
// Error class (same pattern as consumerReservationsApi)
// =============================================================================

export class ReservationV2ApiError extends Error {
  status: number;
  errorCode?: string;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown, errorCode?: string) {
    super(message);
    this.name = "ReservationV2ApiError";
    this.status = status;
    this.payload = payload;
    this.errorCode = errorCode;
  }
}

// =============================================================================
// Authed fetch helper
// =============================================================================

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new ReservationV2ApiError("Not authenticated", 401);

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new ReservationV2ApiError(
      "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      0,
      e,
    );
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg =
      (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    const code = typeof rec?.errorCode === "string" ? rec.errorCode : undefined;
    throw new ReservationV2ApiError(msg, res.status, payload, code);
  }

  return payload as T;
}

// =============================================================================
// Response types
// =============================================================================

export interface AvailabilitySlot {
  time: string;
  total: number;
  paid_available: number;
  free_available: number;
  buffer_available: number;
  occupation_rate: number;
}

export interface AvailabilityResponse {
  ok: true;
  availability: SlotAvailability[] | Record<string, SlotAvailability>;
  discounts: EstablishmentSlotDiscountRow[];
}

export interface AvailabilitySlotResponse {
  ok: true;
  slot: SlotAvailability;
  discounts: EstablishmentSlotDiscountRow[];
}

export interface ReservationV2Row {
  id: string;
  establishment_id: string;
  starts_at: string;
  party_size: number;
  status: ReservationStatus;
  type: string;
  payment_type: PaymentType;
  stock_type: string | null;
  booking_reference: string | null;
  qr_code_token: string | null;
  created_at: string;
  updated_at: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  pro_custom_message: string | null;
  consumed_at: string | null;
  establishments?: {
    name: string | null;
    slug: string | null;
    cover_image_url: string | null;
    city: string | null;
  } | null;
}

export interface CreateReservationResult {
  ok: true;
  reservation: ReservationV2Row;
  waitlisted: boolean;
}

export interface CancelReservationResult {
  ok: true;
  newStatus: string;
  cancellationType: string;
}

export interface UpgradeResult {
  ok: true;
  newStatus: string;
}

export interface QrCodeResult {
  ok: true;
  qrCodeToken: string;
  status: string;
  startsAt: string;
}

export interface PromoValidationResult {
  ok: boolean;
  valid: boolean;
  error?: string;
  discount?: {
    id: string;
    type: string;
    value: number;
    label: string;
  };
}

export interface ScoreResult {
  ok: true;
  score: number;
  stars: number;
  breakdown: Record<string, number>;
  isSuspended: boolean;
  suspendedUntil: string | null;
}

export interface QuoteDetailResult {
  ok: true;
  quote: QuoteRequestRow;
  messages: QuoteMessageRow[];
}

// =============================================================================
// 1-2. Availability
// =============================================================================

export async function getEstablishmentAvailability(
  establishmentId: string,
  date: string,
): Promise<AvailabilityResponse> {
  return authedJson(
    `/api/establishments/${encodeURIComponent(establishmentId)}/availability?date=${encodeURIComponent(date)}`,
  );
}

export async function getEstablishmentDateAvailability(
  establishmentId: string,
  date: string,
  time?: string,
): Promise<AvailabilityResponse | AvailabilitySlotResponse> {
  let url = `/api/establishments/${encodeURIComponent(establishmentId)}/availability/${encodeURIComponent(date)}`;
  if (time) url += `?time=${encodeURIComponent(time)}`;
  return authedJson(url);
}

// =============================================================================
// 3. Create reservation
// =============================================================================

export interface CreateReservationInput {
  establishment_id: string;
  starts_at: string;
  party_size: number;
  payment_type?: PaymentType;
  slot_id?: string;
  promo_code_id?: string;
  meta?: Record<string, unknown>;
}

export async function createReservationV2(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  return authedJson("/api/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// =============================================================================
// 4. Modify reservation
// =============================================================================

export async function modifyReservationV2(
  reservationId: string,
  patch: { starts_at?: string; party_size?: number; slot_id?: string },
): Promise<{ ok: true; message: string }> {
  return authedJson(`/api/reservations/${encodeURIComponent(reservationId)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

// =============================================================================
// 5. Cancel reservation
// =============================================================================

export async function cancelReservationV2(
  reservationId: string,
  reason?: string,
): Promise<CancelReservationResult> {
  return authedJson(`/api/reservations/${encodeURIComponent(reservationId)}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

// =============================================================================
// 6. Upgrade free → paid
// =============================================================================

export async function upgradeReservationV2(
  reservationId: string,
): Promise<UpgradeResult> {
  return authedJson(
    `/api/reservations/${encodeURIComponent(reservationId)}/upgrade`,
    { method: "POST" },
  );
}

// =============================================================================
// 7. QR Code
// =============================================================================

export async function getReservationQrCode(
  reservationId: string,
): Promise<QrCodeResult> {
  return authedJson(
    `/api/reservations/${encodeURIComponent(reservationId)}/qrcode`,
  );
}

// =============================================================================
// 8. Validate promo code
// =============================================================================

export async function validatePromoCode(
  code: string,
  establishmentId: string,
  date?: string,
): Promise<PromoValidationResult> {
  return authedJson("/api/reservations/validate-promo", {
    method: "POST",
    body: JSON.stringify({ code, establishment_id: establishmentId, date }),
  });
}

// =============================================================================
// 9. My reservations
// =============================================================================

export async function getMyReservationsV2(opts?: {
  status?: string;
  upcoming?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ ok: true; reservations: ReservationV2Row[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.upcoming) params.set("upcoming", "true");
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return authedJson(`/api/me/reservations${qs ? `?${qs}` : ""}`);
}

// =============================================================================
// 10. My score
// =============================================================================

export async function getMyScoreV2(): Promise<ScoreResult> {
  return authedJson("/api/me/score");
}

// =============================================================================
// 11. Join waitlist
// =============================================================================

export async function joinWaitlistV2(input: {
  establishment_id: string;
  starts_at: string;
  party_size: number;
  slot_id?: string;
}): Promise<{ ok: true; waitlistEntryId: string }> {
  return authedJson("/api/waitlist", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// =============================================================================
// 12. Confirm waitlist offer
// =============================================================================

export async function confirmWaitlistOfferV2(
  entryId: string,
): Promise<{ ok: true; reservation: ReservationV2Row }> {
  return authedJson(`/api/waitlist/${encodeURIComponent(entryId)}/confirm`, {
    method: "POST",
  });
}

// =============================================================================
// 13. Submit quote request
// =============================================================================

export interface SubmitQuoteInput {
  establishment_id: string;
  party_size: number;
  preferred_date?: string;
  preferred_time_slot?: string;
  is_date_flexible?: boolean;
  event_type: EventType;
  event_type_other?: string;
  requirements?: string;
  budget_indication?: string;
  contact_phone?: string;
  contact_email?: string;
}

export async function submitQuoteRequestV2(
  input: SubmitQuoteInput,
): Promise<{ ok: true; quoteId: string }> {
  return authedJson("/api/quotes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// =============================================================================
// 14. My quotes
// =============================================================================

export async function getMyQuotesV2(): Promise<{
  ok: true;
  quotes: (QuoteRequestRow & { establishments?: { name: string | null; slug: string | null; cover_image_url: string | null; city: string | null } })[];
}> {
  return authedJson("/api/me/quotes");
}

// =============================================================================
// 15. Quote detail
// =============================================================================

export async function getQuoteDetailV2(quoteId: string): Promise<QuoteDetailResult> {
  return authedJson(`/api/quotes/${encodeURIComponent(quoteId)}`);
}

// =============================================================================
// 16. Send quote message
// =============================================================================

export async function sendQuoteMessageV2(
  quoteId: string,
  content: string,
  attachments?: Array<{ url: string; filename: string; type: string; size: number }>,
): Promise<{ ok: true; messageId: string }> {
  return authedJson(`/api/quotes/${encodeURIComponent(quoteId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, attachments }),
  });
}

// =============================================================================
// 17. Accept quote
// =============================================================================

export async function acceptQuoteV2(
  quoteId: string,
): Promise<{ ok: true; quoteId: string; reservationId: string }> {
  return authedJson(`/api/quotes/${encodeURIComponent(quoteId)}/accept`, {
    method: "POST",
  });
}

// =============================================================================
// 18. Respond to no-show dispute
// =============================================================================

export async function respondToNoShowDisputeV2(
  disputeId: string,
  response: ClientDisputeResponse,
  evidence?: Array<{ url: string; type: string; description?: string }>,
): Promise<{ ok: true; newStatus: string }> {
  return authedJson(`/api/no-show-disputes/${encodeURIComponent(disputeId)}/respond`, {
    method: "POST",
    body: JSON.stringify({ response, evidence }),
  });
}

// =============================================================================
// Score display helpers (re-exported from shared for convenience)
// =============================================================================

export { scoreToStars, computeClientScoreV2 } from "../../shared/reservationTypesV2";
