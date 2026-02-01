import { Calendar, Clock, Gift, MapPin, Percent, Users } from "lucide-react";

import { useBooking } from "@/hooks/useBooking";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { formatDateJjMmAa, formatTimeHmLabel } from "@shared/datetime";

function isTimeHm(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function timeToMinutes(value: string): number | null {
  if (!isTimeHm(value)) return null;
  const [hh, mm] = value.split(":").map((n) => Number(n));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function inferPromoPercent(args: { bookingType: "restaurant" | "activity" | "hotel"; time: string | null }): number | null {
  if (!args.time) return null;
  const minutes = timeToMinutes(args.time);
  if (minutes == null) return null;

  if (args.bookingType === "restaurant") {
    // TheFork-like fallback: midi -50%, soir -40%
    if (minutes >= 11 * 60 && minutes <= 15 * 60) return 50;
    if (minutes >= 18 * 60 && minutes <= 23 * 60 + 30) return 40;
    return null;
  }

  if (args.bookingType === "activity") {
    // Light promo hint for activities (optional)
    if (minutes >= 9 * 60 && minutes <= 14 * 60 + 30) return 50;
    return null;
  }

  return null;
}

export function BookingRecapCard(props: { title?: string; establishmentName?: string; className?: string }) {
  const { t, formatCurrencyMAD } = useI18n();

  const {
    bookingType,
    partySize,
    selectedDate,
    selectedTime,
    selectedService,
    selectedPack,
    reservationMode,
  } = useBooking();

  const promoPercent = inferPromoPercent({ bookingType, time: selectedTime });

  const serviceLabel = bookingType === "restaurant" ? (selectedService ? selectedService : null) : null;

  const modeLabel =
    reservationMode === "guaranteed"
      ? t("booking.mode.guaranteed")
      : reservationMode === "non-guaranteed"
        ? t("booking.mode.not_guaranteed")
        : null;

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-4", props.className)}>
      {props.title ? <div className="text-sm font-bold text-slate-900">{props.title}</div> : null}

      <div className={cn(props.title ? "mt-3" : "", "space-y-3")}>
        {props.establishmentName ? (
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-500">{t("booking.recap.establishment")}</div>
              <div className="text-sm font-semibold text-slate-900 truncate">{props.establishmentName}</div>
            </div>
          </div>
        ) : null}

        {selectedPack ? (
          <div className="flex items-start gap-3">
            <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-500">{t("booking.recap.pack")}</div>
              <div className="text-sm font-semibold text-slate-900 truncate">🎁 {selectedPack.title}</div>
              {typeof selectedPack.price === "number" ? (
                <div className="text-xs font-semibold text-primary">
                  {t("booking.price.per_person", { amount: formatCurrencyMAD(Math.round(selectedPack.price)) })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{t("booking.recap.guests")}</div>
            <div className="text-sm font-semibold text-slate-900">
              {typeof partySize === "number" ? `${partySize} ${partySize === 1 ? t("common.person.one") : t("common.person.other")}` : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{t("booking.recap.date")}</div>
            <div className="text-sm font-semibold text-slate-900">
              {selectedDate ? formatDateJjMmAa(selectedDate) : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{t("booking.recap.time")}</div>
            <div className="text-sm font-semibold text-slate-900">
              {selectedTime ? (
                <span>
                  {serviceLabel ? <span className="capitalize">{serviceLabel}</span> : null}
                  {serviceLabel ? " · " : null}
                  <span className="tabular-nums">{formatTimeHmLabel(selectedTime)}</span>
                </span>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        {promoPercent ? (
          <div className="flex items-start gap-3">
            <Percent className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-slate-500">{t("booking.recap.discount")}</div>
              <div className="text-sm font-semibold text-slate-900">-{promoPercent} %</div>
            </div>
          </div>
        ) : null}

        {modeLabel ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
            {modeLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
