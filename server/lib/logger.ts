/**
 * Structured Logger — pino-based logging for SAM.ma backend.
 *
 * Replaces raw console.log/error/warn with structured JSON logging.
 *
 * Usage:
 *   import { logger } from "../lib/logger";
 *   logger.info({ userId, action }, "Reservation created");
 *   logger.error({ err, reservationId }, "Payment webhook failed");
 *
 * Child loggers (for modules):
 *   const log = logger.child({ module: "payments" });
 *   log.info({ amount }, "Webhook received");
 */

import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Root logger instance.
 *
 * - Production: JSON output, info level, redacts sensitive fields.
 * - Development: Pretty-printed (pino-pretty if installed), debug level.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),

  // Redact sensitive fields from logs
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers[\"x-admin-key\"]",
      "req.headers[\"x-admin-session\"]",
      "password",
      "token",
      "idToken",
      "service_role_key",
      "*.password",
      "*.token",
      "*.idToken",
    ],
    censor: "[REDACTED]",
  },

  // Attach default context
  base: {
    service: "sam-api",
    ...(isProduction ? {} : { pid: process.pid }),
  },

  // Timestamp in ISO format for production, epoch ms for dev
  timestamp: isProduction
    ? pino.stdTimeFunctions.isoTime
    : pino.stdTimeFunctions.epochTime,

  // Pretty print in development (falls back gracefully if pino-pretty not installed)
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino/file",
          options: { destination: 1 }, // stdout
        },
      }),
});

/**
 * Create a child logger for a specific module.
 *
 * @example
 * const log = createModuleLogger("payments");
 * log.info({ amount: 5000 }, "Payment processed");
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}

export default logger;
