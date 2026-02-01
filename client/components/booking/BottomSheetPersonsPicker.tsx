import * as React from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type BottomSheetPersonsPickerProps = {
  value: number | null;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function BottomSheetPersonsPicker({ value, onChange, min = 1, max = 50, className }: BottomSheetPersonsPickerProps) {
  const { t } = useI18n();
  const [customValue, setCustomValue] = React.useState<string>(value && value > 10 ? String(value) : "");

  React.useEffect(() => {
    setCustomValue(value && value > 10 ? String(value) : "");
  }, [value]);

  return (
    <div className={cn("space-y-5", className)}>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "h-11 rounded-full border text-sm font-semibold transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
              )}
              aria-label={`${n} ${n === 1 ? t("common.person.one") : t("common.person.other")}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">{t("booking.people.other_number")}</div>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={customValue}
            onChange={(e) => {
              const raw = e.target.value;
              setCustomValue(raw);
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) return;
              onChange(clamp(parsed, min, max));
            }}
            className="h-11 w-full rounded-xl border border-slate-200 px-4 text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t("booking.step1.section.people")}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500">{t("booking.people.range", { min, max })}</div>
      </div>
    </div>
  );
}
