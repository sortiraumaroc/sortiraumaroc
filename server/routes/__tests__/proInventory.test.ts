import { describe, it, expect } from "vitest";
import {
  normalizeUrlList,
  parseIsoDatetimeOrNull,
  parseInventoryVariants,
} from "../proInventory";

// =============================================================================
// normalizeUrlList
// =============================================================================

describe("normalizeUrlList", () => {
  it("should keep valid http/https URLs", () => {
    expect(
      normalizeUrlList([
        "https://example.com/img.jpg",
        "http://cdn.test.com/photo.png",
      ]),
    ).toEqual([
      "https://example.com/img.jpg",
      "http://cdn.test.com/photo.png",
    ]);
  });

  it("should filter out non-URL strings", () => {
    expect(
      normalizeUrlList(["https://valid.com", "not-a-url", "ftp://nope.com"]),
    ).toEqual(["https://valid.com"]);
  });

  it("should filter out empty and whitespace-only strings", () => {
    expect(normalizeUrlList(["", "  ", "https://ok.com"])).toEqual([
      "https://ok.com",
    ]);
  });

  it("should return empty array for all-invalid input", () => {
    expect(normalizeUrlList(["", "not-url"])).toEqual([]);
  });

  it("should return empty array for empty input", () => {
    expect(normalizeUrlList([])).toEqual([]);
  });

  it("should be case-insensitive for protocol check", () => {
    expect(normalizeUrlList(["HTTPS://EXAMPLE.COM/test"])).toEqual([
      "HTTPS://EXAMPLE.COM/test",
    ]);
    expect(normalizeUrlList(["HTTP://test.com"])).toEqual([
      "HTTP://test.com",
    ]);
  });
});

// =============================================================================
// parseIsoDatetimeOrNull
// =============================================================================

describe("parseIsoDatetimeOrNull", () => {
  it("should return ISO string for valid datetime", () => {
    const result = parseIsoDatetimeOrNull("2026-02-23T14:30:00Z");
    expect(result).toBe("2026-02-23T14:30:00.000Z");
  });

  it("should parse date-only strings", () => {
    const result = parseIsoDatetimeOrNull("2026-02-23");
    expect(result).toBeTruthy();
    expect(result!.startsWith("2026-02-23")).toBe(true);
  });

  it("should return null for invalid dates", () => {
    expect(parseIsoDatetimeOrNull("not-a-date")).toBeNull();
    expect(parseIsoDatetimeOrNull("abc123")).toBeNull();
  });

  it("should return null for empty/whitespace strings", () => {
    expect(parseIsoDatetimeOrNull("")).toBeNull();
    expect(parseIsoDatetimeOrNull("   ")).toBeNull();
  });

  it("should return null for non-string types", () => {
    expect(parseIsoDatetimeOrNull(42)).toBeNull();
    expect(parseIsoDatetimeOrNull(null)).toBeNull();
    expect(parseIsoDatetimeOrNull(undefined)).toBeNull();
    expect(parseIsoDatetimeOrNull(true)).toBeNull();
  });
});

// =============================================================================
// parseInventoryVariants
// =============================================================================

describe("parseInventoryVariants", () => {
  it("should return empty array for undefined input", () => {
    const result = parseInventoryVariants(undefined);
    expect(result).toEqual({ ok: true, variants: [] });
  });

  it("should error for non-array input", () => {
    expect(parseInventoryVariants("string")).toEqual({
      ok: false,
      error: "variants doit \u00eatre un tableau",
    });
    expect(parseInventoryVariants(42)).toEqual({
      ok: false,
      error: "variants doit \u00eatre un tableau",
    });
  });

  it("should parse valid variants", () => {
    const input = [
      { price: 100, currency: "mad", title: "Small", quantity: 2, unit: "pcs" },
      { price: 200 },
    ];
    const result = parseInventoryVariants(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variants).toHaveLength(2);
      expect(result.variants[0]).toEqual({
        title: "Small",
        quantity: 2,
        unit: "pcs",
        price: 100,
        currency: "MAD",
        sort_order: 0,
        is_active: true,
      });
      expect(result.variants[1]).toEqual({
        title: null,
        quantity: null,
        unit: null,
        price: 200,
        currency: "MAD",
        sort_order: 0,
        is_active: true,
      });
    }
  });

  it("should error for non-record variant items", () => {
    expect(parseInventoryVariants(["string"])).toEqual({
      ok: false,
      error: "variant invalide",
    });
  });

  it("should error when price is missing", () => {
    expect(parseInventoryVariants([{ title: "No price" }])).toEqual({
      ok: false,
      error: "variant.price requis",
    });
  });

  it("should error when price is negative", () => {
    expect(parseInventoryVariants([{ price: -10 }])).toEqual({
      ok: false,
      error: "variant.price invalide",
    });
  });

  it("should error when quantity is zero or negative", () => {
    expect(parseInventoryVariants([{ price: 100, quantity: 0 }])).toEqual({
      ok: false,
      error: "variant.quantity invalide",
    });
    expect(parseInventoryVariants([{ price: 100, quantity: -5 }])).toEqual({
      ok: false,
      error: "variant.quantity invalide",
    });
  });

  it("should accept null quantity", () => {
    const result = parseInventoryVariants([{ price: 100, quantity: null }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variants[0].quantity).toBeNull();
    }
  });

  it("should round price and quantity", () => {
    const result = parseInventoryVariants([
      { price: 99.7, quantity: 3.2 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variants[0].price).toBe(100);
      expect(result.variants[0].quantity).toBe(3);
    }
  });

  it("should uppercase currency and default to MAD", () => {
    const result = parseInventoryVariants([{ price: 50, currency: "eur" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variants[0].currency).toBe("EUR");
    }

    const result2 = parseInventoryVariants([{ price: 50 }]);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.variants[0].currency).toBe("MAD");
    }
  });

  it("should handle sort_order and is_active", () => {
    const result = parseInventoryVariants([
      { price: 100, sort_order: 5, is_active: false },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variants[0].sort_order).toBe(5);
      expect(result.variants[0].is_active).toBe(false);
    }
  });
});
