import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SamCalendar } from "@/components/SamCalendar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type TimeSlot = {
  value: string;
  label?: string;
  disabled?: boolean;
  badge?: string;
};

type CommonProps = {
  title?: string;
  trigger: React.ReactElement;
  className?: string;
  contentClassName?: string;
  overlayClassName?: string;
  onOpenChange?: (open: boolean) => void;
  onClear?: () => void;
  clearLabel?: string;
  /** Force popover mode even on mobile (useful when nested inside a Dialog) */
  forcePopover?: boolean;
  /** Controlled open state — when provided, the parent controls open/close */
  open?: boolean;
};

export type AdaptivePickerDateProps = CommonProps & {
  type: "date";
  value: Date | null;
  onChange: (date: Date) => void;
  availableDates?: Date[];
  disabledDates?: (date: Date) => boolean;
  minDate?: Date;
};

export type AdaptivePickerTimeProps = CommonProps & {
  type: "time";
  value: string | null;
  onChange: (time: string) => void;
  availableTimes?: Array<string | TimeSlot>;
  disabledTimes?: string[] | ((time: string) => boolean);
};

export type AdaptivePickerProps = AdaptivePickerDateProps | AdaptivePickerTimeProps;

function composeEventHandlers<E>(theirHandler: ((event: E) => void) | undefined, ourHandler: (event: E) => void) {
  return (event: E) => {
    theirHandler?.(event);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEvent = event as any;
    if (anyEvent?.defaultPrevented) return;
    ourHandler(event);
  };
}


function normalizeTimeSlots(
  input: AdaptivePickerTimeProps["availableTimes"],
  disabledTimes: AdaptivePickerTimeProps["disabledTimes"],
): TimeSlot[] {
  const base: TimeSlot[] = (input && input.length
    ? input
    : Array.from({ length: 24 * 2 }, (_, i) => {
        const h = String(Math.floor(i / 2)).padStart(2, "0");
        const m = i % 2 === 0 ? "00" : "30";
        return `${h}:${m}`;
      })
  ).map((t) => (typeof t === "string" ? { value: t } : t));

  const disabledList = Array.isArray(disabledTimes) ? new Set(disabledTimes) : null;
  const disabledFn = typeof disabledTimes === "function" ? disabledTimes : null;

  return base.map((slot) => {
    const disabled = Boolean(slot.disabled || (disabledList ? disabledList.has(slot.value) : false) || (disabledFn ? disabledFn(slot.value) : false));
    return { ...slot, disabled };
  });
}

function DatePickerContent({
  value,
  onSelect,
  availableDates,
  disabledDates,
  minDate,
}: {
  value: Date | null;
  onSelect: (date: Date) => void;
  availableDates?: Date[];
  disabledDates?: (date: Date) => boolean;
  minDate?: Date | null;
}) {
  const [month, setMonth] = React.useState<Date>(
    () => value ?? minDate ?? new Date()
  );

  return (
    <SamCalendar
      value={value}
      onChange={onSelect}
      availableDates={availableDates}
      disabledDates={disabledDates}
      minDate={minDate ?? undefined}
      month={month}
      onMonthChange={setMonth}
    />
  );
}

function TimePickerContent({
  value,
  onSelect,
  slots,
}: {
  value: string | null;
  onSelect: (time: string) => void;
  slots: TimeSlot[];
}) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-3">
        {slots.map((slot) => {
          const selected = value === slot.value;
          return (
            <button
              key={slot.value}
              type="button"
              disabled={slot.disabled}
              onClick={() => onSelect(slot.value)}
              className={cn(
                "h-11 rounded-full border px-3 text-sm font-semibold transition-colors tabular-nums flex items-center justify-center gap-2",
                slot.disabled
                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                  : selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
              )}
              aria-label={`Choisir ${slot.label ?? slot.value}`}
              aria-pressed={selected}
            >
              <span className="tabular-nums">{slot.label ?? slot.value}</span>
              {slot.badge ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{slot.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Wrapper that stops wheel/touchmove events from propagating to document-level
 * listeners (e.g. react-remove-scroll used by Radix Dialog).
 * When the Popover is rendered in a Portal outside the Dialog DOM tree,
 * react-remove-scroll sees wheel events as "outside" and calls preventDefault().
 * By stopping propagation on the Popover content, we prevent this interception.
 */
function ScrollIsolator({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stopWheel = (e: WheelEvent) => {
      // Only stop propagation if this element or a child can scroll
      const target = e.target as HTMLElement;
      const scrollable = target.closest("[data-scroll-isolate]") as HTMLElement | null;
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        e.stopPropagation();
      }
    };

    const stopTouch = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const scrollable = target.closest("[data-scroll-isolate]") as HTMLElement | null;
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        e.stopPropagation();
      }
    };

    // Use bubble phase — the document listener from react-remove-scroll is also in bubble phase
    el.addEventListener("wheel", stopWheel, { passive: true });
    el.addEventListener("touchmove", stopTouch, { passive: true });

    return () => {
      el.removeEventListener("wheel", stopWheel);
      el.removeEventListener("touchmove", stopTouch);
    };
  }, []);

  return (
    <div ref={ref} data-scroll-isolate className={className}>
      {children}
    </div>
  );
}

function PickerHeader({
  title,
  onClose,
  onClear,
  clearLabel,
  compact,
  className,
}: {
  title: string;
  onClose: () => void;
  onClear?: () => void;
  clearLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", compact ? "px-3 py-2" : "px-4 pt-2 pb-3", className)}> 
      <button
        type="button"
        onClick={onClose}
        className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label="Fermer"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex-1 text-center px-2">
        <div className={cn("font-bold text-slate-900", compact ? "text-sm" : "text-base")}>{title}</div>
      </div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="h-10 px-2 inline-flex items-center justify-center text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          {clearLabel ?? "Effacer"}
        </button>
      ) : (
        <div className="h-10 w-10" aria-hidden="true" />
      )}
    </div>
  );
}

export function AdaptivePicker(props: AdaptivePickerProps) {
  const rawIsMobile = useIsMobile();
  const isMobile = rawIsMobile && !props.forcePopover;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = props.open !== undefined;
  const open = isControlled ? props.open! : internalOpen;

  const setOpenSafe = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      props.onOpenChange?.(next);
    },
    [isControlled, props],
  );

  const trigger = React.useMemo(() => {
    const baseProps = {
      "aria-haspopup": isMobile ? "dialog" : "dialog",
      "aria-expanded": open,
    };

    if (isMobile) {
      return React.cloneElement(props.trigger, {
        ...baseProps,
        onClick: composeEventHandlers(props.trigger.props.onClick, () => setOpenSafe(true)),
      });
    }

    return React.cloneElement(props.trigger, baseProps);
  }, [isMobile, open, props.trigger, setOpenSafe]);

  const title = props.title ?? (props.type === "date" ? "Choisir une date" : "Choisir une heure");

  if (isMobile) {
    return (
      <div className={props.className}>
        {trigger}
        <Drawer open={open} onOpenChange={setOpenSafe} dismissible shouldScaleBackground>
          <DrawerContent
            className={cn(
              "rounded-t-3xl border border-slate-200 bg-white w-full max-h-[70dvh] h-auto overflow-hidden",
              props.contentClassName,
            )}
            aria-label={title}
          >
            <PickerHeader
              title={title}
              onClose={() => setOpenSafe(false)}
              onClear={props.onClear}
              clearLabel={props.clearLabel}
              className="ps-[max(12px,env(safe-area-inset-left))] pe-[max(12px,env(safe-area-inset-right))] pt-2 pb-2"
            />
            <div className="border-b border-slate-200" />

            <div data-vaul-no-drag className="ps-[max(12px,env(safe-area-inset-left))] pe-[max(12px,env(safe-area-inset-right))] py-3 overflow-y-auto max-h-[calc(70dvh-88px)] pb-[max(12px,env(safe-area-inset-bottom))]">
              {props.type === "date" ? (
                <DatePickerContent
                  value={props.value}
                  onSelect={(d) => {
                    props.onChange(d);
                    setOpenSafe(false);
                  }}
                  availableDates={props.availableDates}
                  disabledDates={props.disabledDates}
                  minDate={props.minDate}
                />
              ) : (
                <TimePickerContent
                  value={props.value}
                  slots={normalizeTimeSlots(props.availableTimes, props.disabledTimes)}
                  onSelect={(t) => {
                    props.onChange(t);
                    setOpenSafe(false);
                  }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpenSafe}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>

      {open ? (
        <PopoverPrimitive.Portal>
          <div
            className={cn("fixed inset-0 z-40 bg-black/20", props.overlayClassName)}
            onClick={() => setOpenSafe(false)}
            aria-hidden="true"
          />
        </PopoverPrimitive.Portal>
      ) : null}

      {open ? <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={16}
          avoidCollisions={true}
          collisionPadding={16}
          className={cn(
            "z-50 w-[min(420px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white shadow-xl outline-none",
            "max-h-[420px] flex flex-col",
            props.contentClassName,
          )}
          onEscapeKeyDown={() => setOpenSafe(false)}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <PopoverPrimitive.Arrow width={18} height={10} className="fill-white stroke-slate-200" />

          <PickerHeader
            title={title}
            onClose={() => setOpenSafe(false)}
            onClear={props.onClear}
            clearLabel={props.clearLabel}
            compact
          />
          <div className="border-b border-slate-200" />

          <ScrollIsolator className="p-4 overflow-y-auto overscroll-contain max-h-[calc(420px-76px)] flex-1 min-h-0">
            {props.type === "date" ? (
              <DatePickerContent
                value={props.value}
                onSelect={(d) => {
                  props.onChange(d);
                  setOpenSafe(false);
                }}
                availableDates={props.availableDates}
                disabledDates={props.disabledDates}
                minDate={props.minDate}
              />
            ) : (
              <TimePickerContent
                value={props.value}
                slots={normalizeTimeSlots(props.availableTimes, props.disabledTimes)}
                onSelect={(t) => {
                  props.onChange(t);
                  setOpenSafe(false);
                }}
              />
            )}
          </ScrollIsolator>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal> : null}
    </PopoverPrimitive.Root>
  );
}
