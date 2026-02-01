/**
 * Navigation State Management
 *
 * Saves and restores navigation state for logged-in users
 * so they can resume where they left off.
 */

import { isAuthed, AUTH_CHANGED_EVENT } from "@/lib/auth";

export const NAV_STATE_STORAGE_KEY = "sam_nav_state_v1";
export const NAV_STATE_DISMISSED_KEY = "sam_nav_state_dismissed_v1";
export const NAV_STATE_RESUME_EVENT = "sam-nav-state-resume";

export interface NavigationState {
  /** The URL path + search params */
  url: string;
  /** Timestamp when this state was saved */
  savedAt: number;
  /** Human-readable description of the state */
  description?: string;
  /** Universe if applicable */
  universe?: string;
  /** City if applicable */
  city?: string;
  /** Any active filters */
  filters?: {
    promo?: boolean;
    sort?: string;
    date?: string;
    time?: string;
    persons?: number;
  };
}

// Maximum age of saved state (24 hours)
const MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Save the current navigation state
 */
export function saveNavigationState(state: Omit<NavigationState, "savedAt">): void {
  if (typeof window === "undefined") return;
  if (!isAuthed()) return; // Only save for authenticated users

  try {
    const fullState: NavigationState = {
      ...state,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(NAV_STATE_STORAGE_KEY, JSON.stringify(fullState));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the saved navigation state if it exists and is still valid
 */
export function getSavedNavigationState(): NavigationState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(NAV_STATE_STORAGE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw) as NavigationState;

    // Check if state is too old
    if (Date.now() - state.savedAt > MAX_STATE_AGE_MS) {
      clearNavigationState();
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Clear the saved navigation state
 */
export function clearNavigationState(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(NAV_STATE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Check if the resume prompt has been dismissed for the current state
 */
export function isResumePromptDismissed(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const dismissed = window.localStorage.getItem(NAV_STATE_DISMISSED_KEY);
    if (!dismissed) return false;

    const { url, dismissedAt } = JSON.parse(dismissed);
    const state = getSavedNavigationState();

    // Only considered dismissed if it's for the same URL and within 1 hour
    if (state && url === state.url && Date.now() - dismissedAt < 60 * 60 * 1000) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Mark the resume prompt as dismissed
 */
export function dismissResumePrompt(): void {
  if (typeof window === "undefined") return;

  try {
    const state = getSavedNavigationState();
    if (state) {
      window.localStorage.setItem(NAV_STATE_DISMISSED_KEY, JSON.stringify({
        url: state.url,
        dismissedAt: Date.now(),
      }));
    }
  } catch {
    // Ignore
  }
}

/**
 * Clear the dismiss state
 */
export function clearDismissState(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(NAV_STATE_DISMISSED_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Dispatch an event to trigger the resume prompt
 */
export function triggerResumePrompt(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAV_STATE_RESUME_EVENT));
}

/**
 * Build a description for the navigation state based on URL params
 */
export function buildNavigationDescription(
  pathname: string,
  params: URLSearchParams,
  t: (key: string) => string
): string {
  const universe = params.get("universe");
  const city = params.get("city");
  const promo = params.get("promo") === "1";

  const parts: string[] = [];

  if (pathname.includes("/results")) {
    if (universe) {
      const universeLabels: Record<string, string> = {
        restaurants: t("home.universe.restaurants"),
        loisirs: t("home.universe.leisure"),
        bien_etre: t("home.universe.sport"),
        hebergements: t("home.universe.accommodation"),
        hebergement: t("home.universe.accommodation"),
        rentacar: t("home.universe.rentacar"),
        culture: t("home.universe.culture"),
        shopping: t("home.universe.shopping"),
      };
      parts.push(universeLabels[universe] || universe);
    }

    if (city) {
      parts.push(city);
    }

    if (promo) {
      parts.push(t("results.filter.promotions"));
    }
  } else if (pathname.includes("/listing/")) {
    parts.push(t("navigation.resume.establishment_page"));
  }

  return parts.length > 0 ? parts.join(" - ") : t("navigation.resume.search");
}

/**
 * Initialize navigation state tracking
 * Call this in App.tsx or main.tsx
 */
export function initNavigationStateTracking(): void {
  if (typeof window === "undefined") return;

  // Listen for auth changes - when user logs out, clear saved state
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    if (!isAuthed()) {
      clearNavigationState();
      clearDismissState();
    }
  });
}
