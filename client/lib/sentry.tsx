/**
 * Sentry Error Monitoring for React Client
 *
 * SETUP INSTRUCTIONS:
 * 1. Run: npm install @sentry/react
 * 2. Add to .env: VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 */

let Sentry: any = null;
let initialized = false;

/**
 * Initialize Sentry for the React client
 * Call this in main.tsx before rendering the app
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn("[Sentry] VITE_SENTRY_DSN not configured. Client error monitoring disabled.");
    return;
  }

  try {
    Sentry = await import("@sentry/react");

    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || "development",
      release: import.meta.env.VITE_APP_VERSION || "1.0.0",

      // Performance monitoring
      tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,

      // Session Replay (optional, can increase costs)
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Filter sensitive data
      beforeSend(event: any) {
        // Remove sensitive data from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.filter((breadcrumb: any) => {
            // Filter out requests with sensitive data
            if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
              const url = breadcrumb.data?.url || "";
              if (url.includes("password") || url.includes("token") || url.includes("auth")) {
                return false;
              }
            }
            return true;
          });
        }

        return event;
      },

      // Ignore common non-critical errors
      ignoreErrors: [
        "ResizeObserver loop",
        "Non-Error promise rejection",
        "Network request failed",
        "Failed to fetch",
        "Load failed",
        "ChunkLoadError",
      ],

      // Don't report errors from these URLs
      denyUrls: [
        /extensions\//i,
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        /^moz-extension:\/\//i,
      ],
    });

    initialized = true;
    console.log("[Sentry] Client error monitoring initialized");
  } catch (err) {
    console.warn("[Sentry] @sentry/react not installed or initialization failed:", err);
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
  }
): void {
  if (!Sentry || !initialized) {
    console.error("[Error]", error);
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

    Sentry.captureException(error);
  });
}

/**
 * Capture a message to Sentry
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info"
): void {
  if (!Sentry || !initialized) {
    console.log(`[${level.toUpperCase()}]`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id?: string; email?: string } | null): void {
  if (!Sentry || !initialized) return;
  Sentry.setUser(user);
}

/**
 * React Error Boundary component
 * Usage: <SentryErrorBoundary><App /></SentryErrorBoundary>
 */
export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  if (!Sentry || !initialized) {
    return <>{children}</>;
  }

  return (
    <Sentry.ErrorBoundary
      fallback={({ error }: { error: Error }) => (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Une erreur est survenue
            </h1>
            <p className="text-gray-600 mb-4">
              Nous avons été notifiés et travaillons à résoudre le problème.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Rafraîchir la page
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

export default {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  SentryErrorBoundary,
};
