import { describe, it, expect } from "vitest";
import {
  safeInt,
  safeString,
  safeCurrency,
  normalizeOfferType,
  parseDeliverables,
  normalizePromoCode,
  normalizePromoScopeType,
  isUuid,
  normalizeUuidArray,
  safeIsoOrNull,
} from "../adminVisibility";

// =============================================================================
// safeInt
// =============================================================================

describe("safeInt", () => {
  it("should return rounded number for finite numbers", () => {
    expect(safeInt(42)).toBe(42);
    expect(safeInt(3.7)).toBe(4);
    expect(safeInt(-2.3)).toBe(-2);
  });

  it("should parse string numbers", () => {
    expect(safeInt("100")).toBe(100);
    expect(safeInt("  55.9  ")).toBe(56);
  });

  it("should return 0 for non-numeric input", () => {
    expect(safeInt(null)).toBe(0);
    expect(safeInt(undefined)).toBe(0);
    expect(safeInt("abc")).toBe(0);
    expect(safeInt("")).toBe(0);
    expect(safeInt({})).toBe(0);
    expect(safeInt(Infinity)).toBe(0);
    expect(safeInt(NaN)).toBe(0);
  });
});

// =============================================================================
// safeString
// =============================================================================

describe("safeString", () => {
  it("should return trimmed string", () => {
    expect(safeString("hello")).toBe("hello");
    expect(safeString("  world  ")).toBe("world");
  });

  it("should return null for empty/whitespace strings", () => {
    expect(safeString("")).toBeNull();
    expect(safeString("   ")).toBeNull();
  });

  it("should return null for non-string types", () => {
    expect(safeString(42)).toBeNull();
    expect(safeString(null)).toBeNull();
    expect(safeString(undefined)).toBeNull();
    expect(safeString(true)).toBeNull();
  });
});

// =============================================================================
// safeCurrency
// =============================================================================

describe("safeCurrency", () => {
  it("should uppercase valid currency codes", () => {
    expect(safeCurrency("mad")).toBe("MAD");
    expect(safeCurrency("eur")).toBe("EUR");
    expect(safeCurrency("  usd  ")).toBe("USD");
  });

  it("should default to MAD for invalid input", () => {
    expect(safeCurrency("")).toBe("MAD");
    expect(safeCurrency("   ")).toBe("MAD");
    expect(safeCurrency(42)).toBe("MAD");
    expect(safeCurrency(null)).toBe("MAD");
    expect(safeCurrency(undefined)).toBe("MAD");
  });
});

// =============================================================================
// normalizeOfferType
// =============================================================================

describe("normalizeOfferType", () => {
  it("should return valid offer types", () => {
    expect(normalizeOfferType("pack")).toBe("pack");
    expect(normalizeOfferType("option")).toBe("option");
    expect(normalizeOfferType("menu_digital")).toBe("menu_digital");
    expect(normalizeOfferType("media_video")).toBe("media_video");
  });

  it("should be case-insensitive", () => {
    expect(normalizeOfferType("PACK")).toBe("pack");
    expect(normalizeOfferType("  Option  ")).toBe("option");
  });

  it("should return null for invalid types", () => {
    expect(normalizeOfferType("unknown")).toBeNull();
    expect(normalizeOfferType("")).toBeNull();
    expect(normalizeOfferType(42)).toBeNull();
    expect(normalizeOfferType(null)).toBeNull();
  });
});

// =============================================================================
// parseDeliverables
// =============================================================================

describe("parseDeliverables", () => {
  it("should return trimmed non-empty strings", () => {
    expect(parseDeliverables(["Logo", "Banner", "Video"])).toEqual([
      "Logo",
      "Banner",
      "Video",
    ]);
  });

  it("should filter out empty and non-string items", () => {
    expect(parseDeliverables(["Logo", "", 42, "  ", null, "Banner"])).toEqual([
      "Logo",
      "Banner",
    ]);
  });

  it("should return empty array for non-array input", () => {
    expect(parseDeliverables("not-array")).toEqual([]);
    expect(parseDeliverables(42)).toEqual([]);
    expect(parseDeliverables(null)).toEqual([]);
    expect(parseDeliverables(undefined)).toEqual([]);
  });

  it("should cap at 50 items", () => {
    const big = Array.from({ length: 60 }, (_, i) => `item-${i}`);
    expect(parseDeliverables(big)).toHaveLength(50);
  });
});

// =============================================================================
// normalizePromoCode
// =============================================================================

describe("normalizePromoCode", () => {
  it("should uppercase and remove spaces", () => {
    expect(normalizePromoCode("  sam 50  ")).toBe("SAM50");
    expect(normalizePromoCode("promo code")).toBe("PROMOCODE");
  });

  it("should return null for empty/invalid input", () => {
    expect(normalizePromoCode("")).toBeNull();
    expect(normalizePromoCode("   ")).toBeNull();
    expect(normalizePromoCode(42)).toBeNull();
    expect(normalizePromoCode(null)).toBeNull();
  });
});

// =============================================================================
// normalizePromoScopeType
// =============================================================================

describe("normalizePromoScopeType", () => {
  it("should return valid scope types", () => {
    expect(normalizePromoScopeType("pack")).toBe("pack");
    expect(normalizePromoScopeType("OPTION")).toBe("option");
    expect(normalizePromoScopeType("  Menu_Digital  ")).toBe("menu_digital");
    expect(normalizePromoScopeType("media_video")).toBe("media_video");
  });

  it("should return null for invalid types", () => {
    expect(normalizePromoScopeType("unknown")).toBeNull();
    expect(normalizePromoScopeType("")).toBeNull();
    expect(normalizePromoScopeType(42)).toBeNull();
  });
});

// =============================================================================
// isUuid
// =============================================================================

describe("isUuid", () => {
  it("should return true for valid UUIDs", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(true);
  });

  it("should return false for invalid formats", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

// =============================================================================
// normalizeUuidArray
// =============================================================================

describe("normalizeUuidArray", () => {
  it("should return valid UUIDs from array", () => {
    const uuids = [
      "550e8400-e29b-41d4-a716-446655440000",
      "660e8400-e29b-41d4-a716-446655440001",
    ];
    expect(normalizeUuidArray(uuids)).toEqual(uuids);
  });

  it("should filter out invalid UUIDs", () => {
    expect(
      normalizeUuidArray([
        "550e8400-e29b-41d4-a716-446655440000",
        "not-a-uuid",
        "",
      ]),
    ).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
  });

  it("should deduplicate", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUuidArray([uuid, uuid, uuid])).toEqual([uuid]);
  });

  it("should return null for null input", () => {
    expect(normalizeUuidArray(null)).toBeNull();
  });

  it("should return null for non-array input", () => {
    expect(normalizeUuidArray("string")).toBeNull();
    expect(normalizeUuidArray(42)).toBeNull();
  });

  it("should return null if all UUIDs are invalid", () => {
    expect(normalizeUuidArray(["not-uuid", ""])).toBeNull();
  });

  it("should cap at 200 UUIDs", () => {
    const uuids = Array.from(
      { length: 210 },
      (_, i) =>
        `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
    );
    const result = normalizeUuidArray(uuids);
    expect(result).toHaveLength(200);
  });
});

// =============================================================================
// safeIsoOrNull
// =============================================================================

describe("safeIsoOrNull", () => {
  it("should return ISO string for valid dates", () => {
    const result = safeIsoOrNull("2026-02-23T10:00:00Z");
    expect(result).toBe("2026-02-23T10:00:00.000Z");
  });

  it("should parse date-only strings", () => {
    const result = safeIsoOrNull("2026-02-23");
    expect(result).toBeTruthy();
    expect(result!.startsWith("2026-02-23")).toBe(true);
  });

  it("should return null for invalid dates", () => {
    expect(safeIsoOrNull("not-a-date")).toBeNull();
    expect(safeIsoOrNull("")).toBeNull();
    expect(safeIsoOrNull("   ")).toBeNull();
  });

  it("should return null for non-string input", () => {
    expect(safeIsoOrNull(42)).toBeNull();
    expect(safeIsoOrNull(null)).toBeNull();
    expect(safeIsoOrNull(undefined)).toBeNull();
  });
});
