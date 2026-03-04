/**
 * Tests for the pure function `validateReviewSubmission` in server/reviewLogic.ts
 *
 * This function is synchronous and does not hit the database,
 * but the module has top-level imports with side effects that must be mocked.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — prevent import-time side effects
// ---------------------------------------------------------------------------

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => ({})),
}));

vi.mock("../emailService", () => ({
  sendTemplateEmail: vi.fn(),
}));

vi.mock("../adminNotifications", () => ({
  emitAdminNotification: vi.fn(),
}));

vi.mock("../proNotifications", () => ({
  notifyProMembers: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import the function under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import { validateReviewSubmission } from "../reviewLogic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid base input with all four common ratings satisfied. */
function validBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rating_welcome: 4,
    rating_quality: 4,
    rating_value: 3,
    rating_ambiance: 5,
    comment: "A".repeat(60), // 60 chars, above the 50-char minimum
    ...overrides,
  };
}

/** Build a fully valid restaurant review input. */
function validRestaurant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return validBase({ rating_hygiene: 4, ...overrides });
}

/** Build a fully valid loisir review input. */
function validLoisir(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return validBase({ rating_organization: 3, ...overrides });
}

// ============================================================================
// Valid submissions for different universes
// ============================================================================

describe("validateReviewSubmission", () => {
  describe("valid submissions by universe", () => {
    it("accepts a valid restaurant review (uses rating_hygiene)", () => {
      const result = validateReviewSubmission(validRestaurant(), "restaurant");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_hygiene).toBe(4);
      expect(result.data.rating_organization).toBeNull();
    });

    it("accepts a valid loisir review (uses rating_organization)", () => {
      const result = validateReviewSubmission(validLoisir(), "loisir");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_organization).toBe(3);
      expect(result.data.rating_hygiene).toBeNull();
    });

    it("accepts a valid hotel review (uses rating_hygiene)", () => {
      const input = validBase({ rating_hygiene: 5 });
      const result = validateReviewSubmission(input, "hotel");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_hygiene).toBe(5);
      expect(result.data.rating_organization).toBeNull();
    });

    it("accepts a valid evenement review (uses rating_organization)", () => {
      const input = validBase({ rating_organization: 2 });
      const result = validateReviewSubmission(input, "evenement");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_organization).toBe(2);
      expect(result.data.rating_hygiene).toBeNull();
    });
  });

  // ==========================================================================
  // Missing required common ratings
  // ==========================================================================

  describe("missing required common ratings", () => {
    it("rejects when rating_welcome is missing", () => {
      const input = validRestaurant();
      delete input.rating_welcome;
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_welcome must be an integer between 1 and 5");
    });

    it("rejects when rating_quality is missing", () => {
      const input = validRestaurant();
      delete input.rating_quality;
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_quality must be an integer between 1 and 5");
    });

    it("rejects when rating_value is missing", () => {
      const input = validRestaurant();
      delete input.rating_value;
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_value must be an integer between 1 and 5");
    });

    it("rejects when rating_ambiance is missing", () => {
      const input = validRestaurant();
      delete input.rating_ambiance;
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_ambiance must be an integer between 1 and 5");
    });
  });

  // ==========================================================================
  // Rating out-of-bounds
  // ==========================================================================

  describe("rating out of bounds", () => {
    it("rejects rating of 0 (below minimum)", () => {
      const result = validateReviewSubmission(validRestaurant({ rating_welcome: 0 }), "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_welcome must be an integer between 1 and 5");
    });

    it("rejects rating of 6 (above maximum)", () => {
      const result = validateReviewSubmission(validRestaurant({ rating_quality: 6 }), "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_quality must be an integer between 1 and 5");
    });

    it("rejects non-integer rating (3.5)", () => {
      const result = validateReviewSubmission(validRestaurant({ rating_value: 3.5 }), "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_value must be an integer between 1 and 5");
    });
  });

  // ==========================================================================
  // Missing category-specific ratings
  // ==========================================================================

  describe("missing category-specific ratings", () => {
    it("rejects missing rating_hygiene for restaurant", () => {
      const input = validBase(); // no rating_hygiene
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_hygiene must be an integer between 1 and 5 for this category");
    });

    it("rejects missing rating_organization for loisir", () => {
      const input = validBase(); // no rating_organization
      const result = validateReviewSubmission(input, "loisir");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_organization must be an integer between 1 and 5 for this category");
    });
  });

  // ==========================================================================
  // Comment validation
  // ==========================================================================

  describe("comment validation", () => {
    it("rejects comment shorter than 50 characters", () => {
      const result = validateReviewSubmission(
        validRestaurant({ comment: "Too short" }),
        "restaurant",
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("Comment must be between 50 and 1500 characters");
    });

    it("rejects comment longer than 1500 characters", () => {
      const result = validateReviewSubmission(
        validRestaurant({ comment: "X".repeat(1501) }),
        "restaurant",
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("Comment must be between 50 and 1500 characters");
    });

    it("accepts comment of exactly 50 characters", () => {
      const result = validateReviewSubmission(
        validRestaurant({ comment: "B".repeat(50) }),
        "restaurant",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.comment).toBe("B".repeat(50));
    });

    it("rejects when comment is not provided (defaults to empty string)", () => {
      const input = validRestaurant();
      delete input.comment;
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("Comment must be between 50 and 1500 characters");
    });
  });

  // ==========================================================================
  // Photos handling
  // ==========================================================================

  describe("photos handling", () => {
    it("truncates photos to 3 when more are provided", () => {
      const photos = ["url1", "url2", "url3", "url4", "url5"];
      const result = validateReviewSubmission(
        validRestaurant({ photos }),
        "restaurant",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.photos).toEqual(["url1", "url2", "url3"]);
      expect(result.data.photos).toHaveLength(3);
    });

    it("filters out non-string items from photos", () => {
      const photos = ["valid-url", 42, null, "", "another-url", undefined];
      const result = validateReviewSubmission(
        validRestaurant({ photos }),
        "restaurant",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.photos).toEqual(["valid-url", "another-url"]);
    });

    it("defaults to empty array when photos not provided", () => {
      const result = validateReviewSubmission(validRestaurant(), "restaurant");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.photos).toEqual([]);
    });
  });

  // ==========================================================================
  // Overall rating calculation
  // ==========================================================================

  describe("overall rating calculation", () => {
    it("computes correct average for restaurant (5 ratings)", () => {
      // welcome=4, quality=4, value=3, ambiance=5, hygiene=4
      // average = (4+4+3+5+4)/5 = 20/5 = 4.0
      const result = validateReviewSubmission(validRestaurant(), "restaurant");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_overall).toBe(4);
    });

    it("computes correct average for loisir (5 ratings)", () => {
      // welcome=4, quality=4, value=3, ambiance=5, organization=3
      // average = (4+4+3+5+3)/5 = 19/5 = 3.8
      const result = validateReviewSubmission(validLoisir(), "loisir");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_overall).toBe(3.8);
    });

    it("rounds to one decimal place", () => {
      // welcome=3, quality=4, value=2, ambiance=5, hygiene=3
      // average = (3+4+2+5+3)/5 = 17/5 = 3.4
      const input = validBase({
        rating_welcome: 3,
        rating_quality: 4,
        rating_value: 2,
        rating_ambiance: 5,
        rating_hygiene: 3,
      });
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.rating_overall).toBe(3.4);
    });
  });

  // ==========================================================================
  // would_recommend
  // ==========================================================================

  describe("would_recommend field", () => {
    it("returns true when would_recommend is true", () => {
      const result = validateReviewSubmission(
        validRestaurant({ would_recommend: true }),
        "restaurant",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.would_recommend).toBe(true);
    });

    it("returns false when would_recommend is false", () => {
      const result = validateReviewSubmission(
        validRestaurant({ would_recommend: false }),
        "restaurant",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.would_recommend).toBe(false);
    });

    it("returns null when would_recommend is undefined", () => {
      const input = validRestaurant();
      delete input.would_recommend;
      const result = validateReviewSubmission(input, "restaurant");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.would_recommend).toBeNull();
    });
  });

  // ==========================================================================
  // Empty input
  // ==========================================================================

  describe("empty input", () => {
    it("returns error on first missing rating when input is empty", () => {
      const result = validateReviewSubmission({}, "restaurant");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("rating_welcome must be an integer between 1 and 5");
    });
  });
});
