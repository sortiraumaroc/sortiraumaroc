/**
 * Platform Settings Hook
 * ======================
 * Provides access to platform-wide settings for feature toggling.
 * Uses a public endpoint that doesn't require admin auth.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PlatformMode = "test" | "commercial" | "maintenance";

export interface PlatformSettingsSnapshot {
  mode: PlatformMode;
  payments: {
    reservations_enabled: boolean;
    commissions_enabled: boolean;
    subscriptions_enabled: boolean;
    packs_purchases_enabled: boolean;
    payouts_enabled: boolean;
    guarantee_deposits_enabled: boolean;
    wallet_credits_enabled: boolean;
  };
  visibility: {
    orders_enabled: boolean;
  };
  reservations: {
    free_enabled: boolean;
  };
  branding: {
    name: string;
    short: string;
    domain: string;
  };
  footer: {
    social_instagram: string;
    social_tiktok: string;
    social_facebook: string;
    social_youtube: string;
    social_snapchat: string;
    social_linkedin: string;
  };
  ramadan: {
    enabled: boolean;
    start_date: string;
    end_date: string;
  };
}

interface PlatformSettingsContextValue {
  settings: PlatformSettingsSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isTestMode: () => boolean;
  isCommercialMode: () => boolean;
  isFeatureEnabled: (feature: keyof PlatformSettingsSnapshot["payments"]) => boolean;
}

const defaultSnapshot: PlatformSettingsSnapshot = {
  mode: "test",
  payments: {
    reservations_enabled: false,
    commissions_enabled: false,
    subscriptions_enabled: false,
    packs_purchases_enabled: false,
    payouts_enabled: false,
    guarantee_deposits_enabled: false,
    wallet_credits_enabled: false,
  },
  visibility: {
    orders_enabled: true,
  },
  reservations: {
    free_enabled: true,
  },
  branding: {
    name: "Sortir Au Maroc",
    short: "SAM",
    domain: "sam.ma",
  },
  footer: {
    social_instagram: "",
    social_tiktok: "",
    social_facebook: "",
    social_youtube: "",
    social_snapchat: "",
    social_linkedin: "",
  },
  ramadan: {
    enabled: false,
    start_date: "",
    end_date: "",
  },
};

const PlatformSettingsContext = createContext<PlatformSettingsContextValue>({
  settings: defaultSnapshot,
  loading: false,
  error: null,
  refresh: async () => {},
  isTestMode: () => true,
  isCommercialMode: () => false,
  isFeatureEnabled: () => false,
});

export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PlatformSettingsSnapshot | null>(defaultSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/public/platform-settings");
      if (!res.ok) {
        if (res.status === 404) {
          setSettings(defaultSnapshot);
          return;
        }
        throw new Error("Failed to load platform settings");
      }

      // Guard against Vite dev server returning HTML before Express is mounted
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        setSettings(defaultSnapshot);
        return;
      }

      const data = await res.json();
      setSettings(data.snapshot || defaultSnapshot);
    } catch (e) {
      // Silence in dev — race condition with Vite mounting Express
      if (import.meta.env.DEV) {
        setSettings(defaultSnapshot);
      } else {
        console.error("[PlatformSettings] Load error:", e);
        setError(e instanceof Error ? e.message : "Unknown error");
        setSettings(defaultSnapshot);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const isTestMode = () => settings?.mode === "test";
  const isCommercialMode = () => settings?.mode === "commercial";
  const isFeatureEnabled = (feature: keyof PlatformSettingsSnapshot["payments"]) => {
    return settings?.payments[feature] ?? false;
  };

  return (
    <PlatformSettingsContext.Provider value={{ settings, loading, error, refresh, isTestMode, isCommercialMode, isFeatureEnabled }}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings() {
  return useContext(PlatformSettingsContext);
}

let cachedMode: PlatformMode | null = null;

export async function checkPlatformMode(): Promise<PlatformMode> {
  if (cachedMode) return cachedMode;

  try {
    const res = await fetch("/api/public/platform-settings");
    if (res.ok) {
      const data = await res.json();
      cachedMode = data.snapshot?.mode || "test";
      return cachedMode;
    }
  } catch {
    // Ignore errors
  }

  return "test";
}

export function invalidatePlatformModeCache() {
  cachedMode = null;
}
