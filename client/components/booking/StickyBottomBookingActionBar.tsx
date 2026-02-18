import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Calendar, Clock, HelpCircle, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StickyBottomBar } from "@/components/booking/StickyBottomBar";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

import { formatTimeHmLabel } from "@shared/datetime";

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

export type DateSlots = {
  date: string; // YYYY-MM-DD
  services: Array<{ service: string; times: string[] }>;
  promos?: Record<string, number | null>;
  slotIds?: Record<string, string>;
  remaining?: Record<string, number | null>;
};

function getUniverseBookingLabelKey(universe?: BookingUniverse): string {
  const u = (universe ?? "").toLowerCase();

  if (u === "restaurants" || u === "restaurant") return "booking.card.title.restaurant";
  if (u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre") return "booking.card.title.slot";
  if (u === "culture" || u === "visite") return "booking.card.title.ticket";
  if (u === "loisirs" || u === "activities" || u === "activity") return "booking.card.title.slot";
  if (u === "hotels" || u === "hotel") return "booking.card.title.hotel";
  return "booking.card.title.default";
}

function getDefaultPeopleForUniverse(universe?: BookingUniverse): number {
  const u = (universe ?? "").toLowerCase();
  if (u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre") return 1;
  return 2;
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeHm(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function timeToMinutes(value: string): number | null {
  if (!isTimeHm(value)) return null;
  const [hh, mm] = value.split(":").map((n) => Number(n));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDefaultTargetMinutes(universe?: BookingUniverse): number | null {
  const u = (universe ?? "").toLowerCase();

  if (u === "restaurants" || u === "restaurant") return 20 * 60;
  if (u === "culture" || u === "visite") return 11 * 60;
  if (u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre") return 10 * 60;
  if (u === "loisirs" || u === "activities" || u === "activity") return 16 * 60;

  return null;
}

function parseYmd(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toLabel(
  ymd: string,
  intlLocale: string,
  t: (key: string, params?: Record<string, any>) => string,
): string {
  const dt = parseYmd(ymd);
  if (!dt) return ymd;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((d0.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("common.tomorrow");

  return d0.toLocaleDateString(intlLocale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function collectTimes(slot: DateSlots): string[] {
  const all = (slot.services ?? []).flatMap((s) => s.times ?? []);
  const uniq = new Set<string>();

  for (const t of all) {
    const v = String(t ?? "").trim();
    if (!v) continue;
    if (!isTimeHm(v)) continue;
    uniq.add(v);
  }

  return Array.from(uniq).sort((a, b) => (timeToMinutes(a) ?? 0) - (timeToMinutes(b) ?? 0));
}

function chooseBestTime(args: {
  slotDate: string;
  times: string[];
  universe?: BookingUniverse;
  selectedDateYmd?: string;
  selectedTimeHm?: string;
}): string {
  const times = args.times;
  if (!times.length) return "";

  const selectedDate = (args.selectedDateYmd ?? "").trim();
  const selectedTime = (args.selectedTimeHm ?? "").trim();

  if (selectedDate && selectedDate === args.slotDate && selectedTime && times.includes(selectedTime)) {
    return selectedTime;
  }

  const selectedTimeMin = selectedTime ? timeToMinutes(selectedTime) : null;
  const targetMin = selectedTimeMin ?? getDefaultTargetMinutes(args.universe);

  // If it's today, pick the next closest available time in the future.
  if (args.slotDate === todayYmd()) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const threshold = nowMin + 10;
    const next = times.find((t) => {
      const m = timeToMinutes(t);
      return m != null && m >= threshold;
    });
    if (next) return next;
  }

  if (targetMin != null) {
    let best = times[0] ?? "";
    let bestDist = Number.POSITIVE_INFINITY;

    for (const t of times) {
      const m = timeToMinutes(t);
      if (m == null) continue;
      const dist = Math.abs(m - targetMin);
      if (dist < bestDist || (dist === bestDist && m < (timeToMinutes(best) ?? 9999))) {
        bestDist = dist;
        best = t;
      }
    }

    return best;
  }

  // Fallback: pick the middle time (feels more "reasonable" than earliest).
  return times[Math.floor(times.length / 2)] ?? times[0] ?? "";
}

function useCanHover(): boolean {
  const [canHover, setCanHover] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!mq) return;

    const apply = () => setCanHover(Boolean(mq.matches));
    apply();

    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  return canHover;
}

function HelpHint({ message, ariaLabel }: { message: string; ariaLabel: string }) {
  const canHover = useCanHover();
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
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/30 focus-visible:ring-offset-2",
          )}
          aria-label={ariaLabel}
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => {
            if (canHover) setOpen(true);
          }}
          onMouseLeave={() => {
            if (canHover) setOpen(false);
          }}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-lg">
        {message}
      </PopoverContent>
    </Popover>
  );
}

function useAutoExpandOnScroll(options?: { minY?: number; topCollapseY?: number }) {
  const minY = options?.minY ?? 220;
  const topCollapseY = options?.topCollapseY ?? 120;

  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY || 0;
        if (y > minY) {
          setExpanded(true);
        } else if (y < topCollapseY) {
          setExpanded(false);
        }
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [minY, topCollapseY]);

  return { expanded, setExpanded } as const;
}

type QuickSlot = {
  date: string;
  time: string;
  label: string;
  promo?: number | null;
};

function computeQuickSlots(
  availableSlots: DateSlots[] | undefined | null,
  options: {
    universe?: BookingUniverse;
    selectedDateYmd?: string;
    selectedTimeHm?: string;
    formatLabel: (ymd: string) => string;
  },
): QuickSlot[] {
  const slotsRaw = Array.isArray(availableSlots) ? availableSlots : [];
  const slots = slotsRaw
    .filter((s): s is DateSlots => Boolean(s && typeof s.date === "string" && s.date.trim()))
    .filter((s) => isYmd(s.date.trim()))
    .map((s) => ({ ...s, date: s.date.trim() }));

  const byDate = slots.slice().sort((a, b) => a.date.localeCompare(b.date));

  const selectedDate = (options.selectedDateYmd ?? "").trim();
  const selectedIdx = selectedDate ? byDate.findIndex((s) => s.date === selectedDate) : -1;

  const ordered: DateSlots[] = [];
  if (selectedIdx >= 0) {
    ordered.push(byDate[selectedIdx] as DateSlots);
    for (let i = selectedIdx + 1; i < byDate.length && ordered.length < 3; i++) ordered.push(byDate[i] as DateSlots);
    for (let i = 0; i < selectedIdx && ordered.length < 3; i++) ordered.push(byDate[i] as DateSlots);
  } else {
    for (const s of byDate) {
      ordered.push(s as DateSlots);
      if (ordered.length >= 3) break;
    }
  }

  const quick: QuickSlot[] = [];
  for (const s of ordered) {
    const times = collectTimes(s);
    const bestTime = chooseBestTime({
      slotDate: s.date,
      times,
      universe: options.universe,
      selectedDateYmd: selectedDate || undefined,
      selectedTimeHm: (options.selectedTimeHm ?? "").trim() || undefined,
    });
    if (!bestTime) continue;

    // Get promo for this time slot
    const promo = s.promos?.[bestTime] ?? null;

    quick.push({ date: s.date, time: bestTime, label: options.formatLabel(s.date), promo });
  }

  return quick;
}

export function StickyBottomBookingActionBar(props: {
  establishmentId: string;
  universe?: BookingUniverse;
  availableSlots?: DateSlots[];
  avgPriceLabel?: string;
  /** Optional override for the reserve link (useful when the booking flow is not /booking/:id) */
  reserveHref?: string;
  /** Optional click handler for the main CTA (takes precedence over reserveHref) */
  onReserveNow?: () => void;
  /** Optional handler for "Voir plus de dates" (takes precedence over scrolling) */
  onViewMoreDates?: () => void;
  scrollToMoreDatesId?: string;
  className?: string;
  /** Control whether the fixed bottom bar is displayed (spacer stays to prevent layout jump) */
  show?: boolean;
  /** Optional override for the displayed reserve CTA label (used by ReservationBanner). */
  reserveLabelOverride?: string;
  /** Number of reservations made today (shown in the footer) */
  reservationsToday?: number;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, intlLocale } = useI18n();
  const selectedDateYmd = searchParams.get("date") ?? "";
  const selectedTimeHm = searchParams.get("time") ?? "";
  const selectedPeopleRaw = searchParams.get("people") ?? "";

  const selectedPeople = React.useMemo(() => {
    const n = Number(selectedPeopleRaw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(50, Math.max(1, Math.round(n)));
  }, [selectedPeopleRaw]);

  const hasSelectedSlot = Boolean(selectedDateYmd) && Boolean(selectedTimeHm);

  const actionLabel =
    String(props.reserveLabelOverride ?? "").trim() || t(getUniverseBookingLabelKey(props.universe));

  const { expanded } = useAutoExpandOnScroll({ minY: 220, topCollapseY: 120 });

  const quickSlots = React.useMemo(
    () =>
      computeQuickSlots(props.availableSlots, {
        universe: props.universe,
        selectedDateYmd,
        selectedTimeHm,
        formatLabel: (ymd) => toLabel(ymd, intlLocale, t),
      }),
    [props.availableSlots, props.universe, selectedDateYmd, selectedTimeHm, intlLocale, t],
  );

  const bookingHref = React.useMemo(() => {
    if (props.reserveHref) return props.reserveHref;

    const qs = new URLSearchParams();
    if (props.universe) qs.set("universe", String(props.universe));
    if (selectedDateYmd) qs.set("date", selectedDateYmd);
    if (selectedTimeHm) qs.set("time", selectedTimeHm);
    if (selectedPeople) qs.set("people", String(selectedPeople));

    const slotId = (() => {
      if (!selectedDateYmd || !selectedTimeHm) return null;
      const ds = (props.availableSlots ?? []).find((s) => String(s.date ?? "") === selectedDateYmd) as
        | (DateSlots & { slotIds?: Record<string, string> })
        | undefined;
      const id = ds?.slotIds?.[selectedTimeHm];
      return id && String(id).trim() ? String(id).trim() : null;
    })();

    if (slotId) qs.set("slotId", slotId);

    const base = `/booking/${encodeURIComponent(props.establishmentId)}`;
    const query = qs.toString();
    return query ? `${base}?${query}` : base;
  }, [props.availableSlots, props.establishmentId, props.reserveHref, props.universe, selectedDateYmd, selectedTimeHm, selectedPeople]);

  const applyQuickSlot = (slot: QuickSlot) => {
    const next = new URLSearchParams(searchParams);
    next.set("date", slot.date);
    next.set("time", slot.time);

    const peopleRaw = (searchParams.get("people") ?? "").trim();
    if (!peopleRaw) next.set("people", String(getDefaultPeopleForUniverse(props.universe)));

    setSearchParams(next, { replace: true });
  };

  const scrollToMoreDates = () => {
    if (props.onViewMoreDates) {
      props.onViewMoreDates();
      return;
    }

    const id = props.scrollToMoreDatesId || "reservation-rapide";
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const formatSelectedDateLabel = (ymd: string): string => {
    if (!ymd) return "";
    const dt = parseYmd(ymd);
    if (!dt) return ymd;
    return dt.toLocaleDateString(intlLocale, { weekday: "short", day: "2-digit", month: "short" });
  };

  const visible = props.show ?? true;
  const hasSlots = quickSlots.length > 0;

  // If no slots available, show only the reserve button
  if (!hasSlots) {
    return (
      <StickyBottomBar
        show
        className={cn(
          "transition-all duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0 translate-y-4 pointer-events-none",
          props.className,
        )}
        containerClassName="px-3 sm:px-4"
      >
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-lg px-4 py-3">
            {props.onReserveNow ? (
              <Button
                type="button"
                onClick={props.onReserveNow}
                className={cn(
                  "h-12 md:h-14 rounded-xl w-full",
                  "bg-sam-primary hover:bg-sam-primary-hover text-white text-base font-bold shadow-sm active:scale-[0.99]",
                )}
              >
                {actionLabel}
              </Button>
            ) : (
              <Button
                asChild
                className={cn(
                  "h-12 md:h-14 rounded-xl w-full",
                  "bg-sam-primary hover:bg-sam-primary-hover text-white text-base font-bold shadow-sm active:scale-[0.99]",
                )}
              >
                <Link to={bookingHref}>{actionLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </StickyBottomBar>
    );
  }

  // With slots: show SAM slot picker
  return (
    <StickyBottomBar
      show
      className={cn(
        "transition-all duration-300 ease-out",
        expanded ? "-translate-y-2" : "translate-y-0",
        visible ? "opacity-100" : "opacity-0 translate-y-4 pointer-events-none",
        props.className,
      )}
      containerClassName="px-3 sm:px-4"
    >
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg px-4 py-4 md:px-6 md:py-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">
              {t("booking.choose_slot")}
            </h3>
          </div>

          {/* Slot buttons - SAM style */}
          <div className="flex items-start gap-3 md:gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {quickSlots.map((slot) => {
              const active = slot.date === selectedDateYmd && slot.time === selectedTimeHm;
              const hasPromo = typeof slot.promo === "number" && slot.promo > 0;
              return (
                <div key={`${slot.date}-${slot.time}`} className="shrink-0 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => applyQuickSlot(slot)}
                    className={cn(
                      "rounded-xl px-4 py-2.5 text-sm font-bold transition-all min-w-[110px] text-center",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/30 focus-visible:ring-offset-2",
                      active
                        ? "bg-sam-primary text-white shadow-md"
                        : "bg-white text-sam-secondary border-2 border-sam-primary/20 hover:bg-sam-primary hover:text-white hover:border-sam-primary",
                    )}
                    aria-pressed={active}
                  >
                    <span className="block text-sm font-bold">{slot.label}</span>
                    <span className="block text-xs opacity-80 mt-0.5">{formatTimeHmLabel(slot.time)}</span>
                  </button>
                  {/* Promo badge below the button */}
                  {hasPromo ? (
                    <span className="mt-1.5 inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-sam-accent/15 text-xs font-bold text-sam-accent-hover">
                      -{slot.promo}%
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Footer: reservations count + more dates link */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-base leading-none">🔥</span>
              <span className="font-medium">
                {t("booking.reservations_today", { count: props.reservationsToday ?? 0 })}
              </span>
            </div>
            <button
              type="button"
              onClick={scrollToMoreDates}
              className="text-sm font-semibold text-sam-primary hover:text-sam-primary-hover hover:underline underline-offset-2 transition-colors"
            >
              {t("booking.step1.more_dates")}
            </button>
          </div>
        </div>
      </div>
    </StickyBottomBar>
  );
}
