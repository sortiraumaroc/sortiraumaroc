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
  minDate?: Date;
}) {
  return (
    <SamCalendar
      value={value}
      onChange={onSelect}
      availableDates={availableDates}
      disabledDates={disabledDates}
      minDate={minDate}
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
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  const setOpenSafe = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      props.onOpenChange?.(next);
    },
    [props],
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
              "rounded-t-3xl border border-slate-200 bg-white w-full max-h-[50dvh] h-auto overflow-hidden",
              props.contentClassName,
            )}
            aria-label={title}
          >
            <PickerHeader
              title={title}
              onClose={() => setOpenSafe(false)}
              onClear={props.onClear}
              clearLabel={props.clearLabel}
              className="pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-2 pb-2"
            />
            <div className="border-b border-slate-200" />

            <div className="pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] py-3 overflow-y-auto max-h-[calc(50dvh-88px)] pb-[max(12px,env(safe-area-inset-bottom))]">
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

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={16}
          avoidCollisions={true}
          collisionPadding={16}
          className={cn(
            "z-50 w-[min(420px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white shadow-xl outline-none",
            "max-h-[420px] overflow-hidden",
            props.contentClassName,
          )}
          onEscapeKeyDown={() => setOpenSafe(false)}
          onPointerDownOutside={() => setOpenSafe(false)}
          onInteractOutside={() => setOpenSafe(false)}
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

          <div className="p-4 overflow-auto max-h-[calc(420px-76px)]">
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
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
