/**
 * HTTP Request Logger Middleware — pino-http integration.
 *
 * Adds request correlation ID (x-request-id) and structured access logging
 * for every HTTP request. Each request gets a unique `reqId` that can be
 * used to correlate all log entries for that request.
 *
 * Usage in server/index.ts:
 *   import { httpLogger } from "./lib/requestLogger";
 *   app.use(httpLogger);
 */

import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Express middleware that:
 * - Assigns a unique request ID (from `x-request-id` header or generated UUID)
 * - Logs request start + response completion with timing
 * - Attaches `req.log` child logger to every request for module-level logging
 * - Skips noisy health-check and static asset requests
 */
export const httpLogger = pinoHttp({
  logger,

  // Generate or reuse request ID
  genReqId: (req) => {
    const existing = req.headers["x-request-id"];
    if (typeof existing === "string" && existing.length > 0) return existing;
    return randomUUID();
  },

  // Custom log level based on response status
  customLogLevel: (_req, res, err) => {
    if (err || (res.statusCode && res.statusCode >= 500)) return "error";
    if (res.statusCode && res.statusCode >= 400) return "warn";
    return "info";
  },

  // Don't log body/query in production (too verbose + potential PII)
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ...(isProduction ? {} : { query: req.query }),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  // Skip logging for noisy routes
  autoLogging: {
    ignore: (req) => {
      const url = req.url ?? "";
      // Skip health checks, static assets, favicon
      if (url === "/api/health") return true;
      if (url === "/favicon.ico") return true;
      if (url.startsWith("/assets/")) return true;
      if (url.startsWith("/dist/")) return true;
      // Skip OPTIONS preflight
      if (req.method === "OPTIONS") return true;
      return false;
    },
  },

  // Custom success message
  customSuccessMessage: (req, res) => {
    const method = req.method ?? "?";
    const url = req.url ?? "?";
    const status = res.statusCode ?? 0;
    return `${method} ${url} ${status}`;
  },

  // Custom error message
  customErrorMessage: (req, _res, err) => {
    const method = req.method ?? "?";
    const url = req.url ?? "?";
    return `${method} ${url} failed: ${err.message}`;
  },
});
