/**
 * BannerProvider — React Context that manages banner display for the consumer app.
 *
 * Responsibilities:
 *   - Fetch the eligible banner on mount (and on auth/location change)
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
import { useLocation } from "react-router-dom";
import { getConsumerAccessToken } from "@/lib/auth";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import { BannerRenderer } from "./BannerRenderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Banner {
  id: string;
  title?: string;
  subtitle?: string;
  body?: string;
  image_url?: string;
  media_url?: string;
  media_url_mobile?: string;
  media_type?: string;
  cta_label?: string;
  cta_text?: string;
  cta_url?: string;
  cta_target?: string;
  secondary_cta_text?: string;
  secondary_cta_url?: string;
  frequency?: "once" | "daily" | "every_session";
  type?: string;
  display_format?: string;
  animation?: string;
  overlay_color?: string;
  overlay_opacity?: number;
  close_behavior?: string;
  close_delay_seconds?: number;
  appear_delay_type?: string;
  appear_delay_value?: number;
  carousel_slides?: unknown[];
  countdown_target?: string;
  form_fields?: unknown[];
  form_confirmation_message?: string;
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

// Default cooldown: 30 minutes — after dismiss, the banner can show again
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

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

  // Default: time-based cooldown (30 min)
  // Within the same session: always dismissed (sessionStorage)
  if (sessionStorage.getItem(key)) return true;

  // Across sessions: check if cooldown has expired (localStorage timestamp)
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  const dismissedAt = parseInt(stored, 10);
  if (isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DEFAULT_COOLDOWN_MS;
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

  // Default: mark in sessionStorage (don't show again this session)
  // + store timestamp in localStorage (30-min cooldown across sessions)
  sessionStorage.setItem(key, "1");
  localStorage.setItem(key, String(Date.now()));
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

async function fetchEligibleBanner(page?: string): Promise<Banner | null> {
  try {
    const token = await getConsumerAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    const params = new URLSearchParams({ platform: "web" });
    if (page) {
      params.set("page", page);
    } else {
      params.set("trigger", "on_app_open");
    }

    const res = await fetch(`/api/banners/eligible?${params.toString()}`, { headers });
    if (!res.ok) return null;

    const json = await res.json();
    return json?.banner ?? null;
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
  const location = useLocation();

  // Load eligible banner
  const loadBanner = useCallback(async (page?: string) => {
    // Max 1 banner per session
    if (sessionStorage.getItem(BANNER_SHOWN_KEY)) return;

    const banner = await fetchEligibleBanner(page);
    if (!banner?.id) return;

    // Check frequency cap
    if (isDismissed(banner.id, banner.frequency)) return;

    setCurrentBanner(banner);
    sessionStorage.setItem(BANNER_SHOWN_KEY, "1");
  }, []);

  // Fetch on mount with current page
  useEffect(() => {
    void loadBanner(location.pathname);
  }, [loadBanner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch on location change (for on_page banners)
  useEffect(() => {
    void loadBanner(location.pathname);
  }, [location.pathname, loadBanner]);

  // Re-fetch on auth change (login / logout)
  useEffect(() => {
    const handler = () => void loadBanner(location.pathname);
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  }, [loadBanner, location.pathname]);

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

      {/* Render BannerRenderer when a banner is active */}
      {currentBanner && currentBanner.type && currentBanner.display_format && (
        <BannerRenderer
          banner={{
            id: currentBanner.id,
            type: currentBanner.type,
            title: currentBanner.title ?? null,
            subtitle: currentBanner.subtitle ?? null,
            media_url: currentBanner.media_url ?? currentBanner.image_url ?? null,
            media_url_mobile: currentBanner.media_url_mobile ?? null,
            media_type: (currentBanner.media_type as "image" | "video" | undefined) ?? null,
            cta_text: currentBanner.cta_text ?? currentBanner.cta_label,
            cta_url: currentBanner.cta_url,
            cta_target: currentBanner.cta_target,
            secondary_cta_text: currentBanner.secondary_cta_text ?? null,
            secondary_cta_url: currentBanner.secondary_cta_url ?? null,
            carousel_slides: (currentBanner.carousel_slides as any) ?? null,
            countdown_target: currentBanner.countdown_target ?? null,
            form_fields: (currentBanner.form_fields as any) ?? null,
            form_confirmation_message: currentBanner.form_confirmation_message ?? null,
            display_format: currentBanner.display_format,
            animation: (currentBanner.animation as string) ?? "fade",
            overlay_color: currentBanner.overlay_color,
            overlay_opacity: currentBanner.overlay_opacity,
            close_behavior: currentBanner.close_behavior,
            close_delay_seconds: currentBanner.close_delay_seconds,
            appear_delay_type: currentBanner.appear_delay_type,
            appear_delay_value: currentBanner.appear_delay_value,
          }}
          onClose={dismissBanner}
          onCtaClick={() => trackBannerClick(currentBanner.id)}
          onFormSubmit={async (data) => {
            try {
              await submitBannerForm(currentBanner.id, data);
            } catch {
              // best-effort
            }
          }}
          sessionId={sessionId}
        />
      )}
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
