/**
 * Cron Lock — In-memory mutex for cron job handlers.
 *
 * Prevents concurrent executions of the same cron job when a scheduler
 * triggers overlapping runs (e.g., a slow job from minute 0 is still
 * running when the minute-15 trigger fires).
 *
 * Usage:
 *   const result = await withCronLock("vf-retry-pending", async () => {
 *     return retryPendingDocuments();
 *   });
 *   // result is { skipped: true } if the lock is already held
 */

import { createModuleLogger } from "./logger";

const log = createModuleLogger("cron-lock");
const activeLocks = new Map<string, boolean>();

export type CronLockResult<T> =
  | { skipped: false; result: T }
  | { skipped: true; result?: undefined };

/**
 * Execute `fn` only if no other execution of the same `lockName` is in progress.
 * Returns `{ skipped: true }` immediately if the lock is held.
 */
export async function withCronLock<T>(
  lockName: string,
  fn: () => Promise<T>,
): Promise<CronLockResult<T>> {
  if (activeLocks.get(lockName)) {
    log.warn({ lockName }, "Skipping cron — already running");
    return { skipped: true };
  }

  activeLocks.set(lockName, true);
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    activeLocks.delete(lockName);
  }
}

/**
 * Check if a cron lock is currently held (for debugging / health checks).
 */
export function isCronLockHeld(lockName: string): boolean {
  return activeLocks.get(lockName) === true;
}

/**
 * Get all currently held locks (for admin dashboard / debugging).
 */
export function getActiveCronLocks(): string[] {
  return Array.from(activeLocks.keys());
}
