import { getConsumerAccessToken } from "@/lib/auth";
import type { BookingRecord, BookingStatus, BookingPaymentStatus, BookingKind } from "@/lib/userData";

type ConsumerReservationRow = {
  // NEW: auto-promotion waitlist logic
  waitlist_offer?: {
    id: string;
    reservation_id: string;
    slot_id: string | null;
    status: string;
    position: number;
    offer_sent_at: string | null;
    offer_expires_at: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  id: string;
  booking_reference: string | null;
  kind: string | null;
  establishment_id: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  party_size: number | null;
  amount_total: number | null;
  amount_deposit: number | null;
  currency: string | null;
  payment_status: string | null;
  checked_in_at: string | null;
  refusal_reason_code: string | null;
  refusal_reason_custom: string | null;
  is_from_waitlist?: boolean | null;
  meta: unknown;
  created_at: string | null;
  updated_at: string | null;
  establishments?: {
    name: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
  } | null;
};

type ListConsumerReservationsResponse = { ok: true; reservations: ConsumerReservationRow[] };
type GetConsumerReservationResponse = { ok: true; reservation: ConsumerReservationRow };
type UpdateConsumerReservationResponse = { ok: true; reservation: ConsumerReservationRow };

export class ConsumerApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerApiError";
    this.status = status;
    this.payload = payload;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const msg = typeof maybe.error === "string" ? maybe.error : null;
  return msg && msg.trim() ? msg : null;
}

async function requestAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new ConsumerApiError("Not authenticated", 401);

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
    throw new ConsumerApiError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", 0, e);
  }

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    if (res.status === 503 || res.status === 504) {
      throw new ConsumerApiError("Service temporairement indisponible. Réessayez dans un instant.", res.status, payload);
    }

    const msg = extractErrorMessage(payload) || `HTTP ${res.status}`;
    throw new ConsumerApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function listMyConsumerReservations(): Promise<ConsumerReservationRow[]> {
  const res = await requestAuthedJson<ListConsumerReservationsResponse>("/api/consumer/reservations", { method: "GET" });
  return (res.reservations ?? []) as ConsumerReservationRow[];
}

export async function getMyConsumerReservation(id: string): Promise<ConsumerReservationRow> {
  const res = await requestAuthedJson<GetConsumerReservationResponse>(`/api/consumer/reservations/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  return res.reservation as ConsumerReservationRow;
}

type FinanceInvoiceSummary = {
  id: string;
  invoice_number: string;
  issued_at: string;
  amount_cents: number;
  currency: string;
  reference_type: string;
  reference_id: string;
};

type GetConsumerReservationInvoiceResponse = { ok: true; invoice: FinanceInvoiceSummary };

export async function getMyConsumerReservationInvoice(reservationId: string): Promise<FinanceInvoiceSummary> {
  const id = String(reservationId ?? "").trim();
  if (!id) throw new ConsumerApiError("missing_reservation_id", 400);

  const res = await requestAuthedJson<GetConsumerReservationInvoiceResponse>(
    `/api/consumer/reservations/${encodeURIComponent(id)}/invoice`,
    {
      method: "GET",
    },
  );

  return res.invoice;
}

export async function updateMyConsumerReservation(
  id: string,
  patch:
    | { action: "request_change"; requested_change: { starts_at?: string | null; party_size?: number | null } }
    | { action: "cancel_request" }
    | { action: "request_cancellation" }
    | { action: "accept_proposed_change" }
    | { action: "decline_proposed_change" }
    | { action: "waitlist_accept_offer" }
    | { action: "waitlist_refuse_offer" },
): Promise<ConsumerReservationRow> {
  const res = await requestAuthedJson<UpdateConsumerReservationResponse>(
    `/api/consumer/reservations/${encodeURIComponent(id)}/update`,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );

  return res.reservation as ConsumerReservationRow;
}

function mapBookingKind(kind: string | null | undefined): BookingKind {
  if (kind === "hotel" || kind === "hebergement") return "hotel";
  return "restaurant";
}

function mapBookingStatus(status: string | null | undefined): BookingStatus {
  const s = String(status ?? "").trim();
  const allowed: BookingStatus[] = [
    "confirmed",
    "requested",
    "pending_pro_validation",
    "waitlist",
    "refused",
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "noshow",
  ] as unknown as BookingStatus[];

  if ((allowed as unknown as string[]).includes(s)) return s as BookingStatus;
  // fallback: keep legacy "requested" for unknown
  return "requested" as BookingStatus;
}

function mapPaymentStatus(status: string | null | undefined): BookingPaymentStatus {
  const s = String(status ?? "").trim();
  if (s === "paid" || s === "pending" || s === "refunded") return s as BookingPaymentStatus;
  return "pending";
}

function centsToMad(cents: number | null | undefined): number {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return Math.round(v) / 100;
}

export function mapConsumerReservationToBookingRecord(r: ConsumerReservationRow): BookingRecord {
  const est = r.establishments ?? null;

  const status = mapBookingStatus(r.status);
  const paymentStatus = mapPaymentStatus(r.payment_status);

  const depositMad = centsToMad(r.amount_deposit);
  const totalMad = r.amount_total == null ? undefined : centsToMad(r.amount_total);

  const attendance = r.checked_in_at ? "present" : status === "noshow" ? "no_show" : "unknown";

  const refusal = [r.refusal_reason_custom, r.refusal_reason_code].filter(Boolean).join(" · ");

  const notesParts: string[] = [];
  if (refusal) notesParts.push(`Motif: ${refusal}`);

  return {
    id: r.id,
    bookingReference: r.booking_reference ?? undefined,
    kind: mapBookingKind(r.kind),
    title: est?.name ?? "Réservation",
    status,
    dateIso: r.starts_at ?? new Date().toISOString(),
    endDateIso: r.ends_at ?? undefined,
    partySize: typeof r.party_size === "number" ? r.party_size : undefined,
    createdAtIso: r.created_at ?? new Date().toISOString(),

    establishmentId: r.establishment_id ?? undefined,
    addressLine: est?.address ?? undefined,
    city: est?.city ?? undefined,
    phone: est?.phone ?? undefined,
    notes: notesParts.length ? notesParts.join("\n") : undefined,

    payment: {
      status: paymentStatus,
      currency: (r.currency ?? "MAD").toUpperCase(),
      depositAmount: depositMad,
      totalAmount: totalMad,
    },

    attendance,

    // passthrough useful extra fields
    refusalReasonCode: r.refusal_reason_code ?? undefined,
    refusalReasonCustom: r.refusal_reason_custom ?? undefined,
    isFromWaitlist: r.is_from_waitlist ?? undefined,
    meta: r.meta,

    // NEW: auto-promotion waitlist logic
    waitlistOffer: r.waitlist_offer ?? null,
  } as BookingRecord;
}

// ---------------------------------------------------------------------------
// CREATE RESERVATION
// ---------------------------------------------------------------------------

type CreateReservationParams = {
  establishmentId: string;
  startsAt: string;
  partySize: number;
  slotId?: string | null;
  bookingReference?: string;
  kind?: string;
  meta?: Record<string, unknown>;
};

type CreateReservationResponse = {
  reservation: ConsumerReservationRow;
};

/**
 * Create a new consumer reservation.
 * The booking_source will be determined server-side based on the attribution cookie.
 */
export async function createConsumerReservation(
  params: CreateReservationParams
): Promise<CreateReservationResponse> {
  const body = {
    establishment_id: params.establishmentId,
    starts_at: params.startsAt,
    party_size: params.partySize,
    slot_id: params.slotId || undefined,
    booking_reference: params.bookingReference || undefined,
    kind: params.kind || "restaurant",
    meta: params.meta || {},
  };

  const result = await requestAuthedJson<{ reservation: ConsumerReservationRow }>(
    "/api/consumer/reservations",
    {
      method: "POST",
      body: JSON.stringify(body),
      credentials: "include", // Important: include cookies for attribution
    }
  );

  return result;
}
