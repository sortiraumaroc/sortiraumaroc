import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Hotel, Users, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoneyMad, getBookingPreReservationBreakdown } from "@/lib/billing";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getUserBookingStatusBadge, isBookingInPast } from "@/lib/reservationStatus";
import type { BookingRecord } from "@/lib/userData";

import { formatDateJjMmAa, formatHeureHhHMM } from "@shared/datetime";

function formatIsoDateShort(iso: string): string {
  return formatDateJjMmAa(iso);
}

function formatIsoTimeShort(iso: string): string | null {
  const out = formatHeureHhHMM(iso);
  return out ? out : null;
}

export function ProfileBookings({ bookings }: { bookings: BookingRecord[] }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const nowMs = Date.now();
  const currentBookings = bookings.filter((b) => !isBookingInPast(b, nowMs));
  const expiredBookings = bookings.filter((b) => isBookingInPast(b, nowMs));

  if (!bookings.length) {
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-white p-6 text-slate-700">
        <div className="font-bold text-foreground">{t("profile.bookings.empty.title")}</div>
        <div className="mt-2 text-sm text-slate-600">{t("profile.bookings.empty.subtitle")}</div>
      </div>
    );
  }

  const renderBookingCard = (b: BookingRecord) => {
    const Icon = b.kind === "hotel" ? Hotel : UtensilsCrossed;
    const status = getUserBookingStatusBadge(b, { context: "profile", t, nowMs });
    const time = formatIsoTimeShort(b.dateIso);
    const range = b.endDateIso ? `${formatIsoDateShort(b.dateIso)} → ${formatIsoDateShort(b.endDateIso)}` : formatIsoDateShort(b.dateIso);
    const ref = (b.bookingReference ?? b.id).trim();

    const offer = (b as any).waitlistOffer as any;
    const expiresAt = offer && typeof offer.offer_expires_at === "string" ? Date.parse(offer.offer_expires_at) : NaN;
    const isOfferActive = offer && offer.status === "offer_sent" && Number.isFinite(expiresAt) && expiresAt > nowMs;

    const paid = b.payment?.status === "paid";
    const breakdown = paid ? getBookingPreReservationBreakdown(b) : null;

    return (
      <div key={b.id} className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-200 bg-primary/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5 text-primary" />
              <div className="font-bold text-foreground truncate">{b.title}</div>
            </div>
            <div className="mt-1 text-xs text-slate-600 font-mono">
              {t("profile.bookings.ref")} {ref}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <div
              className={cn(
                "max-w-[170px] sm:max-w-none px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-bold text-center leading-tight whitespace-normal sm:whitespace-nowrap",
                status.className,
              )}
              title={status.title}
            >
              {status.text}
            </div>
            {isOfferActive ? (
              <div className="px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-[11px] font-extrabold text-amber-700">
                {t("profile.bookings.waitlist_offer")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{t("profile.bookings.field.date")}</div>
              <div className="font-semibold text-foreground">{range}</div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{t("profile.bookings.field.time")}</div>
              <div className="font-semibold text-foreground">{time ?? "—"}</div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Users className="w-4 h-4 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600">{t("profile.bookings.field.people")}</div>
              <div className="font-semibold text-foreground">{typeof b.partySize === "number" ? b.partySize : "—"}</div>
            </div>
          </div>
        </div>

        {paid && breakdown && breakdown.totalMad != null && breakdown.unitMad != null && breakdown.partySize != null ? (
          <div className="px-4 pb-4 -mt-1">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-600">{t("profile.bookings.pre_reservation")}</div>
                <div className="text-xs text-slate-500">
                  {formatMoneyMad(breakdown.unitMad)} × {breakdown.partySize}
                </div>
              </div>
              <div className="text-end">
                <div className="text-[11px] text-slate-500">{t("profile.bookings.amount_paid")}</div>
                <div className="text-sm font-extrabold text-foreground tabular-nums">{formatMoneyMad(breakdown.totalMad)}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="p-4 pt-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(`/profile/bookings/${encodeURIComponent(b.id)}`)}>
            {t("profile.bookings.view")}
          </Button>
        </div>
      </div>
    );
  };

  const renderSection = (args: { title: string; items: BookingRecord[]; emptyText: string }) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold text-slate-900">{args.title}</div>
          <div className="text-xs text-slate-500 tabular-nums">{args.items.length}</div>
        </div>

        {args.items.length ? <div className="space-y-4">{args.items.map(renderBookingCard)}</div> : <div className="text-sm text-slate-600">{args.emptyText}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderSection({ title: "Réservations actuelles", items: currentBookings, emptyText: "Aucune réservation à venir." })}
      {renderSection({ title: "Réservations expirées", items: expiredBookings, emptyText: "Aucune réservation expirée." })}
    </div>
  );
}
