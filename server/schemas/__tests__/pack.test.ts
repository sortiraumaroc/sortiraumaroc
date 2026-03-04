import { describe, it, expect } from "vitest";
import {
  createPackSchema,
  updatePackSchema,
  checkoutPackSchema,
  packFiltersSchema,
} from "../pack";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// createPackSchema
// =============================================================================

describe("createPackSchema", () => {
  it("accepts valid minimal input (title + price)", () => {
    const result = createPackSchema.parse({ title: "Mon Pack", price: 5000 });
    expect(result.title).toBe("Mon Pack");
    expect(result.price).toBe(5000);
    expect(result.items).toEqual([]);
  });

  it("accepts valid full input", () => {
    const result = createPackSchema.parse({
      title: "Pack Premium",
      price: 15000,
      description: "Un super pack",
      label: "Promo",
      items: [{ name: "Item 1", quantity: 2 }],
      original_price: 20000,
      is_limited: true,
      stock: 50,
      availability: "limited",
      valid_from: "2026-03-01",
      valid_to: "2026-06-30",
      conditions: "Conditions apply",
      cover_url: "https://example.com/cover.jpg",
    });
    expect(result.items).toHaveLength(1);
    expect(result.availability).toBe("limited");
  });

  it("rejects title too short (< 3 chars)", () => {
    expect(() => createPackSchema.parse({ title: "AB", price: 5000 })).toThrow();
  });

  it("rejects negative price", () => {
    expect(() => createPackSchema.parse({ title: "Mon Pack", price: -100 })).toThrow();
  });

  it("rejects zero price", () => {
    expect(() => createPackSchema.parse({ title: "Mon Pack", price: 0 })).toThrow();
  });

  it("trims title whitespace", () => {
    const result = createPackSchema.parse({ title: "  Mon Pack  ", price: 5000 });
    expect(result.title).toBe("Mon Pack");
  });
});

// =============================================================================
// updatePackSchema
// =============================================================================

describe("updatePackSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = updatePackSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial update", () => {
    const result = updatePackSchema.parse({ price: 7000 });
    expect(result.price).toBe(7000);
  });
});

// =============================================================================
// checkoutPackSchema
// =============================================================================

describe("checkoutPackSchema", () => {
  it("accepts valid checkout with pack_id", () => {
    const result = checkoutPackSchema.parse({ pack_id: VALID_UUID });
    expect(result.pack_id).toBe(VALID_UUID);
    expect(result.quantity).toBe(1); // default
  });

  it("rejects missing both pack_id and packId", () => {
    expect(() => checkoutPackSchema.parse({})).toThrow();
  });

  it("accepts packId as alternative", () => {
    const result = checkoutPackSchema.parse({ pack_id: VALID_UUID, packId: VALID_UUID });
    expect(result.pack_id).toBe(VALID_UUID);
  });

  it("rejects quantity > 10", () => {
    expect(() =>
      checkoutPackSchema.parse({ pack_id: VALID_UUID, quantity: 11 }),
    ).toThrow();
  });

  it("rejects quantity < 1", () => {
    expect(() =>
      checkoutPackSchema.parse({ pack_id: VALID_UUID, quantity: 0 }),
    ).toThrow();
  });
});

// =============================================================================
// packFiltersSchema
// =============================================================================

describe("packFiltersSchema", () => {
  it("applies defaults", () => {
    const result = packFiltersSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("coerces string to number", () => {
    const result = packFiltersSchema.parse({ page: "2", limit: "50" });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });
});
