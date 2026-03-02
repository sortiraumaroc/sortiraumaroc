/**
 * Redis Client Singleton — SAM.ma
 *
 * Provides a shared Redis connection for rate limiting, caching, and session management
 * across all cluster workers. Falls back gracefully when REDIS_URL is not set
 * or when ioredis is not installed.
 *
 * Usage:
 *   import { redis, isRedisAvailable } from "./lib/redis";
 *   if (isRedisAvailable()) { await redis!.get("key"); }
 */

import { createModuleLogger } from "./logger";

const log = createModuleLogger("redis");

let redis: any | null = null;
let connected = false;

const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  try {
    // Dynamic import: ne crash pas si ioredis n'est pas installé
    const { default: Redis } = await import("ioredis");

    redis = new Redis(REDIS_URL, {
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      connectTimeout: 5000,
      commandTimeout: 2000,
    });

    redis.on("connect", () => {
      connected = true;
      log.info("Redis connected");
    });

    redis.on("error", (err: Error) => {
      connected = false;
      log.error({ err: err.message }, "Redis error");
    });

    redis.on("close", () => {
      connected = false;
      log.warn("Redis connection closed");
    });
  } catch (err) {
    log.warn({ err }, "Redis unavailable (ioredis not installed or connection failed) — using in-memory fallback");
    redis = null;
  }
} else {
  log.info("No REDIS_URL — using in-memory stores (single-instance mode)");
}

/** Check if Redis is connected and operational */
export function isRedisAvailable(): boolean {
  return redis !== null && connected;
}

/** Graceful shutdown — close the connection pool */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    connected = false;
  }
}

export { redis };
