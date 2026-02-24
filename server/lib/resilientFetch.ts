/**
 * Resilient Fetch Wrapper
 *
 * Adds timeout, retry with exponential backoff, and retryable status code
 * detection to the native fetch() API. Used for external API calls
 * (LacaissePay, VosFactures, etc.) that may be temporarily unavailable.
 */

import { createModuleLogger } from "./logger";

const log = createModuleLogger("resilient-fetch");

export interface ResilientFetchOptions {
  /** Request timeout in milliseconds (default: 15000 = 15s) */
  timeoutMs?: number;
  /** Maximum number of retries (default: 2, meaning up to 3 total attempts) */
  maxRetries?: number;
  /** Initial backoff delay in ms, doubles each retry (default: 1000) */
  initialBackoffMs?: number;
  /** HTTP status codes that trigger a retry (default: 429, 500, 502, 503, 504) */
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: Required<ResilientFetchOptions> = {
  timeoutMs: 15_000,
  maxRetries: 2,
  initialBackoffMs: 1_000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

/**
 * Fetch with timeout, retry, and exponential backoff.
 *
 * @example
 * const res = await resilientFetch("https://api.example.com/data", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify(payload),
 * }, { timeoutMs: 10_000, maxRetries: 3 });
 */
export async function resilientFetch(
  url: string,
  init?: RequestInit,
  options?: ResilientFetchOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    try {
      const response = await fetchWithTimeout(url, init, opts.timeoutMs);

      // If response is OK or not retryable, return immediately
      if (response.ok || !opts.retryableStatuses.includes(response.status)) {
        return response;
      }

      // Retryable status — log and continue to retry
      lastError = new Error(
        `resilientFetch: ${response.status} ${response.statusText} from ${url}`,
      );

      if (attempt < opts.maxRetries) {
        const backoff = opts.initialBackoffMs * Math.pow(2, attempt);
        log.warn(
          { status: response.status, url, backoffMs: backoff, attempt: attempt + 1, maxAttempts: opts.maxRetries + 1 },
          "Retryable status, retrying",
        );
        await sleep(backoff);
      }
    } catch (err) {
      // Network error or timeout
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < opts.maxRetries) {
        const backoff = opts.initialBackoffMs * Math.pow(2, attempt);
        log.warn(
          { err: lastError, url, backoffMs: backoff, attempt: attempt + 1, maxAttempts: opts.maxRetries + 1 },
          "Network error, retrying",
        );
        await sleep(backoff);
      }
    }

    attempt++;
  }

  throw lastError ?? new Error(`resilientFetch: all ${opts.maxRetries + 1} attempts failed for ${url}`);
}

// =============================================================================
// Internal helpers
// =============================================================================

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`resilientFetch: request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
