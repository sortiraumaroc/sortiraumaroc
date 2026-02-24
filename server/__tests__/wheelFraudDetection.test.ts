/**
 * Tests for server/wheelFraudDetection.ts
 *
 * All Supabase calls are mocked via a reusable chainable factory.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
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
  checkMultiAccountSuspicion,
  alertAdminFraudSuspicion,
  runFraudDetectionScan,
} from "../wheelFraudDetection";
import { emitAdminNotification } from "../adminNotifications";

const mockEmitAdminNotification = vi.mocked(emitAdminNotification);

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
    "lt",
    "lte",
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

  builder.maybeSingle = vi.fn(() => _result);
  builder.single = vi.fn(() => _result);
  builder.then = (resolve: Function) => resolve(_result);

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
// 1. checkMultiAccountSuspicion
// ==========================================================================

describe("checkMultiAccountSuspicion", () => {
  it("returns not suspicious when neither deviceId nor ipAddress is provided", async () => {
    const result = await checkMultiAccountSuspicion("user-1", null, null);

    expect(result.suspicious).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("flags suspicion when 3+ accounts win on the same device_id", async () => {
    const deviceWins = [
      { user_id: "user-1" },
      { user_id: "user-2" },
      { user_id: "user-3" },
    ];

    mockSupabase.__setResult({ data: deviceWins, error: null });

    const result = await checkMultiAccountSuspicion("user-1", "device-abc", null);

    expect(result.suspicious).toBe(true);
    expect(result.details?.type).toBe("device");
    expect(result.details?.device_id).toBe("device-abc");
    expect(result.details?.accounts_count).toBe(3);
  });

  it("flags suspicion when 3+ accounts win on the same IP address", async () => {
    const ipWins = [
      { user_id: "user-a" },
      { user_id: "user-b" },
      { user_id: "user-c" },
    ];

    mockSupabase.__setResult({ data: ipWins, error: null });

    const result = await checkMultiAccountSuspicion("user-a", null, "192.168.1.1");

    expect(result.suspicious).toBe(true);
    expect(result.details?.type).toBe("ip");
    expect(result.details?.ip_address).toBe("192.168.1.1");
    expect(result.details?.accounts_count).toBe(3);
  });

  it("returns not suspicious for fewer than 3 accounts", async () => {
    const fewWins = [{ user_id: "user-1" }, { user_id: "user-2" }];

    mockSupabase.__setResult({ data: fewWins, error: null });

    const result = await checkMultiAccountSuspicion("user-1", "device-xyz", "10.0.0.1");

    expect(result.suspicious).toBe(false);
    expect(result.details).toBeUndefined();
  });
});

// ==========================================================================
// 2. alertAdminFraudSuspicion
// ==========================================================================

describe("alertAdminFraudSuspicion", () => {
  it("sends admin notification with correct details", () => {
    alertAdminFraudSuspicion({
      type: "device",
      device_id: "device-123",
      accounts_count: 4,
      winning_accounts: ["user-1", "user-2", "user-3", "user-4"],
    });

    expect(mockEmitAdminNotification).toHaveBeenCalledTimes(1);
    const call = mockEmitAdminNotification.mock.calls[0][0];
    expect(call.type).toBe("wheel_fraud_alert");
    expect(call.title).toContain("Suspicion multi-comptes");
    expect(call.data.accounts).toEqual(["user-1", "user-2", "user-3", "user-4"]);
  });

  it("does nothing when details is undefined", () => {
    alertAdminFraudSuspicion(undefined);

    expect(mockEmitAdminNotification).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// 3. runFraudDetectionScan
// ==========================================================================

describe("runFraudDetectionScan", () => {
  it("returns 0 alerts when there are no winning spins", async () => {
    mockSupabase.__setResult({ data: [], error: null });

    const result = await runFraudDetectionScan();

    expect(result.alerts).toBe(0);
    expect(mockEmitAdminNotification).not.toHaveBeenCalled();
  });

  it("detects and counts alerts for suspicious device and IP groups", async () => {
    const winningSpins = [
      { user_id: "u1", device_id: "d1", ip_address: "ip1", result: "won" },
      { user_id: "u2", device_id: "d1", ip_address: "ip1", result: "won" },
      { user_id: "u3", device_id: "d1", ip_address: "ip1", result: "won" },
    ];

    mockSupabase.__setResult({ data: winningSpins, error: null });

    const result = await runFraudDetectionScan();

    // 3 users on device d1 (1 alert) + 3 users on ip1 (1 alert) = 2
    expect(result.alerts).toBe(2);
    expect(mockEmitAdminNotification).toHaveBeenCalledTimes(2);
  });
});
