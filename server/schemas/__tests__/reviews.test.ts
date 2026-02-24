import { describe, it, expect } from "vitest";
import {
  submitReviewSchema,
  moderateReviewSchema,
  proposeGestureSchema,
  publicListReviewsSchema,
} from "../reviews";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// submitReviewSchema
// =============================================================================

describe("submitReviewSchema", () => {
  const validInput = {
    invitation_token: "tok_12345",
    rating_welcome: 4,
    rating_quality: 4,
    rating_value: 3,
    rating_ambiance: 5,
    comment: "A".repeat(55), // > 50 chars
  };

  it("accepts valid input", () => {
    const result = submitReviewSchema.parse(validInput);
    expect(result.rating_welcome).toBe(4);
    expect(result.photos).toEqual([]); // default
  });

  it("rejects rating below 1", () => {
    expect(() =>
      submitReviewSchema.parse({ ...validInput, rating_welcome: 0 }),
    ).toThrow();
  });

  it("rejects rating above 5", () => {
    expect(() =>
      submitReviewSchema.parse({ ...validInput, rating_quality: 6 }),
    ).toThrow();
  });

  it("rejects comment too short (< 50)", () => {
    expect(() =>
      submitReviewSchema.parse({ ...validInput, comment: "Short" }),
    ).toThrow();
  });

  it("rejects comment too long (> 1500)", () => {
    expect(() =>
      submitReviewSchema.parse({ ...validInput, comment: "X".repeat(1501) }),
    ).toThrow();
  });

  it("rejects more than 3 photos", () => {
    expect(() =>
      submitReviewSchema.parse({
        ...validInput,
        photos: [
          "https://a.com/1.jpg",
          "https://a.com/2.jpg",
          "https://a.com/3.jpg",
          "https://a.com/4.jpg",
        ],
      }),
    ).toThrow();
  });
});

// =============================================================================
// moderateReviewSchema
// =============================================================================

describe("moderateReviewSchema", () => {
  it("accepts valid actions", () => {
    expect(moderateReviewSchema.parse({ action: "approve" }).action).toBe("approve");
    expect(moderateReviewSchema.parse({ action: "reject" }).action).toBe("reject");
    expect(moderateReviewSchema.parse({ action: "request_modification" }).action).toBe(
      "request_modification",
    );
  });

  it("rejects invalid action", () => {
    expect(() => moderateReviewSchema.parse({ action: "delete" })).toThrow();
  });
});

// =============================================================================
// proposeGestureSchema
// =============================================================================

describe("proposeGestureSchema", () => {
  it("accepts valid input", () => {
    const result = proposeGestureSchema.parse({
      review_id: VALID_UUID,
      message: "Merci pour votre avis",
      discount_bps: 500,
    });
    expect(result.discount_bps).toBe(500);
  });

  it("rejects discount_bps below 100 (1%)", () => {
    expect(() =>
      proposeGestureSchema.parse({
        review_id: VALID_UUID,
        message: "Merci pour votre avis",
        discount_bps: 50,
      }),
    ).toThrow();
  });

  it("rejects discount_bps above 10000 (100%)", () => {
    expect(() =>
      proposeGestureSchema.parse({
        review_id: VALID_UUID,
        message: "Merci pour votre avis",
        discount_bps: 10001,
      }),
    ).toThrow();
  });

  it("rejects message too short (< 10)", () => {
    expect(() =>
      proposeGestureSchema.parse({
        review_id: VALID_UUID,
        message: "Short",
        discount_bps: 500,
      }),
    ).toThrow();
  });
});

// =============================================================================
// publicListReviewsSchema
// =============================================================================

describe("publicListReviewsSchema", () => {
  it("applies defaults", () => {
    const result = publicListReviewsSchema.parse({});
    expect(result.sort_by).toBe("published_at");
    expect(result.sort_order).toBe("desc");
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
