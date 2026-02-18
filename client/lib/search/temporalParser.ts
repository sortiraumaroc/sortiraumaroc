/**
 * Temporal NLP parser for search queries.
 * Detects date/time expressions and person counts in natural language,
 * extracts them, and returns a clean query + resolved filters.
 *
 * Pure module — no React, no side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeSlot = "morning" | "lunch" | "afternoon" | "evening" | "night";

export interface TemporalIntent {
  date?: Date;
  timeSlot?: TimeSlot;
  timeRange?: { from: string; to: string };
  persons?: number;
  cleanQuery: string;
  chips: TemporalChip[];
}

export interface TemporalChip {
  id: "date" | "time" | "persons";
  label: string;
}

export interface TemporalSuggestion {
  label: string;
  intent: TemporalIntent;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_SLOT_RANGES: Record<TimeSlot, { from: string; to: string }> = {
  morning: { from: "08:00", to: "11:30" },
  lunch: { from: "11:30", to: "14:00" },
  afternoon: { from: "14:00", to: "18:00" },
  evening: { from: "18:00", to: "23:00" },
  night: { from: "23:00", to: "03:00" },
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function tomorrow(): Date {
  const d = today();
  d.setDate(d.getDate() + 1);
  return d;
}

function getNextDayOfWeek(targetDay: number): Date {
  const now = today();
  const currentDay = now.getDay();
  let diff = targetDay - currentDay;
  if (diff < 0) diff += 7;
  if (diff === 0) return now; // today is the target day
  const d = today();
  d.setDate(d.getDate() + diff);
  return d;
}

function getNextSaturday(): Date {
  const now = today();
  const day = now.getDay();
  // If already saturday(6) or sunday(0), return today
  if (day === 6 || day === 0) return now;
  return getNextDayOfWeek(6);
}

function getNowTimeRange(): { from: string; to: string } {
  const now = new Date();
  const fromH = String(now.getHours()).padStart(2, "0");
  const fromM = String(now.getMinutes()).padStart(2, "0");
  const toDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const toH = String(toDate.getHours()).padStart(2, "0");
  const toM = String(toDate.getMinutes()).padStart(2, "0");
  return { from: `${fromH}:${fromM}`, to: `${toH}:${toM}` };
}

export function formatTimeRange(from: string, to: string): string {
  const fmtHour = (t: string) => {
    const [h, m] = t.split(":");
    return m === "00" ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`;
  };
  return `${fmtHour(from)}-${fmtHour(to)}`;
}

// ---------------------------------------------------------------------------
// Pattern definition type
// ---------------------------------------------------------------------------

interface TemporalPattern {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => {
    date?: Date;
    timeSlot?: TimeSlot;
    timeRange?: { from: string; to: string };
    persons?: number;
  };
  label: (match: RegExpMatchArray) => string; // for suggestion display
}

// ---------------------------------------------------------------------------
// French patterns
// ---------------------------------------------------------------------------

const FR_DAY_NAMES: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0,
};

const FR_SLOT_NAMES: Record<string, TimeSlot> = {
  matin: "morning", midi: "lunch", "après-midi": "afternoon",
  "apres-midi": "afternoon", soir: "evening", nuit: "night",
};

const FR_PATTERNS: TemporalPattern[] = [
  // "demain soir/midi/matin"
  {
    pattern: /\bdemain\s+(matin|midi|soir|nuit|apr[eè]s[- ]midi)\b/i,
    resolve: (m) => {
      const slot = FR_SLOT_NAMES[m[1].toLowerCase().replace("è", "e")] ?? "evening";
      return { date: tomorrow(), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slot = FR_SLOT_NAMES[m[1].toLowerCase().replace("è", "e")] ?? "evening";
      return `Demain ${m[1].toLowerCase()} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
  // "ce soir"
  {
    pattern: /\bce\s+soir\b/i,
    resolve: () => ({ date: today(), timeSlot: "evening", timeRange: TIME_SLOT_RANGES.evening }),
    label: () => `Ce soir (${formatTimeRange("18:00", "23:00")})`,
  },
  // "ce midi"
  {
    pattern: /\bce\s+midi\b/i,
    resolve: () => ({ date: today(), timeSlot: "lunch", timeRange: TIME_SLOT_RANGES.lunch }),
    label: () => `Ce midi (${formatTimeRange("11:30", "14:00")})`,
  },
  // "ce week-end" / "ce weekend"
  {
    pattern: /\bce\s+week[- ]?end\b/i,
    resolve: () => ({ date: getNextSaturday() }),
    label: () => "Ce weekend",
  },
  // "cette semaine"
  {
    pattern: /\bcette\s+semaine\b/i,
    resolve: () => ({ date: today() }),
    label: () => "Cette semaine",
  },
  // Day name + slot: "samedi soir", "vendredi midi"
  {
    pattern: new RegExp(
      `\\b(${Object.keys(FR_DAY_NAMES).join("|")})\\s+(matin|midi|soir|nuit|apr[eè]s[- ]midi)\\b`,
      "i",
    ),
    resolve: (m) => {
      const dayNum = FR_DAY_NAMES[m[1].toLowerCase()];
      const slot = FR_SLOT_NAMES[m[2].toLowerCase().replace("è", "e")] ?? "evening";
      return { date: getNextDayOfWeek(dayNum), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slot = FR_SLOT_NAMES[m[2].toLowerCase().replace("è", "e")] ?? "evening";
      const cap = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      return `${cap} ${m[2].toLowerCase()} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
  // Day name alone: "samedi", "dimanche"
  {
    pattern: new RegExp(`\\b(${Object.keys(FR_DAY_NAMES).join("|")})\\b`, "i"),
    resolve: (m) => ({ date: getNextDayOfWeek(FR_DAY_NAMES[m[1].toLowerCase()]) }),
    label: (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(),
  },
  // "maintenant" / "tout de suite"
  {
    pattern: /\b(maintenant|tout\s+de\s+suite)\b/i,
    resolve: () => ({ date: today(), timeRange: getNowTimeRange() }),
    label: () => {
      const r = getNowTimeRange();
      return `Maintenant (${formatTimeRange(r.from, r.to)})`;
    },
  },
  // "demain" alone
  {
    pattern: /\bdemain\b/i,
    resolve: () => ({ date: tomorrow() }),
    label: () => "Demain",
  },
  // "aujourd'hui" / "aujourd hui"
  {
    pattern: /\baujourd[' ]?hui\b/i,
    resolve: () => ({ date: today() }),
    label: () => "Aujourd'hui",
  },
];

// Persons pattern FR
const FR_PERSONS_PATTERN = /\bpour\s+(\d{1,2})(?:\s+personnes?)?\b/i;

// ---------------------------------------------------------------------------
// English patterns
// ---------------------------------------------------------------------------

const EN_DAY_NAMES: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
};

const EN_SLOT_NAMES: Record<string, TimeSlot> = {
  morning: "morning", lunch: "lunch", afternoon: "afternoon",
  evening: "evening", night: "night", dinner: "evening", breakfast: "morning",
};

const EN_PATTERNS: TemporalPattern[] = [
  // "tomorrow evening/morning/night/lunch"
  {
    pattern: /\btomorrow\s+(morning|lunch|afternoon|evening|night|dinner|breakfast)\b/i,
    resolve: (m) => {
      const slot = EN_SLOT_NAMES[m[1].toLowerCase()] ?? "evening";
      return { date: tomorrow(), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slot = EN_SLOT_NAMES[m[1].toLowerCase()] ?? "evening";
      return `Tomorrow ${m[1].toLowerCase()} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
  // "tonight"
  {
    pattern: /\btonight\b/i,
    resolve: () => ({ date: today(), timeSlot: "evening", timeRange: TIME_SLOT_RANGES.evening }),
    label: () => `Tonight (${formatTimeRange("18:00", "23:00")})`,
  },
  // "this weekend"
  {
    pattern: /\bthis\s+weekend\b/i,
    resolve: () => ({ date: getNextSaturday() }),
    label: () => "This weekend",
  },
  // "this week"
  {
    pattern: /\bthis\s+week\b/i,
    resolve: () => ({ date: today() }),
    label: () => "This week",
  },
  // Day + slot: "saturday night", "friday evening"
  {
    pattern: new RegExp(
      `\\b(${Object.keys(EN_DAY_NAMES).join("|")})\\s+(morning|lunch|afternoon|evening|night|dinner|breakfast)\\b`,
      "i",
    ),
    resolve: (m) => {
      const dayNum = EN_DAY_NAMES[m[1].toLowerCase()];
      const slot = EN_SLOT_NAMES[m[2].toLowerCase()] ?? "evening";
      return { date: getNextDayOfWeek(dayNum), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slot = EN_SLOT_NAMES[m[2].toLowerCase()] ?? "evening";
      const cap = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      return `${cap} ${m[2].toLowerCase()} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
  // Day name alone
  {
    pattern: new RegExp(`\\b(${Object.keys(EN_DAY_NAMES).join("|")})\\b`, "i"),
    resolve: (m) => ({ date: getNextDayOfWeek(EN_DAY_NAMES[m[1].toLowerCase()]) }),
    label: (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(),
  },
  // "right now"
  {
    pattern: /\bright\s+now\b/i,
    resolve: () => ({ date: today(), timeRange: getNowTimeRange() }),
    label: () => {
      const r = getNowTimeRange();
      return `Right now (${formatTimeRange(r.from, r.to)})`;
    },
  },
  // "tomorrow" alone
  {
    pattern: /\btomorrow\b/i,
    resolve: () => ({ date: tomorrow() }),
    label: () => "Tomorrow",
  },
  // "today"
  {
    pattern: /\btoday\b/i,
    resolve: () => ({ date: today() }),
    label: () => "Today",
  },
  // Standalone slot words: "dinner", "lunch", "breakfast"
  {
    pattern: /\b(dinner|lunch|breakfast)\b/i,
    resolve: (m) => {
      const slot = EN_SLOT_NAMES[m[1].toLowerCase()] ?? "lunch";
      return { date: today(), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slot = EN_SLOT_NAMES[m[1].toLowerCase()] ?? "lunch";
      const cap = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      return `${cap} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
];

const EN_PERSONS_PATTERN = /\bfor\s+(\d{1,2})(?:\s+(?:people|persons?|guests?|pax))?\b/i;

// ---------------------------------------------------------------------------
// Spanish patterns
// ---------------------------------------------------------------------------

const ES_DAY_NAMES: Record<string, number> = {
  lunes: 1, martes: 2, "miércoles": 3, miercoles: 3, jueves: 4, viernes: 5, "sábado": 6, sabado: 6, domingo: 0,
};

const ES_PATTERNS: TemporalPattern[] = [
  {
    pattern: /\besta\s+noche\b/i,
    resolve: () => ({ date: today(), timeSlot: "evening", timeRange: TIME_SLOT_RANGES.evening }),
    label: () => `Esta noche (${formatTimeRange("18:00", "23:00")})`,
  },
  {
    pattern: /\bmañana\s+por\s+la\s+(noche|mañana|tarde)\b/i,
    resolve: (m) => {
      const slotMap: Record<string, TimeSlot> = { noche: "evening", "mañana": "morning", tarde: "afternoon" };
      const slot = slotMap[m[1].toLowerCase()] ?? "evening";
      return { date: tomorrow(), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slotMap: Record<string, TimeSlot> = { noche: "evening", "mañana": "morning", tarde: "afternoon" };
      const slot = slotMap[m[1].toLowerCase()] ?? "evening";
      return `Mañana por la ${m[1].toLowerCase()} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
  {
    pattern: /\beste\s+fin\s+de\s+semana\b/i,
    resolve: () => ({ date: getNextSaturday() }),
    label: () => "Este fin de semana",
  },
  {
    pattern: /\bahora\b/i,
    resolve: () => ({ date: today(), timeRange: getNowTimeRange() }),
    label: () => { const r = getNowTimeRange(); return `Ahora (${formatTimeRange(r.from, r.to)})`; },
  },
  {
    pattern: /\bmañana\b/i,
    resolve: () => ({ date: tomorrow() }),
    label: () => "Mañana",
  },
  {
    pattern: /\bhoy\b/i,
    resolve: () => ({ date: today() }),
    label: () => "Hoy",
  },
  {
    pattern: new RegExp(`\\b(${Object.keys(ES_DAY_NAMES).join("|")})\\b`, "i"),
    resolve: (m) => ({ date: getNextDayOfWeek(ES_DAY_NAMES[m[1].toLowerCase().replace(/[áé]/g, (c) => c === "á" ? "a" : "e")] ?? 0) }),
    label: (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(),
  },
];

const ES_PERSONS_PATTERN = /\bpara\s+(\d{1,2})(?:\s+personas?)?\b/i;

// ---------------------------------------------------------------------------
// Italian patterns
// ---------------------------------------------------------------------------

const IT_DAY_NAMES: Record<string, number> = {
  "lunedì": 1, lunedi: 1, "martedì": 2, martedi: 2, "mercoledì": 3, mercoledi: 3,
  "giovedì": 4, giovedi: 4, "venerdì": 5, venerdi: 5, sabato: 6, domenica: 0,
};

const IT_PATTERNS: TemporalPattern[] = [
  {
    pattern: /\bstasera\b/i,
    resolve: () => ({ date: today(), timeSlot: "evening", timeRange: TIME_SLOT_RANGES.evening }),
    label: () => `Stasera (${formatTimeRange("18:00", "23:00")})`,
  },
  {
    pattern: /\bdomani\s+(sera|mattina|pomeriggio)\b/i,
    resolve: (m) => {
      const slotMap: Record<string, TimeSlot> = { sera: "evening", mattina: "morning", pomeriggio: "afternoon" };
      const slot = slotMap[m[1].toLowerCase()] ?? "evening";
      return { date: tomorrow(), timeSlot: slot, timeRange: TIME_SLOT_RANGES[slot] };
    },
    label: (m) => {
      const slotMap: Record<string, TimeSlot> = { sera: "evening", mattina: "morning", pomeriggio: "afternoon" };
      const slot = slotMap[m[1].toLowerCase()] ?? "evening";
      return `Domani ${m[1].toLowerCase()} (${formatTimeRange(TIME_SLOT_RANGES[slot].from, TIME_SLOT_RANGES[slot].to)})`;
    },
  },
  {
    pattern: /\bquesto\s+weekend\b/i,
    resolve: () => ({ date: getNextSaturday() }),
    label: () => "Questo weekend",
  },
  {
    pattern: /\badesso\b/i,
    resolve: () => ({ date: today(), timeRange: getNowTimeRange() }),
    label: () => { const r = getNowTimeRange(); return `Adesso (${formatTimeRange(r.from, r.to)})`; },
  },
  {
    pattern: /\bdomani\b/i,
    resolve: () => ({ date: tomorrow() }),
    label: () => "Domani",
  },
  {
    pattern: /\boggi\b/i,
    resolve: () => ({ date: today() }),
    label: () => "Oggi",
  },
  {
    pattern: new RegExp(`\\b(${Object.keys(IT_DAY_NAMES).join("|")})\\b`, "i"),
    resolve: (m) => {
      const key = m[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return { date: getNextDayOfWeek(IT_DAY_NAMES[key] ?? 0) };
    },
    label: (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(),
  },
];

const IT_PERSONS_PATTERN = /\bper\s+(\d{1,2})(?:\s+persone?)?\b/i;

// ---------------------------------------------------------------------------
// Locale routing
// ---------------------------------------------------------------------------

function getPatternsForLocale(locale: string): {
  temporal: TemporalPattern[];
  persons: RegExp;
} {
  switch (locale) {
    case "en":
      return { temporal: EN_PATTERNS, persons: EN_PERSONS_PATTERN };
    case "es":
      return { temporal: ES_PATTERNS, persons: ES_PERSONS_PATTERN };
    case "it":
      return { temporal: IT_PATTERNS, persons: IT_PERSONS_PATTERN };
    case "ar":
      // Arabic users often understand French; combine FR + EN
      return {
        temporal: [...FR_PATTERNS, ...EN_PATTERNS],
        persons: new RegExp(`${FR_PERSONS_PATTERN.source}|${EN_PERSONS_PATTERN.source}`, "i"),
      };
    default: // "fr" and fallback
      return { temporal: FR_PATTERNS, persons: FR_PERSONS_PATTERN };
  }
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export function parseTemporalIntent(query: string, locale: string): TemporalIntent {
  const { temporal, persons } = getPatternsForLocale(locale);
  let working = query.trim();
  let date: Date | undefined;
  let timeSlot: TimeSlot | undefined;
  let timeRange: { from: string; to: string } | undefined;
  let personCount: number | undefined;
  const chips: TemporalChip[] = [];

  // 1. Try temporal patterns (first match wins — patterns are ordered by specificity)
  for (const p of temporal) {
    const match = working.match(p.pattern);
    if (match) {
      const resolved = p.resolve(match);
      date = resolved.date;
      timeSlot = resolved.timeSlot;
      timeRange = resolved.timeRange;
      // Remove matched text from query
      working = working.replace(p.pattern, " ").replace(/\s{2,}/g, " ").trim();
      break; // one temporal match only
    }
  }

  // 2. Try persons pattern
  const personsMatch = working.match(persons);
  if (personsMatch) {
    const n = parseInt(personsMatch[1], 10);
    if (n > 0 && n <= 99) {
      personCount = n;
      working = working.replace(persons, " ").replace(/\s{2,}/g, " ").trim();
    }
  }

  // 3. Build chips
  if (date && timeRange) {
    chips.push({ id: "date", label: `${formatDateShort(date, locale)} ${formatTimeRange(timeRange.from, timeRange.to)}` });
  } else if (date) {
    chips.push({ id: "date", label: formatDateShort(date, locale) });
  } else if (timeRange) {
    chips.push({ id: "time", label: formatTimeRange(timeRange.from, timeRange.to) });
  }
  if (personCount) {
    const pLabel = locale === "en" ? `${personCount} people`
      : locale === "es" ? `${personCount} personas`
      : locale === "it" ? `${personCount} persone`
      : `${personCount} personnes`;
    chips.push({ id: "persons", label: pLabel });
  }

  return { date, timeSlot, timeRange, persons: personCount, cleanQuery: working, chips };
}

// ---------------------------------------------------------------------------
// Suggestions (for autocomplete dropdown)
// ---------------------------------------------------------------------------

export function getTemporalSuggestions(query: string, locale: string): TemporalSuggestion[] {
  if (!query || query.length < 2) return [];

  const { temporal, persons } = getPatternsForLocale(locale);
  const suggestions: TemporalSuggestion[] = [];

  for (const p of temporal) {
    const match = query.match(p.pattern);
    if (match) {
      const resolved = p.resolve(match);
      const cleanQuery = query.replace(p.pattern, " ").replace(/\s{2,}/g, " ").trim();

      // Check persons in remaining
      let personCount: number | undefined;
      let finalClean = cleanQuery;
      const pm = cleanQuery.match(persons);
      if (pm) {
        const n = parseInt(pm[1], 10);
        if (n > 0 && n <= 99) {
          personCount = n;
          finalClean = cleanQuery.replace(persons, " ").replace(/\s{2,}/g, " ").trim();
        }
      }

      const chips: TemporalChip[] = [];
      if (resolved.date && resolved.timeRange) {
        chips.push({ id: "date", label: `${formatDateShort(resolved.date, locale)} ${formatTimeRange(resolved.timeRange.from, resolved.timeRange.to)}` });
      } else if (resolved.date) {
        chips.push({ id: "date", label: formatDateShort(resolved.date, locale) });
      }
      if (personCount) {
        chips.push({ id: "persons", label: `${personCount}` });
      }

      suggestions.push({
        label: p.label(match),
        intent: {
          date: resolved.date,
          timeSlot: resolved.timeSlot,
          timeRange: resolved.timeRange,
          persons: personCount,
          cleanQuery: finalClean,
          chips,
        },
      });
      break; // one suggestion per query
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function formatDateShort(date: Date, locale: string): string {
  const now = today();
  const tom = tomorrow();

  if (date.getTime() === now.getTime()) {
    return locale === "en" ? "Today" : locale === "es" ? "Hoy" : locale === "it" ? "Oggi" : "Aujourd'hui";
  }
  if (date.getTime() === tom.getTime()) {
    return locale === "en" ? "Tomorrow" : locale === "es" ? "Mañana" : locale === "it" ? "Domani" : "Demain";
  }

  // Short day + date
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  const intlLocale = locale === "ar" ? "ar-MA" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "en" ? "en-US" : "fr-FR";
  return date.toLocaleDateString(intlLocale, opts);
}

/** Format a chip label for Results.tsx from URL params */
export function formatTemporalChipLabel(
  dateStr: string,
  timeFrom: string,
  timeTo: string,
  locale: string,
): string {
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return dateStr;

  let label = formatDateShort(date, locale);
  if (timeFrom && timeTo) {
    label += `, ${formatTimeRange(timeFrom, timeTo)}`;
  }
  return label;
}
