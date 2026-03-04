/**
 * Transformation bidirectionnelle des horaires d'ouverture.
 *
 * Trois formats coexistent :
 *
 * 1. **DaySchedule v1** (ancien format wizard / formulaire admin) :
 *    { monday: { open: true, continuous: false, openTime1: "12:00", closeTime1: "15:00", openTime2: "19:00", closeTime2: "23:30" } }
 *
 * 2. **DaySchedule v2** (format wizard actuel — WizardStepHours) :
 *    { monday: { open: true, mode: "coupure", ranges: [{ from: "12:00", to: "15:00" }, { from: "19:00", to: "23:30" }] } }
 *
 * 3. **OpeningHours** (format DB / front public) :
 *    { monday: [{ type: "lunch", from: "12:00", to: "15:00" }, { type: "dinner", from: "19:00", to: "23:30" }] }
 */

type OpeningInterval = { type: string; from: string; to: string };

/**
 * Transforme le format wizard DaySchedule (v1 ou v2) → format openingHours (tableaux d'intervalles).
 * Idempotent : si les données sont déjà au format tableau, elles sont retournées telles quelles.
 */
export function transformWizardHoursToOpeningHours(
  rawHours: Record<string, unknown>,
): Record<string, OpeningInterval[]> {
  const transformed: Record<string, OpeningInterval[]> = {};

  for (const [dayKey, schedule] of Object.entries(rawHours)) {
    if (!schedule || typeof schedule !== "object") continue;

    // Already in array format → keep as-is (idempotent)
    if (Array.isArray(schedule)) {
      transformed[dayKey] = schedule.filter(
        (s: unknown): s is OpeningInterval =>
          s != null &&
          typeof s === "object" &&
          "from" in (s as Record<string, unknown>) &&
          "to" in (s as Record<string, unknown>),
      );
      continue;
    }

    // DaySchedule format (v1 or v2) → transform
    const s = schedule as Record<string, unknown>;
    if (!s.open) {
      transformed[dayKey] = [];
      continue;
    }

    const intervals: OpeningInterval[] = [];

    // ── v2 format: mode + ranges ──
    if (Array.isArray(s.ranges)) {
      const validRanges = (s.ranges as unknown[]).filter(
        (r): r is { from: string; to: string } =>
          r != null &&
          typeof r === "object" &&
          typeof (r as Record<string, unknown>).from === "string" &&
          typeof (r as Record<string, unknown>).to === "string" &&
          (r as Record<string, unknown>).from !== "" &&
          (r as Record<string, unknown>).to !== "",
      );
      const types = ["lunch", "dinner"];
      validRanges.forEach((r, i) => {
        intervals.push({ type: types[i] ?? "lunch", from: r.from, to: r.to });
      });
    } else {
      // ── v1 format: continuous + openTime1/closeTime1/openTime2/closeTime2 ──
      const t1From = typeof s.openTime1 === "string" ? s.openTime1 : "";
      const t1To = typeof s.closeTime1 === "string" ? s.closeTime1 : "";

      if (s.continuous) {
        if (t1From && t1To) intervals.push({ type: "lunch", from: t1From, to: t1To });
      } else {
        if (t1From && t1To) intervals.push({ type: "lunch", from: t1From, to: t1To });
        const t2From = typeof s.openTime2 === "string" ? s.openTime2 : "";
        const t2To = typeof s.closeTime2 === "string" ? s.closeTime2 : "";
        if (t2From && t2To) intervals.push({ type: "dinner", from: t2From, to: t2To });
      }
    }

    transformed[dayKey] = intervals;
  }

  return transformed;
}

/**
 * DaySchedule unifié — contient les champs v1 (pour AdminContactInfoCard) et v2 (pour WizardStepHours).
 * Les deux composants peuvent lire ce format sans modification.
 */
type DayScheduleUnified = {
  open: boolean;
  // v2 fields (WizardStepHours)
  mode: "continu" | "coupure";
  ranges: { from: string; to: string }[];
  // v1 fields (AdminContactInfoCard)
  continuous: boolean;
  openTime1: string;
  closeTime1: string;
  openTime2?: string;
  closeTime2?: string;
};

function buildUnifiedSchedule(
  open: boolean,
  ranges: { from: string; to: string }[],
): DayScheduleUnified {
  const isContinuous = ranges.length <= 1;
  return {
    open,
    // v2
    mode: isContinuous ? "continu" : "coupure",
    ranges: ranges.length > 0 ? ranges : [{ from: "09:00", to: "18:00" }],
    // v1
    continuous: isContinuous,
    openTime1: ranges[0]?.from ?? "09:00",
    closeTime1: ranges[0]?.to ?? "18:00",
    ...(ranges.length > 1
      ? { openTime2: ranges[1].from, closeTime2: ranges[1].to }
      : {}),
  };
}

/**
 * Convertit le format openingHours (tableaux) → format DaySchedule unifié (pour les formulaires admin).
 * Idempotent : si les données sont déjà au format DaySchedule (v1 ou v2), elles sont normalisées
 * au format unifié.
 */
export function openingHoursToWizardFormat(
  hours: Record<string, unknown>,
): Record<string, DayScheduleUnified> {
  const result: Record<string, DayScheduleUnified> = {};

  for (const [dayKey, value] of Object.entries(hours)) {
    // Already in DaySchedule object format (has the 'open' property)
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "open" in (value as Record<string, unknown>)
    ) {
      const obj = value as Record<string, unknown>;
      const isOpen = !!obj.open;

      // v2 format (has 'ranges')
      if (Array.isArray(obj.ranges)) {
        const ranges = (obj.ranges as unknown[])
          .filter(
            (r): r is { from: string; to: string } =>
              r != null && typeof r === "object" &&
              typeof (r as Record<string, unknown>).from === "string" &&
              typeof (r as Record<string, unknown>).to === "string",
          )
          .map((r) => ({ from: r.from, to: r.to }));
        result[dayKey] = buildUnifiedSchedule(isOpen, ranges);
        continue;
      }

      // v1 format (continuous/openTime1/closeTime1)
      const ranges: { from: string; to: string }[] = [];
      const t1From = typeof obj.openTime1 === "string" ? obj.openTime1 : "";
      const t1To = typeof obj.closeTime1 === "string" ? obj.closeTime1 : "";
      if (t1From && t1To) ranges.push({ from: t1From, to: t1To });
      if (!obj.continuous) {
        const t2From = typeof obj.openTime2 === "string" ? obj.openTime2 : "";
        const t2To = typeof obj.closeTime2 === "string" ? obj.closeTime2 : "";
        if (t2From && t2To) ranges.push({ from: t2From, to: t2To });
      }
      result[dayKey] = buildUnifiedSchedule(isOpen, ranges);
      continue;
    }

    // Array of intervals → convert to unified DaySchedule
    if (Array.isArray(value)) {
      const intervals = value.filter(
        (v: unknown): v is { from: string; to: string } =>
          v != null && typeof v === "object" && "from" in (v as Record<string, unknown>) && "to" in (v as Record<string, unknown>),
      );

      if (intervals.length === 0) {
        result[dayKey] = buildUnifiedSchedule(false, []);
        continue;
      }

      result[dayKey] = buildUnifiedSchedule(
        true,
        intervals.map((i) => ({ from: i.from, to: i.to })),
      );
    }
  }

  return result;
}
