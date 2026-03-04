/**
 * Tests for server/noShowDisputeLogic.ts
 *
 * All Supabase calls are mocked via a queue-based factory that returns
 * different results for sequential queries within the same function call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock("../adminNotifications", () => ({
  emitAdminNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../proNotifications", () => ({
  notifyProMembers: vi.fn(() => Promise.resolve()),
}));

vi.mock("../emailService", () => ({
  sendTemplateEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("../clientScoringV2", () => ({
  recordNoShow: vi.fn(() => Promise.resolve()),
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
// Import the functions under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import {
  declareNoShow,
  clientRespondToNoShow,
  arbitrateDispute,
  expireUnrespondedDisputes,
} from "../noShowDisputeLogic";
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { recordNoShow } from "../clientScoringV2";

// ---------------------------------------------------------------------------
// Queue-based Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const _queue: Array<{ data: unknown; error: unknown }> = [];
  const _default = { data: null, error: null };

  function dequeue() {
    return _queue.length > 0 ? _queue.shift()! : _default;
  }

  const builder: Record<string, any> = {};

  const chainMethods = [
    "from",
    "select",
    "eq",
    "lt",
    "not",
    "limit",
    "insert",
    "update",
    "upsert",
    "range",
    "order",
  ];

  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }

  builder.maybeSingle = vi.fn(() => dequeue());
  builder.single = vi.fn(() => dequeue());
  builder.then = (resolve: Function) => resolve(dequeue());
  builder.rpc = vi.fn(() => dequeue());

  builder.auth = {
    admin: {
      getUserById: vi.fn(() => ({
        data: {
          user: {
            email: "user@test.com",
            user_metadata: { full_name: "Test User" },
          },
        },
      })),
    },
  };

  builder.__enqueue = (r: { data: unknown; error: unknown }) => {
    _queue.push(r);
  };

  builder.__enqueueMany = (results: Array<{ data: unknown; error: unknown }>) => {
    for (const r of results) _queue.push(r);
  };

  builder.__reset = () => {
    _queue.length = 0;
    for (const m of chainMethods) {
      (builder[m] as ReturnType<typeof vi.fn>).mockClear();
    }
    (builder.maybeSingle as ReturnType<typeof vi.fn>).mockClear();
    (builder.single as ReturnType<typeof vi.fn>).mockClear();
    (builder.rpc as ReturnType<typeof vi.fn>).mockClear();
  };

  return builder as any;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabase();

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.__reset();
});

// ===========================================================================
// Helpers
// ===========================================================================

const RESERVATION_ID = "res-001";
const DISPUTE_ID = "disp-001";
const USER_ID = "user-001";
const ESTABLISHMENT_ID = "est-001";
const ADMIN_USER_ID = "admin-001";

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: RESERVATION_ID,
    user_id: USER_ID,
    establishment_id: ESTABLISHMENT_ID,
    status: "confirmed",
    starts_at: new Date(Date.now() - 3600_000).toISOString(),
    party_size: 2,
    booking_reference: "BK-12345678",
    ...overrides,
  };
}

function makeDispute(overrides: Record<string, unknown> = {}) {
  return {
    id: DISPUTE_ID,
    reservation_id: RESERVATION_ID,
    user_id: USER_ID,
    establishment_id: ESTABLISHMENT_ID,
    dispute_status: "pending_client_response",
    client_response_deadline: new Date(Date.now() + 86400_000).toISOString(),
    ...overrides,
  };
}

// ===========================================================================
// 1. declareNoShow
// ===========================================================================

describe("declareNoShow", () => {
  it("returns error when reservation is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: { message: "not found" } });

    const result = await declareNoShow({
      supabase: mockSupabase,
      reservationId: RESERVATION_ID,
      declaredBy: "pro",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("reservation_not_found");
  });

  it("returns error when reservation has invalid status", async () => {
    mockSupabase.__enqueue({
      data: makeReservation({ status: "cancelled" }),
      error: null,
    });

    const result = await declareNoShow({
      supabase: mockSupabase,
      reservationId: RESERVATION_ID,
      declaredBy: "pro",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalid_status_for_noshow");
  });

  it("returns existing dispute id if dispute already exists", async () => {
    mockSupabase.__enqueue({
      data: makeReservation({ status: "noshow" }),
      error: null,
    });
    mockSupabase.__enqueue({
      data: { id: "existing-disp-999" },
      error: null,
    });

    const result = await declareNoShow({
      supabase: mockSupabase,
      reservationId: RESERVATION_ID,
      declaredBy: "pro",
    });

    expect(result.ok).toBe(true);
    expect(result.disputeId).toBe("existing-disp-999");
  });
});

// ===========================================================================
// 2. clientRespondToNoShow
// ===========================================================================

describe("clientRespondToNoShow", () => {
  it("returns error when dispute is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: { message: "not found" } });

    const result = await clientRespondToNoShow({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      userId: USER_ID,
      response: "confirms_absence",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("dispute_not_found");
  });

  it("returns error when user does not own the dispute", async () => {
    mockSupabase.__enqueue({
      data: makeDispute({ user_id: "other-user" }),
      error: null,
    });

    const result = await clientRespondToNoShow({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      userId: USER_ID,
      response: "confirms_absence",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_your_dispute");
  });

  it("returns error when dispute is not in pending status", async () => {
    mockSupabase.__enqueue({
      data: makeDispute({ dispute_status: "no_show_confirmed" }),
      error: null,
    });

    const result = await clientRespondToNoShow({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      userId: USER_ID,
      response: "confirms_absence",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("dispute_not_pending");
  });

  it("confirms no-show when client confirms absence", async () => {
    mockSupabase.__enqueue({ data: makeDispute(), error: null });
    mockSupabase.__enqueue({ data: null, error: null }); // update dispute
    mockSupabase.__enqueue({ data: null, error: null }); // update reservation

    const result = await clientRespondToNoShow({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      userId: USER_ID,
      response: "confirms_absence",
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("no_show_confirmed");
    expect(recordNoShow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("moves to arbitration when client disputes", async () => {
    const evidence = [{ url: "https://proof.com/photo.jpg", type: "photo" }];

    mockSupabase.__enqueue({ data: makeDispute(), error: null });
    mockSupabase.__enqueue({ data: null, error: null }); // update dispute
    mockSupabase.__enqueue({ data: null, error: null }); // update reservation

    const result = await clientRespondToNoShow({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      userId: USER_ID,
      response: "disputes",
      evidence,
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("disputed_pending_arbitration");
    expect(recordNoShow).not.toHaveBeenCalled();
    expect(emitAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "no_show_disputed" }),
    );
  });
});

// ===========================================================================
// 3. arbitrateDispute
// ===========================================================================

describe("arbitrateDispute", () => {
  it("returns error when dispute is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: { message: "not found" } });

    const result = await arbitrateDispute({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      adminUserId: ADMIN_USER_ID,
      decision: "favor_client",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("dispute_not_found");
  });

  it("returns error when dispute is not in arbitration state", async () => {
    mockSupabase.__enqueue({
      data: makeDispute({ dispute_status: "pending_client_response" }),
      error: null,
    });

    const result = await arbitrateDispute({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      adminUserId: ADMIN_USER_ID,
      decision: "favor_pro",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("dispute_not_in_arbitration");
  });

  it("resolves in favor of pro and impacts client scoring", async () => {
    mockSupabase.__enqueue({
      data: makeDispute({ dispute_status: "disputed_pending_arbitration" }),
      error: null,
    });
    mockSupabase.__enqueue({ data: null, error: null }); // update dispute
    mockSupabase.__enqueue({ data: null, error: null }); // update reservation
    mockSupabase.__enqueue({ data: { email: "client@test.com", full_name: "Client" }, error: null });
    mockSupabase.__enqueue({ data: { name: "Restaurant Test" }, error: null });

    const result = await arbitrateDispute({
      supabase: mockSupabase,
      disputeId: DISPUTE_ID,
      adminUserId: ADMIN_USER_ID,
      decision: "favor_pro",
    });

    expect(result.ok).toBe(true);
    expect(result.decision).toBe("favor_pro");
    expect(recordNoShow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});

// ===========================================================================
// 4. expireUnrespondedDisputes
// ===========================================================================

describe("expireUnrespondedDisputes", () => {
  it("returns 0 when query errors", async () => {
    mockSupabase.__enqueue({ data: null, error: { message: "db down" } });

    const result = await expireUnrespondedDisputes({ supabase: mockSupabase });

    expect(result.expired).toBe(0);
  });

  it("returns 0 when no expired disputes exist", async () => {
    mockSupabase.__enqueue({ data: [], error: null });

    const result = await expireUnrespondedDisputes({ supabase: mockSupabase });

    expect(result.expired).toBe(0);
  });

  it("processes expired disputes and impacts scoring", async () => {
    const expiredDisputes = [
      { id: "disp-a", reservation_id: "res-a", user_id: "user-a", establishment_id: "est-a" },
      { id: "disp-b", reservation_id: "res-b", user_id: "user-b", establishment_id: "est-b" },
    ];

    mockSupabase.__enqueue({ data: expiredDisputes, error: null });
    // For each dispute: update dispute + update reservation
    mockSupabase.__enqueue({ data: null, error: null });
    mockSupabase.__enqueue({ data: null, error: null });
    mockSupabase.__enqueue({ data: null, error: null });
    mockSupabase.__enqueue({ data: null, error: null });

    const result = await expireUnrespondedDisputes({ supabase: mockSupabase });

    expect(result.expired).toBe(2);
    expect(recordNoShow).toHaveBeenCalledTimes(2);
  });
});
