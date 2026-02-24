import { Calendar, Clock, Gift, MapPin, Users } from "lucide-react";

import { useBooking } from "@/hooks/useBooking";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { formatDateJjMmAa, formatTimeHmLabel } from "@shared/datetime";

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

        {modeLabel ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
            {modeLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
