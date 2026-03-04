/**
 * Tests for server/reservationV2Logic.ts
 *
 * Covers:
 *   - createReservationV2: all validation paths (email, suspension, self-booking,
 *     double-booking, group redirect, capacity, insert error) + happy path
 *   - proAcceptReservation / proRefuseReservation / proHoldReservation: state transitions
 *   - proCancelReservation: protection window + state machine
 *   - proConfirmVenue: status guards + happy path
 *   - proDeclareNoShowVenue: delegation to noShowDisputeLogic
 *   - clientCancelReservation: protection window + state machine + scoring
 *   - upgradeFreeToPaid: payment guard + terminal guard
 *   - processQrCheckIn: idempotency (already consumed) + status guard
 *
 * All heavy dependencies are mocked at module level.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Module-level mocks — BEFORE any imports from the module under test
// =============================================================================

vi.mock("../capacityManager", () => ({
  allocateStock: vi.fn(),
}));

vi.mock("../clientScoringV2", () => ({
  isClientSuspended: vi.fn(),
  recordHonoredReservation: vi.fn(),
  recordCancellation: vi.fn(),
  recordFreeToPaidUpgrade: vi.fn(),
}));

vi.mock("../noShowDisputeLogic", () => ({
  declareNoShow: vi.fn(),
}));

vi.mock("../adminNotifications", () => ({
  emitAdminNotification: vi.fn(),
}));

vi.mock("../proNotifications", () => ({
  notifyProMembers: vi.fn(),
}));

vi.mock("../emailService", () => ({
  sendTemplateEmail: vi.fn(),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
  createReservationV2,
  proAcceptReservation,
  proRefuseReservation,
  proHoldReservation,
  proCancelReservation,
  proConfirmVenue,
  proDeclareNoShowVenue,
  clientCancelReservation,
  upgradeFreeToPaid,
  processQrCheckIn,
} from "../reservationV2Logic";

import { allocateStock } from "../capacityManager";
import {
  isClientSuspended,
  recordHonoredReservation,
  recordCancellation,
  recordFreeToPaidUpgrade,
} from "../clientScoringV2";
import { declareNoShow } from "../noShowDisputeLogic";

// =============================================================================
// Supabase mock helpers
// =============================================================================

/**
 * Creates a chainable Supabase query builder mock.
 * Every method returns `chain` (itself) so calls can be chained.
 * The terminal awaitable methods (single, maybeSingle) resolve with { data, error }.
 *
 * If `resolveViaLimit` is true, `.limit()` is made awaitable (resolves) instead of
 * chainable. Use this for queries that end with `.limit(n)` (list queries).
 */
function mockChain(
  data: unknown = null,
  error: unknown = null,
  opts?: { resolveViaLimit?: boolean },
) {
  const chain: Record<string, any> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "in", "neq", "gte", "lte", "gt", "lt",
    "order", "limit", "range",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue({ data, error });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error });

  // For list-style queries ending with .limit() or .order().limit()
  if (opts?.resolveViaLimit) {
    chain.limit = vi.fn().mockResolvedValue({ data, error });
  }

  return chain;
}

/**
 * Build a fake Supabase client where `.from(table)` returns a chainable builder.
 * `tableOverrides` maps table names to { data, error } for custom responses.
 * The `auth.admin.getUserById` method can be overridden separately.
 */
function buildFakeSupabase(opts: {
  tableOverrides?: Record<string, { data?: unknown; error?: unknown }>;
  authUser?: { user: Record<string, unknown> } | null;
  authError?: unknown;
} = {}) {
  const { tableOverrides = {}, authUser = null, authError = null } = opts;

  const defaultChain = mockChain(null, null);
  const chains: Record<string, ReturnType<typeof mockChain>> = {};

  for (const [table, { data, error }] of Object.entries(tableOverrides)) {
    chains[table] = mockChain(data ?? null, error ?? null);
  }

  const fromFn = vi.fn((table: string) => chains[table] ?? defaultChain);

  return {
    from: fromFn,
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: authUser,
          error: authError,
        }),
      },
    },
    /** Helper: get the chain mock for a specific table */
    _chain: (table: string) => chains[table] ?? defaultChain,
  } as any;
}

/**
 * Build a Supabase mock specifically for the createReservationV2 happy path.
 *
 * The create flow calls supabase.from() in this order:
 *  1. "pro_establishment_memberships" — self-booking check (.maybeSingle)
 *  2. "reservations" — double-booking check (.maybeSingle)
 *  3. "consumer_user_stats" — user stats (.maybeSingle)
 *  4. "reservations" — no-show history (.order().limit())
 *  5. "pro_auto_accept_rules" — auto-accept rules (.limit())
 *  6. "reservations" — insert (.insert().select().single())
 *
 * Because "reservations" is called multiple times, we route by per-table call index.
 */
function buildCreateFlowSupabase(overrides?: {
  userStats?: Record<string, unknown> | null;
  insertResult?: Record<string, unknown> | null;
  insertError?: unknown;
  noShowHistory?: unknown[];
}) {
  const userStats = overrides?.userStats ?? { reliability_score: 80, no_shows_count: 0 };
  const insertResult = overrides?.insertResult ?? {
    id: "res-new",
    user_id: "user-1",
    establishment_id: "est-1",
    status: "pending_pro_validation",
    party_size: 4,
    stock_type: "free_stock",
    starts_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    meta: {},
  };
  const insertError = overrides?.insertError ?? null;
  const noShowHistory = overrides?.noShowHistory ?? [];

  // Chain for self-booking check (pro_establishment_memberships) -> no match
  const membershipChain = mockChain(null, null);
  // Chain for double-booking check -> no match
  const doubleBookChain = mockChain(null, null);
  // Chain for user stats
  const userStatsChain = mockChain(userStats, null);
  // Chain for no-show history (list query, terminates with .limit())
  const noShowHistChain = mockChain(noShowHistory, null, { resolveViaLimit: true });
  // Chain for auto-accept rules (list query, terminates with .limit()) -> empty = no rules
  const autoAcceptChain = mockChain([], null, { resolveViaLimit: true });
  // Chain for reservation insert
  const insertChain = mockChain(insertResult, insertError);

  // Per-table call counters
  const reservationsCallIdx = { current: 0 };

  const fromFn = vi.fn((table: string) => {
    if (table === "pro_establishment_memberships") return membershipChain;
    if (table === "consumer_user_stats") return userStatsChain;
    if (table === "pro_auto_accept_rules") return autoAcceptChain;
    if (table === "reservations") {
      const idx = reservationsCallIdx.current++;
      if (idx === 0) return doubleBookChain;        // double-booking check
      if (idx === 1) return noShowHistChain;         // no-show history
      return insertChain;                            // insert
    }
    return mockChain(null, null);
  });

  return {
    from: fromFn,
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
          error: null,
        }),
      },
    },
  } as any;
}

// =============================================================================
// Default input factory
// =============================================================================

function defaultCreateInput() {
  return {
    userId: "user-1",
    establishmentId: "est-1",
    slotId: "slot-1",
    startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // +48h
    partySize: 4,
    paymentType: "free" as const,
    meta: {},
  };
}

// =============================================================================
// Reset all mocks between tests
// =============================================================================

beforeEach(() => {
  vi.resetAllMocks();

  // Sensible defaults: not suspended, allocation allowed
  (isClientSuspended as any).mockResolvedValue({ suspended: false, until: null, reason: null });
  (allocateStock as any).mockResolvedValue({ allowed: true, stockType: "free_stock" });
  (recordHonoredReservation as any).mockResolvedValue({});
  (recordCancellation as any).mockResolvedValue({ cancellationType: "free" });
  (recordFreeToPaidUpgrade as any).mockResolvedValue({});
  (declareNoShow as any).mockResolvedValue({ ok: true, disputeId: "disp-1" });
});

// #############################################################################
// createReservationV2
// #############################################################################

describe("createReservationV2", () => {
  // -------------------------------------------------------------------------
  // Validation: user not found
  // -------------------------------------------------------------------------
  it("rejects creation when user is not found (auth error)", async () => {
    const supabase = buildFakeSupabase({ authError: { message: "not found" } });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("user_not_found");
  });

  it("rejects creation when auth user data is null", async () => {
    const supabase = buildFakeSupabase({ authUser: null });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("user_not_found");
  });

  // -------------------------------------------------------------------------
  // Validation: email not verified
  // -------------------------------------------------------------------------
  it("rejects creation when email is not verified", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: null } },
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("email_not_verified");
  });

  // -------------------------------------------------------------------------
  // Validation: user suspended
  // -------------------------------------------------------------------------
  it("rejects creation when consumer is suspended", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
    });
    (isClientSuspended as any).mockResolvedValue({
      suspended: true,
      until: "2026-03-01T00:00:00Z",
      reason: "no-shows",
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("user_suspended");
    expect(result.error).toContain("suspendu");
  });

  it("includes formatted suspension date in error message", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
    });
    (isClientSuspended as any).mockResolvedValue({
      suspended: true,
      until: null, // indefinite
      reason: "repeat offender",
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("user_suspended");
    expect(result.error).toContain("indéfini");
  });

  // -------------------------------------------------------------------------
  // Validation: self-booking
  // -------------------------------------------------------------------------
  it("rejects creation when user is a member of the establishment (self-booking)", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
      tableOverrides: {
        pro_establishment_memberships: { data: { id: "mem-1" } },
      },
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("self_booking_forbidden");
  });

  // -------------------------------------------------------------------------
  // Validation: double booking
  // -------------------------------------------------------------------------
  it("rejects creation when user already has an active reservation at the same slot", async () => {
    // First call to from() = pro_establishment_memberships (no match)
    // Second call = reservations (existing reservation found)
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
    });

    // Override: pro_establishment_memberships returns null (no self-booking)
    const memChain = mockChain(null, null);
    // reservations check returns an existing record
    const resCheckChain = mockChain({ id: "existing-res" }, null);

    let fromCallCount = 0;
    supabase.from = vi.fn((table: string) => {
      if (table === "pro_establishment_memberships") return memChain;
      if (table === "reservations") {
        fromCallCount++;
        // The first .from("reservations") call is the double-booking check
        if (fromCallCount === 1) return resCheckChain;
      }
      return mockChain(null, null);
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("double_booking");
  });

  // -------------------------------------------------------------------------
  // Validation: group redirect
  // -------------------------------------------------------------------------
  it("redirects to quote for groups larger than 15", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
    });
    // No self-booking, no double-booking
    supabase.from = vi.fn(() => mockChain(null, null));

    const input = { ...defaultCreateInput(), partySize: 20 };

    const result = await createReservationV2({ supabase, input });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("redirect_to_quote");
  });

  it("allows groups of exactly 15 (boundary)", async () => {
    const supabase = buildCreateFlowSupabase({
      insertResult: {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "pending_pro_validation",
        party_size: 15,
        stock_type: "free_stock",
        starts_at: defaultCreateInput().startsAt,
        meta: {},
      },
    });

    const input = { ...defaultCreateInput(), partySize: 15 };
    const result = await createReservationV2({ supabase, input });

    // partySize=15 should pass the >15 check
    expect(result.errorCode).not.toBe("redirect_to_quote");
  });

  it("rejects partySize of 16 (just above threshold)", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
    });
    supabase.from = vi.fn(() => mockChain(null, null));

    const input = { ...defaultCreateInput(), partySize: 16 };
    const result = await createReservationV2({ supabase, input });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("redirect_to_quote");
  });

  // -------------------------------------------------------------------------
  // Validation: slot full (capacity)
  // -------------------------------------------------------------------------
  it("rejects creation when slot is full (no capacity)", async () => {
    const supabase = buildFakeSupabase({
      authUser: { user: { id: "user-1", email_confirmed_at: "2024-01-01T00:00:00Z" } },
    });
    supabase.from = vi.fn(() => mockChain(null, null));

    (allocateStock as any).mockResolvedValue({ allowed: false, stockType: null, reason: "full" });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("slot_full");
  });

  // -------------------------------------------------------------------------
  // Validation: insert error
  // -------------------------------------------------------------------------
  it("returns error when database insert fails", async () => {
    const supabase = buildCreateFlowSupabase({
      insertResult: null,
      insertError: { message: "unique constraint violated" },
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("insert_failed");
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it("creates reservation successfully with all validations passing", async () => {
    const insertedReservation = {
      id: "res-new",
      user_id: "user-1",
      establishment_id: "est-1",
      status: "pending_pro_validation",
      party_size: 4,
      stock_type: "free_stock",
      starts_at: defaultCreateInput().startsAt,
      meta: { client_risk_score: 85, no_show_count: 1, establishment_no_shows: [], has_establishment_no_show: false },
    };

    const supabase = buildCreateFlowSupabase({
      userStats: { reliability_score: 85, no_shows_count: 1 },
      insertResult: insertedReservation,
    });

    const result = await createReservationV2({
      supabase,
      input: defaultCreateInput(),
    });

    expect(result.ok).toBe(true);
    expect(result.reservation).toBeDefined();
    expect(result.reservation!.id).toBe("res-new");
    expect(result.waitlisted).toBe(false);
  });
});

// #############################################################################
// proTransition-based actions
// #############################################################################

describe("proAcceptReservation", () => {
  it("returns error when reservation is not found", async () => {
    const supabase = buildFakeSupabase();
    supabase.from = vi.fn(() => mockChain(null, { message: "not found" }));

    const result = await proAcceptReservation({
      supabase,
      reservationId: "res-missing",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("rejects invalid state transition (e.g., consumed -> confirmed)", async () => {
    const supabase = buildFakeSupabase();
    // Reservation in terminal state "consumed"
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "consumed", starts_at: new Date().toISOString() },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await proAcceptReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });

  it("accepts valid transition from pending_pro_validation to confirmed", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "pending_pro_validation", starts_at: new Date().toISOString() },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      // First from() = fetch reservation, second from() = update
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await proAcceptReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("confirmed");
  });
});

describe("proRefuseReservation", () => {
  it("refuses a pending reservation successfully", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "pending_pro_validation", starts_at: new Date().toISOString() },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await proRefuseReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
      reason: "Fully booked",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("refused");
  });

  it("rejects refusing a terminal reservation", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "cancelled_user", starts_at: new Date().toISOString() },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await proRefuseReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });
});

describe("proHoldReservation", () => {
  it("puts a pending reservation on hold successfully", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "pending_pro_validation", starts_at: new Date().toISOString() },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await proHoldReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("on_hold");
  });
});

// #############################################################################
// proCancelReservation (has protection window logic)
// #############################################################################

describe("proCancelReservation", () => {
  it("returns error when reservation is not found", async () => {
    const supabase = buildFakeSupabase();
    supabase.from = vi.fn(() => mockChain(null, { message: "not found" }));

    const result = await proCancelReservation({
      supabase,
      reservationId: "res-missing",
      establishmentId: "est-1",
      reason: "Change of plans",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("blocks pro cancellation of free reservation inside protection window (H-3)", async () => {
    const supabase = buildFakeSupabase();
    // Protection window started 1 hour ago
    const protectionStart = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const chain = mockChain(
      {
        id: "res-1",
        status: "confirmed",
        starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: protectionStart,
      },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await proCancelReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
      reason: "No more capacity",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("fenêtre de protection");
  });

  it("allows pro cancellation of paid reservation inside protection window", async () => {
    const supabase = buildFakeSupabase();
    const protectionStart = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const fetchChain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        status: "confirmed",
        starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        payment_type: "paid",
        protection_window_start: protectionStart,
      },
      null,
    );
    const updateChain = mockChain(null, null);

    // First from = proCancelReservation fetch, second = proTransition fetch, third = update
    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      // proCancelReservation does its own fetch first, then calls proTransition which fetches again
      return callIdx <= 2 ? fetchChain : updateChain;
    });

    const result = await proCancelReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
      reason: "Emergency",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("cancelled_pro");
  });

  it("allows pro cancellation of free reservation outside protection window", async () => {
    const supabase = buildFakeSupabase();
    // Protection window starts in the future
    const protectionStart = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const fetchChain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        status: "confirmed",
        starts_at: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: protectionStart,
      },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx <= 2 ? fetchChain : updateChain;
    });

    const result = await proCancelReservation({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
      reason: "Overbooking",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("cancelled_pro");
  });
});

// #############################################################################
// proConfirmVenue
// #############################################################################

describe("proConfirmVenue", () => {
  it("returns error when reservation is not found", async () => {
    const supabase = buildFakeSupabase();
    supabase.from = vi.fn(() => mockChain(null, { message: "not found" }));

    const result = await proConfirmVenue({
      supabase,
      reservationId: "res-missing",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("rejects venue confirmation from non-confirmed status (e.g., pending_pro_validation)", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "pending_pro_validation" },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await proConfirmVenue({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot confirm venue from status");
  });

  it("allows venue confirmation from confirmed status", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "confirmed" },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await proConfirmVenue({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("consumed");
    expect(recordHonoredReservation).toHaveBeenCalled();
  });

  it("allows venue confirmation from deposit_paid status", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "deposit_paid" },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await proConfirmVenue({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("consumed");
  });
});

// #############################################################################
// proDeclareNoShowVenue
// #############################################################################

describe("proDeclareNoShowVenue", () => {
  it("delegates to declareNoShow and returns its result", async () => {
    const supabase = buildFakeSupabase();
    const updateChain = mockChain(null, null);
    supabase.from = vi.fn(() => updateChain);

    (declareNoShow as any).mockResolvedValue({ ok: true, disputeId: "dispute-42" });

    const result = await proDeclareNoShowVenue({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("noshow");
    expect(declareNoShow).toHaveBeenCalledWith({
      supabase,
      reservationId: "res-1",
      declaredBy: "pro",
    });
  });

  it("passes through error from declareNoShow", async () => {
    const supabase = buildFakeSupabase();
    const updateChain = mockChain(null, null);
    supabase.from = vi.fn(() => updateChain);

    (declareNoShow as any).mockResolvedValue({ ok: false, error: "reservation_too_old" });

    const result = await proDeclareNoShowVenue({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_too_old");
  });
});

// #############################################################################
// clientCancelReservation
// #############################################################################

describe("clientCancelReservation", () => {
  it("returns error when reservation is not found", async () => {
    const supabase = buildFakeSupabase();
    supabase.from = vi.fn(() => mockChain(null, { message: "not found" }));

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-missing",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("rejects cancellation from terminal status (e.g., consumed)", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "consumed",
        starts_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: null,
      },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot cancel from status");
  });

  it("rejects cancellation from refused status", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "refused",
        starts_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: null,
      },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot cancel from status");
  });

  it("blocks client cancellation of free reservation inside protection window", async () => {
    const supabase = buildFakeSupabase();
    const protectionStart = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // started 30min ago
    const chain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "confirmed",
        starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: protectionStart,
      },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("fenêtre de protection");
  });

  it("allows client cancellation of free reservation outside protection window", async () => {
    const supabase = buildFakeSupabase();
    const protectionStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(); // future
    const fetchChain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "confirmed",
        starts_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: protectionStart,
      },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
      reason: "Changed plans",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("cancelled_user");
    expect(recordCancellation).toHaveBeenCalled();
  });

  it("records scoring cancellation and returns cancellationType", async () => {
    const supabase = buildFakeSupabase();
    const protectionStart = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const fetchChain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "pending_pro_validation",
        starts_at: new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: protectionStart,
      },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    (recordCancellation as any).mockResolvedValue({ cancellationType: "late" });

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.cancellationType).toBe("late");
  });

  it("allows cancellation from on_hold status", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        establishment_id: "est-1",
        status: "on_hold",
        starts_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        payment_type: "free",
        protection_window_start: new Date(Date.now() + 45 * 60 * 60 * 1000).toISOString(),
      },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await clientCancelReservation({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("cancelled_user");
  });
});

// #############################################################################
// upgradeFreeToPaid
// #############################################################################

describe("upgradeFreeToPaid", () => {
  it("returns error when reservation is not found", async () => {
    const supabase = buildFakeSupabase();
    supabase.from = vi.fn(() => mockChain(null, { message: "not found" }));

    const result = await upgradeFreeToPaid({
      supabase,
      reservationId: "res-missing",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("rejects upgrade when reservation is already paid", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "confirmed", payment_type: "paid", stock_type: "paid_stock" },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await upgradeFreeToPaid({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_already_paid");
  });

  it("rejects upgrade when reservation is in terminal status", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "cancelled_user", payment_type: "free", stock_type: "free_stock" },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await upgradeFreeToPaid({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_is_terminal");
  });

  it("upgrades a free confirmed reservation to paid successfully", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "confirmed", payment_type: "free", stock_type: "free_stock" },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await upgradeFreeToPaid({
      supabase,
      reservationId: "res-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("confirmed"); // status unchanged, only payment_type changes
    expect(recordFreeToPaidUpgrade).toHaveBeenCalledWith({ supabase, userId: "user-1" });
  });
});

// #############################################################################
// processQrCheckIn
// #############################################################################

describe("processQrCheckIn", () => {
  it("returns error when reservation is not found", async () => {
    const supabase = buildFakeSupabase();
    supabase.from = vi.fn(() => mockChain(null, { message: "not found" }));

    const result = await processQrCheckIn({
      supabase,
      reservationId: "res-missing",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("returns idempotent success when already checked in (checked_in_at is set)", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      {
        id: "res-1",
        user_id: "user-1",
        status: "consumed",
        checked_in_at: "2026-02-22T12:00:00Z",
      },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await processQrCheckIn({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("consumed");
    // Should NOT call recordHonoredReservation again
    expect(recordHonoredReservation).not.toHaveBeenCalled();
  });

  it("rejects QR check-in from non-confirmed/deposit_paid status (e.g., pending_pro_validation)", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "pending_pro_validation", checked_in_at: null },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await processQrCheckIn({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot check in from status");
  });

  it("rejects QR check-in from cancelled status", async () => {
    const supabase = buildFakeSupabase();
    const chain = mockChain(
      { id: "res-1", user_id: "user-1", status: "cancelled_user", checked_in_at: null },
      null,
    );
    supabase.from = vi.fn(() => chain);

    const result = await processQrCheckIn({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot check in from status");
  });

  it("successfully checks in from confirmed status", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "confirmed", checked_in_at: null },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await processQrCheckIn({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("consumed");
    expect(recordHonoredReservation).toHaveBeenCalled();
  });

  it("successfully checks in from deposit_paid status", async () => {
    const supabase = buildFakeSupabase();
    const fetchChain = mockChain(
      { id: "res-1", user_id: "user-1", status: "deposit_paid", checked_in_at: null },
      null,
    );
    const updateChain = mockChain(null, null);

    let callIdx = 0;
    supabase.from = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? fetchChain : updateChain;
    });

    const result = await processQrCheckIn({
      supabase,
      reservationId: "res-1",
      establishmentId: "est-1",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("consumed");
    expect(recordHonoredReservation).toHaveBeenCalled();
  });
});
