/**
 * Tests for server/loyaltyFraudDetection.ts
 *
 * All Supabase calls are mocked via a reusable chainable factory.
 * Each exported function is tested for happy paths, edge cases,
 * and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports from the module
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabase();

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => mockSupabase),
}));

vi.mock("../lib/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../adminNotifications", () => ({
  emitAdminNotification: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Import the functions under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import {
  detectSuspiciousStamping,
  detectAbnormalFrequency,
  detectHighValueReward,
  detectSuspiciousAmountPattern,
  alertProgramCreated,
  getAlerts,
  reviewAlert,
  dismissAlert,
} from "../loyaltyFraudDetection";
import { emitAdminNotification } from "../adminNotifications";

// ---------------------------------------------------------------------------
// Reusable Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase() {
  let _result: { data: unknown; error: unknown; count?: number | null } = {
    data: null,
    error: null,
  };
  const _resultQueue: Array<{
    data: unknown;
    error: unknown;
    count?: number | null;
  }> = [];

  const builder: Record<string, any> = {};

  function nextResult() {
    if (_resultQueue.length > 0) return _resultQueue.shift()!;
    return _result;
  }

  const chainMethods = [
    "from",
    "select",
    "eq",
    "lt",
    "lte",
    "gt",
    "gte",
    "not",
    "is",
    "limit",
    "insert",
    "update",
    "range",
    "order",
  ];

  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }

  builder.maybeSingle = vi.fn(() => nextResult());
  builder.single = vi.fn(() => nextResult());
  builder.then = (resolve: Function) => resolve(nextResult());

  builder.__setResult = (r: {
    data: unknown;
    error: unknown;
    count?: number | null;
  }) => {
    _result = r;
  };

  builder.__enqueueResult = (r: {
    data: unknown;
    error: unknown;
    count?: number | null;
  }) => {
    _resultQueue.push(r);
  };

  builder.__reset = () => {
    _result = { data: null, error: null };
    _resultQueue.length = 0;
    for (const m of chainMethods) {
      (builder[m] as ReturnType<typeof vi.fn>).mockClear();
    }
    (builder.maybeSingle as ReturnType<typeof vi.fn>).mockClear();
    (builder.single as ReturnType<typeof vi.fn>).mockClear();
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
// 1. detectSuspiciousStamping
// ==========================================================================

describe("detectSuspiciousStamping", () => {
  const args = {
    userId: "user-1",
    establishmentId: "est-1",
    programId: "prog-1",
  };

  it("creates an alert when stamp count exceeds threshold", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null, count: 10 });
    mockSupabase.__enqueueResult({ data: null, error: null });
    mockSupabase.__enqueueResult({ data: null, error: null });

    await detectSuspiciousStamping(args);

    expect(mockSupabase.from).toHaveBeenCalledWith("loyalty_alerts");
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_type: "suspicious_stamping",
        establishment_id: "est-1",
        user_id: "user-1",
        program_id: "prog-1",
        status: "pending",
      }),
    );
    expect(emitAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "loyalty_alert_suspicious_stamping",
        title: "Alerte Fidélité",
      }),
    );
  });

  it("does not create alert when stamp count is below threshold", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null, count: 3 });

    await detectSuspiciousStamping(args);

    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  it("does not create duplicate alert if recent alert already exists", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null, count: 10 });
    mockSupabase.__enqueueResult({
      data: { id: "alert-existing" },
      error: null,
    });

    await detectSuspiciousStamping(args);

    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  it("handles DB error gracefully without throwing", async () => {
    mockSupabase.__enqueueResult({
      data: null,
      error: new Error("DB connection lost"),
      count: null,
    });

    await expect(detectSuspiciousStamping(args)).resolves.toBeUndefined();
  });
});

// ==========================================================================
// 2. detectAbnormalFrequency
// ==========================================================================

describe("detectAbnormalFrequency", () => {
  it("flags establishment with stamps above threshold", async () => {
    const stamps = Array.from({ length: 25 }, () => ({
      establishment_id: "est-1",
      stamped_by_user_id: "pro-1",
    }));
    mockSupabase.__enqueueResult({ data: stamps, error: null });
    mockSupabase.__enqueueResult({ data: null, error: null });
    mockSupabase.__enqueueResult({ data: null, error: null });

    const result = await detectAbnormalFrequency();

    expect(result.alerts_created).toBe(1);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_type: "abnormal_frequency",
        establishment_id: "est-1",
        status: "pending",
      }),
    );
  });

  it("returns zero alerts when no stamps found", async () => {
    mockSupabase.__enqueueResult({ data: [], error: null });

    const result = await detectAbnormalFrequency();

    expect(result.alerts_created).toBe(0);
  });

  it("returns zero alerts when data is null", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null });

    const result = await detectAbnormalFrequency();

    expect(result.alerts_created).toBe(0);
  });
});

// ==========================================================================
// 3. detectHighValueReward
// ==========================================================================

describe("detectHighValueReward", () => {
  it("creates alert when reward value exceeds threshold", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null });

    await detectHighValueReward({
      programId: "prog-1",
      establishmentId: "est-1",
      rewardDescription: "iPhone 15",
      rewardValue: "5000",
    });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_type: "high_value_reward",
        establishment_id: "est-1",
        program_id: "prog-1",
        status: "pending",
      }),
    );
  });

  it("does not create alert for normal reward value", async () => {
    await detectHighValueReward({
      programId: "prog-1",
      establishmentId: "est-1",
      rewardDescription: "Free coffee",
      rewardValue: "50",
    });

    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  it("does not create alert when rewardValue is null", async () => {
    await detectHighValueReward({
      programId: "prog-1",
      establishmentId: "est-1",
      rewardDescription: "Mystery gift",
      rewardValue: null,
    });

    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// 4. detectSuspiciousAmountPattern
// ==========================================================================

describe("detectSuspiciousAmountPattern", () => {
  it("flags pro who systematically enters minimum amount", async () => {
    mockSupabase.__enqueueResult({
      data: [
        {
          id: "prog-1",
          establishment_id: "est-1",
          name: "Coffee Loyalty",
          stamp_minimum_amount: 100,
        },
      ],
      error: null,
    });

    const stamps = Array.from({ length: 10 }, () => ({
      amount_spent: 100,
      stamped_by_user_id: "pro-1",
    }));
    mockSupabase.__enqueueResult({ data: stamps, error: null });
    mockSupabase.__enqueueResult({ data: null, error: null });
    mockSupabase.__enqueueResult({ data: null, error: null });

    const result = await detectSuspiciousAmountPattern();

    expect(result.alerts_created).toBe(1);
  });

  it("returns zero alerts when no conditional programs exist", async () => {
    mockSupabase.__enqueueResult({ data: [], error: null });

    const result = await detectSuspiciousAmountPattern();

    expect(result.alerts_created).toBe(0);
  });
});

// ==========================================================================
// 5. alertProgramCreated
// ==========================================================================

describe("alertProgramCreated", () => {
  it("inserts alert and notifies admin", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null });

    await alertProgramCreated({
      programId: "prog-new",
      establishmentId: "est-1",
      programName: "VIP Rewards",
      createdBy: "user-admin",
    });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_type: "program_created",
        establishment_id: "est-1",
        user_id: "user-admin",
        program_id: "prog-new",
        status: "pending",
      }),
    );
    expect(emitAdminNotification).toHaveBeenCalled();
  });
});

// ==========================================================================
// 6. getAlerts
// ==========================================================================

describe("getAlerts", () => {
  it("returns all alerts when no filters provided", async () => {
    const alertsData = [
      { id: "a1", alert_type: "suspicious_stamping" },
      { id: "a2", alert_type: "high_value_reward" },
    ];
    mockSupabase.__enqueueResult({ data: alertsData, error: null });

    const result = await getAlerts();

    expect(result).toEqual(alertsData);
    expect(mockSupabase.limit).toHaveBeenCalledWith(50);
  });

  it("applies status filter when provided", async () => {
    mockSupabase.__enqueueResult({ data: [], error: null });

    await getAlerts({ status: "pending" });

    expect(mockSupabase.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("returns empty array when data is null", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null });

    const result = await getAlerts();

    expect(result).toEqual([]);
  });
});

// ==========================================================================
// 7. reviewAlert
// ==========================================================================

describe("reviewAlert", () => {
  it("updates alert status to reviewed", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null });

    const result = await reviewAlert({
      alertId: "alert-1",
      reviewedBy: "admin-1",
      reviewNotes: "Looks legitimate",
    });

    expect(result).toEqual({ ok: true });
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "reviewed",
        reviewed_by: "admin-1",
        review_notes: "Looks legitimate",
      }),
    );
  });

  it("returns ok false when DB returns error", async () => {
    mockSupabase.__enqueueResult({
      data: null,
      error: { message: "not found" },
    });

    const result = await reviewAlert({
      alertId: "nonexistent",
      reviewedBy: "admin-1",
    });

    expect(result).toEqual({ ok: false });
  });
});

// ==========================================================================
// 8. dismissAlert
// ==========================================================================

describe("dismissAlert", () => {
  it("updates alert status to dismissed", async () => {
    mockSupabase.__enqueueResult({ data: null, error: null });

    const result = await dismissAlert({
      alertId: "alert-2",
      reviewedBy: "admin-2",
      reviewNotes: "False positive",
    });

    expect(result).toEqual({ ok: true });
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "dismissed",
        reviewed_by: "admin-2",
        review_notes: "False positive",
      }),
    );
  });

  it("returns ok false when DB returns error", async () => {
    mockSupabase.__enqueueResult({
      data: null,
      error: { message: "row not found" },
    });

    const result = await dismissAlert({
      alertId: "nonexistent",
      reviewedBy: "admin-2",
    });

    expect(result).toEqual({ ok: false });
  });
});
