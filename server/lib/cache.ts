import NodeCache from "node-cache";
import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("cache");

const CACHE_ENABLED = process.env.CACHE_ENABLED !== "false";

const cache = new NodeCache({
  stdTTL: 120,
  checkperiod: 60,
  useClones: false, // perf: return references (we never mutate cached data)
});

let totalHits = 0;
let totalMisses = 0;

/**
 * Generic cache-through helper. Wraps any async query with transparent caching.
 * If cache is disabled or errors, falls back silently to the query function.
 */
export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  queryFn: () => Promise<T>,
): Promise<T> {
  if (!CACHE_ENABLED) return queryFn();

  try {
    const cached = cache.get<T>(key);
    if (cached !== undefined) {
      totalHits++;
      if (process.env.NODE_ENV !== "production") {
        log.debug({ key }, "cache hit");
      }
      return cached;
    }
  } catch { /* intentional: cache read may fail, fallthrough to DB */
  }

  totalMisses++;
  if (process.env.NODE_ENV !== "production") {
    log.debug({ key }, "cache miss");
  }

  const result = await queryFn();

  try {
    cache.set(key, result, ttlSeconds);
  } catch { /* intentional: cache write may fail, result already fetched */
  }

  return result;
}

/**
 * Build a compact cache key from a prefix and sorted params.
 * Uses SHA256 to keep keys short and uniform.
 */
export function buildCacheKey(
  prefix: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ""}`)
    .join("&");
  const hash = createHash("sha256").update(sorted).digest("hex").slice(0, 16);
  return `${prefix}:${hash}`;
}

/**
 * Normalize a search query for cache key: lowercase, trim, strip accents.
 */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Flush the entire cache. Returns the number of keys that were flushed. */
export function flushCache(): number {
  const keys = cache.keys().length;
  cache.flushAll();
  totalHits = 0;
  totalMisses = 0;
  return keys;
}

/**
 * Express middleware that caches JSON responses.
 * Intercepts res.json() — if a cached response exists, returns it immediately.
 * Otherwise lets the handler run and caches the JSON it sends.
 */
export function cacheMiddleware(
  ttlSeconds: number,
  keyFn: (req: Request) => string,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!CACHE_ENABLED) return next();

    const key = keyFn(req);

    try {
      const cached = cache.get<unknown>(key);
      if (cached !== undefined) {
        totalHits++;
        if (process.env.NODE_ENV !== "production") {
          log.debug({ key }, "cache hit");
        }
        res.json(cached);
        return;
      }
    } catch { /* intentional: cache read may fail, fallthrough to handler */
    }

    totalMisses++;
    if (process.env.NODE_ENV !== "production") {
      log.debug({ key }, "cache miss");
    }

    // Monkey-patch res.json to intercept the response body
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache successful responses (status 2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          cache.set(key, body, ttlSeconds);
        } catch { /* intentional: cache write may fail, response already sent */
        }
      }
      return originalJson(body);
    };

    next();
  };
}

/** Get cache statistics for admin dashboard. */
export function getCacheStats() {
  const stats = cache.getStats();
  const total = totalHits + totalMisses;
  return {
    keys: cache.keys().length,
    hits: totalHits,
    misses: totalMisses,
    hitRate: total > 0 ? Math.round((totalHits / total) * 10000) / 100 : 0,
    nodeCache: {
      hits: stats.hits,
      misses: stats.misses,
      ksize: stats.ksize,
      vsize: stats.vsize,
    },
  };
}
