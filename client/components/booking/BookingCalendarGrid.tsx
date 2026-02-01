import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDayLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type BookingCalendarGridProps = {
  selected?: Date;
  onSelect: (date: Date) => void;
  isDateDisabled?: (date: Date) => boolean;
  promoByDate?: Map<string, number>;
  className?: string;
};

export function BookingCalendarGrid({
  selected,
  onSelect,
  isDateDisabled,
  promoByDate,
  className,
}: BookingCalendarGridProps) {
  const { t, dateFnsLocale, intlLocale } = useI18n();
  const selectedDay = selected ? startOfDayLocal(selected) : undefined;

  const [month, setMonth] = React.useState<Date>(() => startOfMonth(selectedDay ?? new Date()));

  React.useEffect(() => {
    if (!selectedDay) return;
    const nextMonth = startOfMonth(selectedDay);
    if (nextMonth.getTime() !== month.getTime()) setMonth(nextMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay?.getTime()]);

  const monthLabel = React.useMemo(() => {
    return capitalizeFirst(format(month, "MMMM yyyy", { locale: dateFnsLocale }));
  }, [dateFnsLocale, month]);

  const grid = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

    const days: Date[] = [];
    let cursor = start;
    while (cursor.getTime() <= end.getTime()) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }

    return days;
  }, [month]);

  const onPrevMonth = () => setMonth((m) => startOfMonth(addDays(m, -1)));
  const onNextMonth = () => setMonth((m) => startOfMonth(addDays(endOfMonth(m), 1)));

  const weekHeader = React.useMemo(() => {
    // Monday-based calendar grid (consistent with the booking flow)
    const start = startOfWeek(new Date(2021, 7, 2), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEE", { locale: dateFnsLocale }));
  }, [dateFnsLocale]);

  return (
    <div className={cn("w-full max-w-md mx-auto p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          className="h-9 w-9 rounded-lg border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center"
          onClick={onPrevMonth}
          aria-label={t("booking.calendar.prev_month")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="font-bold text-lg text-slate-900 tracking-tight">{monthLabel}</h2>
        <button
          type="button"
          className="h-9 w-9 rounded-lg border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center"
          onClick={onNextMonth}
          aria-label={t("booking.calendar.next_month")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-gray-500">
        {weekHeader.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2 mt-2">
        {grid.map((date) => {
          const day = startOfDayLocal(date);
          const isOutsideMonth = day.getMonth() !== month.getMonth();
          const disabled = isOutsideMonth || Boolean(isDateDisabled?.(day));

          const ymd = toYmd(day);
          const promo = promoByDate?.get(ymd) ?? null;

          const isSelected = Boolean(selectedDay && selectedDay.getTime() === day.getTime());

          if (isOutsideMonth) {
            return <div key={ymd} className="aspect-square" aria-hidden="true" />;
          }

          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              aria-label={day.toLocaleDateString(intlLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              aria-pressed={isSelected}
              onClick={() => {
                if (disabled) return;
                onSelect(day);
              }}
              className={cn(
                "aspect-square rounded-xl border text-sm transition-colors",
                "min-h-[44px] min-w-[44px] sm:min-h-[52px] sm:min-w-[52px]",
                "flex flex-col items-center justify-start pt-2 pb-1 gap-1",
                "enabled:hover:border-[#A3001D]",
                "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
                disabled
                  ? "bg-[#D1D5DB] text-slate-500 border-slate-200 cursor-not-allowed"
                  : isSelected
                    ? "bg-[#A3001D] text-white border-[#A3001D] shadow-sm"
                    : "bg-white text-slate-900 border-slate-200",
              )}
            >
              <span className={cn("text-sm font-semibold leading-none", disabled ? "text-slate-500" : isSelected ? "text-white" : "text-slate-900")}>
                {day.getDate()}
              </span>
              {promo && !disabled ? (
                <span className="text-[10px] leading-none bg-black text-white px-2 py-0.5 rounded-md whitespace-nowrap">-{promo} %</span>
              ) : (
                <span className="h-[18px]" aria-hidden="true" />
              )}
              <span className="flex-1" aria-hidden="true" />
            </button>
          );
        })}
      </div>

    </div>
  );
}
