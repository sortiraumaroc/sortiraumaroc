import { describe, it, expect } from "vitest";
import {
  RESERVATION_STATUSES,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SET,
  REVIEW_ELIGIBLE_STATUSES,
  REVIEW_ELIGIBLE_STATUS_SET,
  OCCUPYING_STATUSES,
  OCCUPYING_STATUS_SET,
  CANCELLABLE_STATUSES,
  CANCELLABLE_STATUS_SET,
  isTerminalStatus,
  isReviewEligible,
  canTransitionV2,
  classifyCancellation,
  scoreToStars,
  starsToScore,
  computeClientScoreV2,
  SCORE_SCALE,
  SCORING_WEIGHTS,
  RESERVATION_TIMINGS,
} from "../reservationTypesV2";

// =============================================================================
// isTerminalStatus
// =============================================================================

describe("isTerminalStatus", () => {
  const terminalStatuses = [
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "cancelled_waitlist_expired",
    "refused",
    "consumed",
    "consumed_default",
    "no_show_confirmed",
    "expired",
  ];

  for (const status of terminalStatuses) {
    it(`should return true for terminal status "${status}"`, () => {
      expect(isTerminalStatus(status)).toBe(true);
    });
  }

  const nonTerminalStatuses = [
    "requested",
    "pending_pro_validation",
    "confirmed",
    "waitlist",
    "pending_waitlist",
    "on_hold",
    "deposit_requested",
    "deposit_paid",
    "noshow",
    "no_show_disputed",
  ];

  for (const status of nonTerminalStatuses) {
    it(`should return false for non-terminal status "${status}"`, () => {
      expect(isTerminalStatus(status)).toBe(false);
    });
  }

  it("should return false for an unknown status", () => {
    expect(isTerminalStatus("unknown_status")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isTerminalStatus("")).toBe(false);
  });
});

// =============================================================================
// isReviewEligible
// =============================================================================

describe("isReviewEligible", () => {
  it('should return true for "consumed"', () => {
    expect(isReviewEligible("consumed")).toBe(true);
  });

  it('should return true for "consumed_default"', () => {
    expect(isReviewEligible("consumed_default")).toBe(true);
  });

  const nonEligibleStatuses = [
    "requested",
    "pending_pro_validation",
    "confirmed",
    "waitlist",
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "refused",
    "noshow",
    "no_show_confirmed",
    "no_show_disputed",
    "expired",
    "on_hold",
    "deposit_requested",
    "deposit_paid",
  ];

  for (const status of nonEligibleStatuses) {
    it(`should return false for non-eligible status "${status}"`, () => {
      expect(isReviewEligible(status)).toBe(false);
    });
  }

  it("should return false for empty string", () => {
    expect(isReviewEligible("")).toBe(false);
  });
});

// =============================================================================
// canTransitionV2
// =============================================================================

describe("canTransitionV2", () => {
  // ---- Self-transitions ----
  it("should allow self-transition (same status)", () => {
    expect(canTransitionV2("requested", "requested")).toBe(true);
    expect(canTransitionV2("confirmed", "confirmed")).toBe(true);
    expect(canTransitionV2("noshow", "noshow")).toBe(true);
  });

  // ---- Invalid: empty target ----
  it("should return false when target is empty string", () => {
    expect(canTransitionV2("requested", "")).toBe(false);
  });

  // ---- Terminal statuses cannot transition (except self) ----
  const terminalStatuses = [
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "cancelled_waitlist_expired",
    "refused",
    "consumed",
    "consumed_default",
    "no_show_confirmed",
    "expired",
  ];

  for (const status of terminalStatuses) {
    it(`should block transitions from terminal status "${status}" to any other`, () => {
      expect(canTransitionV2(status, "confirmed")).toBe(false);
    });
  }

  // ---- Valid transitions from "requested" ----
  const requestedTargets = [
    "pending_pro_validation",
    "confirmed",
    "refused",
    "waitlist",
    "on_hold",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of requestedTargets) {
    it(`should allow requested -> ${target}`, () => {
      expect(canTransitionV2("requested", target)).toBe(true);
    });
  }

  it("should reject requested -> consumed (not in map)", () => {
    expect(canTransitionV2("requested", "consumed")).toBe(false);
  });

  it("should reject requested -> noshow (not in map)", () => {
    expect(canTransitionV2("requested", "noshow")).toBe(false);
  });

  // ---- Valid transitions from "pending_pro_validation" ----
  const pendingProTargets = [
    "confirmed",
    "refused",
    "waitlist",
    "on_hold",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of pendingProTargets) {
    it(`should allow pending_pro_validation -> ${target}`, () => {
      expect(canTransitionV2("pending_pro_validation", target)).toBe(true);
    });
  }

  // ---- Valid transitions from "confirmed" ----
  const confirmedTargets = [
    "consumed",
    "consumed_default",
    "noshow",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
    "deposit_requested",
  ];

  for (const target of confirmedTargets) {
    it(`should allow confirmed -> ${target}`, () => {
      expect(canTransitionV2("confirmed", target)).toBe(true);
    });
  }

  it("should reject confirmed -> refused", () => {
    expect(canTransitionV2("confirmed", "refused")).toBe(false);
  });

  // ---- Valid transitions from "waitlist" ----
  const waitlistTargets = [
    "requested",
    "confirmed",
    "cancelled_user",
    "cancelled_pro",
    "cancelled_waitlist_expired",
    "cancelled",
  ];

  for (const target of waitlistTargets) {
    it(`should allow waitlist -> ${target}`, () => {
      expect(canTransitionV2("waitlist", target)).toBe(true);
    });
  }

  // ---- Valid transitions from "pending_waitlist" ----
  it("should allow pending_waitlist -> waitlist", () => {
    expect(canTransitionV2("pending_waitlist", "waitlist")).toBe(true);
  });

  it("should allow pending_waitlist -> cancelled_user", () => {
    expect(canTransitionV2("pending_waitlist", "cancelled_user")).toBe(true);
  });

  it("should allow pending_waitlist -> cancelled", () => {
    expect(canTransitionV2("pending_waitlist", "cancelled")).toBe(true);
  });

  it("should reject pending_waitlist -> confirmed", () => {
    expect(canTransitionV2("pending_waitlist", "confirmed")).toBe(false);
  });

  // ---- Valid transitions from "on_hold" ----
  const onHoldTargets = [
    "confirmed",
    "refused",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of onHoldTargets) {
    it(`should allow on_hold -> ${target}`, () => {
      expect(canTransitionV2("on_hold", target)).toBe(true);
    });
  }

  it("should reject on_hold -> consumed", () => {
    expect(canTransitionV2("on_hold", "consumed")).toBe(false);
  });

  // ---- Valid transitions from "deposit_requested" ----
  const depositRequestedTargets = [
    "deposit_paid",
    "expired",
    "cancelled_user",
    "cancelled_pro",
    "cancelled",
  ];

  for (const target of depositRequestedTargets) {
    it(`should allow deposit_requested -> ${target}`, () => {
      expect(canTransitionV2("deposit_requested", target)).toBe(true);
    });
  }

  it("should reject deposit_requested -> confirmed", () => {
    expect(canTransitionV2("deposit_requested", "confirmed")).toBe(false);
  });

  // ---- Valid transitions from "deposit_paid" ----
  const depositPaidTargets = [
    "confirmed",
    "consumed",
    "consumed_default",
    "noshow",
    "cancelled_pro",
    "cancelled",
  ];

  for (const target of depositPaidTargets) {
    it(`should allow deposit_paid -> ${target}`, () => {
      expect(canTransitionV2("deposit_paid", target)).toBe(true);
    });
  }

  it("should reject deposit_paid -> cancelled_user (not in map)", () => {
    expect(canTransitionV2("deposit_paid", "cancelled_user")).toBe(false);
  });

  // ---- Valid transitions from "noshow" ----
  it("should allow noshow -> no_show_confirmed", () => {
    expect(canTransitionV2("noshow", "no_show_confirmed")).toBe(true);
  });

  it("should allow noshow -> no_show_disputed", () => {
    expect(canTransitionV2("noshow", "no_show_disputed")).toBe(true);
  });

  it("should reject noshow -> confirmed", () => {
    expect(canTransitionV2("noshow", "confirmed")).toBe(false);
  });

  // ---- Valid transitions from "no_show_disputed" ----
  it("should allow no_show_disputed -> no_show_confirmed", () => {
    expect(canTransitionV2("no_show_disputed", "no_show_confirmed")).toBe(true);
  });

  it("should allow no_show_disputed -> consumed (arbitration in favor of client)", () => {
    expect(canTransitionV2("no_show_disputed", "consumed")).toBe(true);
  });

  it("should reject no_show_disputed -> cancelled", () => {
    expect(canTransitionV2("no_show_disputed", "cancelled")).toBe(false);
  });

  // ---- Unknown source status ----
  it("should return false for unknown source status", () => {
    expect(canTransitionV2("nonexistent", "confirmed")).toBe(false);
  });
});

// =============================================================================
// classifyCancellation
// =============================================================================

describe("classifyCancellation", () => {
  const reservationTime = new Date("2026-03-15T20:00:00Z");

  it('should return "free" when cancelling > 24h before reservation', () => {
    const cancelAt = new Date("2026-03-14T10:00:00Z"); // 34h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("free");
  });

  it('should return "free" when cancelling exactly 25h before reservation', () => {
    const cancelAt = new Date("2026-03-14T19:00:00Z"); // 25h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("free");
  });

  it('should return "late" when cancelling exactly 24h before reservation', () => {
    const cancelAt = new Date("2026-03-14T20:00:00Z"); // 24h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("late");
  });

  it('should return "late" when cancelling 18h before reservation', () => {
    const cancelAt = new Date("2026-03-15T02:00:00Z"); // 18h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("late");
  });

  it('should return "late" when cancelling 13h before reservation', () => {
    const cancelAt = new Date("2026-03-15T07:00:00Z"); // 13h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("late");
  });

  it('should return "very_late" when cancelling exactly 12h before reservation', () => {
    const cancelAt = new Date("2026-03-15T08:00:00Z"); // 12h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("very_late");
  });

  it('should return "very_late" when cancelling 6h before reservation', () => {
    const cancelAt = new Date("2026-03-15T14:00:00Z"); // 6h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("very_late");
  });

  it('should return "very_late" when cancelling 4h before reservation', () => {
    const cancelAt = new Date("2026-03-15T16:00:00Z"); // 4h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("very_late");
  });

  it('should return "blocked" when cancelling exactly 3h before reservation (H-3 boundary)', () => {
    const cancelAt = new Date("2026-03-15T17:00:00Z"); // 3h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("blocked");
  });

  it('should return "blocked" when cancelling 1h before reservation', () => {
    const cancelAt = new Date("2026-03-15T19:00:00Z"); // 1h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("blocked");
  });

  it('should return "blocked" when cancelling at reservation time (0h)', () => {
    const cancelAt = new Date("2026-03-15T20:00:00Z"); // 0h
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("blocked");
  });

  it('should return "blocked" when cancelling after reservation time (negative hours)', () => {
    const cancelAt = new Date("2026-03-15T22:00:00Z"); // -2h
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("blocked");
  });

  it('should return "free" for very early cancellation (48h before)', () => {
    const cancelAt = new Date("2026-03-13T20:00:00Z"); // 48h before
    expect(classifyCancellation(reservationTime, cancelAt)).toBe("free");
  });

  it("should use RESERVATION_TIMINGS.PROTECTION_WINDOW_HOURS constant (3h)", () => {
    expect(RESERVATION_TIMINGS.PROTECTION_WINDOW_HOURS).toBe(3);
  });
});

// =============================================================================
// scoreToStars
// =============================================================================

describe("scoreToStars", () => {
  it("should convert 0 to 0 stars", () => {
    expect(scoreToStars(0)).toBe(0);
  });

  it("should convert 20 to 1.0 stars", () => {
    expect(scoreToStars(20)).toBe(1);
  });

  it("should convert 40 to 2.0 stars", () => {
    expect(scoreToStars(40)).toBe(2);
  });

  it("should convert 60 (base) to 3.0 stars", () => {
    expect(scoreToStars(60)).toBe(3);
  });

  it("should convert 80 to 4.0 stars", () => {
    expect(scoreToStars(80)).toBe(4);
  });

  it("should convert 85 to 4.25 stars", () => {
    expect(scoreToStars(85)).toBe(4.25);
  });

  it("should convert 100 to 5.0 stars", () => {
    expect(scoreToStars(100)).toBe(5);
  });

  it("should clamp negative score to 0 (0 stars)", () => {
    expect(scoreToStars(-10)).toBe(0);
  });

  it("should clamp score above 100 to 5.0 stars", () => {
    expect(scoreToStars(120)).toBe(5);
  });

  it("should handle fractional scores with rounding to 2 decimal places", () => {
    // 33 / 20 = 1.65
    expect(scoreToStars(33)).toBe(1.65);
  });

  it("should handle score = 1 (1/20 = 0.05)", () => {
    expect(scoreToStars(1)).toBe(0.05);
  });
});

// =============================================================================
// starsToScore
// =============================================================================

describe("starsToScore", () => {
  it("should convert 0 stars to score 0", () => {
    expect(starsToScore(0)).toBe(0);
  });

  it("should convert 1.0 stars to score 20", () => {
    expect(starsToScore(1)).toBe(20);
  });

  it("should convert 3.0 stars to score 60", () => {
    expect(starsToScore(3)).toBe(60);
  });

  it("should convert 4.25 stars to score 85", () => {
    expect(starsToScore(4.25)).toBe(85);
  });

  it("should convert 5.0 stars to score 100", () => {
    expect(starsToScore(5)).toBe(100);
  });

  it("should clamp negative stars to score 0", () => {
    expect(starsToScore(-1)).toBe(0);
  });

  it("should clamp stars above 5 to score 100", () => {
    expect(starsToScore(7)).toBe(100);
  });

  it("should be inverse of scoreToStars for integer multiples of 20", () => {
    for (const score of [0, 20, 40, 60, 80, 100]) {
      expect(starsToScore(scoreToStars(score))).toBe(score);
    }
  });
});

// =============================================================================
// computeClientScoreV2
// =============================================================================

describe("computeClientScoreV2", () => {
  /** Minimal empty stats — fresh user */
  const emptyStats = {
    honored: 0,
    noShows: 0,
    lateCancellations: 0,
    veryLateCancellations: 0,
    totalReservations: 0,
    reviewsPosted: 0,
    freeToPaidConversions: 0,
  };

  it("should return base score (60) for a fresh user with no activity", () => {
    expect(computeClientScoreV2(emptyStats)).toBe(SCORE_SCALE.BASE);
  });

  it("should add +5 per honored reservation", () => {
    const stats = { ...emptyStats, honored: 3 };
    expect(computeClientScoreV2(stats)).toBe(60 + 3 * 5); // 75
  });

  it("should subtract -15 per no-show", () => {
    const stats = { ...emptyStats, noShows: 2 };
    expect(computeClientScoreV2(stats)).toBe(60 + 2 * -15); // 30
  });

  it("should subtract -5 per late cancellation", () => {
    const stats = { ...emptyStats, lateCancellations: 4 };
    expect(computeClientScoreV2(stats)).toBe(60 + 4 * -5); // 40
  });

  it("should subtract -10 per very late cancellation", () => {
    const stats = { ...emptyStats, veryLateCancellations: 2 };
    expect(computeClientScoreV2(stats)).toBe(60 + 2 * -10); // 40
  });

  it("should add +1 per review posted", () => {
    const stats = { ...emptyStats, reviewsPosted: 10 };
    expect(computeClientScoreV2(stats)).toBe(60 + 10 * 1); // 70
  });

  it("should add +2 per free-to-paid conversion", () => {
    const stats = { ...emptyStats, freeToPaidConversions: 5 };
    expect(computeClientScoreV2(stats)).toBe(60 + 5 * 2); // 70
  });

  it("should add +5 seniority bonus at 5 total reservations", () => {
    const stats = { ...emptyStats, totalReservations: 5 };
    expect(computeClientScoreV2(stats)).toBe(60 + 5); // 65
  });

  it("should add +5 seniority bonus at 19 total reservations (< 20)", () => {
    const stats = { ...emptyStats, totalReservations: 19 };
    expect(computeClientScoreV2(stats)).toBe(60 + 5); // 65
  });

  it("should add +10 seniority bonus at 20 total reservations", () => {
    const stats = { ...emptyStats, totalReservations: 20 };
    expect(computeClientScoreV2(stats)).toBe(60 + 10); // 70
  });

  it("should add +10 seniority bonus at 100 total reservations (>= 20)", () => {
    const stats = { ...emptyStats, totalReservations: 100 };
    expect(computeClientScoreV2(stats)).toBe(60 + 10); // 70
  });

  it("should not add seniority bonus for < 5 reservations", () => {
    const stats = { ...emptyStats, totalReservations: 4 };
    expect(computeClientScoreV2(stats)).toBe(60); // no bonus
  });

  it("should clamp to minimum 0 for heavily penalized user", () => {
    const stats = { ...emptyStats, noShows: 10 }; // 60 + (-150) = -90 -> clamped to 0
    expect(computeClientScoreV2(stats)).toBe(0);
  });

  it("should clamp to maximum 100 for perfect user", () => {
    const stats = {
      honored: 50, // +250
      noShows: 0,
      lateCancellations: 0,
      veryLateCancellations: 0,
      totalReservations: 50, // +10 seniority
      reviewsPosted: 20, // +20
      freeToPaidConversions: 10, // +20
    };
    // 60 + 250 + 10 + 20 + 20 = 360 -> clamped to 100
    expect(computeClientScoreV2(stats)).toBe(100);
  });

  it("should combine all positive and negative factors correctly", () => {
    const stats = {
      honored: 10, // +50
      noShows: 1, // -15
      lateCancellations: 2, // -10
      veryLateCancellations: 1, // -10
      totalReservations: 14, // +5 seniority (>= 5, < 20)
      reviewsPosted: 3, // +3
      freeToPaidConversions: 1, // +2
    };
    // 60 + 50 - 15 - 10 - 10 + 5 + 3 + 2 = 85
    expect(computeClientScoreV2(stats)).toBe(85);
  });

  it("should return integer (rounded) values", () => {
    // All weights are integers and base is integer, so result is always integer
    const score = computeClientScoreV2({
      ...emptyStats,
      honored: 1,
      reviewsPosted: 1,
    });
    expect(Number.isInteger(score)).toBe(true);
  });
});

// =============================================================================
// Constant sets — sanity checks
// =============================================================================

describe("Constant sets sanity checks", () => {
  it("TERMINAL_STATUS_SET should contain all statuses from TERMINAL_STATUSES array", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(TERMINAL_STATUS_SET.has(s)).toBe(true);
    }
  });

  it("REVIEW_ELIGIBLE_STATUS_SET should contain all review-eligible statuses", () => {
    for (const s of REVIEW_ELIGIBLE_STATUSES) {
      expect(REVIEW_ELIGIBLE_STATUS_SET.has(s)).toBe(true);
    }
  });

  it("OCCUPYING_STATUS_SET should contain exactly occupying statuses", () => {
    for (const s of OCCUPYING_STATUSES) {
      expect(OCCUPYING_STATUS_SET.has(s)).toBe(true);
    }
    expect(OCCUPYING_STATUS_SET.size).toBe(OCCUPYING_STATUSES.length);
  });

  it("CANCELLABLE_STATUS_SET should contain exactly cancellable statuses", () => {
    for (const s of CANCELLABLE_STATUSES) {
      expect(CANCELLABLE_STATUS_SET.has(s)).toBe(true);
    }
    expect(CANCELLABLE_STATUS_SET.size).toBe(CANCELLABLE_STATUSES.length);
  });

  it("every RESERVATION_STATUSES value should be a string", () => {
    for (const s of RESERVATION_STATUSES) {
      expect(typeof s).toBe("string");
    }
  });

  it("RESERVATION_STATUSES should contain at least 18 values", () => {
    expect(RESERVATION_STATUSES.length).toBeGreaterThanOrEqual(18);
  });
});
