import { describe, it, expect, beforeEach } from "vitest";

// We need to test the module in isolation
// Use dynamic import to get fresh module state
let withCronLock: typeof import("../cronLock").withCronLock;
let isCronLockHeld: typeof import("../cronLock").isCronLockHeld;
let getActiveCronLocks: typeof import("../cronLock").getActiveCronLocks;

beforeEach(async () => {
  // Re-import to get fresh state (locks are in-memory)
  const mod = await import("../cronLock");
  withCronLock = mod.withCronLock;
  isCronLockHeld = mod.isCronLockHeld;
  getActiveCronLocks = mod.getActiveCronLocks;
});

describe("withCronLock", () => {
  it("should execute the function and return its result", async () => {
    const result = await withCronLock("test-job", async () => {
      return 42;
    });

    expect(result.skipped).toBe(false);
    expect(result.result).toBe(42);
  });

  it("should skip if the same lock is already held", async () => {
    // Start a long-running job
    let resolveJob: () => void;
    const jobPromise = withCronLock("slow-job", () => {
      return new Promise<string>((resolve) => {
        resolveJob = () => resolve("done");
      });
    });

    // Try to run the same job concurrently
    const concurrent = await withCronLock("slow-job", async () => "should-not-run");

    expect(concurrent.skipped).toBe(true);
    expect(concurrent.result).toBeUndefined();

    // Cleanup: resolve the first job
    resolveJob!();
    const first = await jobPromise;
    expect(first.skipped).toBe(false);
    expect(first.result).toBe("done");
  });

  it("should allow different lock names concurrently", async () => {
    let resolveA: () => void;
    const jobA = withCronLock("job-a", () => {
      return new Promise<string>((resolve) => {
        resolveA = () => resolve("a-done");
      });
    });

    // Different lock name should NOT be skipped
    const jobB = await withCronLock("job-b", async () => "b-done");
    expect(jobB.skipped).toBe(false);
    expect(jobB.result).toBe("b-done");

    resolveA!();
    await jobA;
  });

  it("should release the lock even if the function throws", async () => {
    try {
      await withCronLock("failing-job", async () => {
        throw new Error("boom");
      });
    } catch {
      // Expected
    }

    // Lock should be released — next run should NOT be skipped
    const result = await withCronLock("failing-job", async () => "recovered");
    expect(result.skipped).toBe(false);
    expect(result.result).toBe("recovered");
  });
});

describe("isCronLockHeld", () => {
  it("should return false when no lock is held", () => {
    expect(isCronLockHeld("nonexistent")).toBe(false);
  });

  it("should return true while a job is running", async () => {
    let resolveJob: () => void;
    const jobPromise = withCronLock("check-job", () => {
      return new Promise<void>((resolve) => {
        resolveJob = () => resolve();
      });
    });

    expect(isCronLockHeld("check-job")).toBe(true);

    resolveJob!();
    await jobPromise;

    expect(isCronLockHeld("check-job")).toBe(false);
  });
});

describe("getActiveCronLocks", () => {
  it("should return empty array when no locks are held", () => {
    expect(getActiveCronLocks()).toEqual([]);
  });
});
