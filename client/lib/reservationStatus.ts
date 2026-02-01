import type { BookingRecord } from "@/lib/userData";
import type { TranslateParams } from "@/lib/i18n";
import { messages } from "@/lib/i18n/messages";
import { DEFAULT_APP_LOCALE, normalizeAppLocale, type AppLocale } from "@/lib/i18n/types";

export type StatusBadge = { text: string; className: string; title?: string };

export type TranslateFn = (key: string, params?: TranslateParams) => string;

const STORAGE_KEY = "sam_locale";

function safeLower(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v == null ? "" : String(v);
  });
}

function getActiveLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_APP_LOCALE;
  try {
    return normalizeAppLocale(window.localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_APP_LOCALE;
  } catch {
    return DEFAULT_APP_LOCALE;
  }
}

function defaultTranslate(key: string, params?: TranslateParams): string {
  const locale = getActiveLocale();
  const dict = messages[locale] ?? messages[DEFAULT_APP_LOCALE];
  const raw = dict?.[key] ?? messages[DEFAULT_APP_LOCALE]?.[key] ?? key;
  return interpolate(raw, params);
}

function resolveTranslate(t: TranslateFn | undefined): TranslateFn {
  return t ?? defaultTranslate;
}

export function isFiniteDateIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  return Number.isFinite(ts);
}

export function isPastByIso(iso: string | null | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return ts < nowMs;
}

export function isBookingInPast(booking: BookingRecord, nowMs: number = Date.now()): boolean {
  const endIso = booking.endDateIso ?? booking.dateIso;
  return isPastByIso(endIso, nowMs);
}

export function isGuaranteedBooking(b: BookingRecord): boolean {
  return b.payment?.status === "paid" && (b.payment.depositAmount ?? 0) > 0;
}

export function getBookingRefusalReason(b: BookingRecord): string {
  return [b.refusalReasonCustom, b.refusalReasonCode].filter(Boolean).join(" · ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getUserBookingStatusBadge(
  booking: BookingRecord,
  args?: {
    context?: "details" | "profile";
    nowMs?: number;
    t?: TranslateFn;
  },
): StatusBadge {
  const context = args?.context ?? "details";
  const nowMs = typeof args?.nowMs === "number" && Number.isFinite(args.nowMs) ? args.nowMs : Date.now();
  const translate = resolveTranslate(args?.t);

  const status = safeLower(booking.status);
  const refusalReason = getBookingRefusalReason(booking);

  const metaRaw = (booking as unknown as { meta?: unknown }).meta;
  const meta = isRecord(metaRaw) ? metaRaw : null;
  const hasModificationRequest =
    meta?.modification_requested === true || (isRecord(meta?.requested_change) && Object.keys(meta.requested_change).length > 0);

  if (hasModificationRequest && status !== "refused" && status !== "cancelled" && status !== "cancelled_user" && status !== "cancelled_pro" && status !== "noshow") {
    return {
      text: translate("reservation.status.modification_pending"),
      className: "bg-amber-50 text-amber-900 border-amber-200",
      title: translate("reservation.status.modification_pending.title"),
    };
  }

  // Terminal / explicit outcomes first.
  if (status === "refused") {
    return {
      text: translate("reservation.status.refused"),
      className: "bg-rose-50 text-rose-800 border-rose-200",
      title: refusalReason || translate("reservation.status.refused.title"),
    };
  }

  if (status === "waitlist") {
    return {
      text: translate("reservation.status.waitlist"),
      className: "bg-blue-50 text-blue-800 border-blue-200",
    };
  }

  // Backward-compatible display: treat legacy "requested" like pending.
  if (status === "pending_pro_validation" || status === "requested") {
    return {
      text: translate("reservation.status.pending_pro"),
      className: "bg-amber-50 text-amber-900 border-amber-200",
    };
  }

  if (status === "cancelled_user") {
    return {
      text:
        context === "details"
          ? translate("reservation.status.cancelled.you")
          : translate("reservation.status.cancelled.client"),
      className: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (status === "cancelled_pro") {
    return {
      text: translate("reservation.status.cancelled.establishment"),
      className: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (status === "cancelled") {
    if (booking.payment?.status === "refunded") {
      return {
        text: translate("reservation.status.cancelled.refunded"),
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
    }
    return { text: translate("reservation.status.cancelled.generic"), className: "bg-slate-100 text-slate-700 border-slate-200" };
  }

  if (status === "noshow") {
    return {
      text: translate("reservation.status.no_show"),
      className: "bg-rose-50 text-rose-800 border-rose-200",
    };
  }

  // Past booking labeling (only if dates are valid).
  const endIso = booking.endDateIso ?? booking.dateIso;
  if (isFiniteDateIso(endIso) && isPastByIso(endIso, nowMs)) {
    if (booking.attendance === "present") {
      return {
        text: translate("reservation.status.past.present"),
        className: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    }
    if (booking.attendance === "no_show") {
      return {
        text: translate("reservation.status.past.no_show"),
        className: "bg-rose-50 text-rose-800 border-rose-200",
      };
    }
    return { text: translate("reservation.status.past.generic"), className: "bg-slate-100 text-slate-700 border-slate-200" };
  }

  if (status === "confirmed") {
    const guaranteed = isGuaranteedBooking(booking);
    return {
      text: guaranteed
        ? translate("reservation.status.confirmed.guaranteed")
        : translate("reservation.status.confirmed.not_guaranteed"),
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }

  // Fallback.
  return { text: translate("reservation.status.generic"), className: "bg-slate-100 text-slate-700 border-slate-200" };
}

export function getReservationStatusLabel(status: string | null | undefined, t?: TranslateFn): string {
  const translate = resolveTranslate(t);
  const s = safeLower(status);

  if (s === "refused") return translate("reservation.status.refused");
  if (s === "waitlist") return translate("reservation.status.waitlist");
  if (s === "pending_pro_validation" || s === "requested") return translate("reservation.status.pending_pro");
  if (s === "confirmed") return translate("reservation.status.confirmed");
  if (s === "noshow") return translate("reservation.status.no_show");
  if (s === "cancelled_user") return translate("reservation.status.cancelled.client");
  if (s === "cancelled_pro") return translate("reservation.status.cancelled.establishment");
  if (s === "cancelled") return translate("reservation.status.cancelled.generic");

  return status ? String(status) : "—";
}

export function getReservationStatusBadgeClass(status: string | null | undefined): string {
  const s = safeLower(status);

  if (s === "confirmed" || s === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";

  if (s === "requested" || s === "pending" || s === "pending_pro_validation" || s === "waitlist") {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }

  if (s === "noshow" || s === "cancelled" || s === "cancelled_user" || s === "cancelled_pro" || s === "refused") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  return "bg-slate-50 text-slate-700 border-slate-200";
}

export function getPaymentStatusLabel(paymentStatus: string | null | undefined, t?: TranslateFn): string {
  const translate = resolveTranslate(t);
  const s = safeLower(paymentStatus);
  if (s === "paid") return translate("payment.status.paid");
  if (s === "pending") return translate("payment.status.pending");
  if (s === "refunded") return translate("payment.status.refunded");
  return paymentStatus ? String(paymentStatus) : "—";
}

export function getPaymentStatusBadgeClass(paymentStatus: string | null | undefined): string {
  const s = safeLower(paymentStatus);
  if (s === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "pending") return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "refunded") return "bg-slate-50 text-slate-700 border-slate-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}
