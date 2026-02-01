import * as React from "react";

import { useSearchParams } from "react-router-dom";

import { ProgressiveBookingModule } from "@/components/booking/ProgressiveBookingModule";
import { StickyBottomBookingActionBar, type DateSlots } from "@/components/booking/StickyBottomBookingActionBar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBookingBarsVisibility } from "@/hooks/useBookingBarsVisibility";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type BookingUniverse =
  | "restaurants"
  | "restaurant"
  | "loisirs"
  | "activities"
  | "activity"
  | "sport"
  | "sports"
  | "wellness"
  | "bien-etre"
  | "culture"
  | "visite"
  | "hotels"
  | "hotel"
  | string;

type BookingStep = "date" | "time" | "people";

function getReservationTitleKey(universe?: BookingUniverse): string {
  const u = (universe ?? "").toLowerCase();
  if (u === "restaurants" || u === "restaurant") return "booking.card.title.restaurant";
  if (u === "hotels" || u === "hotel") return "booking.card.title.hotel";
  // Requirement: all other universes use “Réserver un créneau” (including culture, sport, wellness, etc.)
  return "booking.card.title.slot";
}

function deriveStepFromParams(params: URLSearchParams): BookingStep {
  const date = (params.get("date") ?? "").trim();
  const time = (params.get("time") ?? "").trim();

  if (!date) return "date";
  if (!time) return "time";
  return "people";
}

function StepDots({ step }: { step: BookingStep }) {
  const order: BookingStep[] = ["date", "time", "people"];
  const idx = order.indexOf(step);

  return (
    <div className="flex items-center justify-center gap-2">
      {order.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div
            key={s}
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-colors",
              active ? "bg-[#a3001d]" : done ? "bg-[#a3001d]/40" : "bg-slate-200",
            )}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

function HelpHint({ message, ariaLabel }: { message: string; ariaLabel: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-6 w-6 rounded-full border border-slate-200 bg-white text-slate-500",
            "inline-flex items-center justify-center",
            "hover:bg-slate-50 hover:text-slate-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3001d]/30 focus-visible:ring-offset-2",
          )}
          aria-label={ariaLabel}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-sm font-extrabold leading-none">?</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-lg"
      >
        {message}
      </PopoverContent>
    </Popover>
  );
}

export function ReservationBanner(props: {
  establishmentId: string;
  universe?: BookingUniverse;
  availableSlots?: DateSlots[];
  avgPriceLabel?: string;
  extraBookingQuery?: Record<string, string | undefined>;
  /** If provided, use this handler instead of opening the ProgressiveBookingModule (useful for hotels). */
  onReserveNow?: () => void;
  /** Optional handler for “Voir plus de dates” (defaults to opening the booking module when available). */
  onViewMoreDates?: () => void;
  /** Optional override for the reserve link (useful when the booking flow is not /booking/:id) */
  reserveHref?: string;
  /** When using the slot-based booking drawer, control it from the page to allow other sections to open it too. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  stickyClassName?: string;
}) {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const topBookingRef = React.useRef<HTMLDivElement | null>(null);
  const { isTopBookingVisible } = useBookingBarsVisibility(topBookingRef, { initialVisible: true });

  const title = t(getReservationTitleKey(props.universe));
  const subtitle = t("booking.step1.subtitle");
  const step = React.useMemo(() => deriveStepFromParams(searchParams), [searchParams]);

  const canOpenDrawer = typeof props.onOpenChange === "function";
  const openDrawer = React.useCallback(() => {
    if (props.onReserveNow) {
      props.onReserveNow();
      return;
    }
    if (!canOpenDrawer) return;
    props.onOpenChange?.(true);
  }, [canOpenDrawer, props]);

  const viewMoreDates = React.useCallback(() => {
    if (props.onViewMoreDates) return props.onViewMoreDates();
    return openDrawer();
  }, [openDrawer, props.onViewMoreDates]);

  const shouldRenderDrawer = Boolean(props.onOpenChange);

  return (
    <>
      <div ref={topBookingRef} className={cn("w-full", props.className)} data-top-booking-bar>
        <div className="rounded-2xl border border-slate-200 bg-white p-2 sm:p-3" style={{ fontFamily: "Circular Std, sans-serif" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-sm sm:text-base font-bold text-slate-900 truncate">{title}</div>
                <HelpHint message={subtitle} ariaLabel={t("common.help")} />
              </div>
            </div>
            <div className="shrink-0">
              <StepDots step={step} />
            </div>
          </div>

          <Button
            type="button"
            className={cn(
              "mt-3 w-full rounded-xl",
              "h-10 md:h-11 text-sm font-semibold",
              "bg-[#a3001d] hover:bg-[#a3001d]/90 text-white",
            )}
            onClick={openDrawer}
          >
            {title}
          </Button>
        </div>

        {shouldRenderDrawer ? (
          <ProgressiveBookingModule
            variant="dialog-only"
            titleOverride={title}
            establishmentId={props.establishmentId}
            universe={props.universe}
            availableSlots={props.availableSlots}
            open={Boolean(props.open)}
            onOpenChange={props.onOpenChange as (open: boolean) => void}
            extraBookingQuery={props.extraBookingQuery}
          />
        ) : null}
      </div>

      <StickyBottomBookingActionBar
        show={!isTopBookingVisible}
        establishmentId={props.establishmentId}
        universe={props.universe}
        availableSlots={props.availableSlots}
        avgPriceLabel={props.avgPriceLabel}
        reserveHref={props.reserveHref}
        reserveLabelOverride={title}
        onReserveNow={props.onReserveNow ?? (canOpenDrawer ? () => props.onOpenChange?.(true) : undefined)}
        onViewMoreDates={viewMoreDates}
        className={props.stickyClassName}
      />
    </>
  );
}
