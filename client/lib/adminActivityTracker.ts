/**
 * Admin Activity Tracker — heartbeat-based active time measurement
 *
 * Detects real user activity (mouse, keyboard, scroll, touch) and sends
 * heartbeats every 30 seconds with the number of active seconds since the
 * last heartbeat. Pauses when the tab is hidden or the user is idle (90s).
 *
 * Usage:
 *   import { startTracking, stopTracking } from "@/lib/adminActivityTracker";
 *   useEffect(() => { startTracking(); return () => stopTracking(); }, []);
 */

import { getAdminHeaders } from "@/lib/adminApi";

// ─── Configuration ───────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const IDLE_THRESHOLD_MS = 90_000; // 90 seconds without activity → idle
const ENDPOINT = "/api/admin/activity/heartbeat";

// ─── Module state ────────────────────────────────────────────────────────────
let sessionId: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastActivityTs = 0;
let lastHeartbeatTs = 0;
let isPageVisible = true;
let isTracking = false;

// ─── Activity detection ──────────────────────────────────────────────────────
const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

function onActivity() {
  lastActivityTs = Date.now();
}

function onVisibilityChange() {
  isPageVisible = document.visibilityState === "visible";
  if (isPageVisible) {
    // Resuming → mark activity so next heartbeat picks it up
    lastActivityTs = Date.now();
  }
}

// ─── Heartbeat sender ────────────────────────────────────────────────────────
async function sendHeartbeat() {
  if (!sessionId) return;

  const now = Date.now();

  // If the page is hidden, don't count any active time
  if (!isPageVisible) return;

  // If user has been idle longer than threshold, skip
  if (now - lastActivityTs > IDLE_THRESHOLD_MS) return;

  // Calculate active seconds since last heartbeat (max 30s for a 30s interval)
  const elapsed = lastHeartbeatTs > 0 ? now - lastHeartbeatTs : HEARTBEAT_INTERVAL_MS;
  const activeSeconds = Math.min(Math.round(elapsed / 1000), 60);

  if (activeSeconds < 1) return;

  lastHeartbeatTs = now;

  const pagePath = window.location.pathname;

  try {
    const headers = getAdminHeaders();
    await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session_id: sessionId,
        active_seconds: activeSeconds,
        page_path: pagePath,
      }),
    });
  } catch {
    // Silently ignore network errors — heartbeats are best-effort
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start tracking admin activity. Safe to call multiple times
 * (subsequent calls are no-ops while tracking is active).
 */
export function startTracking(): void {
  if (isTracking) return;
  isTracking = true;

  // Generate a unique session ID per browser tab/session
  sessionId = crypto.randomUUID();
  lastActivityTs = Date.now();
  lastHeartbeatTs = Date.now();
  isPageVisible = document.visibilityState === "visible";

  // Listen for user activity (passive for performance)
  for (const evt of ACTIVITY_EVENTS) {
    document.addEventListener(evt, onActivity, { passive: true });
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Start heartbeat interval
  intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop tracking and send a final heartbeat. Called on AdminLayout unmount.
 */
export function stopTracking(): void {
  if (!isTracking) return;
  isTracking = false;

  // Remove event listeners
  for (const evt of ACTIVITY_EVENTS) {
    document.removeEventListener(evt, onActivity);
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);

  // Clear interval
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  // Send a final heartbeat (best-effort, use sendBeacon for reliability)
  if (sessionId) {
    const pagePath = window.location.pathname;
    const now = Date.now();
    const elapsed = lastHeartbeatTs > 0 ? now - lastHeartbeatTs : 0;
    const activeSeconds = Math.min(Math.max(Math.round(elapsed / 1000), 1), 60);

    const headers = getAdminHeaders();
    try {
      // Use sendBeacon for reliability on page unload
      const blob = new Blob(
        [
          JSON.stringify({
            session_id: sessionId,
            active_seconds: activeSeconds,
            page_path: pagePath,
          }),
        ],
        { type: "application/json" }
      );

      // sendBeacon doesn't support custom headers, so fall back to fetch with keepalive
      fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          active_seconds: activeSeconds,
          page_path: pagePath,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Ignore
    }
  }

  sessionId = null;
}
