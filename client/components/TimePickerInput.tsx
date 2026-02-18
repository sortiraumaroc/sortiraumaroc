import * as React from "react";
import { Clock } from "lucide-react";

import { AdaptivePicker } from "@/components/AdaptivePicker";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface TimePickerInputProps {
  value: string;
  onChange: (time: string) => void;
  className?: string;
  onMobileClick?: () => void;
  mode?: "picker" | "text";
  availableTimes?: string[];
  /** Force popover mode even on mobile (useful inside Dialogs) */
  forcePopover?: boolean;
  /** Called when the picker opens or closes */
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state */
  open?: boolean;
}

const TIME_SLOTS_30 = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

function parseTimeValue(value: string): { hour: string; minute: string } | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return undefined;
  return { hour: match[1], minute: match[2] };
}

function formatAsHhMmInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  const hh = digits.slice(0, 2);
  const mm = digits.slice(2, 4);

  if (!hh) return "";
  if (!mm) return hh;
  return `${hh}:${mm}`;
}

function isMinuteAllowedFor30MinSlots(minute: string) {
  return minute === "00" || minute === "30";
}

export function TimePickerInput({
  value,
  onChange,
  className,
  onMobileClick,
  mode = "picker",
  availableTimes,
  forcePopover,
  onOpenChange,
  open,
}: TimePickerInputProps) {
  const { t } = useI18n();
  const placeholderText = t("common.time_placeholder");
  const isMobile = useIsMobile();
  const parsed = value ? parseTimeValue(value) : undefined;
  const displayTime = parsed ? `${parsed.hour}:${parsed.minute}` : "";
  const isEmpty = !parsed;
  const inputId = React.useId();

  const effectiveSlots = React.useMemo(() => {
    const list = availableTimes && availableTimes.length ? availableTimes : TIME_SLOTS_30;
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [availableTimes]);

  const allowedSet = React.useMemo(() => {
    return availableTimes && availableTimes.length ? new Set(availableTimes) : null;
  }, [availableTimes]);

  const triggerClassName = cn(
    "w-full flex items-center justify-start ps-10 pe-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md",
    "text-sm bg-slate-100 hover:bg-slate-100 text-start transition-colors hover:border-slate-300",
    "focus-visible:border-primary/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  );

  const [inputValue, setInputValue] = React.useState(() => displayTime);
  const isEditingRef = React.useRef(false);

  React.useEffect(() => {
    if (isEditingRef.current) return;
    setInputValue(displayTime);
  }, [displayTime]);

  const trigger = (
    <button type="button" className={triggerClassName} style={{ fontFamily: "Circular Std, sans-serif" }}>
      <span className={cn("text-sm font-normal", isEmpty ? "italic text-slate-600" : "not-italic text-slate-900")}>
        {displayTime || placeholderText}
      </span>
    </button>
  );

  if (mode === "text") {
    return (
      <div className={cn("relative w-full group", className)}>
        <Clock className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholderText}
          list={inputId}
          className={cn(
            triggerClassName,
            "text-slate-900 placeholder:text-slate-600 placeholder:font-normal",
            inputValue.trim() ? "not-italic" : "italic",
          )}
          style={{ fontFamily: "Circular Std, sans-serif" }}
          value={inputValue}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(e) => {
            const next = formatAsHhMmInput(e.target.value);
            setInputValue(next);

            if (next.trim() === "") {
              onChange("");
              return;
            }

            if (next.length !== 5) return;

            const parsedInput = parseTimeValue(next);
            if (!parsedInput) return;

            const normalized = `${parsedInput.hour}:${parsedInput.minute}`;
            if (allowedSet) {
              if (!allowedSet.has(normalized)) return;
            } else {
              if (!isMinuteAllowedFor30MinSlots(parsedInput.minute)) return;
            }

            onChange(normalized);
          }}
          onBlur={() => {
            isEditingRef.current = false;

            if (inputValue.trim() === "") return;

            const parsedInput = parseTimeValue(inputValue);
            if (!parsedInput) {
              setInputValue(displayTime);
              return;
            }

            const normalized = `${parsedInput.hour}:${parsedInput.minute}`;
            if (allowedSet) {
              if (!allowedSet.has(normalized)) setInputValue(displayTime);
            } else {
              if (!isMinuteAllowedFor30MinSlots(parsedInput.minute)) setInputValue(displayTime);
            }
          }}
        />
        <datalist id={inputId}>
          {effectiveSlots.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    );
  }

  if (isMobile && onMobileClick) {
    return (
      <div className={cn("relative w-full group", className)}>
        <Clock className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />
        <button
          type="button"
          className={triggerClassName}
          style={{ fontFamily: "Circular Std, sans-serif" }}
          onClick={onMobileClick}
        >
          <span className={cn("text-sm font-normal", isEmpty ? "italic text-slate-600" : "not-italic text-slate-900")}>
            {displayTime || placeholderText}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full group", className)}>
      <Clock className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />

      <AdaptivePicker
        type="time"
        title={t("timepicker.title")}
        trigger={trigger}
        value={parsed ? `${parsed.hour}:${parsed.minute}` : null}
        availableTimes={effectiveSlots}
        onChange={(t) => onChange(t)}
        onClear={() => onChange("")}
        clearLabel={t("common.clear")}
        forcePopover={forcePopover}
        onOpenChange={onOpenChange}
        open={open}
      />
    </div>
  );
}
