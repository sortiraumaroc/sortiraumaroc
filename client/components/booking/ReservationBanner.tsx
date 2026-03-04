import * as React from "react";

import { ProgressiveBookingModule } from "@/components/booking/ProgressiveBookingModule";
import { StickyBottomBookingActionBar, type DateSlots } from "@/components/booking/StickyBottomBookingActionBar";
import { Button } from "@/components/ui/button";
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

function getReservationTitleKey(universe?: BookingUniverse): string {
  const u = (universe ?? "").toLowerCase();
  if (u === "restaurants" || u === "restaurant") return "booking.card.title.restaurant";
  if (u === "hotels" || u === "hotel") return "booking.card.title.hotel";
  // Requirement: all other universes use "Réserver un créneau" (including culture, sport, wellness, etc.)
  return "booking.card.title.slot";
}

export function ReservationBanner(props: {
  establishmentId: string;
  universe?: BookingUniverse;
  availableSlots?: DateSlots[];
  avgPriceLabel?: string;
  extraBookingQuery?: Record<string, string | undefined>;
  /** If provided, use this handler instead of opening the ProgressiveBookingModule (useful for hotels). */
  onReserveNow?: () => void;
  /** Optional handler for "Voir plus de dates" (defaults to opening the booking module when available). */
  onViewMoreDates?: () => void;
  /** Optional override for the reserve link (useful when the booking flow is not /booking/:id) */
  reserveHref?: string;
  /** When using the slot-based booking drawer, control it from the page to allow other sections to open it too. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  stickyClassName?: string;
  /** Number of reservations made today (shown in the sticky bar) */
  reservationsToday?: number;
  /** If false, the booking button will not be displayed (e.g. when establishment has no email). Defaults to true. */
  bookingEnabled?: boolean;
}) {
  const { t } = useI18n();
  const topBookingRef = React.useRef<HTMLDivElement | null>(null);
  const { isTopBookingVisible } = useBookingBarsVisibility(topBookingRef, { initialVisible: true });

  const title = t(getReservationTitleKey(props.universe));

  // If bookingEnabled is explicitly false, don't render the booking button
  const isBookingEnabled = props.bookingEnabled !== false;

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

  // Don't render anything if booking is disabled
  if (!isBookingEnabled) {
    return null;
  }

  return (
    <>
      <div ref={topBookingRef} className={cn("w-full", props.className)} data-top-booking-bar>
        <Button
          type="button"
          className={cn(
            "w-full rounded-xl",
            "h-12 md:h-14 text-base font-bold",
            "bg-sam-primary hover:bg-sam-primary-hover text-white",
          )}
          onClick={openDrawer}
        >
          {title}
        </Button>

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
        reservationsToday={props.reservationsToday}
      />
    </>
  );
}
