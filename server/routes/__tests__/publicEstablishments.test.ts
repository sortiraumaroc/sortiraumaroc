import { describe, it, expect, vi } from "vitest";

// Mock heavy dependencies so we can import the module without Supabase, etc.
vi.mock("../../lib/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../publicHelpers", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getAdminSupabase: vi.fn(() => ({})),
    getUserFromBearerToken: vi.fn(),
  };
});

vi.mock("../../lib/userPreferences", () => ({
  loadOrComputePreferences: vi.fn(),
  applyPersonalizationBonus: vi.fn(),
}));

vi.mock("../../platformSettings", () => ({
  getRamadanConfig: vi.fn(),
}));

vi.mock("../../lib/searchFallback", () => ({
  generateSearchFallback: vi.fn(),
}));

vi.mock("../../lib/search/contextualBoosting", () => ({
  getContextualBoostsForNow: vi.fn(() => []),
  applyContextualBoosting: vi.fn((items: unknown[]) => items),
}));

import {
  normalizePublicUniverseAliases,
  normalizeSearchTerm,
  parseFloatSafe,
  hasFiniteCoords,
  haversineKm,
  isCurrentlyOpen,
  getCurrentTheme,
  normalizeKind,
  sameText,
} from "../publicEstablishments";

// =============================================================================
// normalizePublicUniverseAliases
// =============================================================================

describe("normalizePublicUniverseAliases", () => {
  it("should map 'restaurants' to ['restaurant']", () => {
    expect(normalizePublicUniverseAliases("restaurants")).toEqual(["restaurant"]);
  });

  it("should map 'restaurant' to ['restaurant']", () => {
    expect(normalizePublicUniverseAliases("restaurant")).toEqual(["restaurant"]);
  });

  it("should map 'hotels' and 'hotel' to ['hebergement']", () => {
    expect(normalizePublicUniverseAliases("hotels")).toEqual(["hebergement"]);
    expect(normalizePublicUniverseAliases("hotel")).toEqual(["hebergement"]);
  });

  it("should map 'loisirs' and 'sport' to ['loisir']", () => {
    expect(normalizePublicUniverseAliases("loisirs")).toEqual(["loisir"]);
    expect(normalizePublicUniverseAliases("sport")).toEqual(["loisir"]);
  });

  it("should map 'shopping' to [] (no filter)", () => {
    expect(normalizePublicUniverseAliases("shopping")).toEqual([]);
  });

  it("should be case-insensitive", () => {
    expect(normalizePublicUniverseAliases("RESTAURANT")).toEqual(["restaurant"]);
    expect(normalizePublicUniverseAliases("Wellness")).toEqual(["wellness"]);
    expect(normalizePublicUniverseAliases("  HOTELS  ")).toEqual(["hebergement"]);
  });

  it("should return [] for empty/null/undefined inputs", () => {
    expect(normalizePublicUniverseAliases("")).toEqual([]);
    expect(normalizePublicUniverseAliases(null)).toEqual([]);
    expect(normalizePublicUniverseAliases(undefined)).toEqual([]);
    expect(normalizePublicUniverseAliases("   ")).toEqual([]);
  });

  it("should return [] for unknown universe names not in allowed set", () => {
    expect(normalizePublicUniverseAliases("nightlife")).toEqual([]);
    expect(normalizePublicUniverseAliases("unknown")).toEqual([]);
  });

  it("should return [] for non-string inputs", () => {
    expect(normalizePublicUniverseAliases(123)).toEqual([]);
    expect(normalizePublicUniverseAliases({})).toEqual([]);
    expect(normalizePublicUniverseAliases(true)).toEqual([]);
  });

  it("should handle 'rentacar' universe", () => {
    expect(normalizePublicUniverseAliases("rentacar")).toEqual(["rentacar"]);
  });

  it("should handle 'culture' universe", () => {
    expect(normalizePublicUniverseAliases("culture")).toEqual(["culture"]);
  });
});

// =============================================================================
// normalizeSearchTerm
// =============================================================================

describe("normalizeSearchTerm", () => {
  it("should lowercase the input", () => {
    expect(normalizeSearchTerm("Hello WORLD")).toBe("hello world");
  });

  it("should remove diacritics/accents", () => {
    expect(normalizeSearchTerm("Café Étoile")).toBe("cafe etoile");
    expect(normalizeSearchTerm("crêperie océane")).toBe("creperie oceane");
  });

  it("should remove punctuation", () => {
    expect(normalizeSearchTerm("l'art & la manière!")).toBe("lart la maniere");
  });

  it("should collapse whitespace", () => {
    expect(normalizeSearchTerm("  foo   bar  baz  ")).toBe("foo bar baz");
  });

  it("should handle empty string", () => {
    expect(normalizeSearchTerm("")).toBe("");
  });

  it("should handle only-punctuation input", () => {
    expect(normalizeSearchTerm("!@#$%")).toBe("");
  });

  it("should strip Arabic text (non-\\w characters removed by regex)", () => {
    // The regex [^\w\s] removes non-ASCII characters because \w only matches [a-zA-Z0-9_]
    const result = normalizeSearchTerm("مطعم");
    expect(result).toBe("");
  });

  it("should handle mixed accented and normal characters", () => {
    expect(normalizeSearchTerm("résumé")).toBe("resume");
  });
});

// =============================================================================
// parseFloatSafe
// =============================================================================

describe("parseFloatSafe", () => {
  it("should return the number for finite numbers", () => {
    expect(parseFloatSafe(42)).toBe(42);
    expect(parseFloatSafe(3.14)).toBe(3.14);
    expect(parseFloatSafe(-7.5)).toBe(-7.5);
    expect(parseFloatSafe(0)).toBe(0);
  });

  it("should parse numeric strings", () => {
    expect(parseFloatSafe("42")).toBe(42);
    expect(parseFloatSafe("3.14")).toBe(3.14);
    expect(parseFloatSafe("  -7.5  ")).toBe(-7.5);
  });

  it("should return null for non-numeric strings", () => {
    expect(parseFloatSafe("hello")).toBeNull();
    expect(parseFloatSafe("")).toBeNull();
    expect(parseFloatSafe("   ")).toBeNull();
  });

  it("should return null for Infinity and NaN", () => {
    expect(parseFloatSafe(Infinity)).toBeNull();
    expect(parseFloatSafe(-Infinity)).toBeNull();
    expect(parseFloatSafe(NaN)).toBeNull();
  });

  it("should return null for non-string/non-number types", () => {
    expect(parseFloatSafe(null)).toBeNull();
    expect(parseFloatSafe(undefined)).toBeNull();
    expect(parseFloatSafe({})).toBeNull();
    expect(parseFloatSafe([])).toBeNull();
    expect(parseFloatSafe(true)).toBeNull();
  });
});

// =============================================================================
// hasFiniteCoords
// =============================================================================

describe("hasFiniteCoords", () => {
  it("should return true for valid finite coordinates", () => {
    expect(hasFiniteCoords(33.5731, -7.5898)).toBe(true);
    expect(hasFiniteCoords(0, 0)).toBe(true);
    expect(hasFiniteCoords(-90, 180)).toBe(true);
  });

  it("should return false when lat is null", () => {
    expect(hasFiniteCoords(null, -7.5898)).toBe(false);
  });

  it("should return false when lng is null", () => {
    expect(hasFiniteCoords(33.5731, null)).toBe(false);
  });

  it("should return false when both are null", () => {
    expect(hasFiniteCoords(null, null)).toBe(false);
  });

  it("should return false for Infinity values", () => {
    expect(hasFiniteCoords(Infinity, 0)).toBe(false);
    expect(hasFiniteCoords(0, -Infinity)).toBe(false);
  });

  it("should return false for NaN values", () => {
    expect(hasFiniteCoords(NaN, 0)).toBe(false);
    expect(hasFiniteCoords(0, NaN)).toBe(false);
  });
});

// =============================================================================
// haversineKm
// =============================================================================

describe("haversineKm", () => {
  it("should return 0 for the same point", () => {
    const point = { lat: 33.5731, lng: -7.5898 };
    expect(haversineKm(point, point)).toBe(0);
  });

  it("should calculate Paris to London distance (~343 km)", () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const london = { lat: 51.5074, lng: -0.1278 };
    const dist = haversineKm(paris, london);
    // Known distance is approximately 343 km
    expect(dist).toBeGreaterThan(330);
    expect(dist).toBeLessThan(360);
  });

  it("should calculate Casablanca to Marrakech distance (~240 km)", () => {
    const casablanca = { lat: 33.5731, lng: -7.5898 };
    const marrakech = { lat: 31.6295, lng: -7.9811 };
    const dist = haversineKm(casablanca, marrakech);
    expect(dist).toBeGreaterThan(200);
    expect(dist).toBeLessThan(260);
  });

  it("should be symmetric (A->B same as B->A)", () => {
    const a = { lat: 48.8566, lng: 2.3522 };
    const b = { lat: 40.4168, lng: -3.7038 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("should handle antipodal points (~20000 km)", () => {
    const north = { lat: 0, lng: 0 };
    const south = { lat: 0, lng: 180 };
    const dist = haversineKm(north, south);
    // Half the Earth's circumference ~ 20015 km
    expect(dist).toBeGreaterThan(19000);
    expect(dist).toBeLessThan(21000);
  });

  it("should handle equator coordinates", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 1 };
    const dist = haversineKm(a, b);
    // 1 degree of longitude at equator ~ 111.32 km
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(113);
  });
});

// =============================================================================
// isCurrentlyOpen
// =============================================================================

describe("isCurrentlyOpen", () => {
  // Use array format (already-transformed OpeningHours format) to avoid
  // depending on transformWizardHoursToOpeningHours internals.
  it("should return true when current time is within an opening interval", () => {
    // Wednesday at 13:00
    const now = new Date("2026-02-25T13:00:00"); // Wednesday
    const hours = {
      wednesday: [{ type: "lunch", from: "12:00", to: "15:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(true);
  });

  it("should return false when current time is outside opening intervals", () => {
    // Wednesday at 16:00 (after lunch closes at 15:00)
    const now = new Date("2026-02-25T16:00:00");
    const hours = {
      wednesday: [{ type: "lunch", from: "12:00", to: "15:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(false);
  });

  it("should return false for null/undefined hours", () => {
    const now = new Date("2026-02-25T13:00:00");
    expect(isCurrentlyOpen(null, now)).toBe(false);
    expect(isCurrentlyOpen(undefined, now)).toBe(false);
  });

  it("should return false for non-object hours", () => {
    const now = new Date("2026-02-25T13:00:00");
    expect(isCurrentlyOpen("not an object", now)).toBe(false);
    expect(isCurrentlyOpen(42, now)).toBe(false);
  });

  it("should return false for a day with no intervals", () => {
    // Wednesday but only Monday hours defined
    const now = new Date("2026-02-25T13:00:00"); // Wednesday
    const hours = {
      monday: [{ type: "lunch", from: "12:00", to: "15:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(false);
  });

  it("should handle overnight intervals (e.g. 22:00 - 02:00)", () => {
    // Wednesday at 23:00 — within overnight interval
    const now = new Date("2026-02-25T23:00:00"); // Wednesday
    const hours = {
      wednesday: [{ type: "dinner", from: "22:00", to: "02:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(true);
  });

  it("should handle overnight intervals early morning side", () => {
    // Wednesday at 01:00 — within overnight interval (early side)
    const now = new Date("2026-02-25T01:00:00"); // Wednesday
    const hours = {
      wednesday: [{ type: "dinner", from: "22:00", to: "02:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(true);
  });

  it("should handle French day keys", () => {
    // Wednesday at 13:00
    const now = new Date("2026-02-25T13:00:00"); // Wednesday
    const hours = {
      mercredi: [{ type: "lunch", from: "12:00", to: "15:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(true);
  });

  it("should handle multiple intervals per day", () => {
    // Wednesday at 20:00 — within dinner interval
    const now = new Date("2026-02-25T20:00:00"); // Wednesday
    const hours = {
      wednesday: [
        { type: "lunch", from: "12:00", to: "15:00" },
        { type: "dinner", from: "19:00", to: "23:00" },
      ],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(true);
  });

  it("should return false for empty hours object", () => {
    const now = new Date("2026-02-25T13:00:00");
    expect(isCurrentlyOpen({}, now)).toBe(false);
  });

  it("should return false at the exact closing time (exclusive end)", () => {
    // Wednesday at exactly 15:00 — interval is 12:00-15:00, end is exclusive
    const now = new Date("2026-02-25T15:00:00"); // Wednesday
    const hours = {
      wednesday: [{ type: "lunch", from: "12:00", to: "15:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(false);
  });

  it("should return true at the exact opening time (inclusive start)", () => {
    // Wednesday at exactly 12:00 — interval starts at 12:00
    const now = new Date("2026-02-25T12:00:00"); // Wednesday
    const hours = {
      wednesday: [{ type: "lunch", from: "12:00", to: "15:00" }],
    };
    expect(isCurrentlyOpen(hours, now)).toBe(true);
  });
});

// =============================================================================
// getCurrentTheme
// =============================================================================

describe("getCurrentTheme", () => {
  it("should return 'ftour_shour' during Ramadan (DB config)", () => {
    const now = new Date("2026-03-01T12:00:00");
    const ramadanConfig = { enabled: true, start_date: "2026-02-28", end_date: "2026-03-30" };
    const result = getCurrentTheme(now, ramadanConfig);
    expect(result.key).toBe("ftour_shour");
    expect(result.tags).toContain("ftour");
    expect(result.tags).toContain("ramadan");
  });

  it("should return 'romantic' on Friday evening (>= 18h)", () => {
    // Friday at 20:00
    const now = new Date("2026-02-27T20:00:00"); // Friday
    expect(now.getDay()).toBe(5); // Verify it's Friday
    const result = getCurrentTheme(now);
    expect(result.key).toBe("romantic");
  });

  it("should return 'romantic' on Saturday evening (>= 18h)", () => {
    // Saturday at 21:00
    const now = new Date("2026-02-28T21:00:00"); // Saturday
    expect(now.getDay()).toBe(6); // Verify it's Saturday
    const result = getCurrentTheme(now);
    expect(result.key).toBe("romantic");
  });

  it("should return 'brunch' on Saturday morning (7h-14h)", () => {
    // Saturday at 10:00
    const now = new Date("2026-02-28T10:00:00"); // Saturday
    expect(now.getDay()).toBe(6);
    const result = getCurrentTheme(now);
    expect(result.key).toBe("brunch");
    expect(result.tags).toContain("brunch");
  });

  it("should return 'brunch' on Sunday morning (7h-14h)", () => {
    // Sunday at 9:00
    const now = new Date("2026-03-01T09:00:00"); // Sunday
    expect(now.getDay()).toBe(0);
    const result = getCurrentTheme(now);
    expect(result.key).toBe("brunch");
  });

  it("should return 'lunch' on weekday at noon (Mon-Fri, 11h-15h)", () => {
    // Wednesday at 12:30
    const now = new Date("2026-02-25T12:30:00"); // Wednesday
    expect(now.getDay()).toBe(3);
    const result = getCurrentTheme(now);
    expect(result.key).toBe("lunch");
    expect(result.tags).toContain("lunch");
  });

  it("should return null for times with no theme", () => {
    // Wednesday at 08:00 (too early for lunch, not weekend)
    const now = new Date("2026-02-25T08:00:00"); // Wednesday
    expect(now.getDay()).toBe(3);
    const result = getCurrentTheme(now);
    expect(result.key).toBeNull();
    expect(result.tags).toEqual([]);
  });

  it("should return null when Ramadan config is disabled", () => {
    const now = new Date("2026-03-01T08:00:00"); // Sunday morning = brunch normally
    const ramadanConfig = { enabled: false, start_date: "2026-02-28", end_date: "2026-03-30" };
    const result = getCurrentTheme(now, ramadanConfig);
    // Should not be ftour_shour because disabled
    expect(result.key).toBe("brunch"); // Sunday morning fallback
  });

  it("should prioritize Ramadan over other themes", () => {
    // Friday evening during Ramadan -> should be ftour_shour, not romantic
    const now = new Date("2026-03-06T20:00:00"); // Friday
    const ramadanConfig = { enabled: true, start_date: "2026-02-28", end_date: "2026-03-30" };
    const result = getCurrentTheme(now, ramadanConfig);
    expect(result.key).toBe("ftour_shour");
  });
});

// =============================================================================
// normalizeKind
// =============================================================================

describe("normalizeKind", () => {
  it("should return the kind for valid curation kinds", () => {
    expect(normalizeKind("best_deals")).toBe("best_deals");
    expect(normalizeKind("open_now")).toBe("open_now");
    expect(normalizeKind("trending")).toBe("trending");
    expect(normalizeKind("top_rated")).toBe("top_rated");
    expect(normalizeKind("near_you")).toBe("near_you");
    expect(normalizeKind("new_establishments")).toBe("new_establishments");
  });

  it("should be case-insensitive", () => {
    expect(normalizeKind("BEST_DEALS")).toBe("best_deals");
    expect(normalizeKind("Open_Now")).toBe("open_now");
  });

  it("should trim whitespace", () => {
    expect(normalizeKind("  trending  ")).toBe("trending");
  });

  it("should return null for invalid kinds", () => {
    expect(normalizeKind("invalid_kind")).toBeNull();
    expect(normalizeKind("random")).toBeNull();
  });

  it("should return null for empty/null/undefined inputs", () => {
    expect(normalizeKind("")).toBeNull();
    expect(normalizeKind(null)).toBeNull();
    expect(normalizeKind(undefined)).toBeNull();
    expect(normalizeKind("   ")).toBeNull();
  });

  it("should return null for non-string types", () => {
    expect(normalizeKind(123)).toBeNull();
    expect(normalizeKind(true)).toBeNull();
    expect(normalizeKind({})).toBeNull();
  });
});

// =============================================================================
// sameText
// =============================================================================

describe("sameText", () => {
  it("should return true for identical strings", () => {
    expect(sameText("hello", "hello")).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(sameText("Hello", "hello")).toBe(true);
    expect(sameText("HELLO", "hello")).toBe(true);
  });

  it("should trim whitespace", () => {
    expect(sameText("  hello  ", "hello")).toBe(true);
    expect(sameText("hello", "  hello  ")).toBe(true);
  });

  it("should return false for different strings", () => {
    expect(sameText("hello", "world")).toBe(false);
  });

  it("should return false when either is null/undefined/empty", () => {
    expect(sameText(null, "hello")).toBe(false);
    expect(sameText("hello", null)).toBe(false);
    expect(sameText(null, null)).toBe(false);
    expect(sameText(undefined, undefined)).toBe(false);
    expect(sameText("", "hello")).toBe(false);
    expect(sameText("hello", "")).toBe(false);
    expect(sameText("   ", "hello")).toBe(false);
  });
});
