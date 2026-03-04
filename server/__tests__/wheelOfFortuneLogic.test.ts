/**
 * Tests for server/wheelOfFortuneLogic.ts
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

vi.mock("../notificationEngine", () => ({
  fireNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../adminNotifications", () => ({
  emitAdminNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("../consumerNotifications", () => ({
  emitConsumerUserEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("../audienceSegmentService", () => ({
  getAudienceUserIds: vi.fn(() => Promise.resolve([])),
}));

// ---------------------------------------------------------------------------
// Import the functions under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import {
  getActiveWheel,
  canUserSpin,
  spinWheel,
  getSpinHistory,
  getUserWheelGifts,
} from "../wheelOfFortuneLogic";

// ---------------------------------------------------------------------------
// Reusable Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase() {
  let _result: { data: unknown; error: unknown; count?: number | null } = {
    data: null,
    error: null,
  };

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

  builder.auth = {
    admin: {
      getUserById: vi.fn(() => ({
        data: {
          user: {
            email: "user@test.com",
            email_confirmed_at: "2025-01-01T00:00:00Z",
          },
        },
      })),
    },
  };

  builder.__setResult = (r: {
    data: unknown;
    error: unknown;
    count?: number | null;
  }) => {
    _result = r;
  };

  builder.__reset = () => {
    _result = { data: null, error: null };
    for (const m of chainMethods) {
      (builder[m] as ReturnType<typeof vi.fn>).mockClear();
    }
    (builder.maybeSingle as ReturnType<typeof vi.fn>).mockClear();
    (builder.single as ReturnType<typeof vi.fn>).mockClear();
    builder.auth.admin.getUserById.mockClear();
  };

  return builder;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date();

function makeActiveWheel(overrides: Record<string, unknown> = {}) {
  return {
    id: "wheel-1",
    status: "active",
    start_date: new Date(NOW.getTime() - 86400000).toISOString(),
    end_date: new Date(NOW.getTime() + 86400000).toISOString(),
    spins_per_day: 1,
    eligibility: "all",
    eligibility_filters: null,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.__reset();
});

// ==========================================================================
// 1. getActiveWheel
// ==========================================================================

describe("getActiveWheel", () => {
  it("returns the active wheel event when one exists", async () => {
    const wheel = makeActiveWheel();
    mockSupabase.__setResult({ data: wheel, error: null });

    const result = await getActiveWheel();

    expect(result).toEqual(wheel);
    expect(mockSupabase.from).toHaveBeenCalledWith("wheel_events");
    expect(mockSupabase.eq).toHaveBeenCalledWith("status", "active");
    expect(mockSupabase.maybeSingle).toHaveBeenCalled();
  });

  it("returns null when no active wheel exists", async () => {
    mockSupabase.__setResult({ data: null, error: null });

    const result = await getActiveWheel();

    expect(result).toBeNull();
  });

  it("returns null when supabase returns an error", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "DB error" } });

    const result = await getActiveWheel();

    expect(result).toBeNull();
  });
});

// ==========================================================================
// 2. getSpinHistory
// ==========================================================================

describe("getSpinHistory", () => {
  it("returns paginated spin history for a user", async () => {
    const spins = [
      { id: "spin-1", result: "won", created_at: NOW.toISOString() },
      { id: "spin-2", result: "lost", created_at: NOW.toISOString() },
    ];

    mockSupabase.__setResult({ data: spins, error: null });

    const result = await getSpinHistory("user-1", "wheel-1");

    expect(result).toEqual(spins);
    expect(mockSupabase.from).toHaveBeenCalledWith("wheel_spins");
    expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockSupabase.eq).toHaveBeenCalledWith("wheel_event_id", "wheel-1");
  });

  it("returns an empty array when supabase returns an error", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "DB error" } });

    const result = await getSpinHistory("user-1", "wheel-1");

    expect(result).toEqual([]);
  });
});

// ==========================================================================
// 3. getUserWheelGifts
// ==========================================================================

describe("getUserWheelGifts", () => {
  it("returns the user's wheel gifts", async () => {
    const gifts = [
      {
        id: "gift-1",
        consumer_user_id: "user-1",
        source: "wheel_of_fortune",
        platform_gift: { name: "Free coffee" },
      },
    ];

    mockSupabase.__setResult({ data: gifts, error: null });

    const result = await getUserWheelGifts("user-1");

    expect(result).toEqual(gifts);
    expect(mockSupabase.from).toHaveBeenCalledWith("platform_gift_distributions");
    expect(mockSupabase.eq).toHaveBeenCalledWith("consumer_user_id", "user-1");
    expect(mockSupabase.eq).toHaveBeenCalledWith("source", "wheel_of_fortune");
  });

  it("returns an empty array when supabase returns an error", async () => {
    mockSupabase.__setResult({ data: null, error: { message: "DB error" } });

    const result = await getUserWheelGifts("user-1");

    expect(result).toEqual([]);
  });
});
