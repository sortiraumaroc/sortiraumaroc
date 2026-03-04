import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SamCalendarProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  availableDates?: Date[];
  disabledDates?: (date: Date) => boolean;
  className?: string;
  month?: Date;
  onMonthChange?: (month: Date) => void;
};

function toLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function SamCalendar({ value, onChange, minDate, availableDates, disabledDates, className, month, onMonthChange }: SamCalendarProps) {
  const { dateFnsLocale } = useI18n();

  const min = React.useMemo(() => (minDate ? toLocalDay(minDate) : null), [minDate]);

  const availableSet = React.useMemo(() => {
    if (!availableDates?.length) return null;
    return new Set(availableDates.map((d) => ymd(toLocalDay(d))));
  }, [availableDates]);

  return (
    <div className={cn("sam-calendar w-full", className)}>
      <Calendar
        mode="single"
        selected={value ? toLocalDay(value) : undefined}
        onSelect={(next) => {
          if (!next) return;
          onChange(toLocalDay(next));
        }}
        month={month}
        onMonthChange={onMonthChange}
        weekStartsOn={1}
        locale={dateFnsLocale}
        disabled={(date) => {
          const day = toLocalDay(date);
          if (min && day.getTime() < min.getTime()) return true;
          if (availableSet && !availableSet.has(ymd(day))) return true;
          return disabledDates ? disabledDates(day) : false;
        }}
      />
    </div>
  );
}
