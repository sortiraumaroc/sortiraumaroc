/**
 * Tests for server/packLifecycleLogic.ts
 *
 * Covers all exported lifecycle functions:
 *  - createPackV2
 *  - submitPackForModeration
 *  - approvePack
 *  - rejectPack
 *  - requestPackModification
 *  - featurePack
 *  - updatePackV2 (including SIGNIFICANT_FIELDS re-moderation logic)
 *  - suspendPack / resumePack
 *  - closePack / deletePack
 *  - duplicatePack
 *  - activateScheduledPacks / endExpiredPacks
 *  - checkAndMarkSoldOut
 *
 * Supabase is fully mocked via a chainable query builder factory.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(),
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
  emitAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../proNotifications", () => ({
  notifyProMembers: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { getAdminSupabase } from "../supabaseAdmin";

import {
  createPackV2,
  submitPackForModeration,
  approvePack,
  rejectPack,
  requestPackModification,
  featurePack,
  updatePackV2,
  suspendPack,
  resumePack,
  closePack,
  deletePack,
  duplicatePack,
  activateScheduledPacks,
  endExpiredPacks,
  checkAndMarkSoldOut,
} from "../packLifecycleLogic";

// ---------------------------------------------------------------------------
// Chainable Supabase mock factory
// ---------------------------------------------------------------------------

type ChainResult = { data: unknown; error: unknown; count?: number };

/**
 * Creates a mock Supabase client with chainable `.from().select().eq()...` API.
 * Call `mockResult(result)` to set the value that `.single()` / `.maybeSingle()`
 * (or terminal await) resolves to.
 */
function createMockSupabase(defaultResult: ChainResult = { data: null, error: null }) {
  let currentResult: ChainResult = { ...defaultResult };
  let lastPayload: Record<string, unknown> | null = null;
  let deleteCalled = false;

  const chain: Record<string, any> = {};

  // All chainable methods simply return the chain
  const chainMethods = [
    "from",
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "lt",
    "lte",
    "gt",
    "gte",
    "not",
    "in",
    "is",
    "like",
    "ilike",
    "limit",
    "order",
    "range",
  ];

  for (const method of chainMethods) {
    chain[method] = vi.fn((...args: any[]) => {
      // Capture insert/update payloads
      if (method === "insert" || method === "update") {
        lastPayload = args[0] as Record<string, unknown>;
      }
      if (method === "delete") {
        deleteCalled = true;
      }
      return chain;
    });
  }

  // Terminal methods
  chain.single = vi.fn(() => Promise.resolve(currentResult));
  chain.maybeSingle = vi.fn(() => Promise.resolve(currentResult));

  // Also make the chain itself thenable so `await supabase.from(...).update(...)...` resolves
  chain.then = (resolve: any) => Promise.resolve(currentResult).then(resolve);

  /** Set the result for the next query */
  function mockResult(result: Partial<ChainResult>) {
    currentResult = { data: null, error: null, ...result };
  }

  /** Get the payload passed to the most recent `.insert()` or `.update()` */
  function getLastPayload() {
    return lastPayload;
  }

  function wasDeleteCalled() {
    return deleteCalled;
  }

  function reset() {
    currentResult = { ...defaultResult };
    lastPayload = null;
    deleteCalled = false;
    for (const method of chainMethods) {
      (chain[method] as any).mockClear();
    }
    (chain.single as any).mockClear();
    (chain.maybeSingle as any).mockClear();
  }

  return { chain, mockResult, getLastPayload, wasDeleteCalled, reset };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let mock: ReturnType<typeof createMockSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  mock = createMockSupabase();
  (getAdminSupabase as any).mockReturnValue(mock.chain);
});

// ============================================================================
// createPackV2
// ============================================================================

describe("createPackV2", () => {
  it("should create a draft pack and return its id", async () => {
    mock.mockResult({ data: { id: "pack-1" }, error: null });
    const result = await createPackV2({
      establishmentId: "est-1",
      title: "Weekend Spa",
      price: 50000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.packId).toBe("pack-1");
    }
  });

  it("should set moderation_status to draft and active to false", async () => {
    mock.mockResult({ data: { id: "pack-2" }, error: null });
    await createPackV2({
      establishmentId: "est-1",
      title: "Brunch Pack",
      price: 30000,
    });
    const payload = mock.getLastPayload();
    expect(payload).not.toBeNull();
    expect(payload!.moderation_status).toBe("draft");
    expect(payload!.active).toBe(false);
  });

  it("should calculate discount_percentage when originalPrice > price", async () => {
    mock.mockResult({ data: { id: "pack-3" }, error: null });
    await createPackV2({
      establishmentId: "est-1",
      title: "Discounted",
      price: 8000,
      originalPrice: 10000,
    });
    const payload = mock.getLastPayload();
    expect(payload!.discount_percentage).toBe(20);
  });

  it("should set discount_percentage to null when no originalPrice", async () => {
    mock.mockResult({ data: { id: "pack-4" }, error: null });
    await createPackV2({
      establishmentId: "est-1",
      title: "No Discount",
      price: 5000,
    });
    const payload = mock.getLastPayload();
    expect(payload!.discount_percentage).toBeNull();
  });

  it("should set is_limited=true when stock is provided", async () => {
    mock.mockResult({ data: { id: "pack-5" }, error: null });
    await createPackV2({
      establishmentId: "est-1",
      title: "Limited",
      price: 5000,
      stock: 50,
    });
    const payload = mock.getLastPayload();
    expect(payload!.is_limited).toBe(true);
    expect(payload!.stock).toBe(50);
  });

  it("should return error on db failure", async () => {
    mock.mockResult({ data: null, error: { message: "DB connection lost" } });
    const result = await createPackV2({
      establishmentId: "est-1",
      title: "Fail",
      price: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DB connection lost");
    }
  });
});

// ============================================================================
// submitPackForModeration
// ============================================================================

describe("submitPackForModeration", () => {
  it("should accept submission from draft status", async () => {
    mock.mockResult({
      data: { id: "p1", moderation_status: "draft", title: "Test", establishment_id: "e1" },
      error: null,
    });
    const result = await submitPackForModeration("p1", "e1");
    expect(result.ok).toBe(true);
  });

  it("should accept submission from rejected status", async () => {
    mock.mockResult({
      data: { id: "p2", moderation_status: "rejected", title: "Redo", establishment_id: "e1" },
      error: null,
    });
    // rejected -> draft is the valid transition, but rejected does NOT allow direct pending_moderation
    // Checking the PACK_MODERATION_TRANSITIONS: rejected: ["draft"]
    // So this should FAIL
    const result = await submitPackForModeration("p2", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should accept submission from modification_requested status", async () => {
    mock.mockResult({
      data: { id: "p3", moderation_status: "modification_requested", title: "Modified", establishment_id: "e1" },
      error: null,
    });
    const result = await submitPackForModeration("p3", "e1");
    expect(result.ok).toBe(true);
  });

  it("should reject submission from active status", async () => {
    mock.mockResult({
      data: { id: "p4", moderation_status: "active", title: "Active Pack", establishment_id: "e1" },
      error: null,
    });
    const result = await submitPackForModeration("p4", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should reject submission from approved status", async () => {
    mock.mockResult({
      data: { id: "p5", moderation_status: "approved", title: "Approved", establishment_id: "e1" },
      error: null,
    });
    const result = await submitPackForModeration("p5", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should reject submission from ended status", async () => {
    mock.mockResult({
      data: { id: "p6", moderation_status: "ended", title: "Ended", establishment_id: "e1" },
      error: null,
    });
    const result = await submitPackForModeration("p6", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found when pack does not exist", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await submitPackForModeration("no-exist", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });

  it("should return error on db fetch failure", async () => {
    mock.mockResult({ data: null, error: { message: "timeout" } });
    const result = await submitPackForModeration("p1", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("timeout");
    }
  });
});

// ============================================================================
// approvePack
// ============================================================================

describe("approvePack", () => {
  it("should approve a pending_moderation pack and activate it when no sale_start_date", async () => {
    mock.mockResult({
      data: { id: "p1", moderation_status: "pending_moderation", title: "Pack", establishment_id: "e1", sale_start_date: null },
      error: null,
    });
    const result = await approvePack("p1", "admin-1");
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("active");
    expect(payload!.active).toBe(true);
  });

  it("should set status to approved (not active) when sale_start_date is in the future", async () => {
    mock.mockResult({
      data: { id: "p2", moderation_status: "pending_moderation", title: "Future", establishment_id: "e1", sale_start_date: "2099-12-31" },
      error: null,
    });
    const result = await approvePack("p2", "admin-1");
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("approved");
    expect(payload!.active).toBe(false);
  });

  it("should activate immediately when sale_start_date is today or past", async () => {
    const today = new Date().toISOString().split("T")[0];
    mock.mockResult({
      data: { id: "p3", moderation_status: "pending_moderation", title: "Today", establishment_id: "e1", sale_start_date: today },
      error: null,
    });
    const result = await approvePack("p3", "admin-1");
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("active");
    expect(payload!.active).toBe(true);
  });

  it("should reject approval when pack is not pending_moderation", async () => {
    mock.mockResult({
      data: { id: "p4", moderation_status: "draft", title: "Draft", establishment_id: "e1", sale_start_date: null },
      error: null,
    });
    const result = await approvePack("p4", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await approvePack("missing", "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });

  it("should clear rejection_reason on approval", async () => {
    mock.mockResult({
      data: { id: "p5", moderation_status: "pending_moderation", title: "Re-approved", establishment_id: "e1", sale_start_date: null },
      error: null,
    });
    await approvePack("p5", "admin-1", "Looks good now");
    const payload = mock.getLastPayload();
    expect(payload!.rejection_reason).toBeNull();
    expect(payload!.moderation_note).toBe("Looks good now");
  });

  it("should sanitize non-UUID admin user id via safeUUID", async () => {
    mock.mockResult({
      data: { id: "p6", moderation_status: "pending_moderation", title: "T", establishment_id: "e1", sale_start_date: null },
      error: null,
    });
    await approvePack("p6", "not-a-uuid");
    const payload = mock.getLastPayload();
    expect(payload!.moderated_by).toBeNull();
  });
});

// ============================================================================
// rejectPack
// ============================================================================

describe("rejectPack", () => {
  it("should reject a pending_moderation pack", async () => {
    mock.mockResult({
      data: { id: "p1", moderation_status: "pending_moderation", title: "Bad Pack", establishment_id: "e1" },
      error: null,
    });
    const result = await rejectPack("p1", "admin-1", "Contenu inapproprie");
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("rejected");
    expect(payload!.active).toBe(false);
    expect(payload!.rejection_reason).toBe("Contenu inapproprie");
  });

  it("should refuse rejection when pack is not pending_moderation", async () => {
    mock.mockResult({
      data: { id: "p2", moderation_status: "active", title: "Active", establishment_id: "e1" },
      error: null,
    });
    const result = await rejectPack("p2", "admin-1", "Reason");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await rejectPack("missing", "admin-1", "Reason");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// requestPackModification
// ============================================================================

describe("requestPackModification", () => {
  it("should set status to modification_requested from pending_moderation", async () => {
    mock.mockResult({
      data: { id: "p1", moderation_status: "pending_moderation", title: "Almost", establishment_id: "e1" },
      error: null,
    });
    const result = await requestPackModification("p1", "admin-1", "Please improve the cover image");
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("modification_requested");
    expect(payload!.moderation_note).toBe("Please improve the cover image");
    expect(payload!.active).toBe(false);
  });

  it("should refuse from non-pending_moderation status", async () => {
    mock.mockResult({
      data: { id: "p2", moderation_status: "draft", title: "Draft", establishment_id: "e1" },
      error: null,
    });
    const result = await requestPackModification("p2", "admin-1", "Note");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });
});

// ============================================================================
// featurePack
// ============================================================================

describe("featurePack", () => {
  it("should set is_featured to true", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await featurePack("p1", true);
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.is_featured).toBe(true);
  });

  it("should set is_featured to false", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await featurePack("p1", false);
    expect(result.ok).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.is_featured).toBe(false);
  });

  it("should return error on db failure", async () => {
    mock.mockResult({ data: null, error: { message: "fail" } });
    const result = await featurePack("p1", true);
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// updatePackV2 — editable statuses & SIGNIFICANT_FIELDS
// ============================================================================

describe("updatePackV2", () => {
  it("should allow editing a draft pack without re-moderation", async () => {
    mock.mockResult({
      data: { id: "p1", moderation_status: "draft", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p1", "e1", { title: "New Title" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(false);
    }
  });

  it("should allow editing a modification_requested pack", async () => {
    mock.mockResult({
      data: { id: "p2", moderation_status: "modification_requested", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p2", "e1", { conditions: "No refunds" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(false);
    }
  });

  it("should allow editing a rejected pack", async () => {
    mock.mockResult({
      data: { id: "p3", moderation_status: "rejected", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p3", "e1", { title: "Improved Title" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(false);
    }
  });

  it("should refuse editing a pending_moderation pack", async () => {
    mock.mockResult({
      data: { id: "p4", moderation_status: "pending_moderation", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p4", "e1", { title: "Change" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_editable");
    }
  });

  it("should refuse editing an approved pack", async () => {
    mock.mockResult({
      data: { id: "p5", moderation_status: "approved", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p5", "e1", { title: "Change" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_editable");
    }
  });

  it("should refuse editing an ended pack", async () => {
    mock.mockResult({
      data: { id: "p6", moderation_status: "ended", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p6", "e1", { title: "Change" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_editable");
    }
  });

  // ---- SIGNIFICANT_FIELDS detection on active packs ----

  it("should trigger re-moderation when changing title on active pack", async () => {
    mock.mockResult({
      data: { id: "p7", moderation_status: "active", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p7", "e1", { title: "Changed Title" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(true);
    }
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("pending_moderation");
    expect(payload!.active).toBe(false);
  });

  it("should trigger re-moderation when changing price on active pack", async () => {
    mock.mockResult({
      data: { id: "p8", moderation_status: "active", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p8", "e1", { price: 6000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(true);
    }
  });

  it("should trigger re-moderation when changing coverUrl on active pack", async () => {
    mock.mockResult({
      data: { id: "p9", moderation_status: "active", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p9", "e1", { coverUrl: "https://new-image.jpg" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(true);
    }
  });

  it("should trigger re-moderation when changing items on active pack", async () => {
    mock.mockResult({
      data: { id: "p10", moderation_status: "active", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p10", "e1", { items: [{ name: "New item", quantity: 1 }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(true);
    }
  });

  it("should trigger re-moderation when changing inclusions on active pack", async () => {
    mock.mockResult({
      data: { id: "p11", moderation_status: "active", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p11", "e1", { inclusions: [{ label: "Free drink" }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(true);
    }
  });

  it("should NOT trigger re-moderation for non-significant fields on active pack (e.g. conditions, validDays)", async () => {
    mock.mockResult({
      data: { id: "p12", moderation_status: "active", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p12", "e1", { conditions: "Updated conditions", validDays: [1, 2, 3] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(false);
    }
  });

  it("should allow editing a suspended pack (treated like active for significant field checks)", async () => {
    mock.mockResult({
      data: { id: "p13", moderation_status: "suspended", price: 5000, original_price: null, establishment_id: "e1" },
      error: null,
    });
    const result = await updatePackV2("p13", "e1", { title: "New title" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresModeration).toBe(true);
    }
  });

  it("should recalculate discount_percentage on price update", async () => {
    mock.mockResult({
      data: { id: "p14", moderation_status: "draft", price: 5000, original_price: 10000, establishment_id: "e1" },
      error: null,
    });
    await updatePackV2("p14", "e1", { price: 7000 });
    const payload = mock.getLastPayload();
    // (10000 - 7000) / 10000 = 30%
    expect(payload!.discount_percentage).toBe(30);
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await updatePackV2("missing", "e1", { title: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// suspendPack
// ============================================================================

describe("suspendPack", () => {
  it("should suspend an active pack", async () => {
    mock.mockResult({ data: { id: "p1", moderation_status: "active" }, error: null });
    const result = await suspendPack("p1", "e1");
    expect(result.ok).toBe(true);
  });

  it("should reject suspending a non-active pack", async () => {
    mock.mockResult({ data: { id: "p2", moderation_status: "draft" }, error: null });
    const result = await suspendPack("p2", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should reject suspending an already suspended pack", async () => {
    mock.mockResult({ data: { id: "p3", moderation_status: "suspended" }, error: null });
    const result = await suspendPack("p3", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await suspendPack("missing", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// resumePack
// ============================================================================

describe("resumePack", () => {
  it("should resume a suspended pack", async () => {
    mock.mockResult({ data: { id: "p1", moderation_status: "suspended" }, error: null });
    const result = await resumePack("p1", "e1");
    expect(result.ok).toBe(true);
  });

  it("should reject resuming a non-suspended pack", async () => {
    mock.mockResult({ data: { id: "p2", moderation_status: "active" }, error: null });
    const result = await resumePack("p2", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await resumePack("missing", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// closePack
// ============================================================================

describe("closePack", () => {
  it("should close an active pack", async () => {
    mock.mockResult({ data: { id: "p1", moderation_status: "active" }, error: null });
    const result = await closePack("p1", "e1");
    expect(result.ok).toBe(true);
  });

  it("should close a suspended pack", async () => {
    mock.mockResult({ data: { id: "p2", moderation_status: "suspended" }, error: null });
    const result = await closePack("p2", "e1");
    expect(result.ok).toBe(true);
  });

  it("should close a sold_out pack", async () => {
    mock.mockResult({ data: { id: "p3", moderation_status: "sold_out" }, error: null });
    const result = await closePack("p3", "e1");
    expect(result.ok).toBe(true);
  });

  it("should reject closing a draft pack", async () => {
    mock.mockResult({ data: { id: "p4", moderation_status: "draft" }, error: null });
    const result = await closePack("p4", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should reject closing a pending_moderation pack", async () => {
    mock.mockResult({ data: { id: "p5", moderation_status: "pending_moderation" }, error: null });
    const result = await closePack("p5", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await closePack("missing", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// deletePack
// ============================================================================

describe("deletePack", () => {
  it("should delete a draft pack", async () => {
    mock.mockResult({ data: { id: "p1", moderation_status: "draft" }, error: null });
    const result = await deletePack("p1", "e1");
    expect(result.ok).toBe(true);
  });

  it("should delete a rejected pack", async () => {
    mock.mockResult({ data: { id: "p2", moderation_status: "rejected" }, error: null });
    const result = await deletePack("p2", "e1");
    expect(result.ok).toBe(true);
  });

  it("should delete an ended pack", async () => {
    mock.mockResult({ data: { id: "p3", moderation_status: "ended" }, error: null });
    const result = await deletePack("p3", "e1");
    expect(result.ok).toBe(true);
  });

  it("should refuse to delete an active pack", async () => {
    mock.mockResult({ data: { id: "p4", moderation_status: "active" }, error: null });
    const result = await deletePack("p4", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should refuse to delete a pending_moderation pack", async () => {
    mock.mockResult({ data: { id: "p5", moderation_status: "pending_moderation" }, error: null });
    const result = await deletePack("p5", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should refuse to delete a suspended pack", async () => {
    mock.mockResult({ data: { id: "p6", moderation_status: "suspended" }, error: null });
    const result = await deletePack("p6", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_transition");
    }
  });

  it("should return not_found for missing pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await deletePack("missing", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// duplicatePack
// ============================================================================

describe("duplicatePack", () => {
  it("should duplicate a pack as draft with (copie) suffix", async () => {
    // First call (select) returns the original pack, second call (insert) returns new id
    let callCount = 0;
    const originalPack = {
      id: "orig",
      establishment_id: "e1",
      title: "Brunch Pack",
      description: "Desc",
      label: null,
      price: 5000,
      original_price: 10000,
      items: [],
      is_limited: false,
      stock: null,
      availability: "permanent",
      max_reservations: null,
      active: true,
      valid_from: null,
      valid_to: null,
      conditions: null,
      cover_url: "https://img.jpg",
      short_description: "Short",
      detailed_description: "Detailed",
      additional_photos: [],
      category: "brunch",
      discount_percentage: 50,
      party_size: 2,
      inclusions: [],
      exclusions: null,
      valid_days: null,
      valid_time_start: null,
      valid_time_end: null,
      limit_per_client: 1,
      is_multi_use: false,
      total_uses: 1,
      moderation_status: "active",
      sold_count: 10,
      consumed_count: 5,
      is_featured: true,
      sale_start_date: "2026-01-01",
      sale_end_date: "2026-03-01",
    };

    // Override chain methods to return different results for select vs insert
    mock.chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: originalPack, error: null }),
    );
    mock.chain.single = vi.fn(() =>
      Promise.resolve({ data: { id: "new-pack-id" }, error: null }),
    );

    const result = await duplicatePack("orig", "e1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newPackId).toBe("new-pack-id");
    }

    // Verify the insert payload
    const payload = mock.getLastPayload();
    expect(payload).not.toBeNull();
    expect(payload!.title).toBe("Brunch Pack (copie)");
    expect(payload!.moderation_status).toBe("draft");
    expect(payload!.sold_count).toBe(0);
    expect(payload!.consumed_count).toBe(0);
    expect(payload!.is_featured).toBe(false);
    expect(payload!.active).toBe(false);
    expect(payload!.sale_start_date).toBeNull();
    expect(payload!.sale_end_date).toBeNull();
  });

  it("should return not_found when original does not exist", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await duplicatePack("missing", "e1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("not_found");
    }
  });
});

// ============================================================================
// checkAndMarkSoldOut
// ============================================================================

describe("checkAndMarkSoldOut", () => {
  it("should mark pack as sold_out when sold_count >= stock", async () => {
    mock.mockResult({
      data: { id: "p1", stock: 10, sold_count: 10, moderation_status: "active", is_limited: true },
      error: null,
    });
    const result = await checkAndMarkSoldOut("p1");
    expect(result).toBe(true);
    const payload = mock.getLastPayload();
    expect(payload!.moderation_status).toBe("sold_out");
    expect(payload!.active).toBe(false);
  });

  it("should not mark sold_out when sold_count < stock", async () => {
    mock.mockResult({
      data: { id: "p2", stock: 10, sold_count: 5, moderation_status: "active", is_limited: true },
      error: null,
    });
    const result = await checkAndMarkSoldOut("p2");
    expect(result).toBe(false);
  });

  it("should not mark sold_out for unlimited packs (is_limited=false)", async () => {
    mock.mockResult({
      data: { id: "p3", stock: null, sold_count: 100, moderation_status: "active", is_limited: false },
      error: null,
    });
    const result = await checkAndMarkSoldOut("p3");
    expect(result).toBe(false);
  });

  it("should not mark sold_out for non-active packs", async () => {
    mock.mockResult({
      data: { id: "p4", stock: 5, sold_count: 5, moderation_status: "suspended", is_limited: true },
      error: null,
    });
    const result = await checkAndMarkSoldOut("p4");
    expect(result).toBe(false);
  });

  it("should return false on db error", async () => {
    mock.mockResult({ data: null, error: { message: "fail" } });
    const result = await checkAndMarkSoldOut("p5");
    expect(result).toBe(false);
  });

  it("should return false for non-existent pack", async () => {
    mock.mockResult({ data: null, error: null });
    const result = await checkAndMarkSoldOut("nonexistent");
    expect(result).toBe(false);
  });

  it("should mark sold_out when sold_count exceeds stock (overshoot)", async () => {
    mock.mockResult({
      data: { id: "p6", stock: 5, sold_count: 7, moderation_status: "active", is_limited: true },
      error: null,
    });
    const result = await checkAndMarkSoldOut("p6");
    expect(result).toBe(true);
  });
});

// ============================================================================
// activateScheduledPacks
// ============================================================================

describe("activateScheduledPacks", () => {
  it("should return 0 when no packs to activate", async () => {
    mock.mockResult({ data: [], error: null });
    const count = await activateScheduledPacks();
    expect(count).toBe(0);
  });

  it("should return 0 on db error", async () => {
    mock.mockResult({ data: null, error: { message: "fail" } });
    const count = await activateScheduledPacks();
    expect(count).toBe(0);
  });
});

// ============================================================================
// endExpiredPacks
// ============================================================================

describe("endExpiredPacks", () => {
  it("should return 0 when no expired packs", async () => {
    mock.mockResult({ data: [], error: null });
    const count = await endExpiredPacks();
    expect(count).toBe(0);
  });

  it("should return 0 on db error", async () => {
    mock.mockResult({ data: null, error: { message: "fail" } });
    const count = await endExpiredPacks();
    expect(count).toBe(0);
  });
});
