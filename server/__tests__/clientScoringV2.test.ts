/**
 * Tests for server/clientScoringV2.ts
 *
 * All Supabase calls are mocked via a reusable chainable factory.
 * Each exported function is tested for:
 *   - Happy path (DB returns expected data)
 *   - Error / empty paths
 *   - Edge cases specific to the function (suspension, rehabilitation, etc.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports from the module
// ---------------------------------------------------------------------------

vi.mock("../lib/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import the functions under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import {
  recomputeClientScoreV2,
  recordHonoredReservation,
  recordNoShow,
  recordCancellation,
  recordReviewPosted,
  recordFreeToPaidUpgrade,
  isClientSuspended,
  liftSuspension,
  autoLiftExpiredSuspensions,
} from "../clientScoringV2";

import { SCORE_SCALE } from "../../shared/reservationTypesV2";

// ---------------------------------------------------------------------------
// Reusable Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase() {
  let _result: { data: unknown; error: unknown } = { data: null, error: null };

  const builder: Record<string, any> = {};

  const chainMethods = [
    "from",
    "select",
    "eq",
    "neq",
    "lt",
    "lte",
    "gt",
    "gte",
    "not",
    "in",
    "limit",
    "insert",
    "update",
    "upsert",
    "delete",
    "range",
    "order",
  ];

  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }

  builder.maybeSingle = vi.fn(() => _result);
  builder.single = vi.fn(() => _result);
  builder.then = (resolve: Function) => resolve(_result);
  builder.rpc = vi.fn(() => _result);

  builder.__setResult = (r: { data: unknown; error: unknown }) => {
    _result = r;
  };

  builder.__reset = () => {
    _result = { data: null, error: null };
    for (const m of chainMethods) {
      (builder[m] as ReturnType<typeof vi.fn>).mockClear();
    }
    (builder.maybeSingle as ReturnType<typeof vi.fn>).mockClear();
    (builder.single as ReturnType<typeof vi.fn>).mockClear();
    (builder.rpc as ReturnType<typeof vi.fn>).mockClear();
  };

  return builder;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabase();

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.__reset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatsRow(overrides: Record<string, unknown> = {}) {
  return {
    reliability_score: 60,
    reservations_count: 0,
    no_shows_count: 0,
    honored_reservations: 0,
    late_cancellations: 0,
    very_late_cancellations: 0,
    reviews_posted: 0,
    consecutive_honored: 0,
    consecutive_no_shows: 0,
    free_to_paid_conversions: 0,
    is_suspended: false,
    suspended_until: null,
    suspension_reason: null,
    total_reservations: 0,
    scoring_version: 2,
    ...overrides,
  };
}

const TEST_USER_ID = "user-abc-123";

// ==========================================================================
// 1. recomputeClientScoreV2
// ==========================================================================

describe("recomputeClientScoreV2", () => {
  it("returns default score result when userId is empty", async () => {
    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: "",
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
    expect(result.stars).toBe(3);
    expect(result.isSuspended).toBe(false);
    expect(result.stats.totalReservations).toBe(0);
  });

  it("returns default score result when DB returns an error", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "db down" } });

    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
    expect(result.level).toBe("good");
  });

  it("returns default score result when DB returns null data", async () => {
    mockSupabase.__setResult({ data: null, error: null });

    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
  });

  it("computes correct score for a user with honored reservations", async () => {
    const row = makeStatsRow({
      honored_reservations: 4,
      total_reservations: 4,
    });
    mockSupabase.__setResult({ data: row, error: null });

    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    // BASE(60) + 4*5(honored) = 80
    expect(result.score).toBe(80);
    expect(result.stars).toBe(4);
    expect(result.level).toBe("good");
    expect(result.stats.honoredReservations).toBe(4);
  });

  it("computes correct score including no-shows and seniority", async () => {
    const row = makeStatsRow({
      honored_reservations: 6,
      no_shows_count: 1,
      total_reservations: 7,
      reviews_posted: 2,
    });
    mockSupabase.__setResult({ data: row, error: null });

    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    // BASE(60) + 6*5(honored=30) + 1*(-15)(no_show=-15) + 2*1(review=2) + 5(seniority_5) = 82
    expect(result.score).toBe(82);
    expect(result.stats.noShowsCount).toBe(1);
    expect(result.stats.reviewsPosted).toBe(2);
  });

  it("passes suspension info through from the DB row", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeStatsRow({
      is_suspended: true,
      suspended_until: futureDate,
      suspension_reason: "3 no-shows consécutifs",
    });
    mockSupabase.__setResult({ data: row, error: null });

    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.isSuspended).toBe(true);
    expect(result.suspendedUntil).toBe(futureDate);
    expect(result.suspensionReason).toBe("3 no-shows consécutifs");
  });

  it("clamps score to min bound", async () => {
    const row = makeStatsRow({
      no_shows_count: 10,
      total_reservations: 10,
    });
    mockSupabase.__setResult({ data: row, error: null });

    const result = await recomputeClientScoreV2({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    // BASE(60) + 10*(-15) = -90 => clamped to 0
    expect(result.score).toBe(SCORE_SCALE.MIN);
    expect(result.level).toBe("fragile");
  });
});

// ==========================================================================
// 2. recordHonoredReservation
// ==========================================================================

describe("recordHonoredReservation", () => {
  it("returns default score for empty userId", async () => {
    const result = await recordHonoredReservation({
      supabase: mockSupabase as any,
      userId: "",
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
  });

  it("increments honored_reservations and total_reservations", async () => {
    const currentRow = makeStatsRow({
      honored_reservations: 2,
      total_reservations: 3,
      consecutive_honored: 1,
    });
    mockSupabase.__setResult({ data: currentRow, error: null });

    await recordHonoredReservation({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(mockSupabase.update).toHaveBeenCalled();
  });
});

// ==========================================================================
// 3. recordNoShow
// ==========================================================================

describe("recordNoShow", () => {
  it("returns default score with newlySuspended=false for empty userId", async () => {
    const result = await recordNoShow({
      supabase: mockSupabase as any,
      userId: "",
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
    expect(result.newlySuspended).toBe(false);
  });

  it("increments no_shows and resets consecutive_honored to 0", async () => {
    const currentRow = makeStatsRow({
      consecutive_no_shows: 0,
      no_shows_count: 0,
      is_suspended: false,
      consecutive_honored: 3,
    });
    mockSupabase.__setResult({ data: currentRow, error: null });

    await recordNoShow({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    const updateCalls = mockSupabase.update.mock.calls;
    const firstUpdate = updateCalls[0]?.[0];
    expect(firstUpdate).toHaveProperty("consecutive_honored", 0);
    expect(firstUpdate).toHaveProperty("no_shows_count", 1);
    expect(firstUpdate).toHaveProperty("consecutive_no_shows", 1);
  });

  it("auto-suspends after CONSECUTIVE_NO_SHOWS_THRESHOLD", async () => {
    const currentRow = makeStatsRow({
      consecutive_no_shows: 2,
      no_shows_count: 2,
      is_suspended: false,
    });
    mockSupabase.__setResult({ data: currentRow, error: null });

    const result = await recordNoShow({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.newlySuspended).toBe(true);

    const updateCalls = mockSupabase.update.mock.calls;
    const suspensionUpdate = updateCalls[0]?.[0];
    expect(suspensionUpdate).toHaveProperty("is_suspended", true);
    expect(suspensionUpdate).toHaveProperty("suspension_reason");
    expect(suspensionUpdate.suspended_until).toBeDefined();
  });

  it("does not re-suspend an already-suspended user", async () => {
    const currentRow = makeStatsRow({
      consecutive_no_shows: 3,
      no_shows_count: 3,
      is_suspended: true,
    });
    mockSupabase.__setResult({ data: currentRow, error: null });

    const result = await recordNoShow({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.newlySuspended).toBe(false);
  });
});

// ==========================================================================
// 4. recordCancellation
// ==========================================================================

describe("recordCancellation", () => {
  it("returns cancellationType='free' when cancelled > 24h before", async () => {
    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const cancelledAt = new Date();

    mockSupabase.__setResult({ data: makeStatsRow(), error: null });

    const result = await recordCancellation({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
      startsAt,
      cancelledAt,
    });

    expect(result.cancellationType).toBe("free");
  });

  it("returns cancellationType='late' for cancel 12h-24h before", async () => {
    const startsAt = new Date(Date.now() + 18 * 60 * 60 * 1000);
    const cancelledAt = new Date();

    mockSupabase.__setResult({ data: makeStatsRow({ late_cancellations: 1 }), error: null });

    const result = await recordCancellation({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
      startsAt,
      cancelledAt,
    });

    expect(result.cancellationType).toBe("late");
  });

  it("returns cancellationType='very_late' for cancel < 12h before", async () => {
    const startsAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const cancelledAt = new Date();

    mockSupabase.__setResult({ data: makeStatsRow(), error: null });

    const result = await recordCancellation({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
      startsAt,
      cancelledAt,
    });

    expect(result.cancellationType).toBe("very_late");
  });

  it("returns default result for empty userId", async () => {
    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    mockSupabase.__setResult({ data: makeStatsRow(), error: null });

    const result = await recordCancellation({
      supabase: mockSupabase as any,
      userId: "",
      startsAt,
    });

    expect(result.cancellationType).toBe("free");
    expect(result.score).toBe(SCORE_SCALE.BASE);
  });
});

// ==========================================================================
// 5. recordReviewPosted
// ==========================================================================

describe("recordReviewPosted", () => {
  it("returns default score for empty userId", async () => {
    const result = await recordReviewPosted({
      supabase: mockSupabase as any,
      userId: "",
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
  });

  it("increments reviews_posted by 1", async () => {
    const currentRow = makeStatsRow({ reviews_posted: 3 });
    mockSupabase.__setResult({ data: currentRow, error: null });

    await recordReviewPosted({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    const updateCalls = mockSupabase.update.mock.calls;
    const reviewUpdate = updateCalls.find((c: any) => c[0]?.reviews_posted !== undefined);
    expect(reviewUpdate?.[0]?.reviews_posted).toBe(4);
  });
});

// ==========================================================================
// 6. recordFreeToPaidUpgrade
// ==========================================================================

describe("recordFreeToPaidUpgrade", () => {
  it("returns default score for empty userId", async () => {
    const result = await recordFreeToPaidUpgrade({
      supabase: mockSupabase as any,
      userId: "",
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
  });

  it("increments free_to_paid_conversions by 1", async () => {
    const currentRow = makeStatsRow({ free_to_paid_conversions: 1 });
    mockSupabase.__setResult({ data: currentRow, error: null });

    await recordFreeToPaidUpgrade({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    const updateCalls = mockSupabase.update.mock.calls;
    const upgradeUpdate = updateCalls.find((c: any) => c[0]?.free_to_paid_conversions !== undefined);
    expect(upgradeUpdate?.[0]?.free_to_paid_conversions).toBe(2);
  });
});

// ==========================================================================
// 7. isClientSuspended
// ==========================================================================

describe("isClientSuspended", () => {
  it("returns suspended=false when no stats row exists", async () => {
    mockSupabase.__setResult({ data: null, error: null });

    const result = await isClientSuspended({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.suspended).toBe(false);
    expect(result.until).toBeNull();
    expect(result.reason).toBeNull();
  });

  it("returns suspended=true with details when user is actively suspended", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockSupabase.__setResult({
      data: {
        is_suspended: true,
        suspended_until: futureDate,
        suspension_reason: "3 no-shows consécutifs",
      },
      error: null,
    });

    const result = await isClientSuspended({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.suspended).toBe(true);
    expect(result.until).toBe(futureDate);
    expect(result.reason).toBe("3 no-shows consécutifs");
  });

  it("auto-lifts expired suspension and returns suspended=false", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockSupabase.__setResult({
      data: {
        is_suspended: true,
        suspended_until: pastDate,
        suspension_reason: "3 no-shows consécutifs",
      },
      error: null,
    });

    const result = await isClientSuspended({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.suspended).toBe(false);
    expect(result.until).toBeNull();
    expect(result.reason).toBeNull();

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_suspended: false,
        suspended_until: null,
        suspension_reason: null,
      }),
    );
  });

  it("returns suspended=false when is_suspended is false in DB", async () => {
    mockSupabase.__setResult({
      data: {
        is_suspended: false,
        suspended_until: null,
        suspension_reason: null,
      },
      error: null,
    });

    const result = await isClientSuspended({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    expect(result.suspended).toBe(false);
  });
});

// ==========================================================================
// 8. liftSuspension
// ==========================================================================

describe("liftSuspension", () => {
  it("returns default score for empty userId", async () => {
    const result = await liftSuspension({
      supabase: mockSupabase as any,
      userId: "",
    });

    expect(result.score).toBe(SCORE_SCALE.BASE);
  });

  it("clears suspension fields in DB and returns recomputed score", async () => {
    const row = makeStatsRow({
      honored_reservations: 2,
      total_reservations: 5,
      is_suspended: true,
      suspended_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      suspension_reason: "3 no-shows consécutifs",
    });
    mockSupabase.__setResult({ data: row, error: null });

    const result = await liftSuspension({
      supabase: mockSupabase as any,
      userId: TEST_USER_ID,
    });

    const firstUpdateArg = mockSupabase.update.mock.calls[0]?.[0];
    expect(firstUpdateArg).toHaveProperty("is_suspended", false);
    expect(firstUpdateArg).toHaveProperty("suspended_until", null);
    expect(firstUpdateArg).toHaveProperty("suspension_reason", null);

    expect(result.score).toBeGreaterThanOrEqual(SCORE_SCALE.MIN);
  });
});

// ==========================================================================
// 9. autoLiftExpiredSuspensions
// ==========================================================================

describe("autoLiftExpiredSuspensions", () => {
  it("returns 0 when DB query errors", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "db error" } });

    const count = await autoLiftExpiredSuspensions({
      supabase: mockSupabase as any,
    });

    expect(count).toBe(0);
  });

  it("returns 0 when no expired suspensions found", async () => {
    mockSupabase.__setResult({ data: [], error: null });

    const count = await autoLiftExpiredSuspensions({
      supabase: mockSupabase as any,
    });

    expect(count).toBe(0);
  });

  it("returns the count of lifted suspensions", async () => {
    mockSupabase.__setResult({
      data: [
        { user_id: "user-1" },
        { user_id: "user-2" },
        { user_id: "user-3" },
      ],
      error: null,
    });

    const count = await autoLiftExpiredSuspensions({
      supabase: mockSupabase as any,
    });

    expect(count).toBe(3);
  });

  it("returns 0 when data is null (no rows matched)", async () => {
    mockSupabase.__setResult({ data: null, error: null });

    const count = await autoLiftExpiredSuspensions({
      supabase: mockSupabase as any,
    });

    expect(count).toBe(0);
  });
});
