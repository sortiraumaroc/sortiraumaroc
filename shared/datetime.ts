export const DEFAULT_TIME_ZONE = "Africa/Casablanca" as const;
export const DEFAULT_LOCALE = "fr-MA" as const;

export type DateInput = Date | string | number;

export type ZonedDateTimeParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  const d = new Date(input);
  return d;
}

function getDtf(args: {
  locale: string;
  timeZone: string;
  includeSeconds: boolean;
}): Intl.DateTimeFormat {
  const key = `${args.locale}|${args.timeZone}|${args.includeSeconds ? "s" : "m"}`;
  const cached = dtfCache.get(key);
  if (cached) return cached;

  const dtf = new Intl.DateTimeFormat(args.locale, {
    timeZone: args.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(args.includeSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });

  dtfCache.set(key, dtf);
  return dtf;
}

function readNumberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((p) => p.type === type)?.value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function getTimeZoneParts(
  input: DateInput,
  args: { timeZone: string; locale?: string; includeSeconds?: boolean }
): ZonedDateTimeParts {
  const date = getDate(input);
  const timeZone = args.timeZone;
  const locale = args.locale ?? DEFAULT_LOCALE;
  const includeSeconds = args.includeSeconds ?? true;

  const dtf = getDtf({ locale, timeZone, includeSeconds });
  const parts = dtf.formatToParts(date);

  return {
    year: readNumberPart(parts, "year"),
    month: readNumberPart(parts, "month"),
    day: readNumberPart(parts, "day"),
    hour: readNumberPart(parts, "hour"),
    minute: readNumberPart(parts, "minute"),
    second: includeSeconds ? readNumberPart(parts, "second") : 0,
  };
}

export function getTimeZoneOffsetMs(input: DateInput, timeZone: string): number {
  const date = getDate(input);

  // Convert the same instant into wall-clock parts in the target timezone,
  // then interpret these parts as if they were UTC.
  // The difference gives the timezone offset in milliseconds.
  const parts = getTimeZoneParts(date, { timeZone, locale: "en-US", includeSeconds: true });
  const asUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtcMs - date.getTime();
}

export function zonedTimeToUtc(parts: ZonedDateTimeParts, timeZone: string): Date {
  const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  // First pass
  let candidate = new Date(localAsUtcMs);
  let offsetMs = getTimeZoneOffsetMs(candidate, timeZone);
  candidate = new Date(localAsUtcMs - offsetMs);

  // Second pass (handles DST boundaries)
  const offsetMs2 = getTimeZoneOffsetMs(candidate, timeZone);
  if (offsetMs2 !== offsetMs) {
    candidate = new Date(localAsUtcMs - offsetMs2);
  }

  return candidate;
}

export function mkIsoInTimeZoneDayOffset(args: {
  baseDate?: DateInput;
  daysOffset: number;
  hour: number;
  minute?: number;
  second?: number;
  timeZone?: string;
}): string {
  const baseDate = args.baseDate ?? new Date();
  const timeZone = args.timeZone ?? DEFAULT_TIME_ZONE;

  const baseParts = getTimeZoneParts(baseDate, { timeZone, includeSeconds: false, locale: "en-US" });

  // Add days in a calendar-safe way.
  const dayCursorUtc = new Date(Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + args.daysOffset));

  const utc = zonedTimeToUtc(
    {
      year: dayCursorUtc.getUTCFullYear(),
      month: dayCursorUtc.getUTCMonth() + 1,
      day: dayCursorUtc.getUTCDate(),
      hour: Math.max(0, Math.min(23, Math.floor(args.hour))),
      minute: Math.max(0, Math.min(59, Math.floor(args.minute ?? 0))),
      second: Math.max(0, Math.min(59, Math.floor(args.second ?? 0))),
    },
    timeZone
  );

  return utc.toISOString();
}

export function getHourInTimeZone(date: DateInput, timeZone: string): number {
  try {
    const parts = getTimeZoneParts(date, { timeZone, includeSeconds: false });
    return Number.isFinite(parts.hour) ? parts.hour : getDate(date).getHours();
  } catch {
    return getDate(date).getHours();
  }
}

export function getCasablancaHour(date: DateInput = new Date()): number {
  return getHourInTimeZone(date, DEFAULT_TIME_ZONE);
}

export function formatInTimeZone(
  input: DateInput,
  args: { timeZone?: string; locale?: string; options?: Intl.DateTimeFormatOptions }
): string {
  const date = getDate(input);
  const timeZone = args.timeZone ?? DEFAULT_TIME_ZONE;
  const locale = args.locale ?? DEFAULT_LOCALE;

  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    ...(args.options ?? {}),
  };

  return new Intl.DateTimeFormat(locale, options).format(date);
}

function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, "0");
}

function toValidDate(input: DateInput): Date | null {
  const d = getDate(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Date courte, format fixe: JJ/MM/AA (ex: 04/01/26)
 * - Affichée en timezone Africa/Casablanca par défaut.
 */
export function formatDateJjMmAa(input: DateInput, args?: { timeZone?: string }): string {
  const d = toValidDate(input);
  if (!d) return String(input);

  const parts = getTimeZoneParts(d, {
    timeZone: args?.timeZone ?? DEFAULT_TIME_ZONE,
    includeSeconds: false,
    locale: "en-US",
  });

  const yy = parts.year % 100;
  return `${pad2(parts.day)}/${pad2(parts.month)}/${pad2(yy)}`;
}

/**
 * Heure courte, format fixe: HHhMM (ex: 22h00)
 * - Affichée en timezone Africa/Casablanca par défaut.
 */
export function formatHeureHhHMM(input: DateInput, args?: { timeZone?: string }): string {
  const d = toValidDate(input);
  if (!d) return "";

  const parts = getTimeZoneParts(d, {
    timeZone: args?.timeZone ?? DEFAULT_TIME_ZONE,
    includeSeconds: false,
    locale: "en-US",
  });

  return `${pad2(parts.hour)}h${pad2(parts.minute)}`;
}

/**
 * Format complet: "le JJ/MM/AA à HHhMM" (ex: le 04/01/26 à 22h00)
 */
export function formatLeJjMmAaAHeure(input: DateInput, args?: { timeZone?: string }): string {
  const date = formatDateJjMmAa(input, args);
  const time = formatHeureHhHMM(input, args);
  return time ? `le ${date} à ${time}` : `le ${date}`;
}

/**
 * Convertit une heure "HH:mm" (valeurs issues des slots) en libellé "HHhMM".
 * (N'affecte pas les valeurs stockées / API, uniquement l'affichage.)
 */
export function formatTimeHmLabel(timeHm: string | null | undefined): string {
  const raw = String(timeHm ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return raw;
  const [hh, mm] = raw.split(":");
  return `${hh}h${mm}`;
}
