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

export function setProNotificationPreferences(next: ProNotificationPreferences): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
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
