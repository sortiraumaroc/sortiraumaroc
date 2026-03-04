/**
 * Sentry Error Monitoring Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Run: npm install @sentry/node
 * 2. Create a Sentry account at https://sentry.io
 * 3. Create a new project (Node.js)
 * 4. Copy your DSN and add to .env: SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 */

import { createModuleLogger } from "./logger";

const log = createModuleLogger("sentry");

let Sentry: any = null;

// Dynamic import to avoid errors if @sentry/node is not installed
async function loadSentry() {
  try {
    Sentry = await import("@sentry/node");
    return true;
  } catch { /* intentional: @sentry/node may not be installed */
    log.warn("@sentry/node not installed, error monitoring disabled");
    return false;
  }
}

let initialized = false;

/**
 * Initialize Sentry error monitoring
 * Call this at server startup
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    log.warn("SENTRY_DSN not configured, error monitoring disabled");
    return;
  }

  const loaded = await loadSentry();
  if (!loaded || !Sentry) return;

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      release: process.env.npm_package_version || "1.0.0",

      // Disable OpenTelemetry auto-instrumentation that requires `require.cache`
      // (incompatible with Vite ESM bundles where modules are inlined, not loaded via require)
      registerEsmLoaderHooks: false,

      // Sample 10% of transactions for performance monitoring.
      // CJS-based auto-instrumentation (Http, Express) is disabled (ESM incompatible),
      // but manual spans + error capture benefit from a non-zero rate.
      tracesSampleRate: 0.1,
      autoSessionTracking: true,

      // Only use integrations that don't rely on CJS require hooks.
      // The default auto-discovery tries to patch http/express via require-in-the-middle
      // which crashes in Vite ESM bundles ("require is not defined").
      defaultIntegrations: false,
      integrations: [
        // Safe ESM-compatible integrations from @sentry/node
        ...(Sentry.inboundFiltersIntegration ? [Sentry.inboundFiltersIntegration()] : []),
        ...(Sentry.functionToStringIntegration ? [Sentry.functionToStringIntegration()] : []),
        ...(Sentry.linkedErrorsIntegration ? [Sentry.linkedErrorsIntegration()] : []),
        ...(Sentry.dedupeIntegration ? [Sentry.dedupeIntegration()] : []),
      ],

      // Filter sensitive data
      beforeSend(event: any) {
        // Remove sensitive data from the event
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers["x-admin-key"];
          delete event.request.headers["x-admin-session"];
          delete event.request.headers.cookie;
        }

        if (event.request?.data) {
          // Remove password fields
          if (typeof event.request.data === "object") {
            delete event.request.data.password;
            delete event.request.data.token;
            delete event.request.data.idToken;
          }
        }

        return event;
      },

      // Ignore common non-critical errors
      ignoreErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "Request aborted",
        "Network request failed",
      ],
    });

    initialized = true;
    log.info("error monitoring initialized");
  } catch (err) {
    log.error({ err }, "failed to initialize");
  }
}

/**
 * Capture an exception to Sentry
 */
export function captureException(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id?: string; email?: string };
    level?: "fatal" | "error" | "warning" | "info" | "debug";
  }
): void {
  if (!Sentry || !initialized) {
    log.error({ err: error }, "unhandled error (Sentry not initialized)");
    return;
  }

  Sentry.withScope((scope: any) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    if (context?.user) {
      scope.setUser(context.user);
    }

    if (context?.level) {
      scope.setLevel(context.level);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture a message to Sentry
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info",
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
): void {
  if (!Sentry || !initialized) {
    log.info({ level }, message);
    return;
  }

  Sentry.withScope((scope: any) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id?: string; email?: string; role?: string } | null): void {
  if (!Sentry || !initialized) return;
  Sentry.setUser(user);
}

/**
 * Express error handler middleware for Sentry
 */
export function sentryErrorHandler() {
  if (!Sentry || !initialized) {
    return (err: Error, req: any, res: any, next: any) => next(err);
  }

  return Sentry.Handlers?.errorHandler() || ((err: Error, req: any, res: any, next: any) => next(err));
}

/**
 * Express request handler middleware for Sentry
 */
export function sentryRequestHandler() {
  if (!Sentry || !initialized) {
    return (req: any, res: any, next: any) => next();
  }

  return Sentry.Handlers?.requestHandler() || ((req: any, res: any, next: any) => next());
}

export default {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  sentryErrorHandler,
  sentryRequestHandler,
};
