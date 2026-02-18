export type ServiceType = "lunch" | "dinner";

export type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type OpeningInterval = {
  type: ServiceType;
  from: string; // HH:mm
  to: string; // HH:mm
};

export type NormalizedOpeningHours = Record<WeekdayKey, OpeningInterval[]>;

export type LegacyRestaurantHours = Record<
  string,
  {
    lunch?: string;
    dinner?: string;
    closed?: boolean;
  }
>;

export const WEEKDAYS_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const LEGACY_TO_WEEKDAY: Record<string, WeekdayKey> = {
  lundi: "monday",
  mardi: "tuesday",
  mercredi: "wednesday",
  jeudi: "thursday",
  vendredi: "friday",
  samedi: "saturday",
  dimanche: "sunday",
};

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function parseLegacyRange(value: string): { from: string; to: string } | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "fermé" || lower === "ferme" || lower === "closed") return null;

  const match = /^\s*([01]\d|2[0-3]):([0-5]\d)\s*[-–]\s*([01]\d|2[0-3]):([0-5]\d)\s*$/.exec(trimmed);
  if (!match) return null;

  const from = `${match[1]}:${match[2]}`;
  const to = `${match[3]}:${match[4]}`;
  if (!isValidTime(from) || !isValidTime(to)) return null;
  return { from, to };
}

export function normalizeOpeningHours(args: {
  openingHours?: Partial<Record<WeekdayKey, OpeningInterval[]>> | null;
  legacyHours?: LegacyRestaurantHours | null;
}): NormalizedOpeningHours {
  const base: NormalizedOpeningHours = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  if (args.openingHours) {
    for (const k of WEEKDAYS_ORDER) {
      const dayIntervals = args.openingHours[k];

      // Standard format: array of intervals
      if (Array.isArray(dayIntervals)) {
        base[k] = dayIntervals
          .filter((i): i is OpeningInterval => !!i && typeof i.type === "string" && isValidTime(i.from) && isValidTime(i.to))
          .map((i) => ({ type: i.type as ServiceType, from: i.from, to: i.to }));
        continue;
      }

      // Fallback: DaySchedule object (v1 or v2) that wasn't transformed server-side
      if (dayIntervals && typeof dayIntervals === "object" && "open" in dayIntervals) {
        const s = dayIntervals as Record<string, unknown>;
        if (!s.open) { base[k] = []; continue; }

        const intervals: OpeningInterval[] = [];

        // v2 format: mode + ranges
        if (Array.isArray(s.ranges)) {
          const types: ServiceType[] = ["lunch", "dinner"];
          (s.ranges as { from?: string; to?: string }[]).forEach((r, i) => {
            if (r && typeof r.from === "string" && typeof r.to === "string" && isValidTime(r.from) && isValidTime(r.to)) {
              intervals.push({ type: types[i] ?? "lunch", from: r.from, to: r.to });
            }
          });
        } else {
          // v1 format: continuous + openTime1/closeTime1
          const t1From = typeof s.openTime1 === "string" ? s.openTime1 : "";
          const t1To = typeof s.closeTime1 === "string" ? s.closeTime1 : "";
          if (t1From && t1To && isValidTime(t1From) && isValidTime(t1To)) {
            intervals.push({ type: "lunch", from: t1From, to: t1To });
          }
          if (!s.continuous) {
            const t2From = typeof s.openTime2 === "string" ? s.openTime2 : "";
            const t2To = typeof s.closeTime2 === "string" ? s.closeTime2 : "";
            if (t2From && t2To && isValidTime(t2From) && isValidTime(t2To)) {
              intervals.push({ type: "dinner", from: t2From, to: t2To });
            }
          }
        }

        base[k] = intervals;
      }
    }
  }

  if (args.legacyHours) {
    for (const [legacyKey, value] of Object.entries(args.legacyHours)) {
      const key = LEGACY_TO_WEEKDAY[legacyKey.toLowerCase()];
      if (!key) continue;

      if (value?.closed) {
        base[key] = [];
        continue;
      }

      const lunch = typeof value?.lunch === "string" ? parseLegacyRange(value.lunch) : null;
      const dinner = typeof value?.dinner === "string" ? parseLegacyRange(value.dinner) : null;

      const next: OpeningInterval[] = [];
      if (lunch) next.push({ type: "lunch", from: lunch.from, to: lunch.to });
      if (dinner) next.push({ type: "dinner", from: dinner.from, to: dinner.to });
      base[key] = next;
    }
  }

  return base;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":" ).map((n) => Number(n));
  return h * 60 + m;
}

export function getWeekdayKeyFromDate(date: Date): WeekdayKey {
  const day = date.getDay();
  const map: WeekdayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[day];
}

export function formatTimeFr(time: string): string {
  const [hh, mm] = time.split(":" );
  return `${hh}h${mm}`;
}

export type DateTimeCompatibility =
  | { ok: true }
  | { ok: false; reason: "closed_day" }
  | { ok: false; reason: "opens_at"; timeHm: string }
  | { ok: false; reason: "opens_tomorrow_at"; timeHm: string }
  | { ok: false; reason: "not_compatible" };

export function isDateTimeCompatible(
  openingHours: NormalizedOpeningHours,
  dateYmd: string,
  timeHm: string,
): DateTimeCompatibility | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeHm)) return null;

  const [y, m, d] = dateYmd.split("-").map((n) => Number(n));
  const selectedDate = new Date(y, m - 1, d);
  if (Number.isNaN(selectedDate.getTime())) return null;

  const weekday = getWeekdayKeyFromDate(selectedDate);
  const intervals = openingHours[weekday] || [];
  if (!intervals.length) return { ok: false, reason: "closed_day" };

  const t = timeToMinutes(timeHm);
  const hits = intervals.some((i) => {
    const start = timeToMinutes(i.from);
    const end = timeToMinutes(i.to);
    if (end <= start) {
      return t >= start || t <= end;
    }
    return t >= start && t <= end;
  });

  if (hits) return { ok: true };

  const nextStart = [...intervals]
    .map((i) => timeToMinutes(i.from))
    .sort((a, b) => a - b)
    .find((start) => start > t);

  if (typeof nextStart === "number") {
    const hh = String(Math.floor(nextStart / 60)).padStart(2, "0");
    const mm = String(nextStart % 60).padStart(2, "0");
    return { ok: false, reason: "opens_at", timeHm: `${hh}:${mm}` };
  }

  const firstStart = intervals
    .map((i) => timeToMinutes(i.from))
    .sort((a, b) => a - b)[0];

  if (typeof firstStart === "number") {
    const hh = String(Math.floor(firstStart / 60)).padStart(2, "0");
    const mm = String(firstStart % 60).padStart(2, "0");
    return { ok: false, reason: "opens_tomorrow_at", timeHm: `${hh}:${mm}` };
  }

  return { ok: false, reason: "not_compatible" };
}
