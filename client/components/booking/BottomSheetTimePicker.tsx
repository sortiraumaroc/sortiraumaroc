import * as React from "react";

import { cn } from "@/lib/utils";

export type TimeSlot = {
  value: string;
  label?: string;
  disabled?: boolean;
};

export type BottomSheetTimePickerProps = {
  value: string | null;
  onChange: (time: string) => void;
  slots: TimeSlot[];
  columns?: 2 | 3 | 4;
  className?: string;
};

function gridColsClass(columns: 2 | 3 | 4) {
  switch (columns) {
    case 2:
      return "grid-cols-2";
    case 4:
      return "grid-cols-4";
    default:
      return "grid-cols-3";
  }
}

export function BottomSheetTimePicker({ value, onChange, slots, columns = 3, className }: BottomSheetTimePickerProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className={cn("grid gap-3", gridColsClass(columns))}>
        {slots.map((slot) => {
          const selected = value === slot.value;
          return (
            <button
              key={slot.value}
              type="button"
              disabled={slot.disabled}
              onClick={() => onChange(slot.value)}
              className={cn(
                "h-11 rounded-full border text-sm font-semibold transition-colors tabular-nums",
                slot.disabled
                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                  : selected
                    ? "border-[#a3001d] bg-[#a3001d]/10 text-[#a3001d] border"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
              )}
              aria-label={`Choisir ${slot.label ?? slot.value}`}
              aria-pressed={selected}
            >
              {slot.label ?? slot.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
