/**
 * Reservation V2 — Pro-side API helpers
 *
 * Uses proSupabase auth for Bearer token.
 * Endpoints map 1:1 to server/routes/reservationV2Pro.ts.
 */

import { proSupabase } from "@/lib/pro/supabase";
import type {
  ReservationStatus,
  PaymentType,
  EstablishmentCapacityRow,
  EstablishmentSlotDiscountRow,
  ProAutoAcceptRuleRow,
  QuoteRequestRow,
  QuoteMessageRow,
  SlotAvailability,
} from "../../shared/reservationTypesV2";

// =============================================================================
// Auth helper
// =============================================================================

async function getProToken(): Promise<string> {
  const { data, error } = await proSupabase.auth.getSession();
  if (error || !data.session) throw new Error("Non authentifié");
  return data.session.access_token;
}

// =============================================================================
// Generic fetch
// =============================================================================

export class ProV2ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(msg: string, status: number, payload?: unknown) {
    super(msg);
    this.name = "ProV2ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function proAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getProToken();
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
  } catch {
    throw new ProV2ApiError("Impossible de contacter le serveur.", 0);
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) payload = await res.json().catch(() => null);
  else payload = await res.text().catch(() => null);

  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg = (typeof rec?.error === "string" ? rec.error : null) ?? `HTTP ${res.status}`;
    throw new ProV2ApiError(msg, res.status, payload);
  }
  return payload as T;
}

function qs(estId: string, extra?: Record<string, string>): string {
  const p = new URLSearchParams({ establishment_id: estId, ...extra });
  return p.toString();
}

// =============================================================================
// Reservations — list & calendar
// =============================================================================

export interface ProReservationRow {
  id: string;
  user_id: string;
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
  pro_custom_message: string | null;
  consumed_at: string | null;
  consumer_users?: { full_name: string | null; email: string | null; phone: string | null } | null;
  consumer_user_stats?: { score_v2: number | null; no_shows_count: number | null } | null;
}

export async function proListReservationsV2(
  estId: string,
  opts?: { status?: string; date?: string; from?: string; to?: string; limit?: number; offset?: number },
): Promise<{ ok: true; reservations: ProReservationRow[] }> {
  const params = new URLSearchParams({ establishment_id: estId });
  if (opts?.status) params.set("status", opts.status);
  if (opts?.date) params.set("date", opts.date);
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  return proAuthedJson(`/api/pro/reservations?${params}`);
}

export async function proGetCalendarV2(
  estId: string,
  month: string,
): Promise<{ ok: true; calendar: Record<string, { total: number; confirmed: number; pending: number; free: number; paid: number }> }> {
  return proAuthedJson(`/api/pro/reservations/calendar?${qs(estId, { month })}`);
}

// =============================================================================
// Actions on reservations
// =============================================================================

export async function proAcceptReservation(
  reservationId: string,
  estId: string,
  customMessage?: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/accept`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, custom_message: customMessage }),
  });
}

export async function proRefuseReservation(
  reservationId: string,
  estId: string,
  reason?: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/refuse`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, reason }),
  });
}

export async function proHoldReservation(
  reservationId: string,
  estId: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/hold`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId }),
  });
}

export async function proScanQr(
  token: string,
  estId: string,
): Promise<{ ok: true; reservation: ProReservationRow }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(token)}/scan-qr`, {
    method: "POST",
    body: JSON.stringify({ qr_token: token, establishment_id: estId }),
  });
}

export async function proConfirmAttendance(
  reservationId: string,
  estId: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/confirm-venue`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId }),
  });
}

export async function proDeclareNoShow(
  reservationId: string,
  estId: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/declare-no-show`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId }),
  });
}

export async function proRequestDeposit(
  reservationId: string,
  estId: string,
  amount: number,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/request-deposit`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, amount }),
  });
}

export async function proCancelReservation(
  reservationId: string,
  estId: string,
  reason?: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/reservations/${encodeURIComponent(reservationId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, reason }),
  });
}

// =============================================================================
// Capacity
// =============================================================================

export async function proGetCapacity(
  estId: string,
): Promise<{ ok: true; capacity: EstablishmentCapacityRow[] }> {
  return proAuthedJson(`/api/pro/capacity?${qs(estId)}`);
}

export async function proUpdateCapacity(
  estId: string,
  slots: Partial<EstablishmentCapacityRow>[],
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/capacity`, {
    method: "PUT",
    body: JSON.stringify({ establishment_id: estId, slots }),
  });
}

// =============================================================================
// Discounts
// =============================================================================

export async function proGetDiscounts(
  estId: string,
): Promise<{ ok: true; discounts: EstablishmentSlotDiscountRow[] }> {
  return proAuthedJson(`/api/pro/discounts?${qs(estId)}`);
}

export async function proCreateDiscount(
  estId: string,
  discount: Partial<EstablishmentSlotDiscountRow>,
): Promise<{ ok: true; discount: EstablishmentSlotDiscountRow }> {
  return proAuthedJson(`/api/pro/discounts`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, ...discount }),
  });
}

export async function proUpdateDiscount(
  discountId: string,
  estId: string,
  patch: Partial<EstablishmentSlotDiscountRow>,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/discounts/${encodeURIComponent(discountId)}`, {
    method: "PUT",
    body: JSON.stringify({ establishment_id: estId, ...patch }),
  });
}

export async function proDeleteDiscount(
  discountId: string,
  estId: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/discounts/${encodeURIComponent(discountId)}`, {
    method: "DELETE",
    body: JSON.stringify({ establishment_id: estId }),
  });
}

// =============================================================================
// Auto-accept rules
// =============================================================================

export async function proGetAutoAcceptRules(
  estId: string,
): Promise<{ ok: true; rules: ProAutoAcceptRuleRow[] }> {
  return proAuthedJson(`/api/pro/auto-accept-rules?${qs(estId)}`);
}

export async function proUpsertAutoAcceptRules(
  estId: string,
  rules: Partial<ProAutoAcceptRuleRow>[],
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/auto-accept-rules`, {
    method: "PUT",
    body: JSON.stringify({ establishment_id: estId, rules }),
  });
}

// =============================================================================
// Quotes
// =============================================================================

export async function proListQuotes(
  estId: string,
): Promise<{ ok: true; quotes: QuoteRequestRow[] }> {
  return proAuthedJson(`/api/pro/quotes?${qs(estId)}`);
}

export async function proAcknowledgeQuote(
  quoteId: string,
  estId: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/quotes/${encodeURIComponent(quoteId)}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId }),
  });
}

export async function proSendQuoteOffer(
  quoteId: string,
  estId: string,
  content: string,
  attachments?: any[],
): Promise<{ ok: true; messageId: string }> {
  return proAuthedJson(`/api/pro/quotes/${encodeURIComponent(quoteId)}/send-quote`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, content, attachments }),
  });
}

export async function proDeclineQuote(
  quoteId: string,
  estId: string,
  reason?: string,
): Promise<{ ok: true }> {
  return proAuthedJson(`/api/pro/quotes/${encodeURIComponent(quoteId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ establishment_id: estId, reason }),
  });
}

// =============================================================================
// Stats
// =============================================================================

export interface ProReservationStats {
  occupancyRate: number;
  noShowRate: number;
  conversionRate: number;
  freeTooPaidRate: number;
  totalReservations: number;
  totalConfirmed: number;
  totalNoShows: number;
  totalCancelled: number;
  revenueDeposits: number;
}

export async function proGetReservationStats(
  estId: string,
  period?: string,
): Promise<{ ok: true; stats: ProReservationStats }> {
  const params: Record<string, string> = {};
  if (period) params.period = period;
  return proAuthedJson(`/api/pro/stats/reservations?${qs(estId, params)}`);
}

export async function proGetOccupancyRealtime(
  estId: string,
  date: string,
): Promise<{ ok: true; slots: Array<{ time: string; availability: SlotAvailability }> }> {
  return proAuthedJson(`/api/pro/stats/occupancy?${qs(estId, { date })}`);
}
