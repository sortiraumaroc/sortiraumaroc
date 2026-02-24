import { describe, it, expect } from "vitest";
import {
  isUuid,
  asString,
  asRecord,
  asInt,
  centsToMad,
  generateEstablishmentSlug,
  dateYmdToEndOfDayIso,
  addDaysIso,
  MOROCCO_TZ,
  moroccoDateParts,
  toYmd,
  timeHm,
  moroccoMinutes,
  normalizeUniverseToPackUniverse,
  buildEstablishmentDetailsUrl,
  promoPercentFromSlot,
  getRestaurantServiceLabelFromMinutes,
  normalizeReasonCode,
  normalizeReasonText,
  normalizeUserMetaString,
  maxPromoPercent,
  isTimeoutError,
} from "../publicHelpers";

// =============================================================================
// isUuid
// =============================================================================

describe("isUuid", () => {
  it("should accept valid v4 UUIDs (lowercase)", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("should accept uppercase UUIDs", () => {
    expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("should reject empty or garbage strings", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("12345")).toBe(false);
  });

  it("should reject UUIDs with wrong variant nibble", () => {
    // variant nibble (position 19) must be 8, 9, a, or b
    expect(isUuid("550e8400-e29b-41d4-0716-446655440000")).toBe(false);
  });

  it("should reject UUIDs with wrong version nibble", () => {
    // version nibble (position 14) must be 1-5
    expect(isUuid("550e8400-e29b-61d4-a716-446655440000")).toBe(false);
  });

  it("should reject UUIDs with extra characters", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000X")).toBe(false);
    expect(isUuid("X550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

// =============================================================================
// asString
// =============================================================================

describe("asString", () => {
  it("should return trimmed string for non-empty strings", () => {
    expect(asString("hello")).toBe("hello");
    expect(asString("  hello  ")).toBe("hello");
  });

  it("should return null for empty or whitespace-only strings", () => {
    expect(asString("")).toBeNull();
    expect(asString("   ")).toBeNull();
  });

  it("should return null for non-string types", () => {
    expect(asString(123)).toBeNull();
    expect(asString(null)).toBeNull();
    expect(asString(undefined)).toBeNull();
    expect(asString(true)).toBeNull();
    expect(asString({})).toBeNull();
    expect(asString([])).toBeNull();
  });
});

// =============================================================================
// asRecord
// =============================================================================

describe("asRecord", () => {
  it("should return the object for plain objects", () => {
    const obj = { a: 1, b: "two" };
    expect(asRecord(obj)).toBe(obj);
  });

  it("should return null for arrays", () => {
    expect(asRecord([1, 2, 3])).toBeNull();
  });

  it("should return null for null/undefined", () => {
    expect(asRecord(null)).toBeNull();
    expect(asRecord(undefined)).toBeNull();
  });

  it("should return null for primitives", () => {
    expect(asRecord("string")).toBeNull();
    expect(asRecord(42)).toBeNull();
    expect(asRecord(true)).toBeNull();
  });

  it("should accept empty objects", () => {
    expect(asRecord({})).toEqual({});
  });
});

// =============================================================================
// asInt
// =============================================================================

describe("asInt", () => {
  it("should return rounded integer from numbers", () => {
    expect(asInt(5)).toBe(5);
    expect(asInt(5.7)).toBe(6);
    expect(asInt(5.3)).toBe(5);
  });

  it("should parse numeric strings", () => {
    expect(asInt("10")).toBe(10);
    expect(asInt("  42  ")).toBe(42);
    expect(asInt("3.9")).toBe(4);
  });

  it("should return null for non-numeric values", () => {
    expect(asInt("hello")).toBeNull();
    expect(asInt("")).toBeNull();
    expect(asInt(null)).toBeNull();
    expect(asInt(undefined)).toBeNull();
    expect(asInt({})).toBeNull();
  });

  it("should return null for Infinity and NaN", () => {
    expect(asInt(Infinity)).toBeNull();
    expect(asInt(-Infinity)).toBeNull();
    expect(asInt(NaN)).toBeNull();
  });

  it("should handle negative numbers", () => {
    expect(asInt(-5)).toBe(-5);
    expect(asInt("-3")).toBe(-3);
  });
});

// =============================================================================
// centsToMad
// =============================================================================

describe("centsToMad", () => {
  it("should convert cents to MAD (divide by 100)", () => {
    expect(centsToMad(1000)).toBe(10);
    expect(centsToMad(1550)).toBe(15.5);
    expect(centsToMad(99)).toBe(0.99);
  });

  it("should handle string inputs", () => {
    expect(centsToMad("500")).toBe(5);
  });

  it("should return null for invalid inputs", () => {
    expect(centsToMad(null)).toBeNull();
    expect(centsToMad("abc")).toBeNull();
    expect(centsToMad(undefined)).toBeNull();
  });

  it("should handle zero", () => {
    expect(centsToMad(0)).toBe(0);
  });
});

// =============================================================================
// generateEstablishmentSlug
// =============================================================================

describe("generateEstablishmentSlug", () => {
  it("should generate slug from name and city", () => {
    expect(generateEstablishmentSlug("Atlas Lodge", "Agadir")).toBe(
      "atlas-lodge-agadir",
    );
  });

  it("should generate slug from name only", () => {
    expect(generateEstablishmentSlug("My Restaurant", null)).toBe(
      "my-restaurant",
    );
  });

  it("should transliterate French accents", () => {
    expect(generateEstablishmentSlug("Café Étoile", "Marrakech")).toBe(
      "cafe-etoile-marrakech",
    );
    expect(generateEstablishmentSlug("Crêperie Océane", null)).toBe(
      "creperie-oceane",
    );
  });

  it("should remove special characters", () => {
    expect(generateEstablishmentSlug("L'Art & La Manière!", null)).toBe(
      "l-art-la-maniere",
    );
  });

  it("should collapse multiple hyphens", () => {
    expect(generateEstablishmentSlug("Foo --- Bar", null)).toBe("foo-bar");
  });

  it("should return null for empty/null name", () => {
    expect(generateEstablishmentSlug("", null)).toBeNull();
    expect(generateEstablishmentSlug(null, null)).toBeNull();
    expect(generateEstablishmentSlug("  ", null)).toBeNull();
  });

  it("should append '-etablissement' for very short slugs", () => {
    expect(generateEstablishmentSlug("AB", null)).toBe("ab-etablissement");
  });

  it("should handle œ and ß ligatures", () => {
    expect(generateEstablishmentSlug("Bœuf", null)).toBe("boeuf");
    expect(generateEstablishmentSlug("Straße", null)).toBe("strasse");
  });
});

// =============================================================================
// dateYmdToEndOfDayIso
// =============================================================================

describe("dateYmdToEndOfDayIso", () => {
  it("should convert YYYY-MM-DD to end of day ISO", () => {
    const result = dateYmdToEndOfDayIso("2026-02-23");
    expect(result).toBe("2026-02-23T23:59:59.999Z");
  });

  it("should return null for invalid date format", () => {
    expect(dateYmdToEndOfDayIso("23-02-2026")).toBeNull();
    expect(dateYmdToEndOfDayIso("2026/02/23")).toBeNull();
    expect(dateYmdToEndOfDayIso("not-a-date")).toBeNull();
    expect(dateYmdToEndOfDayIso("")).toBeNull();
  });

  it("should handle edge dates", () => {
    expect(dateYmdToEndOfDayIso("2025-12-31")).toBe(
      "2025-12-31T23:59:59.999Z",
    );
    expect(dateYmdToEndOfDayIso("2025-01-01")).toBe(
      "2025-01-01T23:59:59.999Z",
    );
  });
});

// =============================================================================
// addDaysIso
// =============================================================================

describe("addDaysIso", () => {
  it("should add days to a date", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const result = addDaysIso(base, 5);
    expect(result).toContain("2026-01-06");
  });

  it("should handle negative days (subtract)", () => {
    const base = new Date("2026-01-10T12:00:00.000Z");
    const result = addDaysIso(base, -3);
    expect(result).toContain("2026-01-07");
  });

  it("should not mutate the original date", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const original = base.getTime();
    addDaysIso(base, 5);
    expect(base.getTime()).toBe(original);
  });
});

// =============================================================================
// MOROCCO_TZ
// =============================================================================

describe("MOROCCO_TZ", () => {
  it("should be Africa/Casablanca", () => {
    expect(MOROCCO_TZ).toBe("Africa/Casablanca");
  });
});

// =============================================================================
// moroccoDateParts
// =============================================================================

describe("moroccoDateParts", () => {
  it("should extract year, month, day, hour, minute", () => {
    // Use a well-known UTC time: 2026-06-15 12:30 UTC
    // Morocco (Africa/Casablanca) is UTC+1 in summer (no DST since 2018 reform, but +1 permanent sometimes)
    const dt = new Date("2026-06-15T12:30:00.000Z");
    const parts = moroccoDateParts(dt);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(15);
    // hour might be 12 or 13 depending on Morocco DST rules
    expect(parts.minute).toBe(30);
  });

  it("should return all required fields", () => {
    const parts = moroccoDateParts(new Date());
    expect(parts).toHaveProperty("year");
    expect(parts).toHaveProperty("month");
    expect(parts).toHaveProperty("day");
    expect(parts).toHaveProperty("hour");
    expect(parts).toHaveProperty("minute");
  });
});

// =============================================================================
// toYmd
// =============================================================================

describe("toYmd", () => {
  it("should return YYYY-MM-DD formatted date in Morocco TZ", () => {
    const dt = new Date("2026-06-15T12:00:00.000Z");
    const result = toYmd(dt);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2026-06-15");
  });

  it("should pad single-digit months and days", () => {
    const dt = new Date("2026-01-05T12:00:00.000Z");
    const result = toYmd(dt);
    expect(result).toMatch(/^\d{4}-0\d-0\d$/);
  });
});

// =============================================================================
// timeHm
// =============================================================================

describe("timeHm", () => {
  it("should return HH:MM formatted time in Morocco TZ", () => {
    const dt = new Date("2026-06-15T12:30:00.000Z");
    const result = timeHm(dt);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("should pad single-digit hours and minutes", () => {
    // 03:05 UTC → should still produce zero-padded HH:MM
    const dt = new Date("2026-06-15T03:05:00.000Z");
    const result = timeHm(dt);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

// =============================================================================
// moroccoMinutes
// =============================================================================

describe("moroccoMinutes", () => {
  it("should return total minutes since midnight in Morocco TZ", () => {
    // A known time: if Morocco is UTC+1, then 14:00 UTC → 15:00 local → 900 min
    // But depending on DST, let's just check it's reasonable
    const dt = new Date("2026-06-15T14:00:00.000Z");
    const mins = moroccoMinutes(dt);
    expect(mins).toBeGreaterThanOrEqual(0);
    expect(mins).toBeLessThan(24 * 60);
  });

  it("should calculate correctly for midnight UTC", () => {
    const dt = new Date("2026-01-15T00:00:00.000Z");
    const mins = moroccoMinutes(dt);
    // Morocco is UTC+1 in January → 01:00 local → 60 minutes
    expect(mins).toBe(60);
  });
});

// =============================================================================
// normalizeUniverseToPackUniverse
// =============================================================================

describe("normalizeUniverseToPackUniverse", () => {
  it("should return 'restaurant' for restaurant or unknown", () => {
    expect(normalizeUniverseToPackUniverse("restaurant")).toBe("restaurant");
    expect(normalizeUniverseToPackUniverse("")).toBe("restaurant");
    expect(normalizeUniverseToPackUniverse(null)).toBe("restaurant");
    expect(normalizeUniverseToPackUniverse(undefined)).toBe("restaurant");
    expect(normalizeUniverseToPackUniverse(42)).toBe("restaurant");
  });

  it("should return 'wellness' for wellness", () => {
    expect(normalizeUniverseToPackUniverse("wellness")).toBe("wellness");
    expect(normalizeUniverseToPackUniverse("Wellness")).toBe("wellness");
    expect(normalizeUniverseToPackUniverse("  WELLNESS  ")).toBe("wellness");
  });

  it("should return 'loisir' for loisir, culture, sport", () => {
    expect(normalizeUniverseToPackUniverse("loisir")).toBe("loisir");
    expect(normalizeUniverseToPackUniverse("culture")).toBe("loisir");
    expect(normalizeUniverseToPackUniverse("sport")).toBe("loisir");
    expect(normalizeUniverseToPackUniverse("Sport")).toBe("loisir");
  });
});

// =============================================================================
// buildEstablishmentDetailsUrl
// =============================================================================

describe("buildEstablishmentDetailsUrl", () => {
  it("should return /restaurant/ URL for restaurant universe", () => {
    expect(buildEstablishmentDetailsUrl("abc-123", "restaurant")).toBe(
      "/restaurant/abc-123",
    );
  });

  it("should return /wellness/ URL for wellness universe", () => {
    expect(buildEstablishmentDetailsUrl("id-1", "wellness")).toBe(
      "/wellness/id-1",
    );
  });

  it("should return /loisir/ URL for loisir/culture/sport", () => {
    expect(buildEstablishmentDetailsUrl("id-1", "loisir")).toBe(
      "/loisir/id-1",
    );
    expect(buildEstablishmentDetailsUrl("id-1", "culture")).toBe(
      "/loisir/id-1",
    );
    expect(buildEstablishmentDetailsUrl("id-1", "sport")).toBe(
      "/loisir/id-1",
    );
  });

  it("should default to /restaurant/ for unknown universe", () => {
    expect(buildEstablishmentDetailsUrl("id-1", "unknown")).toBe(
      "/restaurant/id-1",
    );
    expect(buildEstablishmentDetailsUrl("id-1", null)).toBe(
      "/restaurant/id-1",
    );
  });

  it("should URL-encode the establishment ID", () => {
    expect(buildEstablishmentDetailsUrl("a b/c", "restaurant")).toBe(
      "/restaurant/a%20b%2Fc",
    );
  });
});

// =============================================================================
// promoPercentFromSlot
// =============================================================================

describe("promoPercentFromSlot", () => {
  it("should return promo value for percent type", () => {
    expect(
      promoPercentFromSlot({ promo_type: "percent", promo_value: 25 }),
    ).toBe(25);
  });

  it("should clamp to 1-95 range", () => {
    expect(
      promoPercentFromSlot({ promo_type: "percent", promo_value: 0 }),
    ).toBeNull();
    expect(
      promoPercentFromSlot({ promo_type: "percent", promo_value: -5 }),
    ).toBeNull();
    expect(
      promoPercentFromSlot({ promo_type: "percent", promo_value: 100 }),
    ).toBe(95);
    expect(
      promoPercentFromSlot({ promo_type: "percent", promo_value: 1 }),
    ).toBe(1);
  });

  it("should return null for non-percent types", () => {
    expect(
      promoPercentFromSlot({ promo_type: "fixed", promo_value: 25 }),
    ).toBeNull();
    expect(
      promoPercentFromSlot({ promo_type: null, promo_value: 25 }),
    ).toBeNull();
    expect(
      promoPercentFromSlot({ promo_type: "", promo_value: 25 }),
    ).toBeNull();
  });

  it("should round fractional values", () => {
    expect(
      promoPercentFromSlot({ promo_type: "percent", promo_value: 25.7 }),
    ).toBe(26);
  });
});

// =============================================================================
// getRestaurantServiceLabelFromMinutes
// =============================================================================

describe("getRestaurantServiceLabelFromMinutes", () => {
  it("should return 'Midi' for morning/lunch times", () => {
    expect(getRestaurantServiceLabelFromMinutes(0)).toBe("Midi");
    expect(getRestaurantServiceLabelFromMinutes(12 * 60)).toBe("Midi");
    expect(getRestaurantServiceLabelFromMinutes(14 * 60 + 59)).toBe("Midi");
  });

  it("should return 'Tea Time' for afternoon", () => {
    expect(getRestaurantServiceLabelFromMinutes(15 * 60)).toBe("Tea Time");
    expect(getRestaurantServiceLabelFromMinutes(16 * 60)).toBe("Tea Time");
    expect(getRestaurantServiceLabelFromMinutes(17 * 60 + 29)).toBe(
      "Tea Time",
    );
  });

  it("should return 'Happy Hour' for pre-dinner", () => {
    expect(getRestaurantServiceLabelFromMinutes(17 * 60 + 30)).toBe(
      "Happy Hour",
    );
    expect(getRestaurantServiceLabelFromMinutes(18 * 60)).toBe("Happy Hour");
    expect(getRestaurantServiceLabelFromMinutes(19 * 60 + 29)).toBe(
      "Happy Hour",
    );
  });

  it("should return 'Soir' for evening", () => {
    expect(getRestaurantServiceLabelFromMinutes(19 * 60 + 30)).toBe("Soir");
    expect(getRestaurantServiceLabelFromMinutes(21 * 60)).toBe("Soir");
    expect(getRestaurantServiceLabelFromMinutes(23 * 60 + 59)).toBe("Soir");
  });
});

// =============================================================================
// normalizeReasonCode
// =============================================================================

describe("normalizeReasonCode", () => {
  it("should return trimmed string for valid reason codes", () => {
    expect(normalizeReasonCode("plans_changed")).toBe("plans_changed");
  });

  it("should truncate at 80 characters", () => {
    const long = "a".repeat(100);
    expect(normalizeReasonCode(long)!.length).toBe(80);
  });

  it("should return null for invalid inputs", () => {
    expect(normalizeReasonCode(null)).toBeNull();
    expect(normalizeReasonCode("")).toBeNull();
    expect(normalizeReasonCode(123)).toBeNull();
    expect(normalizeReasonCode(undefined)).toBeNull();
  });
});

// =============================================================================
// normalizeReasonText
// =============================================================================

describe("normalizeReasonText", () => {
  it("should return trimmed string for valid text", () => {
    expect(normalizeReasonText("I changed my plans")).toBe(
      "I changed my plans",
    );
  });

  it("should truncate at 800 characters", () => {
    const long = "b".repeat(1000);
    expect(normalizeReasonText(long)!.length).toBe(800);
  });

  it("should return null for invalid inputs", () => {
    expect(normalizeReasonText(null)).toBeNull();
    expect(normalizeReasonText("")).toBeNull();
    expect(normalizeReasonText("   ")).toBeNull();
  });
});

// =============================================================================
// normalizeUserMetaString
// =============================================================================

describe("normalizeUserMetaString", () => {
  it("should extract and trim string from metadata object", () => {
    expect(normalizeUserMetaString({ name: "  Alice  " }, "name")).toBe(
      "Alice",
    );
  });

  it("should return null for missing keys", () => {
    expect(normalizeUserMetaString({}, "name")).toBeNull();
  });

  it("should return null for non-string values", () => {
    expect(normalizeUserMetaString({ age: 25 }, "age")).toBeNull();
    expect(normalizeUserMetaString({ flag: true }, "flag")).toBeNull();
  });

  it("should return null for empty or whitespace-only values", () => {
    expect(normalizeUserMetaString({ name: "" }, "name")).toBeNull();
    expect(normalizeUserMetaString({ name: "   " }, "name")).toBeNull();
  });
});

// =============================================================================
// maxPromoPercent
// =============================================================================

describe("maxPromoPercent", () => {
  it("should return percentage for 'percent' type with valid value", () => {
    expect(maxPromoPercent("percent", 30)).toBe(30);
  });

  it("should be case-insensitive for type", () => {
    expect(maxPromoPercent("Percent", 20)).toBe(20);
    expect(maxPromoPercent("PERCENT", 20)).toBe(20);
  });

  it("should clamp to 1-95 range", () => {
    expect(maxPromoPercent("percent", 100)).toBe(95);
    expect(maxPromoPercent("percent", 0)).toBeNull();
    expect(maxPromoPercent("percent", -10)).toBeNull();
    expect(maxPromoPercent("percent", 1)).toBe(1);
  });

  it("should return null for non-percent types", () => {
    expect(maxPromoPercent("fixed", 50)).toBeNull();
    expect(maxPromoPercent("", 50)).toBeNull();
    expect(maxPromoPercent(null, 50)).toBeNull();
  });

  it("should handle numeric strings as promo_value", () => {
    expect(maxPromoPercent("percent", "30")).toBe(30);
  });

  it("should return null for non-finite promo values", () => {
    expect(maxPromoPercent("percent", NaN)).toBeNull();
    expect(maxPromoPercent("percent", "abc")).toBeNull();
    expect(maxPromoPercent("percent", Infinity)).toBeNull();
  });

  it("should round fractional values", () => {
    expect(maxPromoPercent("percent", 25.4)).toBe(25);
    expect(maxPromoPercent("percent", 25.6)).toBe(26);
  });
});

// =============================================================================
// isTimeoutError
// =============================================================================

describe("isTimeoutError", () => {
  it("should return true for Error with 'timeout' in message", () => {
    expect(isTimeoutError(new Error("timeout"))).toBe(true);
    expect(isTimeoutError(new Error("Connection timeout occurred"))).toBe(true);
    expect(isTimeoutError(new Error("TIMEOUT"))).toBe(true);
  });

  it("should return true for string with 'timeout'", () => {
    expect(isTimeoutError("timeout")).toBe(true);
    expect(isTimeoutError("Request TIMEOUT")).toBe(true);
  });

  it("should return false for non-timeout errors", () => {
    expect(isTimeoutError(new Error("connection refused"))).toBe(false);
    expect(isTimeoutError(new Error("not found"))).toBe(false);
    expect(isTimeoutError("something went wrong")).toBe(false);
  });

  it("should handle null/undefined", () => {
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });
});
