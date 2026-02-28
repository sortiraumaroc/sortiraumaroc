/**
 * Redis Client Singleton — SAM.ma
 *
 * Provides a shared Redis connection for rate limiting, caching, and session management
 * across all cluster workers. Falls back gracefully when REDIS_URL is not set.
 *
 * Usage:
 *   import { redis, isRedisAvailable } from "./lib/redis";
 *   if (isRedisAvailable()) { await redis!.get("key"); }
 */

import Redis from "ioredis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("redis");

let redis: Redis | null = null;
let connected = false;

const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      // Reconnect with exponential backoff (max 5s)
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      // Don't block the server if Redis is slow
      connectTimeout: 5000,
      commandTimeout: 2000,
    });

    redis.on("connect", () => {
      connected = true;
      log.info("Redis connected");
    });

    redis.on("error", (err) => {
      connected = false;
      log.error({ err: err.message }, "Redis error");
    });

    redis.on("close", () => {
      connected = false;
      log.warn("Redis connection closed");
    });
  } catch (err) {
    log.error({ err }, "Failed to create Redis client");
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
