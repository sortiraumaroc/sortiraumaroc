import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ChevronLeft } from "lucide-react";

import { AuthModalV2 } from "@/components/AuthModalV2";
import { BookingCalendarGrid } from "@/components/booking/BookingCalendarGrid";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isAuthed } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { DateSlots } from "@/components/booking/StickyBottomBookingActionBar";

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

type PromoSource = {
  date: string; // YYYY-MM-DD
  service: string;
  time: string; // HH:mm
};

type TFunc = (key: string, params?: Record<string, any>) => string;

function isI18nToken(value: string): boolean {
  return value.startsWith("booking.") || value.startsWith("common.") || value.startsWith("language.") || value.startsWith("header.") || value.startsWith("footer.");
}

function normalizeServiceLabelToken(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "booking.time.bucket.available";

  const lower = v.toLowerCase();

  if (lower === "disponible" || lower === "available") return "booking.time.bucket.available";
  if (lower === "petit-déjeuner" || lower === "petit-dejeuner" || lower === "breakfast") return "booking.time.bucket.breakfast";
  if (lower === "midi" || lower === "déjeuner" || lower === "dejeuner" || lower === "lunch") return "booking.time.bucket.lunch";
  if (lower === "tea time") return "booking.time.bucket.tea_time";
  if (lower === "happy hour") return "booking.time.bucket.happy_hour";
  if (lower === "soir" || lower === "dîner" || lower === "diner" || lower === "dinner") return "booking.time.bucket.dinner";

  return v;
}

function peopleUnit(count: number, t: TFunc): string {
  return count === 1 ? t("common.person.one") : t("common.person.other");
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

function parseYmd(ymd: string): Date | null {
  if (!isYmd(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateChip(ymd: string, intlLocale: string): string {
  const dt = parseYmd(ymd);
  if (!dt) return ymd;
  return dt.toLocaleDateString(intlLocale, { weekday: "short", day: "2-digit", month: "short" });
}

function getUniverseTitleKey(universe?: BookingUniverse): string {
  const u = (universe ?? "").toLowerCase();
  if (u === "restaurants" || u === "restaurant") return "booking.card.title.restaurant";
  if (u === "hotels" || u === "hotel") return "booking.card.title.hotel";
  if (u === "culture" || u === "visite") return "booking.card.title.ticket";
  if (u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre") return "booking.card.title.slot";
  if (u === "loisirs" || u === "activities" || u === "activity") return "booking.card.title.slot";
  return "booking.card.title.default";
}

function getDefaultPeopleForUniverse(universe?: BookingUniverse): number {
  const u = (universe ?? "").toLowerCase();
  if (u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre") return 1;
  return 2;
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
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3001d]/30 focus-visible:ring-offset-2",
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

function normalizeSlots(slots: DateSlots[] | undefined | null): DateSlots[] {
  const arr = Array.isArray(slots) ? slots : [];
  const clean = arr
    .filter((s): s is DateSlots => Boolean(s && typeof s.date === "string"))
    .map((s) => ({
      date: String(s.date).trim(),
      services: Array.isArray(s.services) ? s.services : [],
    }))
    .filter((s) => isYmd(s.date));

  clean.sort((a, b) => a.date.localeCompare(b.date));
  return clean;
}

function buildFallbackSlots(universe?: BookingUniverse): DateSlots[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const nextDays = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return formatYmd(d);
    });

  const u = (universe ?? "").toLowerCase();

  if (u === "restaurants" || u === "restaurant") {
    const services: DateSlots["services"] = [
      { service: "booking.time.bucket.lunch", times: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"] },
      { service: "booking.time.bucket.tea_time", times: ["15:00", "15:30", "16:00", "16:30", "17:00"] },
      { service: "booking.time.bucket.happy_hour", times: ["17:30", "18:00", "18:30", "19:00"] },
      { service: "booking.time.bucket.dinner", times: ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"] },
    ];

    return nextDays(10).map((date) => ({ date, services }));
  }

  // Generic fallback for other universes
  const genericTimes = ["10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
  return nextDays(10).map((date) => ({
    date,
    services: [{ service: "booking.time.bucket.available", times: genericTimes }],
  }));
}

function getPromoPercentHeuristic(universe: BookingUniverse | undefined, src: PromoSource): number | null {
  const u = (universe ?? "").toLowerCase();
  const min = timeToMinutes(src.time);
  if (min == null) return null;

  // Restaurant: midi -50%, soir -40% (fallback style TheFork).
  if (u === "restaurants" || u === "restaurant") {
    if (min >= 11 * 60 && min <= 15 * 60) return 50;
    if (min >= 18 * 60 && min <= 23 * 60 + 30) return 40;
    return null;
  }

  // Other universes: optional promo, lighter.
  if (u === "loisirs" || u === "activities" || u === "activity" || u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre") {
    // Put promo on early/mid slots to communicate availability.
    if (min >= 9 * 60 && min <= 14 * 60 + 30) return 50;
    return 40;
  }

  return null;
}

function buildBookingUrl(args: {
  establishmentId: string;
  universe?: BookingUniverse;
  people: number;
  dateYmd: string;
  timeHm: string;
  slotId?: string | null;
  extraQuery?: Record<string, string | undefined>;
}) {
  const qs = new URLSearchParams();
  if (args.universe) qs.set("universe", String(args.universe));
  qs.set("people", String(args.people));
  qs.set("date", args.dateYmd);
  qs.set("time", args.timeHm);
  if (args.slotId) qs.set("slotId", String(args.slotId));

  for (const [k, v] of Object.entries(args.extraQuery ?? {})) {
    const value = String(v ?? "").trim();
    if (!value) continue;
    qs.set(k, value);
  }

  const base = `/booking/${encodeURIComponent(args.establishmentId)}`;
  return `${base}?${qs.toString()}`;
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

function PeopleGrid({
  value,
  max,
  onChange,
  t,
}: {
  value: number;
  max: number | null;
  onChange: (n: number) => void;
  t: TFunc;
}) {
  const [custom, setCustom] = React.useState<number>(value > 10 ? value : 10);

  React.useEffect(() => {
    if (value > 10) setCustom(value);
  }, [value]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={typeof max === "number" && n > max}
              onClick={() => {
                if (typeof max === "number" && n > max) return;
                onChange(n);
              }}
              className={cn(
                "h-12 rounded-2xl border text-base font-semibold transition-colors",
                typeof max === "number" && n > max ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed" : "",
                !(typeof max === "number" && n > max) &&
                  (selected
                    ? "border-[#a3001d] bg-[#a3001d] text-white"
                    : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"),
              )}
              aria-label={`${n} ${peopleUnit(n, t)}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          );
        })}
        <button
          type="button"
          disabled={typeof max === "number" && Math.max(11, custom) > max}
          onClick={() => {
            const next = Math.max(11, custom);
            if (typeof max === "number" && next > max) return;
            onChange(next);
          }}
          className={cn(
            "h-12 rounded-2xl border text-base font-semibold transition-colors",
            typeof max === "number" && Math.max(11, custom) > max ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed" : "",
            !(typeof max === "number" && Math.max(11, custom) > max) &&
              (value > 10 ? "border-[#a3001d] bg-[#a3001d] text-white" : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"),
          )}
          aria-label={t("booking.people.more_than_10")}
          aria-pressed={value > 10}
        >
          10+
        </button>
      </div>

      {value > 10 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">{t("booking.people.exact_count")}</div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const next = Math.max(11, custom - 1);
                if (typeof max === "number" && next > max) return;
                setCustom(next);
                onChange(next);
              }}
              className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-lg font-semibold hover:bg-slate-50"
              aria-label={t("booking.people.remove_one")}
            >
              −
            </button>
            <div className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={typeof max === "number" ? Math.min(50, max) : 50}
                value={custom}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw)) return;
                  const next = Math.max(11, Math.min(typeof max === "number" ? Math.min(50, max) : 50, Math.round(raw)));
                  setCustom(next);
                  onChange(next);
                }}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                aria-label={t("booking.step1.section.people")}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const next = Math.min(50, custom + 1);
                if (typeof max === "number" && next > max) return;
                setCustom(next);
                onChange(next);
              }}
              className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-lg font-semibold hover:bg-slate-50"
              aria-label={t("booking.people.add_one")}
            >
              +
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500">{t("booking.people.up_to")}</div>
        </div>
      ) : null}
    </div>
  );
}

function TimeButton({
  time,
  promo,
  active,
  disabled,
  onClick,
  t,
}: {
  time: string;
  promo: number | null;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  t: TFunc;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={cn(
        "h-16 rounded-xl border transition-colors",
        "flex flex-col items-center justify-between py-2",
        "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
        disabled ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" : "bg-white",
        !disabled && (active ? "border-[#A3001D] bg-[#A3001D]/[0.04]" : "border-slate-200 hover:border-[#A3001D]"),
      )}
      aria-pressed={active}
      aria-label={t("booking.time.choose", { time })}
    >
      <div className={cn("text-base font-semibold tabular-nums", disabled ? "text-slate-400" : "text-slate-900")}>{time}</div>
      {disabled ? (
        <div className="text-[11px] font-bold bg-slate-300 text-slate-700 px-2 py-1 rounded-md leading-none whitespace-nowrap">{t("booking.slot.full")}</div>
      ) : promo ? (
        <div className="text-[11px] font-bold bg-black text-white px-2 py-1 rounded-md leading-none whitespace-nowrap">
          <span className="sm:hidden">{t("booking.offer.short", { promo })}</span>
          <span className="hidden sm:inline">{t("booking.offer.long", { promo })}</span>
        </div>
      ) : (
        <div className="h-[22px]" aria-hidden="true" />
      )}
    </button>
  );
}

export function ProgressiveBookingModule(props: {
  establishmentId: string;
  universe?: BookingUniverse;
  availableSlots?: DateSlots[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extraBookingQuery?: Record<string, string | undefined>;
  className?: string;
  anchorId?: string;
  /**
   * inline: renders the top CTA card + the dialog.
   * dialog-only: only renders the dialog (CTA card is rendered by a parent like ReservationBanner).
   */
  variant?: "inline" | "dialog-only";
  /** Optional override for the CTA title (used to standardize labels across universes). */
  titleOverride?: string;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, intlLocale } = useI18n();

  const [authOpen, setAuthOpen] = React.useState(false);
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  const slots = React.useMemo(() => {
    const normalized = normalizeSlots(props.availableSlots);
    if (normalized.length) return normalized;
    return buildFallbackSlots(props.universe);
  }, [props.availableSlots, props.universe]);
  const title = (() => {
    const override = String(props.titleOverride ?? "").trim();
    if (override) return isI18nToken(override) ? t(override) : override;
    return t(getUniverseTitleKey(props.universe));
  })();
  const variant = props.variant ?? "inline";
  const subtitle = t("booking.step1.subtitle");

  const peopleParam = (searchParams.get("people") ?? "").trim();
  const dateParam = (searchParams.get("date") ?? "").trim();
  const timeParam = (searchParams.get("time") ?? "").trim();

  const defaultPeople = getDefaultPeopleForUniverse(props.universe);

  const [step, setStep] = React.useState<BookingStep>("date");
  const [people, setPeople] = React.useState<number>(() => {
    const n = Number(peopleParam);
    if (!Number.isFinite(n) || n <= 0) return defaultPeople;
    return Math.min(50, Math.max(1, Math.round(n)));
  });

  const [dateYmd, setDateYmd] = React.useState<string>(() => {
    if (isYmd(dateParam)) return dateParam;
    const first = slots[0]?.date;
    return first && isYmd(first) ? first : formatYmd(new Date());
  });

  const [timeHm, setTimeHm] = React.useState<string>(() => (isTimeHm(timeParam) ? timeParam : ""));

  React.useEffect(() => {
    if (!props.open) return;

    const nextPeople = (() => {
      const n = Number((searchParams.get("people") ?? "").trim());
      if (!Number.isFinite(n) || n <= 0) return defaultPeople;
      return Math.min(50, Math.max(1, Math.round(n)));
    })();

    const nextDate = (() => {
      const raw = (searchParams.get("date") ?? "").trim();
      if (isYmd(raw)) return raw;
      const first = slots[0]?.date;
      return first && isYmd(first) ? first : formatYmd(new Date());
    })();

    const nextTime = (() => {
      const raw = (searchParams.get("time") ?? "").trim();
      return isTimeHm(raw) ? raw : "";
    })();

    const hasDate = isYmd((searchParams.get("date") ?? "").trim());
    const hasTime = isTimeHm((searchParams.get("time") ?? "").trim());
    const nPeople = Number((searchParams.get("people") ?? "").trim());
    const hasPeople = Number.isFinite(nPeople) && nPeople > 0;

    setPeople(nextPeople);
    setDateYmd(nextDate);
    setTimeHm(nextTime);

    if (!hasDate) setStep("date");
    else if (!hasTime) setStep("time");
    else if (!hasPeople) setStep("people");
    else setStep("people");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const updateUrl = (next: { people?: number; date?: string; time?: string }) => {
    const p = new URLSearchParams(searchParams);

    if (typeof next.people === "number" && Number.isFinite(next.people) && next.people > 0) {
      p.set("people", String(next.people));
    }

    if (typeof next.date === "string") {
      if (next.date && isYmd(next.date)) p.set("date", next.date);
      else p.delete("date");
    }

    if (typeof next.time === "string") {
      if (next.time && isTimeHm(next.time)) p.set("time", next.time);
      else p.delete("time");
    }

    setSearchParams(p, { replace: true });
  };

  const availableDates = React.useMemo(() => {
    const list: Date[] = [];

    for (const s of slots) {
      const dt = parseYmd(s.date);
      if (!dt) continue;

      const remaining = (s as unknown as { remaining?: Record<string, number | null> }).remaining ?? null;
      if (remaining && typeof remaining === "object") {
        const hasAny = Object.values(remaining).some((v) => typeof v === "number" ? v > 0 : true);
        if (!hasAny) continue;
      }

      list.push(dt);
    }

    return list;
  }, [slots]);

  const today = React.useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const isPast = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return d.getTime() < today.getTime();
  };

  const dateSlot = React.useMemo(() => slots.find((s) => s.date === dateYmd) ?? null, [slots, dateYmd]);

  const remainingByTime = React.useMemo(() => {
    const ds = (dateSlot as (DateSlots & { remaining?: Record<string, number | null> }) | null) ?? null;
    return ds?.remaining ?? {};
  }, [dateSlot]);

  const services = React.useMemo(() => {
    const s = dateSlot?.services ?? [];
    return s
      .map((x) => ({
        service: String(x.service ?? "").trim(),
        times: Array.isArray(x.times) ? x.times.map((t) => String(t ?? "").trim()).filter((t) => isTimeHm(t)) : [],
      }))
      .filter((x) => x.service && x.times.length)
      .map((x) => ({ ...x, times: Array.from(new Set(x.times)).sort((a, b) => (timeToMinutes(a) ?? 0) - (timeToMinutes(b) ?? 0)) }));
  }, [dateSlot]);

  const promoByDate = React.useMemo(() => {
    const map = new Map<string, number>();

    for (const s of slots) {
      let best: number | null = null;
      for (const service of s.services ?? []) {
        const serviceLabel = String(service.service ?? "");
        for (const t of service.times ?? []) {
          const time = String(t ?? "").trim();
          if (!isTimeHm(time)) continue;
          const p = getPromoPercentHeuristic(props.universe, { date: s.date, service: serviceLabel, time });
          if (!p) continue;
          best = best == null ? p : Math.max(best, p);
        }
      }
      if (best != null) map.set(s.date, best);
    }

    return map;
  }, [props.universe, slots]);

  const startBooking = () => {
    if (!people || !dateYmd || !timeHm) return;
    const slotId = (() => {
      const ds = (dateSlot as (DateSlots & { slotIds?: Record<string, string> }) | null) ?? null;
      const id = ds?.slotIds?.[timeHm];
      return id && String(id).trim() ? String(id).trim() : null;
    })();

    const url = buildBookingUrl({
      establishmentId: props.establishmentId,
      universe: props.universe,
      people,
      dateYmd,
      timeHm,
      slotId,
      extraQuery: props.extraBookingQuery,
    });

    if (!isAuthed()) {
      // Avoid stacking 2 Radix dialogs (booking drawer + auth modal), which can feel "blocked" on mobile.
      setPendingUrl(url);
      props.onOpenChange(false);
      setAuthOpen(true);
      return;
    }

    props.onOpenChange(false);
    navigate(url);
  };

  const onAuthSuccess = () => {
    setAuthOpen(false);
    if (!pendingUrl) return;
    navigate(pendingUrl);
    setPendingUrl(null);
    props.onOpenChange(false);
  };

  const stepOrder: BookingStep[] = ["date", "time", "people"];
  const currentStep = Math.max(1, stepOrder.indexOf(step) + 1);

  // Scroll to top of the dialog content when step changes
  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [step]);

  const headerTitle =
    step === "date"
      ? t("booking.step1.section.date")
      : step === "time"
        ? t("booking.step1.section.time")
        : t("booking.step1.section.people");

  return (
    <div id={props.anchorId} className={cn("w-full", props.className)} style={{ fontFamily: "Circular Std, sans-serif" }}>
      {variant === "inline" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
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
            onClick={() => props.onOpenChange(true)}
          >
            {title}
          </Button>
        </div>
      ) : null}

      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent
          hideCloseButton
          className={cn(
            "p-0 gap-0 overflow-hidden",
            "w-screen h-[100dvh] max-w-none rounded-none",
            // On desktop/tablet, the page behind the dialog can't scroll (Radix scroll-lock).
            // So we must constrain the dialog height and rely on the internal scroll area.
            "sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl",
          )}
        >
          <DialogTitle className="sr-only">{title} — {headerTitle}</DialogTitle>
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (step === "people") setStep("time");
                  else if (step === "time") setStep("date");
                  else props.onOpenChange(false);
                }}
                className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center"
                aria-label={t("common.back")}
              >
                <ChevronLeft className="h-5 w-5 text-slate-700" />
              </button>

              <div className="min-w-0 text-center">
                <div className="text-xs font-semibold text-slate-500">{title}</div>
                <div className="mt-0.5 text-lg font-bold text-slate-900">{headerTitle}</div>
              </div>

              <div className="h-10 w-10" aria-hidden="true" />
            </div>

            <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
              {step === "people" ? (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600">{t("booking.step1.people.helper")}</div>
                  <PeopleGrid
                    value={people}
                    max={(() => {
                      if (!timeHm) return null;
                      const v = remainingByTime?.[timeHm];
                      return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
                    })()}
                    onChange={(n) => {
                      setPeople(n);
                      updateUrl({ people: n });
                      setStep("people");
                    }}
                    t={t}
                  />
                </div>
              ) : null}

              {step === "date" ? (
                <div className="space-y-4">
                  <div className="text-sm text-slate-600">{t("booking.step1.date.helper")}</div>

                  <BookingCalendarGrid
                    selected={parseYmd(dateYmd) ?? undefined}
                    promoByDate={promoByDate}
                    isDateDisabled={(d) => {
                      if (isPast(d)) return true;
                      const y = formatYmd(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                      return !promoByDate.has(y) && !availableDates.some((x) => formatYmd(x) === y);
                    }}
                    onSelect={(d) => {
                      if (isPast(d)) return;
                      const ymd = formatYmd(d);
                      setDateYmd(ymd);
                      setTimeHm("");
                      updateUrl({ date: ymd, time: "" });
                      setStep("time");
                    }}
                  />
                </div>
              ) : null}

              {step === "time" ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{formatDateChip(dateYmd, intlLocale)}</div>
                      <div className="mt-0.5 text-sm text-slate-600">{t("booking.step1.time.helper")}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep("date")}
                      className="text-sm font-semibold text-[#a3001d] hover:underline underline-offset-4"
                    >
                      {t("common.change")}
                    </button>
                  </div>

                  {services.length ? (
                    <div className="space-y-8">
                      {services.map((s) => {
                        const labelToken = normalizeServiceLabelToken(s.service);
                        const label = isI18nToken(labelToken) ? t(labelToken) : labelToken;

                        return (
                          <div key={s.service} className="space-y-3">
                            <div className="text-base font-bold text-slate-900">{label}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {s.times.map((time) => {
                                const promo = getPromoPercentHeuristic(props.universe, { date: dateYmd, service: s.service, time });
                                const active = timeHm === time;
                                const remaining = typeof remainingByTime?.[time] === "number" ? (remainingByTime?.[time] as number) : null;
                                const disabled = remaining !== null && remaining <= 0;
                                return (
                                  <TimeButton
                                    key={`${s.service}-${time}`}
                                    time={time}
                                    promo={promo}
                                    disabled={disabled}
                                    active={active}
                                    t={t}
                                    onClick={() => {
                                      setTimeHm(time);
                                      updateUrl({ time });

                                      if (remaining !== null && people > remaining) {
                                        setPeople(Math.max(1, remaining));
                                        updateUrl({ people: Math.max(1, remaining) });
                                      }

                                      setStep("people");
                                    }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">{t("booking.step1.no_slots")}</div>
                    </div>
                  )}

                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-100 bg-white px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                onClick={startBooking}
                disabled={!people || !dateYmd || !timeHm}
                className={cn(
                  "w-full h-12 rounded-2xl text-base font-semibold",
                  "bg-[#a3001d] hover:bg-[#a3001d]/90 text-white",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {t("booking.cta.book_now")}
              </Button>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#a3001d]" aria-hidden="true" />
                  <span>{t("booking.module.step_progress", { current: currentStep, total: stepOrder.length })}</span>
                </div>
                <button
                  type="button"
                  className="text-[#a3001d] font-semibold"
                  onClick={() => {
                    if (step === "people") setStep("time");
                    else if (step === "time") setStep("date");
                    else props.onOpenChange(false);
                  }}
                >
                  {t("common.back")}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AuthModalV2
        isOpen={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingUrl(null);
        }}
        onAuthed={onAuthSuccess}
      />
    </div>
  );
}
