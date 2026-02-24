/**
 * Tests for server/packPurchaseLogic.ts — validatePackPromoCode
 *
 * Uses queue-based Supabase mock since the function makes multiple sequential queries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabase();

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => mockSupabase),
}));

vi.mock("../proNotifications", () => ({
  notifyProMembers: vi.fn(() => Promise.resolve()),
}));

vi.mock("../emailService", () => ({
  sendTemplateEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("../packLifecycleLogic", () => ({
  checkAndMarkSoldOut: vi.fn(() => Promise.resolve()),
}));

vi.mock("../vosfactures/documents", () => ({
  generatePackSaleReceipt: vi.fn(() => Promise.resolve()),
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

import { validatePackPromoCode, confirmPackPurchase } from "../packPurchaseLogic";

// ---------------------------------------------------------------------------
// Queue-based Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const _queue: Array<{ data: unknown; error: unknown; count?: number | null }> = [];
  const _default: { data: unknown; error: unknown; count?: number | null } = {
    data: null,
    error: null,
  };

  function dequeue() {
    return _queue.length > 0 ? _queue.shift()! : _default;
  }

  const builder: Record<string, any> = {};

  const chainMethods = [
    "from",
    "select",
    "eq",
    "ilike",
    "in",
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
    (builder.rpc as ReturnType<typeof vi.fn>).mockClear();
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

const PACK_ID = "pack-001";
const USER_ID = "user-001";
const ESTABLISHMENT_ID = "est-001";
const PACK_PRICE_CENTS = 10000; // 100 MAD

function makePromoCode(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo-001",
    code: "RAMADAN20",
    is_active: true,
    start_date: new Date(Date.now() - 86400_000).toISOString(),
    end_date: new Date(Date.now() + 86400_000).toISOString(),
    applies_to: "all",
    specific_pack_id: null,
    establishment_id: null,
    max_total_uses: null,
    current_uses: 0,
    max_uses_per_user: 0,
    discount_type: "percentage",
    discount_value: 2000, // 20% in basis points
    is_platform_code: false,
    ...overrides,
  };
}

// ==========================================================================
// validatePackPromoCode
// ==========================================================================

describe("validatePackPromoCode", () => {
  it("returns valid=false when promo code is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: null });

    const result = await validatePackPromoCode(
      "INVALID",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalide");
  });

  it("returns valid=false when promo code has expired", async () => {
    mockSupabase.__enqueue({
      data: makePromoCode({
        end_date: new Date(Date.now() - 3600_000).toISOString(),
      }),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("expire");
  });

  it("returns valid=false when promo code is not yet active", async () => {
    mockSupabase.__enqueue({
      data: makePromoCode({
        start_date: new Date(Date.now() + 86400_000).toISOString(),
      }),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("pas encore actif");
  });

  it("returns valid=false when scope is specific_pack and wrong pack", async () => {
    mockSupabase.__enqueue({
      data: makePromoCode({
        applies_to: "specific_pack",
        specific_pack_id: "other-pack",
      }),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("pas applicable");
  });

  it("returns valid=false when global usage limit reached", async () => {
    mockSupabase.__enqueue({
      data: makePromoCode({
        max_total_uses: 100,
        current_uses: 100,
      }),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("limite");
  });

  it("returns valid=false when per-user limit reached", async () => {
    // 1. promo code lookup
    mockSupabase.__enqueue({
      data: makePromoCode({ max_uses_per_user: 1 }),
      error: null,
    });
    // 2. per-user count query (select with count)
    mockSupabase.__enqueue({ data: null, error: null, count: 1 });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("deja utilise");
  });

  it("calculates percentage discount correctly", async () => {
    // 20% of 10000 cents = 2000 cents
    mockSupabase.__enqueue({
      data: makePromoCode({
        discount_type: "percentage",
        discount_value: 2000, // 20% in basis points
      }),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(2000);
    expect(result.discountType).toBe("percentage");
  });

  it("calculates fixed discount capped at price", async () => {
    // Fixed 15000 cents but price is 10000 → capped at 10000
    mockSupabase.__enqueue({
      data: makePromoCode({
        discount_type: "fixed_amount",
        discount_value: 15000,
      }),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(10000); // capped at pack price
  });

  it("returns valid=true with correct discount info", async () => {
    mockSupabase.__enqueue({
      data: makePromoCode(),
      error: null,
    });

    const result = await validatePackPromoCode(
      "RAMADAN20",
      PACK_ID,
      USER_ID,
      PACK_PRICE_CENTS,
      ESTABLISHMENT_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.promoCodeId).toBe("promo-001");
    expect(result.isPlatformCode).toBe(false);
  });
});

// ==========================================================================
// confirmPackPurchase — error paths
// ==========================================================================

describe("confirmPackPurchase", () => {
  it("returns error when pack is not found", async () => {
    mockSupabase.__enqueue({ data: null, error: null }); // pack query returns null

    const result = await confirmPackPurchase({
      userId: USER_ID,
      packId: PACK_ID,
      quantity: 1,
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("introuvable");
  });

  it("returns error when pack is not approved", async () => {
    mockSupabase.__enqueue({
      data: {
        id: PACK_ID,
        title: "Pack Test",
        price: 10000,
        establishment_id: ESTABLISHMENT_ID,
        moderation_status: "pending",
        stock: 10,
        sold_count: 0,
        is_limited: false,
      },
      error: null,
    });

    const result = await confirmPackPurchase({
      userId: USER_ID,
      packId: PACK_ID,
      quantity: 1,
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("pas en vente");
  });
});
