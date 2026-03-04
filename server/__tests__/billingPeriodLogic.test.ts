/**
 * Tests for server/billingPeriodLogic.ts
 *
 * All Supabase calls are mocked via a reusable factory.
 * Each exported function is tested for:
 *   - Status guards / validation paths
 *   - Error propagation from Supabase
 *   - Happy path (correct status transitions, notifications)
 *   - Edge cases (deadline, race conditions, etc.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports from the module
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabase();

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => mockSupabase),
}));

vi.mock("../proNotifications", () => ({
  notifyProMembers: vi.fn(() => Promise.resolve()),
}));

vi.mock("../adminNotifications", () => ({
  emitAdminNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../emailService", () => ({
  sendTemplateEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock("../vosfactures/documents", () => ({
  generateCommissionInvoice: vi.fn(() => Promise.resolve()),
  generateCorrectionCreditNote: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Import the functions under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import {
  closeBillingPeriods,
  ensureBillingPeriod,
  callToInvoice,
  validateInvoice,
  executePayment,
  sendInvoiceReminders,
  rolloverExpiredPeriods,
  createBillingDispute,
  respondToDispute,
  escalateDispute,
} from "../billingPeriodLogic";

// ---------------------------------------------------------------------------
// Reusable Supabase mock factory
// ---------------------------------------------------------------------------

/**
 * Creates a deeply chainable mock that mimics the Supabase client.
 *
 * Every query-builder method (.from, .select, .eq, .lt, .not, .limit, .insert,
 * .update, .maybeSingle, .single, .range) returns `this` so chains work.
 *
 * Call `mockSupabase.__setResult(result)` before calling the function under
 * test to control what the final resolver (.maybeSingle / .single / the raw
 * await) returns.
 */
function createMockSupabase() {
  let _result: { data: unknown; error: unknown } = { data: null, error: null };
  let _rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

  const builder: Record<string, any> = {};

  // All chainable query-builder methods
  const chainMethods = [
    "from",
    "select",
    "eq",
    "lt",
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

  // Terminal resolvers
  builder.maybeSingle = vi.fn(() => _result);
  builder.single = vi.fn(() => _result);

  // When the builder is awaited directly (no .maybeSingle / .single), it
  // resolves to _result — this covers the `select("...")` lists like the
  // closeBillingPeriods query.
  builder.then = (resolve: Function) => resolve(_result);

  // RPC mock
  builder.rpc = vi.fn(() => _rpcResult);

  // Auth admin mock for getUserById
  builder.auth = {
    admin: {
      getUserById: vi.fn(() => ({
        data: {
          user: {
            email: "pro@test.com",
            user_metadata: { full_name: "Pro User" },
          },
        },
      })),
    },
  };

  // Helper to control query results
  builder.__setResult = (r: { data: unknown; error: unknown }) => {
    _result = r;
  };

  builder.__setRpcResult = (r: { data: unknown; error: unknown }) => {
    _rpcResult = r;
  };

  // Reset all internal state
  builder.__reset = () => {
    _result = { data: null, error: null };
    _rpcResult = { data: null, error: null };
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

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.__reset();
});

// ==========================================================================
// 1. closeBillingPeriods
// ==========================================================================

describe("closeBillingPeriods", () => {
  it("should return 0 when the query errors", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "db down" } });
    const count = await closeBillingPeriods();
    expect(count).toBe(0);
  });

  it("should return 0 when there are no open periods past end_date", async () => {
    mockSupabase.__setResult({ data: [], error: null });
    const count = await closeBillingPeriods();
    expect(count).toBe(0);
  });

  it("should close periods when RPC returns ok", async () => {
    // The initial select returns one period
    mockSupabase.__setResult({
      data: [{ id: "p1", establishment_id: "e1", period_code: "2026-01-A", end_date: "2026-01-15" }],
      error: null,
    });
    mockSupabase.__setRpcResult({ data: { ok: true }, error: null });

    const count = await closeBillingPeriods();
    expect(count).toBe(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("close_billing_period", expect.objectContaining({
      p_period_id: "p1",
    }));
  });

  it("should skip a period when RPC returns an error", async () => {
    mockSupabase.__setResult({
      data: [{ id: "p1", establishment_id: "e1", period_code: "2026-01-A", end_date: "2026-01-15" }],
      error: null,
    });
    mockSupabase.__setRpcResult({ data: null, error: { message: "rpc failed" } });

    const count = await closeBillingPeriods();
    expect(count).toBe(0);
  });

  it("should skip a period when RPC returns ok=false", async () => {
    mockSupabase.__setResult({
      data: [{ id: "p1", establishment_id: "e1", period_code: "2026-01-A", end_date: "2026-01-15" }],
      error: null,
    });
    mockSupabase.__setRpcResult({ data: { ok: false, error: "already closed" }, error: null });

    const count = await closeBillingPeriods();
    expect(count).toBe(0);
  });

  it("should pass CALL_TO_INVOICE_DEADLINE_DAYS to the RPC", async () => {
    mockSupabase.__setResult({
      data: [{ id: "p1", establishment_id: "e1", period_code: "2026-01-A", end_date: "2026-01-15" }],
      error: null,
    });
    mockSupabase.__setRpcResult({ data: { ok: true }, error: null });

    await closeBillingPeriods();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("close_billing_period", {
      p_period_id: "p1",
      p_deadline_offset_days: 10, // BILLING_PERIOD.CALL_TO_INVOICE_DEADLINE_DAYS
    });
  });
});

// ==========================================================================
// 2. ensureBillingPeriod
// ==========================================================================

describe("ensureBillingPeriod", () => {
  it("should return existing period id when it already exists", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: { id: "existing-id" }, error: null });

    const id = await ensureBillingPeriod("est-1");
    expect(id).toBe("existing-id");
  });

  it("should create a new period when none exists", async () => {
    // First maybeSingle (check existing) returns null
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });
    // single (insert) returns the new id
    mockSupabase.single.mockReturnValueOnce({ data: { id: "new-id" }, error: null });

    const id = await ensureBillingPeriod("est-1");
    expect(id).toBe("new-id");
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  it("should handle race condition by re-fetching on insert error", async () => {
    // First maybeSingle (check existing) returns null
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });
    // insert fails (race condition)
    mockSupabase.single.mockReturnValueOnce({ data: null, error: { message: "unique violation" } });
    // Second maybeSingle (re-fetch) returns the period
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: { id: "race-id" }, error: null });

    const id = await ensureBillingPeriod("est-1");
    expect(id).toBe("race-id");
  });

  it("should throw when insert fails and re-fetch also finds nothing", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });
    mockSupabase.single.mockReturnValueOnce({ data: null, error: { message: "unique violation" } });
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    await expect(ensureBillingPeriod("est-1")).rejects.toEqual({ message: "unique violation" });
  });

  it("should use date parameter for period code calculation", async () => {
    const jan5 = new Date(2026, 0, 5); // January 5 = period A
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: { id: "jan-a" }, error: null });

    await ensureBillingPeriod("est-1", jan5);
    // The .eq call for period_code should have been called with "2026-01-A"
    expect(mockSupabase.eq).toHaveBeenCalledWith("period_code", "2026-01-A");
  });

  it("should calculate period B for dates after the 15th", async () => {
    const jan20 = new Date(2026, 0, 20); // January 20 = period B
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: { id: "jan-b" }, error: null });

    await ensureBillingPeriod("est-1", jan20);
    expect(mockSupabase.eq).toHaveBeenCalledWith("period_code", "2026-01-B");
  });
});

// ==========================================================================
// 3. callToInvoice
// ==========================================================================

describe("callToInvoice", () => {
  it("should return error when query fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: { message: "db error" } });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("db error");
  });

  it("should return not_found when period does not exist", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });

  it("should reject when period status is not 'closed'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "open", period_code: "2026-01-A" },
      error: null,
    });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_status");
      expect(result.error).toContain('"open"');
    }
  });

  it("should reject when period status is 'paid'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "paid", period_code: "2026-01-A" },
      error: null,
    });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_status");
    }
  });

  it("should reject when period status is 'invoice_submitted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "invoice_submitted", period_code: "2026-01-A" },
      error: null,
    });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when deadline has passed", async () => {
    const pastDeadline = new Date(Date.now() - 86400000).toISOString(); // yesterday
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: {
        id: "bp-1",
        status: "closed",
        period_code: "2026-01-A",
        call_to_invoice_deadline: pastDeadline,
      },
      error: null,
    });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("deadline_passed");
    }
  });

  it("should succeed when status is 'closed' and deadline not passed", async () => {
    const futureDeadline = new Date(Date.now() + 86400000 * 5).toISOString(); // 5 days ahead
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: {
        id: "bp-1",
        status: "closed",
        period_code: "2026-01-A",
        call_to_invoice_deadline: futureDeadline,
        total_gross: 10000,
        total_commission: 1500,
        total_net: 8500,
        total_refunds: 0,
        transaction_count: 5,
      },
      error: null,
    });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveProperty("invoiceGenerated");
    }
  });

  it("should succeed when status is 'closed' and no deadline is set", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: {
        id: "bp-1",
        status: "closed",
        period_code: "2026-01-A",
        call_to_invoice_deadline: null,
        total_gross: 5000,
        total_commission: 750,
        total_net: 4250,
        total_refunds: 0,
        transaction_count: 2,
      },
      error: null,
    });

    const result = await callToInvoice("bp-1", "est-1");
    expect(result.ok).toBe(true);
  });

  it("should update status to 'invoice_submitted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: {
        id: "bp-1",
        status: "closed",
        period_code: "2026-01-A",
        call_to_invoice_deadline: null,
      },
      error: null,
    });

    await callToInvoice("bp-1", "est-1");
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "invoice_submitted" }),
    );
  });
});

// ==========================================================================
// 4. validateInvoice
// ==========================================================================

describe("validateInvoice", () => {
  it("should return error when query fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: { message: "db error" } });

    const result = await validateInvoice("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("db error");
  });

  it("should return not_found when period does not exist", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    const result = await validateInvoice("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("not_found");
  });

  it("should reject when status is not 'invoice_submitted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "closed", establishment_id: "e1", period_code: "2026-01-A" },
      error: null,
    });

    const result = await validateInvoice("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'open'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "open", establishment_id: "e1", period_code: "2026-01-A" },
      error: null,
    });

    const result = await validateInvoice("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'paid'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "paid", establishment_id: "e1", period_code: "2026-01-A" },
      error: null,
    });

    const result = await validateInvoice("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should succeed when status is 'invoice_submitted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: {
        id: "bp-1",
        status: "invoice_submitted",
        establishment_id: "e1",
        period_code: "2026-01-A",
        total_net: 8500,
      },
      error: null,
    });

    const result = await validateInvoice("bp-1", "admin-1");
    expect(result.ok).toBe(true);
  });

  it("should update status to 'invoice_validated' with payment_due_date", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: {
        id: "bp-1",
        status: "invoice_submitted",
        establishment_id: "e1",
        period_code: "2026-01-A",
        total_net: 8500,
      },
      error: null,
    });

    await validateInvoice("bp-1", "admin-1");
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "invoice_validated",
        payment_due_date: expect.any(String),
      }),
    );
  });
});

// ==========================================================================
// 5. executePayment
// ==========================================================================

describe("executePayment", () => {
  it("should return error when query fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: { message: "db error" } });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("db error");
  });

  it("should return not_found when period does not exist", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("not_found");
  });

  it("should reject when status is 'open'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "open", establishment_id: "e1", period_code: "2026-01-A", total_net: 1000 },
      error: null,
    });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'closed'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "closed", establishment_id: "e1", period_code: "2026-01-A", total_net: 1000 },
      error: null,
    });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'invoice_submitted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "invoice_submitted", establishment_id: "e1", period_code: "2026-01-A", total_net: 1000 },
      error: null,
    });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'paid' (already paid)", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "paid", establishment_id: "e1", period_code: "2026-01-A", total_net: 1000 },
      error: null,
    });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should succeed when status is 'invoice_validated'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "invoice_validated", establishment_id: "e1", period_code: "2026-01-A", total_net: 8500 },
      error: null,
    });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(true);
  });

  it("should succeed when status is 'payment_scheduled'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "payment_scheduled", establishment_id: "e1", period_code: "2026-01-A", total_net: 8500 },
      error: null,
    });

    const result = await executePayment("bp-1", "admin-1");
    expect(result.ok).toBe(true);
  });

  it("should update status to 'paid'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "invoice_validated", establishment_id: "e1", period_code: "2026-01-A", total_net: 8500 },
      error: null,
    });

    await executePayment("bp-1", "admin-1");
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paid",
        payment_executed_at: expect.any(String),
      }),
    );
  });
});

// ==========================================================================
// 6. sendInvoiceReminders
// ==========================================================================

describe("sendInvoiceReminders", () => {
  it("should return 0 when the query errors", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "db error" } });
    const count = await sendInvoiceReminders();
    expect(count).toBe(0);
  });

  it("should return 0 when there are no closed periods", async () => {
    mockSupabase.__setResult({ data: [], error: null });
    const count = await sendInvoiceReminders();
    expect(count).toBe(0);
  });
});

// ==========================================================================
// 7. rolloverExpiredPeriods
// ==========================================================================

describe("rolloverExpiredPeriods", () => {
  it("should return 0 when the query errors", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "db error" } });
    const count = await rolloverExpiredPeriods();
    expect(count).toBe(0);
  });

  it("should return 0 when there are no expired periods", async () => {
    mockSupabase.__setResult({ data: [], error: null });
    const count = await rolloverExpiredPeriods();
    expect(count).toBe(0);
  });
});

// ==========================================================================
// 8. createBillingDispute
// ==========================================================================

describe("createBillingDispute", () => {
  it("should return error when query fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: { message: "db error" } });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("db error");
  });

  it("should return not_found when period does not exist", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("not_found");
  });

  it("should reject when status is 'open' (period not yet closed)", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "open", period_code: "2026-01-A" },
      error: null,
    });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'paid'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "paid", period_code: "2026-01-A" },
      error: null,
    });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'corrected'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "corrected", period_code: "2026-01-A" },
      error: null,
    });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should allow dispute when status is 'closed'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "closed", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: { id: "disp-1" }, error: null });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.disputeId).toBe("disp-1");
  });

  it("should allow dispute when status is 'invoice_submitted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "invoice_submitted", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: { id: "disp-2" }, error: null });

    const result = await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(result.ok).toBe(true);
  });

  it("should allow dispute when status is 'invoice_validated'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "invoice_validated", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: { id: "disp-3" }, error: null });

    const result = await createBillingDispute("bp-1", "est-1", "incorrect commission");
    expect(result.ok).toBe(true);
  });

  it("should allow dispute when status is 'payment_scheduled'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "payment_scheduled", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: { id: "disp-4" }, error: null });

    const result = await createBillingDispute("bp-1", "est-1", "missing transaction");
    expect(result.ok).toBe(true);
  });

  it("should return error when dispute insert fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "closed", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: null, error: { message: "insert failed" } });

    const result = await createBillingDispute("bp-1", "est-1", "reason");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("insert failed");
  });

  it("should update period status to 'disputed'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "closed", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: { id: "disp-1" }, error: null });

    await createBillingDispute("bp-1", "est-1", "wrong amount");
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "disputed" }),
    );
  });

  it("should pass disputed transaction ids and evidence when provided", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "bp-1", status: "closed", period_code: "2026-01-A" },
      error: null,
    });
    mockSupabase.single.mockReturnValueOnce({ data: { id: "disp-1" }, error: null });

    const txIds = ["tx-1", "tx-2"];
    const evidence = [{ url: "https://example.com/proof.pdf", type: "pdf", description: "proof" }];

    await createBillingDispute("bp-1", "est-1", "overcharged", txIds, evidence);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        disputed_transactions: txIds,
        evidence,
        reason: "overcharged",
      }),
    );
  });
});

// ==========================================================================
// 9. respondToDispute
// ==========================================================================

describe("respondToDispute", () => {
  it("should return error when query fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: { message: "db error" } });

    const result = await respondToDispute("disp-1", "admin-1", "accept", "agreed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("db error");
  });

  it("should return not_found when dispute does not exist", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    const result = await respondToDispute("disp-1", "admin-1", "accept", "agreed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("not_found");
  });

  it("should reject when dispute status is 'resolved_accepted' (already resolved)", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "resolved_accepted" },
      error: null,
    });

    const result = await respondToDispute("disp-1", "admin-1", "accept", "agreed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("already_resolved");
  });

  it("should reject when dispute status is 'resolved_rejected'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "resolved_rejected" },
      error: null,
    });

    const result = await respondToDispute("disp-1", "admin-1", "reject", "no evidence");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("already_resolved");
  });

  it("should reject when dispute status is 'escalated'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "escalated" },
      error: null,
    });

    const result = await respondToDispute("disp-1", "admin-1", "accept", "ok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("already_resolved");
  });

  it("should succeed when dispute status is 'open'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    const result = await respondToDispute("disp-1", "admin-1", "accept", "agreed", 500);
    expect(result.ok).toBe(true);
  });

  it("should succeed when dispute status is 'under_review'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "under_review" },
      error: null,
    });

    const result = await respondToDispute("disp-1", "admin-1", "reject", "no basis");
    expect(result.ok).toBe(true);
  });

  it("should set status to 'resolved_accepted' when decision is 'accept'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    await respondToDispute("disp-1", "admin-1", "accept", "correction applied", 1000);

    // The first .update call is on billing_disputes
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "resolved_accepted" }),
    );
  });

  it("should set status to 'resolved_rejected' when decision is 'reject'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    await respondToDispute("disp-1", "admin-1", "reject", "no basis for claim");

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "resolved_rejected" }),
    );
  });

  it("should set correction_amount when accepting with a correction", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    await respondToDispute("disp-1", "admin-1", "accept", "credited", 2500);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ correction_amount: 2500 }),
    );
  });

  it("should set correction_amount to null when rejecting", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    await respondToDispute("disp-1", "admin-1", "reject", "invalid claim", 999);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ correction_amount: null }),
    );
  });

  it("should update period status to 'corrected' when accepting", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    await respondToDispute("disp-1", "admin-1", "accept", "ok");

    // The second .update call is on billing_periods
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "corrected" }),
    );
  });

  it("should update period status to 'dispute_resolved' when rejecting", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", billing_period_id: "bp-1", establishment_id: "e1", status: "open" },
      error: null,
    });

    await respondToDispute("disp-1", "admin-1", "reject", "denied");

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dispute_resolved" }),
    );
  });
});

// ==========================================================================
// 10. escalateDispute
// ==========================================================================

describe("escalateDispute", () => {
  it("should return error when query fails", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: { message: "db error" } });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("db error");
  });

  it("should return not_found when dispute does not exist", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("not_found");
  });

  it("should reject when status is 'open' (not yet rejected)", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", status: "open", establishment_id: "e1" },
      error: null,
    });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'under_review'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", status: "under_review", establishment_id: "e1" },
      error: null,
    });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'resolved_accepted'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", status: "resolved_accepted", establishment_id: "e1" },
      error: null,
    });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should reject when status is 'escalated' (already escalated)", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", status: "escalated", establishment_id: "e1" },
      error: null,
    });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("invalid_status");
  });

  it("should succeed when status is 'resolved_rejected'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", status: "resolved_rejected", establishment_id: "e1" },
      error: null,
    });

    const result = await escalateDispute("disp-1");
    expect(result.ok).toBe(true);
  });

  it("should update dispute status to 'escalated'", async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({
      data: { id: "disp-1", status: "resolved_rejected", establishment_id: "e1" },
      error: null,
    });

    await escalateDispute("disp-1");
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "escalated",
        escalated_at: expect.any(String),
      }),
    );
  });
});

// ==========================================================================
// Shared types / helper coverage (getBillingPeriodCode, getBillingPeriodDates)
// ==========================================================================

import { getBillingPeriodCode, getBillingPeriodDates } from "../../shared/packsBillingTypes";

describe("getBillingPeriodCode (shared helper)", () => {
  it("should return period A for day 1", () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 1))).toBe("2026-01-A");
  });

  it("should return period A for day 15", () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 15))).toBe("2026-01-A");
  });

  it("should return period B for day 16", () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 16))).toBe("2026-01-B");
  });

  it("should return period B for day 31", () => {
    expect(getBillingPeriodCode(new Date(2026, 0, 31))).toBe("2026-01-B");
  });

  it("should zero-pad the month", () => {
    expect(getBillingPeriodCode(new Date(2026, 1, 5))).toBe("2026-02-A");
  });

  it("should handle December correctly", () => {
    expect(getBillingPeriodCode(new Date(2026, 11, 20))).toBe("2026-12-B");
  });
});

describe("getBillingPeriodDates (shared helper)", () => {
  it("should return 1-15 for period A", () => {
    const { start, end } = getBillingPeriodDates("2026-01-A");
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(15);
    expect(start.getMonth()).toBe(0);
  });

  it("should return 16-end for period B", () => {
    const { start, end } = getBillingPeriodDates("2026-01-B");
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(31); // January has 31 days
  });

  it("should handle February correctly for period B", () => {
    const { end } = getBillingPeriodDates("2026-02-B");
    expect(end.getDate()).toBe(28); // 2026 is not a leap year
  });

  it("should handle leap year February for period B", () => {
    const { end } = getBillingPeriodDates("2028-02-B");
    expect(end.getDate()).toBe(29); // 2028 is a leap year
  });
});
