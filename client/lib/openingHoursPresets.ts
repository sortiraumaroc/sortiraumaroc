export type LegacyHoursDay = {
  lunch?: string;
  dinner?: string;
  closed?: boolean;
};

export type LegacyHours = Record<string, LegacyHoursDay>;

type Preset = "restaurant" | "daytime" | "culture" | "shopping";

const WEEK_KEYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

function makeAllDays(day: LegacyHoursDay): LegacyHours {
  return WEEK_KEYS.reduce((acc, k) => {
    acc[k] = { ...day };
    return acc;
  }, {} as LegacyHours);
}

export function makeLegacyHoursPreset(preset: Preset): LegacyHours {
  switch (preset) {
    case "restaurant": {
      return {
        lundi: { lunch: "12:00-15:00", dinner: "19:00-23:30" },
        mardi: { lunch: "12:00-15:00", dinner: "19:00-23:30" },
        mercredi: { lunch: "12:00-15:00", dinner: "19:00-23:30" },
        jeudi: { lunch: "12:00-15:00", dinner: "19:00-23:30" },
        vendredi: { lunch: "12:00-15:30", dinner: "19:00-00:00" },
        samedi: { lunch: "12:00-16:00", dinner: "19:00-00:00" },
        dimanche: { lunch: "12:00-15:00", dinner: "19:00-23:00" },
      };
    }
    case "shopping": {
      return {
        lundi: { lunch: "10:00-14:00", dinner: "15:30-20:00" },
        mardi: { lunch: "10:00-14:00", dinner: "15:30-20:00" },
        mercredi: { lunch: "10:00-14:00", dinner: "15:30-20:00" },
        jeudi: { lunch: "10:00-14:00", dinner: "15:30-20:00" },
        vendredi: { lunch: "10:00-14:00", dinner: "15:30-21:00" },
        samedi: { lunch: "10:00-14:30", dinner: "15:30-21:00" },
        dimanche: { closed: true },
      };
    }
    case "culture": {
      return {
        lundi: { lunch: "10:00-18:00" },
        mardi: { lunch: "10:00-18:00" },
        mercredi: { closed: true },
        jeudi: { lunch: "10:00-18:00" },
        vendredi: { lunch: "10:00-18:00" },
        samedi: { lunch: "10:00-18:30" },
        dimanche: { lunch: "10:00-18:00" },
      };
    }
    case "daytime": {
      return makeAllDays({ lunch: "10:00-17:00", dinner: "17:00-20:00" });
    }
  }
}
