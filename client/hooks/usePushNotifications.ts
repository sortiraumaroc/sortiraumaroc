/**
 * usePushNotifications hook
 *
 * Manages the full push notification lifecycle for consumer users:
 * - Checks if push is supported & permission status
 * - Requests permission and registers the FCM token
 * - Listens for foreground messages
 * - Provides state for UI (prompt banner, preferences)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isAuthed, AUTH_CHANGED_EVENT } from "@/lib/auth";
import {
  isPushSupported,
  getNotificationPermission,
  setupPushNotifications,
  onForegroundMessage,
  getCurrentToken,
  unregisterPushToken,
} from "@/lib/pushNotifications";

// ---------------------------------------------------------------------------
// Local storage keys for dismissal tracking
// ---------------------------------------------------------------------------

const PUSH_PROMPT_DISMISSED_KEY = "sam_push_prompt_dismissed";
const PUSH_PROMPT_DISMISSED_UNTIL_KEY = "sam_push_prompt_dismissed_until";

// Show prompt again after 7 days if dismissed
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushNotificationState {
  /** Push is supported by the browser & Firebase is configured */
  supported: boolean;
  /** Current browser permission: "default" | "granted" | "denied" */
  permission: NotificationPermission;
  /** Whether the user has an active FCM token registered */
  registered: boolean;
  /** Whether setup is in progress */
  loading: boolean;
  /** Whether the permission prompt banner should be shown */
  shouldShowPrompt: boolean;
  /** Request permission and register token */
  requestPermission: () => Promise<boolean>;
  /** Dismiss the prompt banner (for a while) */
  dismissPrompt: () => void;
  /** Disable push (unregister token) */
  disablePush: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePushNotifications(): PushNotificationState {
  const [supported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "denied",
  );
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(isAuthed());
  const [dismissed, setDismissed] = useState(() => isPromptDismissed());

  const foregroundUnsubRef = useRef<(() => void) | null>(null);

  // Track auth state
  useEffect(() => {
    const handler = () => setAuthed(isAuthed());
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  }, []);

  // If user is authenticated & permission is already granted, silently register
  useEffect(() => {
    if (!authed || !supported || permission !== "granted") return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const result = await setupPushNotifications();
        if (!cancelled) {
          setRegistered(result.success);
        }
      } catch {
        // Best-effort
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authed, supported, permission]);

  // Set up foreground message listener
  useEffect(() => {
    if (!registered) return;

    foregroundUnsubRef.current = onForegroundMessage((payload) => {
      // Dispatch a custom event that the App can listen to for showing a toast
      window.dispatchEvent(
        new CustomEvent("sam:push_foreground_message", { detail: payload }),
      );
    });

    return () => {
      foregroundUnsubRef.current?.();
      foregroundUnsubRef.current = null;
    };
  }, [registered]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;

    setLoading(true);
    try {
      const result = await setupPushNotifications();
      setPermission(getNotificationPermission());
      setRegistered(result.success);
      if (result.success) {
        // Clear any dismissal
        clearPromptDismissed();
        setDismissed(false);
      }
      return result.success;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  // Dismiss prompt
  const dismissPrompt = useCallback(() => {
    setPromptDismissed();
    setDismissed(true);
  }, []);

  // Disable push
  const disablePush = useCallback(async () => {
    const token = getCurrentToken();
    if (token) {
      await unregisterPushToken(token);
    }
    setRegistered(false);
  }, []);

  // Should show prompt: user is authed, push supported, permission is "default", not dismissed
  const shouldShowPrompt =
    authed && supported && permission === "default" && !dismissed && !registered;

  return {
    supported,
    permission,
    registered,
    loading,
    shouldShowPrompt,
    requestPermission,
    dismissPrompt,
    disablePush,
  };
}

// ---------------------------------------------------------------------------
// Dismissal helpers
// ---------------------------------------------------------------------------

function isPromptDismissed(): boolean {
  try {
    const until = localStorage.getItem(PUSH_PROMPT_DISMISSED_UNTIL_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  } catch {
    return false;
  }
}

function setPromptDismissed(): void {
  try {
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "true");
    localStorage.setItem(
      PUSH_PROMPT_DISMISSED_UNTIL_KEY,
      String(Date.now() + DISMISS_DURATION_MS),
    );
  } catch {
    // Ignore
  }
}

function clearPromptDismissed(): void {
  try {
    localStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY);
    localStorage.removeItem(PUSH_PROMPT_DISMISSED_UNTIL_KEY);
  } catch {
    // Ignore
  }
}
