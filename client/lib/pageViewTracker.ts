/**
 * Page View Tracker — Lightweight analytics for SAM.ma
 *
 * Tracks page views on the PUBLIC consumer site (excludes /admin/* and /pro/*).
 * Sends fire-and-forget POST to /api/analytics/pageview on each route change.
 *
 * Metrics collected per page view:
 *   - session_id (UUID per tab, stored in sessionStorage)
 *   - path, referrer, is_mobile, viewport_width
 *   - duration_seconds (time on previous page)
 *   - had_interaction (click, scroll > 300px, or keydown detected)
 *
 * Uses navigator.sendBeacon on page unload for reliability.
 */

// ─── Configuration ──────────────────────────────────────────────────────────
const ENDPOINT = "/api/analytics/pageview";
const SESSION_KEY = "sam_analytics_sid";
const EXCLUDED_PREFIXES = ["/admin", "/pro"];

// ─── Module state ───────────────────────────────────────────────────────────
let sessionId: string | null = null;
let currentPath: string | null = null;
let pageEnteredAt = 0;
let hadInteraction = false;
let isTracking = false;
let scrollThresholdReached = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOrCreateSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function isMobile(): boolean {
  return window.innerWidth < 768 || navigator.maxTouchPoints > 0;
}

function isExcludedPath(path: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function calculateDuration(): number {
  if (!pageEnteredAt) return 0;
  const seconds = Math.round((Date.now() - pageEnteredAt) / 1000);
  return Math.min(Math.max(seconds, 0), 3600); // clamp 0-3600
}

// ─── Interaction detection ──────────────────────────────────────────────────

function onInteraction() {
  hadInteraction = true;
}

function onScroll() {
  if (!scrollThresholdReached && window.scrollY > 300) {
    scrollThresholdReached = true;
    hadInteraction = true;
  }
}

const INTERACTION_EVENTS: Array<keyof DocumentEventMap> = ["click", "keydown"];

function startInteractionListeners() {
  for (const evt of INTERACTION_EVENTS) {
    document.addEventListener(evt, onInteraction, { passive: true, once: true });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
}

function stopInteractionListeners() {
  for (const evt of INTERACTION_EVENTS) {
    document.removeEventListener(evt, onInteraction);
  }
  window.removeEventListener("scroll", onScroll);
}

// ─── Send page view ─────────────────────────────────────────────────────────

function sendPageView(
  path: string,
  durationSeconds: number,
  interaction: boolean,
  useBeacon = false,
): void {
  if (!sessionId) return;

  const payload = JSON.stringify({
    session_id: sessionId,
    path,
    referrer: document.referrer || undefined,
    is_mobile: isMobile(),
    viewport_width: window.innerWidth,
    duration_seconds: durationSeconds,
    had_interaction: interaction,
  });

  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(ENDPOINT, blob);
  } else {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Silently ignore — analytics are best-effort
    });
  }
}

// ─── Page transition handling ───────────────────────────────────────────────

function flushCurrentPage(useBeacon = false) {
  if (currentPath && !isExcludedPath(currentPath)) {
    const duration = calculateDuration();
    sendPageView(currentPath, duration, hadInteraction, useBeacon);
  }
}

function enterNewPage(path: string) {
  currentPath = path;
  pageEnteredAt = Date.now();
  hadInteraction = false;
  scrollThresholdReached = false;

  // Re-attach one-time interaction listeners
  stopInteractionListeners();
  if (!isExcludedPath(path)) {
    startInteractionListeners();
  }
}

// ─── Visibility / unload handlers ───────────────────────────────────────────

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    // Page going away — flush via beacon
    flushCurrentPage(true);
  } else if (document.visibilityState === "visible" && currentPath) {
    // Returning — reset timer for this page
    pageEnteredAt = Date.now();
    hadInteraction = false;
    scrollThresholdReached = false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Start tracking page views. Safe to call multiple times.
 */
export function startPageViewTracking(): void {
  if (isTracking) return;
  isTracking = true;

  sessionId = getOrCreateSessionId();
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Track the initial page
  enterNewPage(window.location.pathname);
}

/**
 * Notify the tracker of a SPA route change.
 * Call this from a React useEffect that watches location changes.
 */
export function notifyRouteChange(newPath: string): void {
  if (!isTracking) return;
  if (newPath === currentPath) return;

  // Flush the previous page
  flushCurrentPage(false);

  // Enter the new page
  enterNewPage(newPath);
}

/**
 * Stop tracking. Called on app unmount (rarely needed).
 */
export function stopPageViewTracking(): void {
  if (!isTracking) return;
  isTracking = false;

  flushCurrentPage(true);
  stopInteractionListeners();
  document.removeEventListener("visibilitychange", onVisibilityChange);

  currentPath = null;
  sessionId = null;
}
