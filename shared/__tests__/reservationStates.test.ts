import { describe, it, expect } from "vitest";
import {
  OCCUPYING_RESERVATION_STATUSES,
  OCCUPYING_RESERVATION_STATUS_SET,
  OCCUPYING_RESERVATION_STATUSES_V2,
  OCCUPYING_RESERVATION_STATUS_V2_SET,
  ACTIVE_WAITLIST_ENTRY_STATUSES,
  ACTIVE_WAITLIST_ENTRY_STATUS_SET,
  CANCELLABLE_RESERVATION_STATUSES,
  CANCELLABLE_RESERVATION_STATUS_SET,
  CANCELLABLE_RESERVATION_STATUSES_V2,
  CANCELLABLE_RESERVATION_STATUS_V2_SET,
  MODIFIABLE_RESERVATION_STATUSES,
  MODIFIABLE_RESERVATION_STATUS_SET,
  REVIEW_ELIGIBLE_STATUSES,
  REVIEW_ELIGIBLE_STATUS_SET,
  isCancelledReservationStatus,
  isTerminalReservationStatus,
  canTransitionReservationStatus,
  canTransitionReservationStatusV2,
} from "../reservationStates";

// =============================================================================
// isCancelledReservationStatus
// =============================================================================

describe("isCancelledReservationStatus", () => {
  it('should return true for "cancelled"', () => {
    expect(isCancelledReservationStatus("cancelled")).toBe(true);
  });

  it('should return true for "cancelled_user"', () => {
    expect(isCancelledReservationStatus("cancelled_user")).toBe(true);
  });

  it('should return true for "cancelled_pro"', () => {
    expect(isCancelledReservationStatus("cancelled_pro")).toBe(true);
  });

  it('should return true for "cancelled_waitlist_expired"', () => {
    expect(isCancelledReservationStatus("cancelled_waitlist_expired")).toBe(true);
  });

  it("should return true for any string starting with cancelled_", () => {
    expect(isCancelledReservationStatus("cancelled_unknown_reason")).toBe(true);
  });

  it('should return false for "confirmed"', () => {
    expect(isCancelledReservationStatus("confirmed")).toBe(false);
  });

  it('should return false for "requested"', () => {
    expect(isCancelledReservationStatus("requested")).toBe(false);
  });

  it('should return false for "refused"', () => {
    expect(isCancelledReservationStatus("refused")).toBe(false);
  });

  it('should return false for "consumed"', () => {
    expect(isCancelledReservationStatus("consumed")).toBe(false);
  });

  it('should return false for "noshow"', () => {
    expect(isCancelledReservationStatus("noshow")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isCancelledReservationStatus("")).toBe(false);
  });

  it("should handle case-insensitively via lowercasing", () => {
    expect(isCancelledReservationStatus("CANCELLED")).toBe(true);
    expect(isCancelledReservationStatus("Cancelled_User")).toBe(true);
  });

  it("should handle null/undefined coercion gracefully", () => {
    expect(isCancelledReservationStatus(null as any)).toBe(false);
    expect(isCancelledReservationStatus(undefined as any)).toBe(false);
  });
});

// =============================================================================
// isTerminalReservationStatus
// =============================================================================

describe("isTerminalReservationStatus", () => {
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
      expect(isTerminalReservationStatus(status)).toBe(true);
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
      expect(isTerminalReservationStatus(status)).toBe(false);
    });
  }

  it("should return true for any cancelled_ prefix (via isCancelledReservationStatus)", () => {
    expect(isTerminalReservationStatus("cancelled_something_custom")).toBe(true);
  });

  it("should return false for empty string", () => {
    expect(isTerminalReservationStatus("")).toBe(false);
  });

  it("should handle case-insensitively via lowercasing", () => {
    expect(isTerminalReservationStatus("REFUSED")).toBe(true);
    expect(isTerminalReservationStatus("Consumed")).toBe(true);
  });

  it("should handle null/undefined gracefully", () => {
    expect(isTerminalReservationStatus(null as any)).toBe(false);
    expect(isTerminalReservationStatus(undefined as any)).toBe(false);
  });
});

// =============================================================================
// canTransitionReservationStatus (V1)
// =============================================================================

describe("canTransitionReservationStatus (V1)", () => {
  // ---- Self-transitions ----
  it("should allow self-transition (same status)", () => {
    expect(canTransitionReservationStatus({ from: "requested", to: "requested" })).toBe(true);
    expect(canTransitionReservationStatus({ from: "confirmed", to: "confirmed" })).toBe(true);
  });

  // ---- Empty target ----
  it("should return false for empty target", () => {
    expect(canTransitionReservationStatus({ from: "requested", to: "" })).toBe(false);
  });

  // ---- Terminal statuses block outgoing transitions ----
  it("should block transitions from cancelled status", () => {
    expect(canTransitionReservationStatus({ from: "cancelled", to: "confirmed" })).toBe(false);
  });

  it("should block transitions from cancelled_user", () => {
    expect(canTransitionReservationStatus({ from: "cancelled_user", to: "confirmed" })).toBe(false);
  });

  it("should block transitions from cancelled_pro", () => {
    expect(canTransitionReservationStatus({ from: "cancelled_pro", to: "confirmed" })).toBe(false);
  });

  it("should block transitions from refused", () => {
    expect(canTransitionReservationStatus({ from: "refused", to: "confirmed" })).toBe(false);
  });

  // ---- Valid transitions from "requested" ----
  const requestedV1Targets = [
    "pending_pro_validation",
    "confirmed",
    "refused",
    "waitlist",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of requestedV1Targets) {
    it(`should allow requested -> ${target} (V1)`, () => {
      expect(canTransitionReservationStatus({ from: "requested", to: target })).toBe(true);
    });
  }

  it("should reject requested -> consumed (V1)", () => {
    expect(canTransitionReservationStatus({ from: "requested", to: "consumed" })).toBe(false);
  });

  // ---- Valid transitions from "pending_pro_validation" ----
  const pendingProV1Targets = [
    "confirmed",
    "refused",
    "waitlist",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of pendingProV1Targets) {
    it(`should allow pending_pro_validation -> ${target} (V1)`, () => {
      expect(canTransitionReservationStatus({ from: "pending_pro_validation", to: target })).toBe(true);
    });
  }

  // ---- Valid transitions from "confirmed" ----
  const confirmedV1Targets = [
    "noshow",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of confirmedV1Targets) {
    it(`should allow confirmed -> ${target} (V1)`, () => {
      expect(canTransitionReservationStatus({ from: "confirmed", to: target })).toBe(true);
    });
  }

  it("should reject confirmed -> consumed (V1 does not have consumed)", () => {
    expect(canTransitionReservationStatus({ from: "confirmed", to: "consumed" })).toBe(false);
  });

  // ---- Valid transitions from "waitlist" ----
  const waitlistV1Targets = [
    "cancelled_user",
    "cancelled_pro",
    "cancelled",
  ];

  for (const target of waitlistV1Targets) {
    it(`should allow waitlist -> ${target} (V1)`, () => {
      expect(canTransitionReservationStatus({ from: "waitlist", to: target })).toBe(true);
    });
  }

  it("should reject waitlist -> confirmed (V1)", () => {
    expect(canTransitionReservationStatus({ from: "waitlist", to: "confirmed" })).toBe(false);
  });

  // ---- noshow is terminal-like in V1 (no outgoing transitions) ----
  it("should block noshow -> any other (V1 — empty set)", () => {
    expect(canTransitionReservationStatus({ from: "noshow", to: "confirmed" })).toBe(false);
    expect(canTransitionReservationStatus({ from: "noshow", to: "cancelled" })).toBe(false);
  });

  // ---- Unknown source status ----
  it("should return false for unknown source status", () => {
    expect(canTransitionReservationStatus({ from: "unknown", to: "confirmed" })).toBe(false);
  });

  // ---- Case-insensitive handling ----
  it("should handle uppercase inputs via lowercasing", () => {
    expect(canTransitionReservationStatus({ from: "REQUESTED", to: "CONFIRMED" })).toBe(true);
  });
});

// =============================================================================
// canTransitionReservationStatusV2
// =============================================================================

describe("canTransitionReservationStatusV2", () => {
  // ---- Self-transitions ----
  it("should allow self-transition", () => {
    expect(canTransitionReservationStatusV2({ from: "on_hold", to: "on_hold" })).toBe(true);
  });

  // ---- Empty target ----
  it("should return false for empty target", () => {
    expect(canTransitionReservationStatusV2({ from: "requested", to: "" })).toBe(false);
  });

  // ---- Terminal statuses block outgoing transitions ----
  it("should block transitions from terminal status consumed", () => {
    expect(canTransitionReservationStatusV2({ from: "consumed", to: "confirmed" })).toBe(false);
  });

  it("should block transitions from terminal status expired", () => {
    expect(canTransitionReservationStatusV2({ from: "expired", to: "confirmed" })).toBe(false);
  });

  it("should block transitions from terminal status no_show_confirmed", () => {
    expect(canTransitionReservationStatusV2({ from: "no_show_confirmed", to: "confirmed" })).toBe(false);
  });

  // ---- V2-specific transitions from "requested" ----
  it("should allow requested -> on_hold (V2 extension)", () => {
    expect(canTransitionReservationStatusV2({ from: "requested", to: "on_hold" })).toBe(true);
  });

  it("should allow requested -> expired (V2 extension)", () => {
    expect(canTransitionReservationStatusV2({ from: "requested", to: "expired" })).toBe(true);
  });

  // ---- V2-specific transitions from "confirmed" ----
  it("should allow confirmed -> consumed (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "confirmed", to: "consumed" })).toBe(true);
  });

  it("should allow confirmed -> consumed_default (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "confirmed", to: "consumed_default" })).toBe(true);
  });

  it("should allow confirmed -> deposit_requested (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "confirmed", to: "deposit_requested" })).toBe(true);
  });

  // ---- Transitions from "on_hold" ----
  const onHoldV2Targets = [
    "confirmed",
    "refused",
    "expired",
    "cancelled_pro",
    "cancelled_user",
    "cancelled",
  ];

  for (const target of onHoldV2Targets) {
    it(`should allow on_hold -> ${target} (V2)`, () => {
      expect(canTransitionReservationStatusV2({ from: "on_hold", to: target })).toBe(true);
    });
  }

  it("should reject on_hold -> noshow", () => {
    expect(canTransitionReservationStatusV2({ from: "on_hold", to: "noshow" })).toBe(false);
  });

  // ---- Transitions from "deposit_requested" ----
  const depositReqTargets = [
    "deposit_paid",
    "expired",
    "cancelled_user",
    "cancelled_pro",
    "cancelled",
  ];

  for (const target of depositReqTargets) {
    it(`should allow deposit_requested -> ${target} (V2)`, () => {
      expect(canTransitionReservationStatusV2({ from: "deposit_requested", to: target })).toBe(true);
    });
  }

  // ---- Transitions from "deposit_paid" ----
  const depositPaidTargets = [
    "confirmed",
    "consumed",
    "consumed_default",
    "noshow",
    "cancelled_pro",
    "cancelled",
  ];

  for (const target of depositPaidTargets) {
    it(`should allow deposit_paid -> ${target} (V2)`, () => {
      expect(canTransitionReservationStatusV2({ from: "deposit_paid", to: target })).toBe(true);
    });
  }

  it("should reject deposit_paid -> cancelled_user (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "deposit_paid", to: "cancelled_user" })).toBe(false);
  });

  // ---- Transitions from "noshow" ----
  it("should allow noshow -> no_show_confirmed (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "noshow", to: "no_show_confirmed" })).toBe(true);
  });

  it("should allow noshow -> no_show_disputed (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "noshow", to: "no_show_disputed" })).toBe(true);
  });

  it("should reject noshow -> confirmed (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "noshow", to: "confirmed" })).toBe(false);
  });

  // ---- Transitions from "no_show_disputed" ----
  it("should allow no_show_disputed -> no_show_confirmed", () => {
    expect(canTransitionReservationStatusV2({ from: "no_show_disputed", to: "no_show_confirmed" })).toBe(true);
  });

  it("should allow no_show_disputed -> consumed (arbitration in favor of client)", () => {
    expect(canTransitionReservationStatusV2({ from: "no_show_disputed", to: "consumed" })).toBe(true);
  });

  it("should reject no_show_disputed -> cancelled", () => {
    expect(canTransitionReservationStatusV2({ from: "no_show_disputed", to: "cancelled" })).toBe(false);
  });

  // ---- Transitions from "waitlist" — V2 extensions ----
  it("should allow waitlist -> requested (V2 — promote from waitlist)", () => {
    expect(canTransitionReservationStatusV2({ from: "waitlist", to: "requested" })).toBe(true);
  });

  it("should allow waitlist -> confirmed (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "waitlist", to: "confirmed" })).toBe(true);
  });

  it("should allow waitlist -> cancelled_waitlist_expired (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "waitlist", to: "cancelled_waitlist_expired" })).toBe(true);
  });

  // ---- Transitions from "pending_waitlist" ----
  it("should allow pending_waitlist -> waitlist (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "pending_waitlist", to: "waitlist" })).toBe(true);
  });

  it("should allow pending_waitlist -> cancelled_user (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "pending_waitlist", to: "cancelled_user" })).toBe(true);
  });

  it("should reject pending_waitlist -> confirmed (V2)", () => {
    expect(canTransitionReservationStatusV2({ from: "pending_waitlist", to: "confirmed" })).toBe(false);
  });

  // ---- Unknown source ----
  it("should return false for unknown source status", () => {
    expect(canTransitionReservationStatusV2({ from: "nonexistent", to: "confirmed" })).toBe(false);
  });

  // ---- Case-insensitive ----
  it("should handle uppercase inputs via lowercasing", () => {
    expect(canTransitionReservationStatusV2({ from: "ON_HOLD", to: "CONFIRMED" })).toBe(true);
  });
});

// =============================================================================
// Constant sets — sanity checks
// =============================================================================

describe("Constant sets sanity checks", () => {
  it("OCCUPYING_RESERVATION_STATUS_SET matches array (V1)", () => {
    expect(OCCUPYING_RESERVATION_STATUS_SET.size).toBe(OCCUPYING_RESERVATION_STATUSES.length);
    for (const s of OCCUPYING_RESERVATION_STATUSES) {
      expect(OCCUPYING_RESERVATION_STATUS_SET.has(s)).toBe(true);
    }
  });

  it("OCCUPYING_RESERVATION_STATUS_V2_SET includes deposit_paid", () => {
    expect(OCCUPYING_RESERVATION_STATUS_V2_SET.has("deposit_paid")).toBe(true);
    expect(OCCUPYING_RESERVATION_STATUS_V2_SET.size).toBe(OCCUPYING_RESERVATION_STATUSES_V2.length);
  });

  it("ACTIVE_WAITLIST_ENTRY_STATUS_SET matches array", () => {
    expect(ACTIVE_WAITLIST_ENTRY_STATUS_SET.size).toBe(ACTIVE_WAITLIST_ENTRY_STATUSES.length);
    for (const s of ACTIVE_WAITLIST_ENTRY_STATUSES) {
      expect(ACTIVE_WAITLIST_ENTRY_STATUS_SET.has(s)).toBe(true);
    }
  });

  it("CANCELLABLE_RESERVATION_STATUS_SET matches array (V1)", () => {
    expect(CANCELLABLE_RESERVATION_STATUS_SET.size).toBe(CANCELLABLE_RESERVATION_STATUSES.length);
    for (const s of CANCELLABLE_RESERVATION_STATUSES) {
      expect(CANCELLABLE_RESERVATION_STATUS_SET.has(s)).toBe(true);
    }
  });

  it("CANCELLABLE_RESERVATION_STATUS_V2_SET includes V2 statuses", () => {
    expect(CANCELLABLE_RESERVATION_STATUS_V2_SET.has("on_hold")).toBe(true);
    expect(CANCELLABLE_RESERVATION_STATUS_V2_SET.has("deposit_requested")).toBe(true);
    expect(CANCELLABLE_RESERVATION_STATUS_V2_SET.has("deposit_paid")).toBe(true);
    expect(CANCELLABLE_RESERVATION_STATUS_V2_SET.size).toBe(CANCELLABLE_RESERVATION_STATUSES_V2.length);
  });

  it("MODIFIABLE_RESERVATION_STATUS_SET matches array", () => {
    expect(MODIFIABLE_RESERVATION_STATUS_SET.size).toBe(MODIFIABLE_RESERVATION_STATUSES.length);
    for (const s of MODIFIABLE_RESERVATION_STATUSES) {
      expect(MODIFIABLE_RESERVATION_STATUS_SET.has(s)).toBe(true);
    }
  });

  it("REVIEW_ELIGIBLE_STATUS_SET matches array", () => {
    expect(REVIEW_ELIGIBLE_STATUS_SET.size).toBe(REVIEW_ELIGIBLE_STATUSES.length);
    for (const s of REVIEW_ELIGIBLE_STATUSES) {
      expect(REVIEW_ELIGIBLE_STATUS_SET.has(s)).toBe(true);
    }
  });
});
