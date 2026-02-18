/**
 * BannerProvider — React Context that manages banner display for the consumer app.
 *
 * Responsibilities:
 *   - Fetch the eligible banner on mount (and on auth change)
 *   - Enforce frequency caps (once / daily / every_session)
 *   - Limit to max 1 banner per session
 *   - Expose tracking helpers (view, click, form submit)
 *   - Render the BannerRenderer when a banner is active
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getConsumerAccessToken } from "@/lib/auth";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Banner {
  id: string;
  title?: string;
  body?: string;
  image_url?: string;
  cta_label?: string;
  cta_url?: string;
  frequency?: "once" | "daily" | "every_session";
  type?: string;
  form_fields?: unknown[];
  [key: string]: unknown;
}

interface BannerContextValue {
  currentBanner: Banner | null;
  dismissBanner: () => void;
  trackBannerView: (bannerId: string) => void;
  trackBannerClick: (bannerId: string) => void;
  submitBannerForm: (bannerId: string, data: Record<string, unknown>) => Promise<void>;
}

const BannerContext = createContext<BannerContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers — frequency management
// ---------------------------------------------------------------------------

const DISMISS_KEY_PREFIX = "banner_dismissed_";

function isDismissed(bannerId: string, frequency?: string): boolean {
  const key = `${DISMISS_KEY_PREFIX}${bannerId}`;

  if (frequency === "once") {
    return localStorage.getItem(key) !== null;
  }

  if (frequency === "daily") {
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    const today = new Date().toISOString().slice(0, 10);
    return stored === today;
  }

  // every_session (default)
  return sessionStorage.getItem(key) !== null;
}

function markDismissed(bannerId: string, frequency?: string): void {
  const key = `${DISMISS_KEY_PREFIX}${bannerId}`;

  if (frequency === "once") {
    localStorage.setItem(key, "1");
    return;
  }

  if (frequency === "daily") {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(key, today);
    return;
  }

  // every_session (default)
  sessionStorage.setItem(key, "1");
}

// ---------------------------------------------------------------------------
// Session ID — unique per browser session
// ---------------------------------------------------------------------------

const SESSION_ID_KEY = "banner_session_id";

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchEligibleBanner(): Promise<Banner | null> {
  try {
    const token = await getConsumerAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch("/api/banners/eligible?platform=web&trigger=on_app_open", { headers });
    if (!res.ok) return null;

    const json = await res.json();
    return json?.banner ?? json ?? null;
  } catch {
    return null;
  }
}

async function postBannerEvent(
  bannerId: string,
  event: "view" | "click",
  sessionId: string,
): Promise<void> {
  try {
    const token = await getConsumerAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    await fetch(`/api/banners/${bannerId}/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, session_id: sessionId }),
    });
  } catch {
    // best-effort
  }
}

async function postBannerFormSubmission(
  bannerId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const token = await getConsumerAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`/api/banners/${bannerId}/form`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error ?? "Form submission failed");
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const BANNER_SHOWN_KEY = "banner_shown_this_session";

export function BannerProvider({ children }: { children: ReactNode }) {
  const [currentBanner, setCurrentBanner] = useState<Banner | null>(null);
  const [sessionId] = useState<string>(getOrCreateSessionId);

  // Load eligible banner
  const loadBanner = useCallback(async () => {
    // Max 1 banner per session
    if (sessionStorage.getItem(BANNER_SHOWN_KEY)) return;

    const banner = await fetchEligibleBanner();
    if (!banner?.id) return;

    // Check frequency cap
    if (isDismissed(banner.id, banner.frequency)) return;

    setCurrentBanner(banner);
    sessionStorage.setItem(BANNER_SHOWN_KEY, "1");
  }, []);

  // Fetch on mount
  useEffect(() => {
    void loadBanner();
  }, [loadBanner]);

  // Re-fetch on auth change (login / logout)
  useEffect(() => {
    const handler = () => void loadBanner();
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  }, [loadBanner]);

  // ------ actions ------

  const dismissBanner = useCallback(() => {
    if (currentBanner) {
      markDismissed(currentBanner.id, currentBanner.frequency);
    }
    setCurrentBanner(null);
  }, [currentBanner]);

  const trackBannerView = useCallback(
    (bannerId: string) => {
      void postBannerEvent(bannerId, "view", sessionId);
    },
    [sessionId],
  );

  const trackBannerClick = useCallback(
    (bannerId: string) => {
      void postBannerEvent(bannerId, "click", sessionId);
    },
    [sessionId],
  );

  const submitBannerForm = useCallback(
    async (bannerId: string, data: Record<string, unknown>) => {
      await postBannerFormSubmission(bannerId, data);
    },
    [],
  );

  // ------ render ------

  return (
    <BannerContext.Provider
      value={{ currentBanner, dismissBanner, trackBannerView, trackBannerClick, submitBannerForm }}
    >
      {children}
    </BannerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBanner(): BannerContextValue {
  const ctx = useContext(BannerContext);
  if (!ctx) throw new Error("useBanner must be used within a BannerProvider");
  return ctx;
}
