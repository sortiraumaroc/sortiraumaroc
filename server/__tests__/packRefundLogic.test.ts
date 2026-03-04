/**
 * Tests for server/packRefundLogic.ts
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

vi.mock("../vosfactures/documents", () => ({
  generateRefundCreditNote: vi.fn(() => Promise.resolve()),
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
  requestPackRefund,
  processRefund,
  refundAllActivePacksForEstablishment,
} from "../packRefundLogic";

// ---------------------------------------------------------------------------
// Queue-based Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const _queue: Array<{ data: unknown; error: unknown; count?: number | null }> = [];
  const _default: { data: unknown; error: unknown } = { data: null, error: null };

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

  builder.__enqueue = (r: { data: unknown; error: unknown; count?: number | null }) => {
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

const PURCHASE_ID = "purchase-001";
const USER_ID = "user-001";
const ESTABLISHMENT_ID = "est-001";
const REFUND_ID = "refund-001";

function makePurchaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PURCHASE_ID,
    pack_id: "pack-001",
    user_id: USER_ID,
    total_price: 10000,
    payment_status: "completed",
    status: "active",
    expires_at: null,
    receipt_id: null,
    packs: { id: "pack-001", title: "Pack Test", validity_end_date: null },
    ...overrides,
  };
}

// ==========================================================================
// requestPackRefund
// ==========================================================================

describe("requestPackRefund", () => {
  it("returns error when purchase is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: null });

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Je veux un remboursement");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("not_found");
  });

  it("returns error when payment is not confirmed", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({ payment_status: "pending" }),
      error: null,
    });

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement svp");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("not_paid");
  });

  it("returns error when pack is already consumed", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({ status: "used" }),
      error: null,
    });

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement svp");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("already_consumed");
  });

  it("returns error when pack is already refunded", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({ status: "refunded" }),
      error: null,
    });

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement svp");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("already_refunded");
  });

  it("returns error when pack has expired", async () => {
    mockSupabase.__enqueue({
      data: makePurchaseRow({
        expires_at: new Date(Date.now() - 86400_000).toISOString(),
      }),
      error: null,
    });

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement svp");

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("expired");
  });

  it("grants full refund when no expiry date (auto-approved)", async () => {
    // 1. Fetch purchase (no expires_at)
    mockSupabase.__enqueue({
      data: makePurchaseRow({ expires_at: null }),
      error: null,
    });
    // 2. Insert refund → single
    mockSupabase.__enqueue({ data: { id: REFUND_ID }, error: null });
    // 3-6. processRefund calls (fetch refund, update refund, update purchase, transaction)
    mockSupabase.__enqueue({
      data: {
        id: REFUND_ID,
        pack_purchase_id: PURCHASE_ID,
        user_id: USER_ID,
        refund_type: "full",
        refund_amount: 10000,
        credit_amount: 0,
        reason: "Remboursement",
        status: "requested",
        pack_purchases: {
          id: PURCHASE_ID,
          total_price: 10000,
          receipt_id: null,
          pack_id: "pack-001",
          establishment_id: ESTABLISHMENT_ID,
          packs: { title: "Pack Test" },
        },
      },
      error: null,
    });
    mockSupabase.__enqueue({ data: null, error: null }); // update refund
    mockSupabase.__enqueue({ data: null, error: null }); // update purchase

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.refundType).toBe("full");
    expect(result.data.refundAmount).toBe(10000);
    expect(result.data.creditAmount).toBe(0);
  });

  it("grants 50% partial refund when < 14 days before expiry", async () => {
    const expiresIn10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch purchase
    mockSupabase.__enqueue({
      data: makePurchaseRow({ expires_at: expiresIn10Days }),
      error: null,
    });
    // 2. Insert refund → single (partial refund is NOT auto-approved)
    mockSupabase.__enqueue({ data: { id: REFUND_ID }, error: null });

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement", false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.refundType).toBe("partial");
    expect(result.data.refundAmount).toBe(5000); // 50% of 10000
  });

  it("grants 100% credit when < 14 days and preferCredit=true (auto-approved)", async () => {
    const expiresIn10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch purchase
    mockSupabase.__enqueue({
      data: makePurchaseRow({ expires_at: expiresIn10Days }),
      error: null,
    });
    // 2. Insert refund → single
    mockSupabase.__enqueue({ data: { id: REFUND_ID }, error: null });
    // 3-6. processRefund calls (auto-approved for credit)
    mockSupabase.__enqueue({
      data: {
        id: REFUND_ID,
        pack_purchase_id: PURCHASE_ID,
        user_id: USER_ID,
        refund_type: "credit",
        refund_amount: 0,
        credit_amount: 10000,
        reason: "Remboursement",
        status: "requested",
        pack_purchases: {
          id: PURCHASE_ID,
          total_price: 10000,
          receipt_id: null,
          pack_id: "pack-001",
          establishment_id: ESTABLISHMENT_ID,
          packs: { title: "Pack Test" },
        },
      },
      error: null,
    });
    mockSupabase.__enqueue({ data: null, error: null }); // update refund
    mockSupabase.__enqueue({ data: null, error: null }); // update purchase

    const result = await requestPackRefund(PURCHASE_ID, USER_ID, "Remboursement", true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.refundType).toBe("credit");
    expect(result.data.creditAmount).toBe(10000);
  });
});

// ==========================================================================
// processRefund
// ==========================================================================

describe("processRefund", () => {
  it("returns error when refund is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: null });

    const result = await processRefund(REFUND_ID);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("not_found");
  });

  it("returns error when refund is already processed", async () => {
    mockSupabase.__enqueue({
      data: {
        id: REFUND_ID,
        status: "processed",
        pack_purchases: null,
      },
      error: null,
    });

    const result = await processRefund(REFUND_ID);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("already_processed");
  });
});

// ==========================================================================
// refundAllActivePacksForEstablishment
// ==========================================================================

describe("refundAllActivePacksForEstablishment", () => {
  it("returns 0 refunded when no active purchases found", async () => {
    mockSupabase.__enqueue({ data: [], error: null });

    const result = await refundAllActivePacksForEstablishment(
      ESTABLISHMENT_ID,
      "Establishment deactivated",
    );

    expect(result.refunded).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("returns 0 refunded when DB query fails", async () => {
    mockSupabase.__enqueue({ data: null, error: { message: "db error" } });

    const result = await refundAllActivePacksForEstablishment(
      ESTABLISHMENT_ID,
      "Establishment deactivated",
    );

    expect(result.refunded).toBe(0);
    expect(result.errors).toBe(0);
  });
});
