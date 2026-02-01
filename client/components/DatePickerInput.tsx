import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { AdaptivePicker } from "@/components/AdaptivePicker";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface DatePickerInputProps {
  value: string;
  onChange: (date: string) => void;
  className?: string;
  onMobileClick?: () => void;
  mode?: "picker" | "text";
  minDate?: Date;
  maxDate?: Date;
}

function toLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseYmdToLocalDate(value: string): Date | undefined {
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatLocalDateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date: Date, intlLocale: string): string {
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function parseDisplayDdMmYyyyToLocalDate(value: string): Date | undefined {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return undefined;
  if (year < 1900 || year > 3000) return undefined;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;

  return date;
}

function formatAsDdMmYyyyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);

  if (!m) return d;
  if (!y) return `${d}/${m}`;
  return `${d}/${m}/${y}`;
}

export function DatePickerInput({
  value,
  onChange,
  className,
  onMobileClick,
  mode = "picker",
  minDate,
  maxDate,
}: DatePickerInputProps) {
  const isMobile = useIsMobile();
  const { intlLocale, t } = useI18n();

  const selectedDate = value ? parseYmdToLocalDate(value) : undefined;

  const displayDate = selectedDate ? formatDisplayDate(selectedDate, intlLocale) : t("booking.calendar.placeholder");
  const isEmpty = !selectedDate;

  const min = React.useMemo(() => (minDate ? toLocalDay(minDate) : null), [minDate]);
  const max = React.useMemo(() => (maxDate ? toLocalDay(maxDate) : null), [maxDate]);

  const [inputValue, setInputValue] = React.useState(() => (selectedDate ? formatDisplayDate(selectedDate, intlLocale) : ""));
  const isEditingRef = React.useRef(false);

  React.useEffect(() => {
    if (isEditingRef.current) return;
    setInputValue(selectedDate ? formatDisplayDate(selectedDate, intlLocale) : "");
  }, [intlLocale, selectedDate?.getFullYear(), selectedDate?.getMonth(), selectedDate?.getDate()]);

  const triggerClassName = cn(
    "w-full flex items-center justify-start pl-10 pr-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md",
    "text-sm bg-slate-100 hover:bg-slate-100 text-left transition-colors hover:border-slate-300",
    "focus-visible:border-primary/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  );

  const trigger = (
    <button type="button" className={triggerClassName}>
      <span className={cn("text-sm font-normal", isEmpty ? "italic text-slate-600" : "not-italic text-slate-900")}>{displayDate}</span>
    </button>
  );

  if (mode === "text") {
    return (
      <div className={cn("relative w-full group", className)}>
        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("booking.calendar.placeholder")}
          className={cn(
            triggerClassName,
            "text-slate-900 placeholder:text-slate-600 placeholder:font-normal",
            inputValue.trim() ? "not-italic" : "italic",
          )}
          value={inputValue}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(e) => {
            const next = formatAsDdMmYyyyInput(e.target.value);
            setInputValue(next);

            if (next.trim() === "") {
              onChange("");
              return;
            }

            if (next.length !== 10) return;

            const parsed = parseDisplayDdMmYyyyToLocalDate(next);
            if (!parsed) return;

            const day = toLocalDay(parsed);
            if (min && day.getTime() < min.getTime()) return;
            if (max && day.getTime() > max.getTime()) return;

            onChange(formatLocalDateToYmd(day));
          }}
          onBlur={() => {
            isEditingRef.current = false;

            if (inputValue.trim() === "") return;

            const parsed = parseDisplayDdMmYyyyToLocalDate(inputValue);
            if (!parsed) {
              setInputValue(selectedDate ? formatDisplayDate(selectedDate, intlLocale) : "");
              return;
            }

            const day = toLocalDay(parsed);
            if ((min && day.getTime() < min.getTime()) || (max && day.getTime() > max.getTime())) {
              setInputValue(selectedDate ? formatDisplayDate(selectedDate, intlLocale) : "");
            }
          }}
        />
      </div>
    );
  }

  if (isMobile && onMobileClick) {
    return (
      <div className={cn("relative w-full group", className)}>
        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />
        <button
          type="button"
          className={triggerClassName}
          onClick={onMobileClick}
        >
          <span className={cn("text-sm font-normal", isEmpty ? "italic text-slate-600" : "not-italic text-slate-900")}>
            {displayDate}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full group", className)}>
      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />

      <AdaptivePicker
        type="date"
        title={t("booking.calendar.choose_date")}
        trigger={trigger}
        value={selectedDate ?? null}
        onChange={(d) => onChange(formatLocalDateToYmd(d))}
        minDate={min}
        onClear={() => onChange("")}
        clearLabel={t("common.clear")}
      />
    </div>
  );
}
