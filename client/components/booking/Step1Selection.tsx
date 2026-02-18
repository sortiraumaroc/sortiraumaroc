import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "react-router-dom";

import { ChevronDown, ChevronRight } from "lucide-react";

import { BookingStepHeader } from "@/components/booking/BookingStepHeader";

import { BookingCalendarGrid } from "@/components/booking/BookingCalendarGrid";
import { getPublicEstablishment, type PublicDateSlots } from "@/lib/publicApi";
import { isUuid } from "@/lib/pro/visits";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useBooking, type ServiceType } from "@/hooks/useBooking";

import { formatTimeHmLabel } from "@shared/datetime";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const SERVICE_TIMES: { service: ServiceType; labelKey: string; times: string[] }[] = [
  { service: "déjeuner", labelKey: "booking.service.lunch", times: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00"] },
  {
    service: "continu",
    labelKey: "booking.service.continuous",
    times: ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"],
  },
  {
    service: "dîner",
    labelKey: "booking.service.dinner",
    times: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"],
  },
];

function inferServiceFromTime(time: string): ServiceType {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return "déjeuner";
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const minutes = hh * 60 + mm;
  if (minutes < 15 * 60) return "déjeuner";
  if (minutes < 19 * 60) return "continu";
  return "dîner";
}

function formatLocalDateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmdToLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function expandTimesToThirtyMinutes(times: string[]): string[] {
  const parsed = times
    .map((t) => {
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
      if (!m) return null;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      return hh * 60 + mm;
    })
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (parsed.length === 0) return [];

  const min = Math.min(...parsed);
  const max = Math.max(...parsed);

  const start = Math.floor(min / 30) * 30;
  const end = Math.ceil(max / 30) * 30;

  const out: string[] = [];
  for (let m = start; m <= end; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
}

function toLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatLocalDayToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeToMinutes(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function getTimeBucketKey(args: { time: string; bookingType: "restaurant" | "activity" }): string {
  const minutes = timeToMinutes(args.time);
  if (minutes == null) return "booking.time.bucket.other";

  if (args.bookingType === "activity") {
    if (minutes < 12 * 60) return "booking.time.bucket.morning";
    if (minutes < 18 * 60) return "booking.time.bucket.afternoon";
    return "booking.time.bucket.evening";
  }

  if (minutes < 11 * 60) return "booking.time.bucket.breakfast";
  if (minutes < 16 * 60) return "booking.time.bucket.lunch";
  if (minutes < 18 * 60) return "booking.time.bucket.happy_hour";
  return "booking.time.bucket.dinner";
}

function normalizeServiceLabelToken(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "booking.time.bucket.available";

  const lower = v.toLowerCase();

  if (lower === "disponible" || lower === "available") return "booking.time.bucket.available";
  if (lower === "petit-déjeuner" || lower === "petit-dejeuner" || lower === "breakfast") return "booking.time.bucket.breakfast";
  if (lower === "déjeuner" || lower === "dejeuner" || lower === "lunch") return "booking.service.lunch";
  if (lower === "service continu" || lower === "all-day service" || lower === "all day service") return "booking.service.continuous";
  if (lower === "dîner" || lower === "diner" || lower === "dinner") return "booking.service.dinner";
  if (lower === "happy hour") return "booking.time.bucket.happy_hour";
  if (lower === "matin" || lower === "morning") return "booking.time.bucket.morning";
  if (lower === "après-midi" || lower === "apres-midi" || lower === "afternoon") return "booking.time.bucket.afternoon";
  if (lower === "soir" || lower === "evening") return "booking.time.bucket.evening";

  return v;
}

function isI18nToken(value: string): boolean {
  return value.startsWith("booking.") || value.startsWith("common.");
}

function peopleUnit(count: number, t: (key: string, params?: Record<string, any>) => string): string {
  return count === 1 ? t("common.person.one") : t("common.person.other");
}

function peopleCountLabel(count: number, t: (key: string, params?: Record<string, any>) => string): string {
  return `${count} ${peopleUnit(count, t)}`;
}

export default function Step1Selection() {
  const { t, intlLocale } = useI18n();

  const {
    bookingType,
    establishmentId,
    partySize,
    setPartySize,
    waitlistRequested,
    setWaitlistRequested,
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    selectedService,
    setSelectedService,
    selectedPack,
    setSelectedPack,
    setCurrentStep,
    canProceed,
  } = useBooking();

  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dateSlots, setDateSlots] = useState<PublicDateSlots[]>([]);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [showAllPeople, setShowAllPeople] = useState(false);

  const [dateOpen, setDateOpen] = useState<boolean>(!selectedDate);
  const [timeOpen, setTimeOpen] = useState<boolean>(!selectedTime);
  const [peopleOpen, setPeopleOpen] = useState<boolean>(!partySize);

  const timeSectionRef = useRef<HTMLElement | null>(null);
  const peopleSectionRef = useRef<HTMLElement | null>(null);

  const prevSelectedDateRef = useRef<Date | null>(selectedDate);
  const prevSelectedTimeRef = useRef<string | null>(selectedTime);
  const prevPartySizeRef = useRef<number | null>(partySize);

  const scrollToSection = (el: HTMLElement | null) => {
    if (!isMobile) return;
    if (!el) return;
    window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  useEffect(() => {
    if (!isMobile) {
      setDateOpen(true);
      setTimeOpen(true);
      setPeopleOpen(true);
      return;
    }

    setDateOpen(!selectedDate);
    setTimeOpen(!selectedTime);
    setPeopleOpen(!partySize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;

    const prev = prevSelectedDateRef.current;
    const prevYmd = prev ? formatLocalDayToYmd(toLocalDay(prev)) : null;
    const nextYmd = selectedDate ? formatLocalDayToYmd(toLocalDay(selectedDate)) : null;

    if (prevYmd !== nextYmd) {
      if (selectedDate) {
        setDateOpen(false);
        setTimeOpen(true);
        scrollToSection(timeSectionRef.current);
      } else {
        setDateOpen(true);
      }
    }

    prevSelectedDateRef.current = selectedDate;
  }, [isMobile, selectedDate]);

  useEffect(() => {
    if (!isMobile) return;

    if (prevSelectedTimeRef.current !== selectedTime) {
      if (selectedTime) {
        setTimeOpen(false);
        setPeopleOpen(true);
        scrollToSection(peopleSectionRef.current);
      } else {
        setTimeOpen(true);
      }
    }

    prevSelectedTimeRef.current = selectedTime;
  }, [isMobile, selectedTime]);

  useEffect(() => {
    if (!isMobile) return;

    if (prevPartySizeRef.current !== partySize) {
      if (partySize) {
        setPeopleOpen(false);
        setShowAllPeople(false);
      } else {
        setPeopleOpen(true);
      }
    }

    prevPartySizeRef.current = partySize;
  }, [isMobile, partySize]);

  const activityTimes = useMemo(() => {
    return ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  }, []);

  const primaryPeopleOptions = useMemo(() => {
    if (bookingType === "restaurant") return [2, 3, 4, 5, 6, 7];
    if (bookingType === "hotel") return [1, 2, 3, 4];
    return [1, 2, 3, 4, 5, 6];
  }, [bookingType]);

  const morePeopleOptions = useMemo(() => {
    const start = bookingType === "restaurant" ? 8 : 7;
    return Array.from({ length: 20 - start + 1 }, (_, i) => start + i);
  }, [bookingType]);

  const restaurantTimesFallback = useMemo(() => {
    const set = new Set<string>();
    for (const s of SERVICE_TIMES) {
      for (const t of s.times) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, []);

  useEffect(() => {
    if (!establishmentId || !isUuid(establishmentId)) {
      setDateSlots([]);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const title = searchParams.get("title");
        const payload = await getPublicEstablishment({ ref: establishmentId, title });
        if (!active) return;
        setDateSlots(payload.offers?.availableSlots ?? []);
      } catch {
        if (!active) return;
        setDateSlots([]);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [establishmentId, searchParams]);

  useEffect(() => {
    if (bookingType !== "restaurant") return;
    if (!selectedTime) return;
    setSelectedService(inferServiceFromTime(selectedTime));
  }, [bookingType, selectedTime, setSelectedService]);

  const today = useMemo(() => toLocalDay(new Date()), []);

  const updateUrl = (next: {
    date?: string | null;
    time?: string | null;
    people?: number | null;
    slotId?: string | null;
    waitlist?: boolean | null;
  }) => {
    const p = new URLSearchParams(searchParams);

    if ("date" in next) {
      const v = String(next.date ?? "").trim();
      if (v) p.set("date", v);
      else p.delete("date");
    }

    if ("time" in next) {
      const v = String(next.time ?? "").trim();
      if (v) p.set("time", v);
      else p.delete("time");
    }

    if ("people" in next) {
      const v = typeof next.people === "number" && Number.isFinite(next.people) ? Math.max(1, Math.round(next.people)) : null;
      if (v) p.set("people", String(v));
      else p.delete("people");
    }

    if ("slotId" in next) {
      const v = String(next.slotId ?? "").trim();
      if (v) p.set("slotId", v);
      else p.delete("slotId");
    }

    if ("waitlist" in next) {
      const v = next.waitlist;
      if (v) p.set("waitlist", "1");
      else p.delete("waitlist");
    }

    setSearchParams(p, { replace: true });
  };

  const slotsByDate = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { promo: number | null; remaining: number | null; slotId: string | null; service: string }>
    >();

    for (const ds of dateSlots) {
      const date = String(ds.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      const byTime =
        map.get(date) ??
        new Map<string, { promo: number | null; remaining: number | null; slotId: string | null; service: string }>();

      const promos = (ds as unknown as { promos?: Record<string, number | null> }).promos ?? {};
      const remaining = (ds as unknown as { remaining?: Record<string, number | null> }).remaining ?? {};
      const slotIds = (ds as unknown as { slotIds?: Record<string, string> }).slotIds ?? {};

      for (const svc of (ds.services ?? []) as Array<{ service: string; times: string[] }>) {
        const serviceLabel = normalizeServiceLabelToken(String(svc.service ?? ""));
        for (const raw of svc.times ?? []) {
          const time = String(raw ?? "").trim();
          if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) continue;

          const promoRaw = promos?.[time];
          const promo = typeof promoRaw === "number" && Number.isFinite(promoRaw) ? Math.round(promoRaw) : null;

          const remRaw = remaining?.[time];
          const rem = typeof remRaw === "number" && Number.isFinite(remRaw) ? Math.max(0, Math.round(remRaw)) : null;

          const slotIdRaw = slotIds?.[time];
          const slotId = slotIdRaw && String(slotIdRaw).trim() ? String(slotIdRaw).trim() : null;

          const existing = byTime.get(time);
          const bestPromo = existing?.promo == null ? promo : promo == null ? existing.promo : Math.max(existing.promo, promo);
          const chosenService = existing?.service || serviceLabel;
          const chosenRemaining = existing?.remaining == null ? rem : rem == null ? existing.remaining : Math.min(existing.remaining, rem);

          byTime.set(time, {
            promo: bestPromo ?? null,
            remaining: chosenRemaining ?? null,
            slotId: slotId ?? existing?.slotId ?? null,
            service: chosenService,
          });
        }
      }

      map.set(date, byTime);
    }

    return map;
  }, [dateSlots]);

  const promoByDate = useMemo(() => {
    const map = new Map<string, number>();

    for (const [ymd, byTime] of slotsByDate.entries()) {
      let best: number | null = null;
      for (const v of byTime.values()) {
        if (v.promo == null) continue;
        best = best == null ? v.promo : Math.max(best, v.promo);
      }
      if (best != null) map.set(ymd, best);
    }

    return map;
  }, [slotsByDate]);

  const isUsingAvailability = slotsByDate.size > 0;

  const selectedDay = selectedDate ? toLocalDay(selectedDate) : null;
  const selectedYmd = selectedDay ? formatLocalDayToYmd(selectedDay) : "";

  const selectedTimes = useMemo(() => {
    if (!selectedYmd)
      return [] as Array<{ time: string; promo: number | null; remaining: number | null; slotId: string | null; service: string }>;

    const byTime = slotsByDate.get(selectedYmd);
    if (byTime && byTime.size) {
      return Array.from(byTime.entries())
        .map(([time, meta]) => ({ time, promo: meta.promo, remaining: meta.remaining, slotId: meta.slotId, service: meta.service }))
        .sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0));
    }

    if (bookingType === "restaurant")
      return restaurantTimesFallback.map((t) => ({
        time: t,
        promo: null,
        remaining: null,
        slotId: null,
        service: getTimeBucketKey({ time: t, bookingType: "restaurant" }),
      }));

    if (bookingType === "activity")
      return expandTimesToThirtyMinutes(activityTimes).map((t) => ({
        time: t,
        promo: null,
        remaining: null,
        slotId: null,
        service: getTimeBucketKey({ time: t, bookingType: "activity" }),
      }));

    return [];
  }, [activityTimes, bookingType, restaurantTimesFallback, selectedYmd, slotsByDate]);

  const timeSections = useMemo(() => {
    if (bookingType !== "restaurant" && bookingType !== "activity") {
      return [] as Array<{
        label: string;
        items: Array<{ time: string; promo: number | null; remaining: number | null; slotId: string | null; service: string }>;
      }>;
    }

    const map = new Map<string, Array<{ time: string; promo: number | null; remaining: number | null; slotId: string | null; service: string }>>();
    for (const t of selectedTimes) {
      const label = normalizeServiceLabelToken(String(t.service ?? ""));
      const list = map.get(label) ?? [];
      list.push(t);
      map.set(label, list);
    }

    const preferred =
      bookingType === "restaurant"
        ? [
            "booking.time.bucket.breakfast",
            "booking.service.lunch",
            "booking.time.bucket.happy_hour",
            "booking.service.dinner",
            "booking.service.continuous",
            "booking.time.bucket.evening",
            "booking.time.bucket.available",
            "booking.time.bucket.other",
          ]
        : [
            "booking.time.bucket.morning",
            "booking.time.bucket.afternoon",
            "booking.time.bucket.evening",
            "booking.time.bucket.available",
            "booking.time.bucket.other",
          ];

    const out: Array<{
      label: string;
      items: Array<{ time: string; promo: number | null; remaining: number | null; slotId: string | null; service: string }>;
    }> = [];

    for (const label of preferred) {
      const items = map.get(label);
      if (!items?.length) continue;
      out.push({ label, items: items.sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0)) });
    }

    for (const [label, items] of map.entries()) {
      if (preferred.includes(label)) continue;
      out.push({ label, items: items.sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0)) });
    }

    return out;
  }, [bookingType, selectedTimes]);

  const selectedSlotMeta = useMemo(() => {
    if (!selectedTime) return null;
    return selectedTimes.find((x) => x.time === selectedTime) ?? null;
  }, [selectedTime, selectedTimes]);

  const selectedRemaining = selectedSlotMeta?.remaining ?? null;
  const selectedSlotId = selectedSlotMeta?.slotId ?? null;

  const handleContinue = () => {
    if (typeof selectedRemaining === "number" && selectedRemaining <= 0 && !waitlistRequested) {
      setCapacityError(t("booking.capacity.full_waitlist"));
      return;
    }

    if (canProceed(1)) setCurrentStep(2);
  };

  const recapDateLabel = selectedDate
    ? new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long" }).format(selectedDate)
    : null;

  const recapServiceLabel = (() => {
    if (!selectedTime) return null;

    if (bookingType === "activity") {
      return t("booking.activity.slot_at", { time: formatTimeHmLabel(selectedTime) });
    }

    if (!selectedService) return null;

    const token = SERVICE_TIMES.find((s) => s.service === selectedService)?.labelKey ?? selectedService;
    const serviceLabel = isI18nToken(token) ? t(token) : token;

    return t("booking.service.at_time", { service: serviceLabel, time: selectedTime });
  })();

  const showRecap = Boolean(partySize || selectedDate || selectedTime);

  const selectedPromo = useMemo(() => {
    if (!selectedTime) return null;
    const match = selectedTimes.find((x) => x.time === selectedTime);
    return match?.promo ?? null;
  }, [selectedTime, selectedTimes]);

  const stickyTitle = partySize
    ? peopleCountLabel(partySize, t)
    : selectedTime
      ? t("booking.step1.choose_people")
      : selectedDate
        ? t("booking.step1.choose_time")
        : t("booking.step1.choose_date");

  return (
    <div className={cn("space-y-8", isMobile ? "pb-28" : "")}>
      {selectedPack && (
        <div className="rounded-xl border border-[#a3001d]/20 bg-[#a3001d]/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-600 font-semibold tracking-wider" style={{ fontFamily: "Intra, sans-serif" }}>
                {t("booking.pack.selected")}
              </p>
              <p className="mt-1 font-bold text-foreground">🎁 {selectedPack.title}</p>
              {typeof selectedPack.price === "number" ? (
                <p className="mt-1 text-sm text-[#a3001d] font-semibold">{Math.round(selectedPack.price)} Dhs / personne</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSelectedPack(null)}
              className="text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              {t("booking.pack.remove")}
            </button>
          </div>
        </div>
      )}

      <BookingStepHeader
        step={1}
        totalSteps={4}
        title={t("booking.step1.title")}
        subtitle={t("booking.step1.subtitle")}
      />

      {/* Date */}
      <section className="space-y-3">
        <div>
          <div className="text-lg font-bold text-foreground">{t("booking.step1.section.date")}</div>
          <div className="mt-1 text-sm text-slate-600">{t("booking.step1.date.helper")}</div>
        </div>

        <Collapsible open={isMobile ? dateOpen : true} onOpenChange={(open) => (isMobile ? setDateOpen(open) : undefined)}>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {isMobile && selectedDate ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{recapDateLabel ?? t("booking.step1.selected.date")}</div>
                    <div className="text-xs text-slate-600">{t("booking.step1.selected.date")}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-primary font-semibold text-sm">
                    <span>{dateOpen ? t("common.close") : t("common.edit")}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", dateOpen ? "rotate-180" : "rotate-0")} />
                  </div>
                </button>
              </CollapsibleTrigger>
            ) : null}

            <CollapsibleContent>
              <div className={cn(selectedDate ? "border-t border-slate-200" : "", "p-3 sm:p-4")}>
                <BookingCalendarGrid
                  className="max-w-none mx-0 p-0"
                  selected={selectedDay ?? undefined}
                  promoByDate={promoByDate}
                  isDateDisabled={(d) => {
                    const day = toLocalDay(d);
                    if (day.getTime() < today.getTime()) return true;
                    if (!isUsingAvailability) return false;

                    const ymd = formatLocalDayToYmd(day);
                    const byTime = slotsByDate.get(ymd);
                    if (!byTime) return true;

                    // Only enable days with at least one available slot.
                    const hasAny = Array.from(byTime.values()).some((v) => v.remaining == null || v.remaining > 0);
                    return !hasAny;
                  }}
                  onSelect={(d) => {
                    const day = toLocalDay(d);
                    const ymd = formatLocalDayToYmd(day);

                    setCapacityError(null);
                    setWaitlistRequested(false);
                    setSelectedDate(day);
                    setSelectedTime(null);
                    setSelectedService(null);
                    setPartySize(null);

                    updateUrl({ date: ymd, time: null, people: null, slotId: null, waitlist: null });
                  }}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </section>

      {/* Time */}
      <section ref={timeSectionRef} className="space-y-4">
        <div>
          <div className="text-lg font-bold text-foreground">{t("booking.step1.section.time")}</div>
          <div className="mt-1 text-sm text-slate-600">{t("booking.step1.time.helper")}</div>
        </div>

        <Collapsible open={isMobile ? timeOpen : true} onOpenChange={(open) => (isMobile ? setTimeOpen(open) : undefined)}>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {isMobile && selectedTime ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{recapServiceLabel ?? t("booking.step1.selected.slot")}</div>
                    <div className="text-xs text-slate-600">{t("booking.step1.selected.time")}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-primary font-semibold text-sm">
                    <span>{timeOpen ? t("common.close") : t("common.edit")}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", timeOpen ? "rotate-180" : "rotate-0")} />
                  </div>
                </button>
              </CollapsibleTrigger>
            ) : null}

            <CollapsibleContent>
              <div className={cn(selectedTime ? "border-t border-slate-200" : "", "p-4")}>
                {selectedDay ? (
                  timeSections.length ? (
                    <div className="space-y-8">
                      {timeSections.map((section) => (
                        <div key={section.label} className="space-y-3">
                          <div className="text-base font-bold text-foreground">
                            {isI18nToken(section.label) ? t(section.label) : section.label}
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {section.items.map((slot) => {
                              const active = selectedTime === slot.time;
                              const isFull = typeof slot.remaining === "number" && slot.remaining <= 0;

                              if (isFull) {
                                return (
                                  <div
                                    key={slot.time}
                                    className={cn(
                                      "h-16 rounded-xl border",
                                      "flex flex-col items-center justify-between py-2",
                                      "bg-slate-100 border-slate-200 text-slate-400",
                                    )}
                                    role="group"
                                    aria-label={t("booking.slot.full_aria", { time: formatTimeHmLabel(slot.time) })}
                                  >
                                    <div className="text-base font-semibold tabular-nums text-slate-400">{formatTimeHmLabel(slot.time)}</div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-[11px] font-bold bg-slate-300 text-slate-700 px-2 py-1 rounded-md leading-none whitespace-nowrap">
                                        {t("booking.slot.full")}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCapacityError(null);
                                          setWaitlistRequested(true);
                                          setSelectedTime(slot.time);
                                          if (bookingType === "restaurant") setSelectedService(inferServiceFromTime(slot.time));
                                          updateUrl({ time: slot.time, slotId: slot.slotId, waitlist: true });
                                        }}
                                        className="text-[11px] font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                                      >
                                        {t("booking.waitlist")}
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  onClick={() => {
                                    setCapacityError(null);
                                    setWaitlistRequested(false);
                                    setSelectedTime(slot.time);
                                    if (bookingType === "restaurant") setSelectedService(inferServiceFromTime(slot.time));

                                    updateUrl({ time: slot.time, slotId: slot.slotId, waitlist: null });

                                    if (partySize && typeof slot.remaining === "number" && partySize > slot.remaining) {
                                      setPartySize(null);
                                      updateUrl({ people: null });
                                      setCapacityError(
                                        t("booking.capacity.limited", {
                                          remaining: slot.remaining,
                                          unit: peopleUnit(slot.remaining, t),
                                        }),
                                      );
                                    }
                                  }}
                                  className={cn(
                                    "h-16 rounded-xl border transition-colors",
                                    "flex flex-col items-center justify-between py-2",
                                    "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
                                    "bg-white",
                                    active ? "border-[#A3001D] bg-[#A3001D]/[0.04]" : "border-slate-200 hover:border-[#A3001D]",
                                  )}
                                  aria-pressed={active}
                                  aria-label={t("booking.time.choose", { time: formatTimeHmLabel(slot.time) })}
                                >
                                  <div className="text-base font-semibold tabular-nums text-slate-900">{formatTimeHmLabel(slot.time)}</div>
                                  {slot.promo ? (
                                    <div className="text-[11px] font-bold bg-black text-white px-2 py-1 rounded-md leading-none whitespace-nowrap">
                                      <span className="sm:hidden">{t("booking.offer.short", { promo: slot.promo })}</span>
                                      <span className="hidden sm:inline">{t("booking.offer.long", { promo: slot.promo })}</span>
                                    </div>
                                  ) : (
                                    <div className="h-[22px]" aria-hidden="true" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {t("booking.step1.no_slots")}
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {t("booking.step1.select_date_first")}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </section>

      {/* People */}
      <section ref={peopleSectionRef} className="space-y-4">
        <div>
          <div className="text-lg font-bold text-foreground">{t("booking.step1.section.people")}</div>
          <div className="mt-1 text-sm text-slate-600">{t("booking.step1.people.helper")}</div>
        </div>

        <Collapsible open={isMobile ? peopleOpen : true} onOpenChange={(open) => (isMobile ? setPeopleOpen(open) : undefined)}>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {isMobile && partySize ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {peopleCountLabel(partySize, t)}
                    </div>
                    <div className="text-xs text-slate-600">{t("booking.step1.selected.participants")}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-primary font-semibold text-sm">
                    <span>{peopleOpen ? t("common.close") : t("common.edit")}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", peopleOpen ? "rotate-180" : "rotate-0")} />
                  </div>
                </button>
              </CollapsibleTrigger>
            ) : null}

            <CollapsibleContent>
              <div className={cn(partySize ? "border-t border-slate-200" : "", "p-4")}>
                {capacityError ? (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {capacityError}
                  </div>
                ) : null}

                {waitlistRequested ? (
                  <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-slate-800">
                    {t("booking.waitlist.notice")}
                  </div>
                ) : null}

                {!waitlistRequested && typeof selectedRemaining === "number" ? (
                  <div className="mb-2 text-xs text-slate-500">
                    {t("booking.capacity.remaining", { remaining: selectedRemaining })}
                  </div>
                ) : null}

                {selectedTime ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {primaryPeopleOptions.map((size) => {
                        const active = partySize === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            disabled={!waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining}
                            onClick={() => {
                              const disabled = !waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining;
                              if (disabled) {
                                setCapacityError(
                                  t("booking.capacity.limited", {
                                    remaining: selectedRemaining,
                                    unit: peopleUnit(selectedRemaining, t),
                                  }),
                                );
                                return;
                              }
                              setCapacityError(null);
                              setPartySize(size);
                              updateUrl({ people: size });
                            }}
                            className={cn(
                              "h-16 rounded-xl border transition-colors",
                              "flex flex-col items-center justify-between py-2",
                              "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
                              !waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining
                                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-white",
                              !(!waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining) &&
                                (active ? "border-[#A3001D] bg-[#A3001D]/[0.04]" : "border-slate-200 hover:border-[#A3001D]"),
                            )}
                            aria-pressed={active}
                            aria-label={`${size} personne${size > 1 ? "s" : ""}`}
                          >
                            <div className="text-lg font-bold tabular-nums text-slate-900">{size}</div>
                            <div className="h-[22px]" aria-hidden="true" />
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setShowAllPeople((s) => !s)}
                        className={cn(
                          "h-16 rounded-xl border bg-white transition-colors",
                          "flex flex-col items-center justify-center",
                          "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
                          showAllPeople ? "border-[#A3001D]" : "border-slate-200 hover:border-[#A3001D]",
                        )}
                        aria-expanded={showAllPeople}
                      >
                        <div className="text-sm font-semibold text-slate-900">{t("booking.step1.more_choices")}</div>
                        <div className="text-xs text-slate-500">+</div>
                      </button>
                    </div>

                    {showAllPeople ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {morePeopleOptions.map((size) => {
                          const active = partySize === size;
                          return (
                            <button
                              key={size}
                              type="button"
                              disabled={!waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining}
                              onClick={() => {
                                const disabled = !waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining;
                                if (disabled) {
                                  setCapacityError(
                                    t("booking.capacity.limited", {
                                    remaining: selectedRemaining,
                                    unit: peopleUnit(selectedRemaining, t),
                                  }),
                                  );
                                  return;
                                }
                                setCapacityError(null);
                                setPartySize(size);
                                updateUrl({ people: size });
                              }}
                              className={cn(
                                "h-16 rounded-xl border transition-colors",
                                "flex flex-col items-center justify-between py-2",
                                "focus:outline-none focus:ring-2 focus:ring-[#A3001D]/25",
                                !waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining
                                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-white",
                                !(!waitlistRequested && typeof selectedRemaining === "number" && size > selectedRemaining) &&
                                (active ? "border-[#A3001D] bg-[#A3001D]/[0.04]" : "border-slate-200 hover:border-[#A3001D]"),
                              )}
                              aria-pressed={active}
                              aria-label={`${size} personnes`}
                            >
                              <div className="text-lg font-bold tabular-nums text-slate-900">{size}</div>
                              <div className="h-[22px]" aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {t("booking.step1.select_time_first")}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </section>

      {/* Recap + CTA (desktop) */}
      {!isMobile ? (
        <div className="space-y-4">
          {showRecap ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-600 font-semibold tracking-wider" style={{ fontFamily: "Intra, sans-serif" }}>
                {t("booking.step1.recap")}
              </p>
              <div className="mt-3 space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  {partySize ? peopleCountLabel(partySize, t) : t("booking.step1.choose_people")}
                </div>
                <div className="text-sm text-slate-700">{recapDateLabel ?? t("booking.step1.choose_date")}</div>
                <div className="text-sm text-slate-700">{recapServiceLabel ?? t("booking.step1.choose_time")}</div>
              </div>
            </div>
          ) : null}

          <button
            onClick={handleContinue}
            disabled={!canProceed(1)}
            className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95 flex items-center justify-center gap-2"
          >
            {t("common.continue")} <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      ) : null}

      {/* Sticky recap (mobile) */}
      {isMobile && showRecap ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate">{stickyTitle}</div>
              <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-600">
                {recapDateLabel ? <span className="truncate max-w-[220px]">{recapDateLabel}</span> : null}
                {selectedTime ? <span className="tabular-nums">{selectedTime}</span> : null}
                {selectedPromo ? (
                  <span className="inline-flex items-center rounded-full bg-black text-white px-2 py-0.5 text-[11px] font-bold whitespace-nowrap">
                    <span className="sm:hidden">{t("booking.offer.short", { promo: selectedPromo })}</span>
                    <span className="hidden sm:inline">{t("booking.offer.long", { promo: selectedPromo })}</span>
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              disabled={!canProceed(1)}
              className={cn(
                "shrink-0 h-11 px-5 rounded-xl font-bold",
                "bg-primary text-white hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {t("common.continue")}
            </button>
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
      ) : null}
    </div>
  );
}
