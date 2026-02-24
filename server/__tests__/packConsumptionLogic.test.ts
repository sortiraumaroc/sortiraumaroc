/**
 * Tests for server/packConsumptionLogic.ts
 *
 * Uses queue-based Supabase mock since functions make multiple sequential queries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabase();

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => mockSupabase),
}));

vi.mock("../consumerNotifications", () => ({
  emitConsumerUserEvent: vi.fn(() => Promise.resolve()),
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
// Import AFTER mocks
// ---------------------------------------------------------------------------

import {
  getClientActivePacksAtEstablishment,
  consumePack,
} from "../packConsumptionLogic";

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
    "in",
    "not",
    "limit",
    "insert",
    "update",
    "range",
    "order",
  ];

  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }

  builder.maybeSingle = vi.fn(() => dequeue());
  builder.single = vi.fn(() => dequeue());
  builder.then = (resolve: Function) => resolve(dequeue());

  builder.__enqueue = (r: { data: unknown; error: unknown }) => {
    _queue.push(r);
  };

  builder.__reset = () => {
    _queue.length = 0;
    for (const m of chainMethods) {
      (builder[m] as ReturnType<typeof vi.fn>).mockClear();
    }
    (builder.maybeSingle as ReturnType<typeof vi.fn>).mockClear();
    (builder.single as ReturnType<typeof vi.fn>).mockClear();
  };

  return builder as any;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.__reset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "user-001";
const ESTABLISHMENT_ID = "est-001";
const PURCHASE_ID = "purchase-001";
const PACK_ID = "pack-001";

function makePurchaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PURCHASE_ID,
    pack_id: PACK_ID,
    user_id: USER_ID,
    establishment_id: ESTABLISHMENT_ID,
    status: "active",
    payment_status: "completed",
    is_multi_use: false,
    uses_remaining: 1,
    uses_total: 1,
    expires_at: null,
    packs: {
      id: PACK_ID,
      title: "Pack Ftour",
      cover_url: null,
      validity_end_date: null,
      valid_days: null,
      valid_time_start: null,
      valid_time_end: null,
    },
    ...overrides,
  };
}

// ==========================================================================
// getClientActivePacksAtEstablishment
// ==========================================================================

describe("getClientActivePacksAtEstablishment", () => {
  it("returns empty array when no purchases found", async () => {
    mockSupabase.__enqueue({ data: [], error: null });

    const result = await getClientActivePacksAtEstablishment(USER_ID, ESTABLISHMENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
  });

  it("returns error when DB query fails", async () => {
    mockSupabase.__enqueue({ data: null, error: { message: "db error" } });

    const result = await getClientActivePacksAtEstablishment(USER_ID, ESTABLISHMENT_ID);

    expect(result.ok).toBe(false);
  });

  it("returns active packs filtering out expired ones", async () => {
    const activePurchase = makePurchaseRow();
    const expiredPurchase = makePurchaseRow({
      id: "purchase-002",
      expires_at: new Date(Date.now() - 86400_000).toISOString(), // expired yesterday
    });

    mockSupabase.__enqueue({
      data: [activePurchase, expiredPurchase],
      error: null,
    });

    const result = await getClientActivePacksAtEstablishment(USER_ID, ESTABLISHMENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].purchaseId).toBe(PURCHASE_ID);
  });

  it("filters out multi-use packs with no remaining uses", async () => {
    const noUsesLeft = makePurchaseRow({
      id: "purchase-003",
      is_multi_use: true,
      uses_remaining: 0,
    });

    mockSupabase.__enqueue({
      data: [noUsesLeft],
      error: null,
    });

    const result = await getClientActivePacksAtEstablishment(USER_ID, ESTABLISHMENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });
});

// ==========================================================================
// consumePack
// ==========================================================================

describe("consumePack", () => {
  it("returns error when purchase is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: null });

    const result = await consumePack(PURCHASE_ID, ESTABLISHMENT_ID, "scanner-user");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("introuvable");
  });

  it("returns error when payment is not confirmed", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({ payment_status: "pending" }),
      error: null,
    });

    const result = await consumePack(PURCHASE_ID, ESTABLISHMENT_ID, "scanner-user");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("not_paid");
  });

  it("returns error when purchase status is invalid", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({ status: "used" }),
      error: null,
    });

    const result = await consumePack(PURCHASE_ID, ESTABLISHMENT_ID, "scanner-user");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("invalid_status");
  });

  it("returns error when pack has expired", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({
        expires_at: new Date(Date.now() - 86400_000).toISOString(),
      }),
      error: null,
    });

    const result = await consumePack(PURCHASE_ID, ESTABLISHMENT_ID, "scanner-user");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("expired");
  });

  it("returns error when no uses remaining", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({ uses_remaining: 0 }),
      error: null,
    });

    const result = await consumePack(PURCHASE_ID, ESTABLISHMENT_ID, "scanner-user");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("no_uses_left");
  });

  it("creates consumption record and returns success on happy path", async () => {
    // 1. Fetch purchase
    mockSupabase.__enqueue({ data: makePurchaseRow(), error: null });
    // 2. Insert consumption → single
    mockSupabase.__enqueue({ data: { id: "consumption-001" }, error: null });
    // 3. Update purchase (then)
    mockSupabase.__enqueue({ data: null, error: null });

    const result = await consumePack(PURCHASE_ID, ESTABLISHMENT_ID, "scanner-user");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.consumptionId).toBe("consumption-001");
    expect(result.data.usesRemaining).toBe(0);
    expect(mockSupabase.insert).toHaveBeenCalled();
    expect(mockSupabase.update).toHaveBeenCalled();
  });
});
