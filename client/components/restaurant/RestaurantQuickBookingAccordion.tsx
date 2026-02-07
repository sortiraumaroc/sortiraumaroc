import * as React from "react";

import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { isAuthed } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { DatePickerInput } from "@/components/DatePickerInput";
import { TimePickerInput } from "@/components/TimePickerInput";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DateTimeCompatibility, LegacyRestaurantHours } from "./openingHoursUtils";
import { formatTimeFr, isDateTimeCompatible, normalizeOpeningHours } from "./openingHoursUtils";

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function buildBookingUrl(params: { establishmentId: string; date?: string; time?: string; people?: string }) {
  const qs = new URLSearchParams();
  if (params.date) qs.set("date", params.date);
  if (params.time) qs.set("time", params.time);
  if (params.people) qs.set("people", params.people);

  const base = `/booking/${encodeURIComponent(params.establishmentId)}`;
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

function PeoplePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useI18n();
  const unit = value === 1 ? t("common.person.one") : t("common.person.other");

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "w-full h-10 md:h-11 px-3 bg-slate-100 border border-slate-200 rounded-md flex items-center justify-between",
          "focus-within:ring-2 focus-within:ring-primary",
        )}
      >
        <div className="text-sm italic text-gray-700">{value} {unit}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onChange(value - 1)}
            disabled={value <= 1}
            aria-label={t("booking.people.remove_one")}
          >
            −
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onChange(value + 1)}
            disabled={value >= 20}
            aria-label={t("booking.people.add_one")}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function RestaurantQuickBookingAccordion(props: {
  establishmentId: string;
  legacyHours?: LegacyRestaurantHours | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [authOpen, setAuthOpen] = React.useState(false);
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);

  const dateParam = searchParams.get("date") || "";
  const timeParam = searchParams.get("time") || "";
  const peopleParam = searchParams.get("people") || "";

  const [date, setDate] = React.useState<string>(dateParam);
  const [time, setTime] = React.useState<string>(timeParam);
  const [people, setPeople] = React.useState<number>(() => {
    const n = Number(peopleParam);
    return Number.isFinite(n) && n > 0 ? clampInt(n, 1, 20) : 2;
  });

  React.useEffect(() => {
    if (dateParam !== date) setDate(dateParam);
    if (timeParam !== time) setTime(timeParam);

    const n = Number(peopleParam);
    const next = Number.isFinite(n) && n > 0 ? clampInt(n, 1, 20) : 2;
    if (next !== people) setPeople(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, timeParam, peopleParam]);

  const updateUrlParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);

    if (value && value.trim()) {
      next.set(key, value.trim());
    } else {
      next.delete(key);
    }

    setSearchParams(next, { replace: true });
  };

  const normalizedHours = React.useMemo(() => {
    if (!props.legacyHours) return null;
    return normalizeOpeningHours({ legacyHours: props.legacyHours });
  }, [props.legacyHours]);

  const compatibility = React.useMemo(() => {
    if (!normalizedHours) return null;
    if (!date || !time) return null;
    return isDateTimeCompatible(normalizedHours, date, time);
  }, [date, normalizedHours, time]);

  const hintText = React.useMemo(() => {
    const value: DateTimeCompatibility | null = compatibility;
    if (!value || value.ok === true) return null;

    if (value.reason === "closed_day") return t("restaurant.hours.compatibility.closed_day");

    if (value.reason === "opens_at") {
      const timeLabel = locale === "fr" ? formatTimeFr(value.timeHm) : value.timeHm;
      return t("restaurant.hours.compatibility.opens_at", { time: timeLabel });
    }

    if (value.reason === "opens_tomorrow_at") {
      const timeLabel = locale === "fr" ? formatTimeFr(value.timeHm) : value.timeHm;
      return t("restaurant.hours.compatibility.opens_tomorrow_at", { time: timeLabel });
    }

    return t("restaurant.hours.compatibility.not_compatible");
  }, [compatibility, locale, t]);

  const startBooking = (url: string) => {
    if (!isAuthed()) {
      setPendingUrl(url);
      setAuthOpen(true);
      return;
    }

    navigate(url);
  };

  const canReserve = Boolean(date) && Boolean(time) && people > 0;

  const reserveQuick = () => {
    startBooking(
      buildBookingUrl({
        establishmentId: props.establishmentId,
        date: date || undefined,
        time: time || undefined,
        people: people ? String(people) : undefined,
      }),
    );
  };

  const onAuthSuccess = () => {
    setAuthOpen(false);
    if (!pendingUrl) return;
    navigate(pendingUrl);
    setPendingUrl(null);
  };

  return (
    <div className={cn("w-full font-[Circular_Std,_sans-serif]", props.className)}>
      <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="brand"
            className={cn(
              "w-full rounded-xl",
              "h-11 md:h-12 text-base md:text-sm font-semibold",
              "flex items-center justify-between gap-3",
            )}
          >
            <span>{t("results.action.book")}</span>
            {props.open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div
            id="reservation-rapide"
            className="mt-3 scroll-mt-44 rounded-2xl border border-[#a3001d]/15 bg-[#a3001d]/[0.04] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{t("restaurant.quick_booking.title")}</div>
                <div className="mt-1 text-sm text-slate-700">{t("restaurant.quick_booking.subtitle")}</div>
              </div>
              <span className="shrink-0 inline-flex items-center rounded-full bg-white/70 border border-[#a3001d]/20 px-3 py-1 text-xs font-semibold text-[#a3001d]">
                {t("restaurant.quick_booking.duration")}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <DatePickerInput
                value={date}
                onChange={(next) => {
                  setDate(next);
                  updateUrlParam("date", next);
                }}
              />
              <TimePickerInput
                value={time}
                onChange={(next) => {
                  setTime(next);
                  updateUrlParam("time", next);
                }}
              />
              <PeoplePicker
                value={people}
                onChange={(next) => {
                  const v = clampInt(next, 1, 20);
                  setPeople(v);
                  updateUrlParam("people", String(v));
                }}
              />
            </div>

            <Button
              type="button"
              variant="brand"
              className="mt-4 w-full rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={reserveQuick}
              disabled={!canReserve}
            >
              {canReserve ? t("restaurant.quick_booking.cta.book_slot") : t("restaurant.quick_booking.cta.choose_slot")}
            </Button>

            {compatibility?.ok === false ? (
              <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                <div className="font-semibold">{t("restaurant.quick_booking.closed_warning")}</div>
                {hintText ? <div className="mt-0.5 text-xs opacity-90">{hintText}</div> : null}
              </div>
            ) : null}

            <div className="mt-2 text-xs text-slate-600">{t("restaurant.quick_booking.advice")}</div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AuthModalV2
        isOpen={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingUrl(null);
        }}
        onAuthed={onAuthSuccess}
      />
    </div>
  );
}
