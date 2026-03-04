/**
 * Idle Timeout — Détection d'inactivité utilisateur.
 *
 * Timer client-side pur (sans React) qui :
 * 1. Écoute les événements d'activité (mousemove, keydown, click, scroll, touchstart)
 * 2. Après IDLE_TIMEOUT_MS sans activité → déclenche un warning
 * 3. Après WARNING_BEFORE_MS supplémentaires → déclenche le logout
 * 4. Toute activité pendant le warning annule et remet à zéro
 */

/** Durée totale d'inactivité avant logout (30 min) */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Durée du warning avant logout (2 min) */
export const WARNING_BEFORE_MS = 2 * 60 * 1000;

/** Événements considérés comme activité utilisateur */
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

/** Throttle : ne reset le timer qu'une fois toutes les 30s max (perf) */
const THROTTLE_MS = 30_000;

export type IdleTimeoutCallbacks = {
  onWarning: (remainingMs: number) => void;
  onTimeout: () => void;
  onActivityAfterWarning: () => void;
};

export type IdleTimeoutHandle = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  isWarning: () => boolean;
};

export function createIdleTimeout(callbacks: IdleTimeoutCallbacks): IdleTimeoutHandle {
  let warningTimer: ReturnType<typeof setTimeout> | null = null;
  let logoutTimer: ReturnType<typeof setTimeout> | null = null;
  let inWarningPhase = false;
  let running = false;
  let lastHandled = 0;

  function clearTimers() {
    if (warningTimer !== null) {
      clearTimeout(warningTimer);
      warningTimer = null;
    }
    if (logoutTimer !== null) {
      clearTimeout(logoutTimer);
      logoutTimer = null;
    }
  }

  function scheduleTimers() {
    clearTimers();
    inWarningPhase = false;

    // Timer 1 : warning après (IDLE_TIMEOUT - WARNING_BEFORE)
    warningTimer = setTimeout(() => {
      inWarningPhase = true;
      callbacks.onWarning(WARNING_BEFORE_MS);

      // Timer 2 : logout après WARNING_BEFORE supplémentaires
      logoutTimer = setTimeout(() => {
        callbacks.onTimeout();
      }, WARNING_BEFORE_MS);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
  }

  function onActivity() {
    if (!running) return;

    const now = Date.now();

    // Pendant le warning → toujours réagir immédiatement
    if (inWarningPhase) {
      callbacks.onActivityAfterWarning();
      scheduleTimers();
      lastHandled = now;
      return;
    }

    // Hors warning → throttle à 30s pour la perf
    if (now - lastHandled < THROTTLE_MS) return;
    lastHandled = now;
    scheduleTimers();
  }

  function start() {
    if (running) return;
    running = true;
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true, capture: true });
    }
    scheduleTimers();
  }

  function stop() {
    running = false;
    clearTimers();
    inWarningPhase = false;
    for (const evt of ACTIVITY_EVENTS) {
      window.removeEventListener(evt, onActivity, { capture: true } as EventListenerOptions);
    }
  }

  return {
    start,
    stop,
    reset: scheduleTimers,
    isWarning: () => inWarningPhase,
  };
}
