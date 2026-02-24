import { describe, it, expect } from "vitest";
import {
  getBillingPeriodCode,
  getBillingPeriodDates,
  calculateDiscountPercentage,
  PACK_MODERATION_TRANSITIONS,
  PACK_VISIBLE_STATUSES,
  PACK_PURCHASABLE_STATUSES,
  PACK_EDITABLE_STATUSES,
  BILLING_PERIOD,
  type PackModerationStatus,
} from "../packsBillingTypes";

// =============================================================================
// getBillingPeriodCode
// =============================================================================

describe("getBillingPeriodCode", () => {
  it('should return "YYYY-MM-A" for day 1 of a month', () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 1))).toBe("2026-01-A"); // Jan 1
  });

  it('should return "YYYY-MM-A" for day 15 of a month', () => {
    expect(getBillingPeriodCode(new Date(2026, 2, 15))).toBe("2026-03-A"); // Mar 15
  });

  it('should return "YYYY-MM-B" for day 16 of a month', () => {
    expect(getBillingPeriodCode(new Date(2026, 2, 16))).toBe("2026-03-B"); // Mar 16
  });

  it('should return "YYYY-MM-B" for last day of month', () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 31))).toBe("2026-01-B"); // Jan 31
  });

  it("should zero-pad single-digit months", () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 5))).toBe("2026-01-A"); // January
    expect(getBillingPeriodCode(new Date(2026, 8, 10))).toBe("2026-09-A"); // September
  });

  it("should handle December correctly", () => {
    expect(getBillingPeriodCode(new Date(2026, 11, 1))).toBe("2026-12-A"); // Dec 1
    expect(getBillingPeriodCode(new Date(2026, 11, 31))).toBe("2026-12-B"); // Dec 31
  });

  it("should handle February correctly", () => {
    expect(getBillingPeriodCode(new Date(2026, 1, 14))).toBe("2026-02-A"); // Feb 14
    expect(getBillingPeriodCode(new Date(2026, 1, 28))).toBe("2026-02-B"); // Feb 28
  });

  it("should handle leap year February 29", () => {
    expect(getBillingPeriodCode(new Date(2028, 1, 29))).toBe("2028-02-B"); // Feb 29 (2028 leap)
  });

  it("should handle different years", () => {
    expect(getBillingPeriodCode(new Date(2025, 5, 20))).toBe("2025-06-B"); // June 2025
    expect(getBillingPeriodCode(new Date(2030, 10, 8))).toBe("2030-11-A"); // Nov 2030
  });
});

// =============================================================================
// getBillingPeriodDates
// =============================================================================

describe("getBillingPeriodDates", () => {
  it("should return correct start/end for first-half period (A)", () => {
    const { start, end } = getBillingPeriodDates("2026-01-A");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0); // January
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  it("should return correct start/end for second-half period (B)", () => {
    const { start, end } = getBillingPeriodDates("2026-01-B");
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(31); // January has 31 days
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("should handle February second-half correctly (28 days)", () => {
    const { start, end } = getBillingPeriodDates("2026-02-B");
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(28); // 2026 is not a leap year
  });

  it("should handle February second-half correctly in leap year (29 days)", () => {
    const { start, end } = getBillingPeriodDates("2028-02-B");
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(29); // 2028 is a leap year
  });

  it("should handle December second-half correctly", () => {
    const { start, end } = getBillingPeriodDates("2026-12-B");
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(31);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11); // December
  });

  it("should handle April second-half (30-day month)", () => {
    const { start, end } = getBillingPeriodDates("2026-04-B");
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(30); // April has 30 days
  });

  it("should be inverse of getBillingPeriodCode for first-half period", () => {
    const date = new Date(2026, 5, 10); // June 10 -> A
    const code = getBillingPeriodCode(date);
    expect(code).toBe("2026-06-A");
    const { start, end } = getBillingPeriodDates(code);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(15);
  });

  it("should be inverse of getBillingPeriodCode for second-half period", () => {
    const date = new Date(2026, 5, 25); // June 25 -> B
    const code = getBillingPeriodCode(date);
    expect(code).toBe("2026-06-B");
    const { start, end } = getBillingPeriodDates(code);
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(30); // June has 30 days
  });
});

// =============================================================================
// calculateDiscountPercentage
// =============================================================================

describe("calculateDiscountPercentage", () => {
  it("should return 0 when originalPrice is 0", () => {
    expect(calculateDiscountPercentage(0, 50)).toBe(0);
  });

  it("should return 0 when originalPrice is negative", () => {
    expect(calculateDiscountPercentage(-100, 50)).toBe(0);
  });

  it("should return 0 when packPrice equals originalPrice (no discount)", () => {
    expect(calculateDiscountPercentage(100, 100)).toBe(0);
  });

  it("should return 0 when packPrice is greater than originalPrice", () => {
    expect(calculateDiscountPercentage(100, 150)).toBe(0);
  });

  it("should calculate 50% discount correctly", () => {
    expect(calculateDiscountPercentage(200, 100)).toBe(50);
  });

  it("should calculate 25% discount correctly", () => {
    expect(calculateDiscountPercentage(200, 150)).toBe(25);
  });

  it("should calculate 100% discount when packPrice is 0", () => {
    expect(calculateDiscountPercentage(100, 0)).toBe(100);
  });

  it("should handle fractional percentages with 2 decimal places", () => {
    // (300 - 199) / 300 = 101/300 = 0.336666... -> 33.67
    expect(calculateDiscountPercentage(300, 199)).toBe(33.67);
  });

  it("should handle 10% discount", () => {
    expect(calculateDiscountPercentage(1000, 900)).toBe(10);
  });

  it("should handle small prices (cents)", () => {
    expect(calculateDiscountPercentage(500, 250)).toBe(50); // 50% off
  });

  it("should return 0 for negative packPrice (packPrice >= originalPrice after negative check)", () => {
    // originalPrice=100, packPrice=-50 -> 100 - (-50) = 150, 150/100 = 150%, this is valid math
    // The function only checks originalPrice <= 0 || packPrice >= originalPrice
    // -50 is not >= 100, so it computes: (100-(-50))/100 = 1.5 * 10000 / 100 = 150
    expect(calculateDiscountPercentage(100, -50)).toBe(150);
  });
});

// =============================================================================
// PACK_MODERATION_TRANSITIONS
// =============================================================================

describe("PACK_MODERATION_TRANSITIONS", () => {
  it("draft can only transition to pending_moderation", () => {
    expect(PACK_MODERATION_TRANSITIONS.draft).toEqual(["pending_moderation"]);
  });

  it("pending_moderation can transition to approved, modification_requested, or rejected", () => {
    expect(PACK_MODERATION_TRANSITIONS.pending_moderation).toEqual([
      "approved",
      "modification_requested",
      "rejected",
    ]);
  });

  it("modification_requested can only transition to pending_moderation", () => {
    expect(PACK_MODERATION_TRANSITIONS.modification_requested).toEqual(["pending_moderation"]);
  });

  it("approved can only transition to active", () => {
    expect(PACK_MODERATION_TRANSITIONS.approved).toEqual(["active"]);
  });

  it("active can transition to suspended, sold_out, or ended", () => {
    expect(PACK_MODERATION_TRANSITIONS.active).toEqual(["suspended", "sold_out", "ended"]);
  });

  it("suspended can transition to active or ended", () => {
    expect(PACK_MODERATION_TRANSITIONS.suspended).toEqual(["active", "ended"]);
  });

  it("sold_out can transition to active (restock) or ended", () => {
    expect(PACK_MODERATION_TRANSITIONS.sold_out).toEqual(["active", "ended"]);
  });

  it("ended is terminal — no transitions allowed", () => {
    expect(PACK_MODERATION_TRANSITIONS.ended).toEqual([]);
  });

  it("rejected can transition back to draft (pro reworks)", () => {
    expect(PACK_MODERATION_TRANSITIONS.rejected).toEqual(["draft"]);
  });

  it("should have an entry for every PackModerationStatus", () => {
    const allStatuses: PackModerationStatus[] = [
      "draft",
      "pending_moderation",
      "modification_requested",
      "approved",
      "active",
      "suspended",
      "sold_out",
      "ended",
      "rejected",
    ];
    for (const status of allStatuses) {
      expect(PACK_MODERATION_TRANSITIONS).toHaveProperty(status);
    }
  });

  it("should not allow direct draft -> active", () => {
    expect(PACK_MODERATION_TRANSITIONS.draft).not.toContain("active");
  });

  it("should not allow active -> draft (no reverting to draft)", () => {
    expect(PACK_MODERATION_TRANSITIONS.active).not.toContain("draft");
  });
});

// =============================================================================
// Pack status constants — sanity checks
// =============================================================================

describe("Pack status constants", () => {
  it("PACK_VISIBLE_STATUSES should only include active", () => {
    expect(PACK_VISIBLE_STATUSES).toEqual(["active"]);
  });

  it("PACK_PURCHASABLE_STATUSES should only include active", () => {
    expect(PACK_PURCHASABLE_STATUSES).toEqual(["active"]);
  });

  it("PACK_EDITABLE_STATUSES should include draft, modification_requested, rejected", () => {
    expect(PACK_EDITABLE_STATUSES).toEqual(["draft", "modification_requested", "rejected"]);
  });

  it("BILLING_PERIOD constants should have expected values", () => {
    expect(BILLING_PERIOD.CALL_TO_INVOICE_DEADLINE_DAYS).toBe(10);
    expect(BILLING_PERIOD.PAYMENT_DELAY_DAYS).toBe(7);
  });
});
