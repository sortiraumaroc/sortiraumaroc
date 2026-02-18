import { proSupabase } from "./supabase";

export type ProNotificationPreferences = {
  popupsEnabled: boolean;
  soundEnabled: boolean;
};

const STORAGE_KEY = "sam:pro_notification_preferences:v1";
const CHANGE_EVENT = "sam:pro_notification_preferences_changed";

const DEFAULT_PREFERENCES: ProNotificationPreferences = {
  popupsEnabled: true,
  soundEnabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Get preferences from localStorage (synchronous, instant).
 * Used by sound/popup checks that need to be synchronous.
 */
export function getProNotificationPreferences(): ProNotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_PREFERENCES;

    return {
      popupsEnabled: typeof parsed.popupsEnabled === "boolean" ? parsed.popupsEnabled : DEFAULT_PREFERENCES.popupsEnabled,
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_PREFERENCES.soundEnabled,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Set preferences locally AND sync to backend (best-effort).
 */
export function setProNotificationPreferences(next: ProNotificationPreferences): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }

  // Sync to backend (best-effort, non-blocking)
  void syncPreferencesToBackend(next);
}

export function subscribeToProNotificationPreferencesChanges(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => cb();

  window.addEventListener("storage", handler);
  window.addEventListener(CHANGE_EVENT, handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}

// =============================================================================
// Backend sync
// =============================================================================

async function getProAccessToken(): Promise<string | null> {
  try {
    const { data } = await proSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Sync preferences to backend. Best-effort: failures are silently ignored.
 */
async function syncPreferencesToBackend(prefs: ProNotificationPreferences): Promise<void> {
  try {
    const token = await getProAccessToken();
    if (!token) return;

    await fetch("/api/pro/notification-preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        popupsEnabled: prefs.popupsEnabled,
        soundEnabled: prefs.soundEnabled,
      }),
    });
  } catch {
    // best-effort
  }
}

/**
 * Load preferences from backend and update localStorage.
 * Called once on dashboard mount to ensure localStorage is in sync.
 */
export async function loadProNotificationPreferencesFromBackend(): Promise<ProNotificationPreferences> {
  try {
    const token = await getProAccessToken();
    if (!token) return getProNotificationPreferences();

    const res = await fetch("/api/pro/notification-preferences", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) return getProNotificationPreferences();

    const json = await res.json();
    if (!json?.ok || !json?.preferences) return getProNotificationPreferences();

    const prefs: ProNotificationPreferences = {
      popupsEnabled: typeof json.preferences.popupsEnabled === "boolean" ? json.preferences.popupsEnabled : true,
      soundEnabled: typeof json.preferences.soundEnabled === "boolean" ? json.preferences.soundEnabled : true,
    };

    // Update localStorage without triggering another backend sync
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // ignore
    }

    return prefs;
  } catch {
    return getProNotificationPreferences();
  }
}
