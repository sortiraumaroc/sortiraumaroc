import * as React from "react";

import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Moon, Utensils } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type {
  DateTimeCompatibility,
  LegacyRestaurantHours,
  NormalizedOpeningHours,
  ServiceType,
  WeekdayKey,
} from "./openingHoursUtils";
import {
  WEEKDAYS_ORDER,
  formatTimeFr,
  getWeekdayKeyFromDate,
  isDateTimeCompatible,
  normalizeOpeningHours,
  timeToMinutes,
} from "./openingHoursUtils";

type OpeningHoursBlockProps = {
  openingHours?: Partial<Record<WeekdayKey, { type: ServiceType; from: string; to: string }[]>> | null;
  legacyHours?: LegacyRestaurantHours | null;
  className?: string;
};

const WEEKDAY_LABEL_KEYS: Record<WeekdayKey, string> = {
  monday: "weekday.monday",
  tuesday: "weekday.tuesday",
  wednesday: "weekday.wednesday",
  thursday: "weekday.thursday",
  friday: "weekday.friday",
  saturday: "weekday.saturday",
  sunday: "weekday.sunday",
};

function weekdayLabel(day: WeekdayKey, t: (k: string) => string): string {
  return t(WEEKDAY_LABEL_KEYS[day]);
}

function formatTimeLabel(time: string, locale: "fr" | "en"): string {
  return locale === "fr" ? formatTimeFr(time) : time;
}

function makeLocalDateAt(date: Date, time: string): Date {
  const [h, m] = time.split(":").map((n) => Number(n));
  const next = new Date(date);
  next.setHours(h, m, 0, 0);
  return next;
}

type IntervalWithDate = {
  start: Date;
  end: Date;
  type: ServiceType;
};

function buildIntervalsAroundNow(now: Date, openingHours: NormalizedOpeningHours): IntervalWithDate[] {
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);

  const intervals: IntervalWithDate[] = [];

  for (let i = 0; i < 9; i += 1) {
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + i);

    const weekday = getWeekdayKeyFromDate(dayDate);
    const dayIntervals = openingHours[weekday] || [];

    for (const interval of dayIntervals) {
      const startAt = makeLocalDateAt(dayDate, interval.from);
      const endAtBase = makeLocalDateAt(dayDate, interval.to);
      const endAt = endAtBase.getTime() <= startAt.getTime() ? new Date(endAtBase.getTime() + 24 * 60 * 60 * 1000) : endAtBase;

      intervals.push({ start: startAt, end: endAt, type: interval.type });
    }
  }

  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  return intervals;
}

function formatTimeCompact(time: string, locale: "fr" | "en"): string {
  const [hh, mm] = time.split(":");

  if (locale === "en") return `${hh}:${mm}`;

  if (mm === "00") return `${Number(hh)}h`;
  return `${Number(hh)}h${mm}`;
}

function formatRangeArrow(from: string, to: string, locale: "fr" | "en"): string {
  return `${formatTimeLabel(from, locale)} → ${formatTimeLabel(to, locale)}`;
}

function formatRangeCompact(from: string, to: string, locale: "fr" | "en"): string {
  return `${formatTimeCompact(from, locale)}–${formatTimeCompact(to, locale)}`;
}

function relativeDayLabel(targetDate: Date, now: Date, args: { t: (k: string) => string }): string {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(targetDate);
  b.setHours(0, 0, 0, 0);

  const diffDays = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return args.t("common.today").toLowerCase();
  if (diffDays === 1) return args.t("common.tomorrow").toLowerCase();

  const weekday = getWeekdayKeyFromDate(targetDate);
  return weekdayLabel(weekday, args.t).toLowerCase();
}

function getTodayLabel(now: Date, args: { t: (k: string) => string }): string {
  const weekday = getWeekdayKeyFromDate(now);
  return weekdayLabel(weekday, args.t);
}

type OpenStatus = "open" | "closed" | "soon";

type StatusComputation = {
  status: OpenStatus;
  currentOrNext: IntervalWithDate | null;
  nextAfterCurrent: IntervalWithDate | null;
};

function computeStatus(now: Date, openingHours: NormalizedOpeningHours, soonThresholdMinutes = 90): StatusComputation {
  const intervals = buildIntervalsAroundNow(now, openingHours);

  const current = intervals.find((i) => now.getTime() >= i.start.getTime() && now.getTime() < i.end.getTime()) || null;

  const next = intervals.find((i) => i.start.getTime() > now.getTime()) || null;
  const nextAfterCurrent = current ? intervals.find((i) => i.start.getTime() >= current.end.getTime()) || null : next;

  if (current) {
    return { status: "open", currentOrNext: current, nextAfterCurrent };
  }

  if (!next) {
    return { status: "closed", currentOrNext: null, nextAfterCurrent: null };
  }

  const minutesToNext = Math.max(0, Math.round((next.start.getTime() - now.getTime()) / (60 * 1000)));
  const status: OpenStatus = minutesToNext <= soonThresholdMinutes ? "soon" : "closed";
  return { status, currentOrNext: next, nextAfterCurrent: next };
}

function StatusBadge({ status, t }: { status: OpenStatus; t: (k: string) => string }) {
  const styles =
    status === "open"
      ? "bg-emerald-100 text-emerald-800"
      : status === "soon"
        ? "bg-orange-100 text-orange-800"
        : "bg-red-100 text-red-800";

  const label = status === "open" ? t("restaurant.hours.status.open") : status === "soon" ? t("restaurant.hours.status.soon") : t("restaurant.hours.status.closed");

  return <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", styles)}>{label}</span>;
}

function ServiceRow({
  type,
  from,
  to,
  locale,
  t,
}: {
  type: ServiceType;
  from: string;
  to: string;
  locale: "fr" | "en";
  t: (k: string) => string;
}) {
  const Icon = type === "lunch" ? Utensils : Moon;
  const label = type === "lunch" ? t("restaurant.hours.service.lunch") : t("restaurant.hours.service.dinner");

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2 text-slate-700">
        <Icon className="h-4 w-4" />
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-slate-900 font-semibold tabular-nums">{formatRangeArrow(from, to, locale)}</div>
    </div>
  );
}

function WeeklyDesktopTable({
  openingHours,
  locale,
  t,
}: {
  openingHours: NormalizedOpeningHours;
  locale: "fr" | "en";
  t: (k: string) => string;
}) {
  return (
    <div className="hidden md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-2 pr-4 font-semibold">{t("restaurant.hours.table.day")}</th>
              <th className="py-2 pr-4 font-semibold">{t("restaurant.hours.service.lunch")}</th>
              <th className="py-2 pr-0 font-semibold">{t("restaurant.hours.service.dinner")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {WEEKDAYS_ORDER.map((day) => {
              const intervals = openingHours[day] || [];
              const lunch = intervals.find((i) => i.type === "lunch");
              const dinner = intervals.find((i) => i.type === "dinner");
              const closed = !intervals.length;

              return (
                <tr key={day} className="text-slate-800">
                  <td className="py-3 pr-4 font-semibold">{weekdayLabel(day, t)}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {closed ? (
                      <span className="text-slate-500">❌ {t("restaurant.hours.closed")}</span>
                    ) : lunch ? (
                      <span>{formatRangeCompact(lunch.from, lunch.to, locale)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-0 tabular-nums">
                    {closed ? (
                      <span className="text-slate-500">❌ {t("restaurant.hours.closed")}</span>
                    ) : dinner ? (
                      <span>{formatRangeCompact(dinner.from, dinner.to, locale)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeeklyMobileCards({
  openingHours,
  locale,
  t,
}: {
  openingHours: NormalizedOpeningHours;
  locale: "fr" | "en";
  t: (k: string) => string;
}) {
  return (
    <div className="md:hidden space-y-3">
      {WEEKDAYS_ORDER.map((day) => {
        const intervals = openingHours[day] || [];
        const lunch = intervals.find((i) => i.type === "lunch");
        const dinner = intervals.find((i) => i.type === "dinner");

        return (
          <div key={day} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-semibold text-slate-900">{weekdayLabel(day, t)}</div>
            <div className="mt-3 space-y-2">
              {!intervals.length ? (
                <div className="text-slate-500">❌ {t("restaurant.hours.closed")}</div>
              ) : (
                <>
                  {lunch ? (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Utensils className="h-4 w-4" />
                        <span className="font-medium">{t("restaurant.hours.service.lunch")}</span>
                      </div>
                      <div className="font-semibold text-slate-900 tabular-nums">{formatRangeCompact(lunch.from, lunch.to, locale)}</div>
                    </div>
                  ) : null}

                  {dinner ? (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Moon className="h-4 w-4" />
                        <span className="font-medium">{t("restaurant.hours.service.dinner")}</span>
                      </div>
                      <div className="font-semibold text-slate-900 tabular-nums">{formatRangeCompact(dinner.from, dinner.to, locale)}</div>
                    </div>
                  ) : null}

                  {!lunch && !dinner ? <div className="text-slate-500">❌ {t("restaurant.hours.closed")}</div> : null}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function compatibilityHint(args: {
  compatibility: DateTimeCompatibility;
  locale: "fr" | "en";
  t: (k: string, params?: Record<string, string>) => string;
}): string | null {
  if (args.compatibility.ok === true) return null;

  if (args.compatibility.reason === "closed_day") return args.t("restaurant.hours.compatibility.closed_day");

  if (args.compatibility.reason === "opens_at") {
    return args.t("restaurant.hours.compatibility.opens_at", { time: formatTimeLabel(args.compatibility.timeHm, args.locale) });
  }

  if (args.compatibility.reason === "opens_tomorrow_at") {
    return args.t("restaurant.hours.compatibility.opens_tomorrow_at", { time: formatTimeLabel(args.compatibility.timeHm, args.locale) });
  }

  return args.t("restaurant.hours.compatibility.not_compatible");
}

export function OpeningHoursBlock({ openingHours, legacyHours, className }: OpeningHoursBlockProps) {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const { t, locale } = useI18n();

  const normalized = React.useMemo(() => normalizeOpeningHours({ openingHours, legacyHours }), [openingHours, legacyHours]);

  const { status, currentOrNext } = React.useMemo(() => computeStatus(new Date(), normalized), [normalized]);

  const todayKey = getWeekdayKeyFromDate(new Date());
  const todayIntervals = normalized[todayKey] || [];
  const todayLabel = getTodayLabel(new Date(), { t });

  const nextSlotText = React.useMemo(() => {
    if (!currentOrNext) return t("restaurant.hours.next_slot.unavailable");
    const day = relativeDayLabel(currentOrNext.start, new Date(), { t });
    return t("restaurant.hours.next_slot.label", {
      day,
      from: formatTimeLabel(currentOrNext.start.toTimeString().slice(0, 5), locale),
      to: formatTimeLabel(currentOrNext.end.toTimeString().slice(0, 5), locale),
    });
  }, [currentOrNext, locale, t]);

  const selectedDate = searchParams.get("date") || "";
  const selectedTime = searchParams.get("time") || "";

  const compatibility = React.useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    return isDateTimeCompatible(normalized, selectedDate, selectedTime);
  }, [normalized, selectedDate, selectedTime]);

  const compatibilityRow = compatibility ? (
    <div
      className={cn(
        "mt-3 rounded-lg border px-3 py-2 text-sm flex items-start gap-2",
        compatibility.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-orange-200 bg-orange-50 text-orange-800",
      )}
    >
      {compatibility.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
      <div className="min-w-0">
        <div className="font-semibold">
          {compatibility.ok ? t("restaurant.hours.compatibility.ok") : t("restaurant.hours.compatibility.not_ok")}
        </div>
        {compatibility.ok === false ? (
          <div className="text-xs opacity-90">{compatibilityHint({ compatibility, locale, t })}</div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <section className={cn("space-y-4 font-[Circular_Std,_sans-serif]", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-700" />
            <h2 className="text-xl font-semibold text-slate-900">{t("restaurant.hours.title")}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">{nextSlotText}</p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={status} t={t} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">📅 {t("restaurant.hours.today_label", { day: todayLabel })}</div>
          {todayIntervals.length ? null : <span className="text-xs font-semibold text-slate-500">❌ {t("restaurant.hours.closed")}</span>}
        </div>

        <div className="mt-4 space-y-3">
          {todayIntervals.length ? (
            todayIntervals
              .slice()
              .sort((a, b) => (a.type === b.type ? timeToMinutes(a.from) - timeToMinutes(b.from) : a.type === "lunch" ? -1 : 1))
              .map((i) => <ServiceRow key={`${i.type}-${i.from}-${i.to}`} type={i.type} from={i.from} to={i.to} locale={locale} t={t} />)
          ) : (
            <div className="text-slate-600 font-medium">❌ {t("restaurant.hours.closed_today")}</div>
          )}
        </div>

        {compatibilityRow}
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="week" className="border-none">
          <AccordionTrigger
            className={cn(
              "w-full justify-between rounded-xl border border-slate-200 bg-white px-4 py-3",
              "text-slate-700 hover:no-underline hover:bg-slate-50",
              "data-[state=open]:rounded-b-none",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span>{t("restaurant.hours.week_toggle")}</span>
            </div>
          </AccordionTrigger>

          <AccordionContent className="border border-t-0 border-slate-200 rounded-b-xl bg-white px-4 py-4">
            {isMobile ? <WeeklyMobileCards openingHours={normalized} locale={locale} t={t} /> : <WeeklyDesktopTable openingHours={normalized} locale={locale} t={t} />}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
