/**
 * Platform Settings Module
 * ========================
 * Centralized management of platform-wide settings.
 * Used to control Phase 1 (test) vs Phase 2 (commercial) features.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types
export type PlatformMode = "test" | "commercial" | "maintenance";

export interface PlatformSetting {
  key: string;
  value: string;
  value_type: "string" | "boolean" | "number" | "json";
  label: string;
  description: string | null;
  category: string;
  is_sensitive: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

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

// Cache for settings (refreshed periodically)
let settingsCache: Map<string, PlatformSetting> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache

// Get Supabase admin client
function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Default settings for when table doesn't exist or is empty
const DEFAULT_SETTINGS: PlatformSetting[] = [
  {
    key: "PLATFORM_MODE",
    value: "test",
    value_type: "string",
    label: "Mode Plateforme",
    description: "Mode de fonctionnement de la plateforme",
    category: "mode",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "PAYMENTS_RESERVATIONS_ENABLED",
    value: "false",
    value_type: "boolean",
    label: "Paiements réservations",
    description: "Activer les paiements pour les réservations",
    category: "payments",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "COMMISSIONS_ENABLED",
    value: "false",
    value_type: "boolean",
    label: "Commissions",
    description: "Activer les commissions sur les réservations",
    category: "payments",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "VISIBILITY_ORDERS_ENABLED",
    value: "true",
    value_type: "boolean",
    label: "Commandes visibilité",
    description: "Activer les commandes de visibilité (SAM Media)",
    category: "visibility",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "FREE_RESERVATIONS_ENABLED",
    value: "true",
    value_type: "boolean",
    label: "Réservations gratuites",
    description: "Autoriser les réservations sans paiement",
    category: "reservations",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "BRAND_NAME",
    value: "Sortir Au Maroc",
    value_type: "string",
    label: "Nom de marque",
    description: "Nom complet de la plateforme",
    category: "branding",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "BRAND_SHORT",
    value: "SAM",
    value_type: "string",
    label: "Nom court",
    description: "Abréviation de la marque",
    category: "branding",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    key: "BRAND_DOMAIN",
    value: "sam.ma",
    value_type: "string",
    label: "Domaine",
    description: "Domaine principal de la plateforme",
    category: "branding",
    is_sensitive: false,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Load all platform settings from database
 */
export async function loadPlatformSettings(): Promise<Map<string, PlatformSetting>> {
  const now = Date.now();

  // Return cached if still valid
  if (settingsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return settingsCache;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .order("category")
      .order("key");

    if (error) {
      console.warn("[PlatformSettings] Load error (using defaults):", error.message);
      // Return stale cache if available, otherwise use defaults
      if (settingsCache) return settingsCache;
      settingsCache = new Map(DEFAULT_SETTINGS.map((s) => [s.key, s]));
      cacheTimestamp = now;
      return settingsCache;
    }

    // If no data, use defaults
    if (!data || data.length === 0) {
      console.warn("[PlatformSettings] No settings in database, using defaults");
      settingsCache = new Map(DEFAULT_SETTINGS.map((s) => [s.key, s]));
      cacheTimestamp = now;
      return settingsCache;
    }

    settingsCache = new Map((data || []).map((s) => [s.key, s as PlatformSetting]));
    cacheTimestamp = now;

    return settingsCache;
  } catch (err) {
    console.warn("[PlatformSettings] Unexpected error (using defaults):", err);
    // Return stale cache if available, otherwise use defaults
    if (settingsCache) return settingsCache;
    settingsCache = new Map(DEFAULT_SETTINGS.map((s) => [s.key, s]));
    cacheTimestamp = now;
    return settingsCache;
  }
}

/**
 * Get a single setting value
 */
export async function getSetting(key: string): Promise<string | null> {
  const settings = await loadPlatformSettings();
  return settings.get(key)?.value ?? null;
}

/**
 * Get a boolean setting
 */
export async function getSettingBool(key: string): Promise<boolean> {
  const value = await getSetting(key);
  return value === "true";
}

/**
 * Get a number setting
 */
export async function getSettingNumber(key: string): Promise<number | null> {
  const value = await getSetting(key);
  if (value === null) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Get current platform mode
 */
export async function getPlatformMode(): Promise<PlatformMode> {
  const mode = await getSetting("PLATFORM_MODE");
  if (mode === "commercial" || mode === "maintenance") return mode;
  return "test"; // Default to test mode
}

/**
 * Check if platform is in test mode (Phase 1)
 */
export async function isTestMode(): Promise<boolean> {
  return (await getPlatformMode()) === "test";
}

/**
 * Check if platform is in commercial mode (Phase 2)
 */
export async function isCommercialMode(): Promise<boolean> {
  return (await getPlatformMode()) === "commercial";
}

/**
 * Get full settings snapshot (for admin UI)
 */
export async function getPlatformSettingsSnapshot(): Promise<PlatformSettingsSnapshot> {
  const settings = await loadPlatformSettings();

  const getBool = (key: string): boolean => settings.get(key)?.value === "true";
  const getStr = (key: string, fallback: string): string => settings.get(key)?.value || fallback;

  return {
    mode: (getStr("PLATFORM_MODE", "test") as PlatformMode),
    payments: {
      reservations_enabled: getBool("PAYMENTS_RESERVATIONS_ENABLED"),
      commissions_enabled: getBool("COMMISSIONS_ENABLED"),
      subscriptions_enabled: getBool("SUBSCRIPTIONS_ENABLED"),
      packs_purchases_enabled: getBool("PACKS_PURCHASES_ENABLED"),
      payouts_enabled: getBool("PAYOUTS_ENABLED"),
      guarantee_deposits_enabled: getBool("GUARANTEE_DEPOSITS_ENABLED"),
      wallet_credits_enabled: getBool("WALLET_CREDITS_ENABLED"),
    },
    visibility: {
      orders_enabled: getBool("VISIBILITY_ORDERS_ENABLED"),
    },
    reservations: {
      free_enabled: getBool("FREE_RESERVATIONS_ENABLED"),
    },
    branding: {
      name: getStr("BRAND_NAME", "Sortir Au Maroc"),
      short: getStr("BRAND_SHORT", "SAM"),
      domain: getStr("BRAND_DOMAIN", "sam.ma"),
    },
    footer: {
      social_instagram: getStr("FOOTER_SOCIAL_INSTAGRAM", ""),
      social_tiktok: getStr("FOOTER_SOCIAL_TIKTOK", ""),
      social_facebook: getStr("FOOTER_SOCIAL_FACEBOOK", ""),
      social_youtube: getStr("FOOTER_SOCIAL_YOUTUBE", ""),
      social_snapchat: getStr("FOOTER_SOCIAL_SNAPCHAT", ""),
      social_linkedin: getStr("FOOTER_SOCIAL_LINKEDIN", ""),
    },
    ramadan: {
      enabled: getBool("RAMADAN_ENABLED"),
      start_date: getStr("RAMADAN_START_DATE", ""),
      end_date: getStr("RAMADAN_END_DATE", ""),
    },
  };
}

/**
 * Update a platform setting (Superadmin only)
 */
export async function updatePlatformSetting(
  key: string,
  value: string,
  updatedBy: string
): Promise<PlatformSetting> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("platform_settings")
    .update({
      value,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key)
    .select()
    .single();

  if (error) {
    console.error("[PlatformSettings] Update error:", error);
    throw error;
  }

  // Invalidate cache
  settingsCache = null;

  return data as PlatformSetting;
}

/**
 * List all settings (for admin UI)
 */
export async function listPlatformSettings(): Promise<PlatformSetting[]> {
  const settings = await loadPlatformSettings();
  return Array.from(settings.values());
}

/**
 * List settings by category
 */
export async function listPlatformSettingsByCategory(
  category: string
): Promise<PlatformSetting[]> {
  const settings = await loadPlatformSettings();
  return Array.from(settings.values()).filter((s) => s.category === category);
}

// ============================================================================
// Feature Check Helpers (for use throughout the codebase)
// ============================================================================

/**
 * Check if Ramadan mode is currently active (enabled + within date range)
 */
export async function isRamadanActive(): Promise<boolean> {
  const enabled = await getSettingBool("RAMADAN_ENABLED");
  if (!enabled) return false;
  const startStr = await getSetting("RAMADAN_START_DATE");
  const endStr = await getSetting("RAMADAN_END_DATE");
  if (!startStr || !endStr) return false;
  const now = new Date();
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T23:59:59");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  return now >= start && now <= end;
}

/**
 * Get Ramadan configuration from platform settings
 */
export async function getRamadanConfig(): Promise<{ enabled: boolean; start_date: string; end_date: string }> {
  const settings = await loadPlatformSettings();
  return {
    enabled: settings.get("RAMADAN_ENABLED")?.value === "true",
    start_date: settings.get("RAMADAN_START_DATE")?.value || "",
    end_date: settings.get("RAMADAN_END_DATE")?.value || "",
  };
}

/**
 * Check if reservation payments are enabled
 */
export async function isReservationPaymentsEnabled(): Promise<boolean> {
  return getSettingBool("PAYMENTS_RESERVATIONS_ENABLED");
}

/**
 * Check if commissions are enabled
 */
export async function isCommissionsEnabled(): Promise<boolean> {
  return getSettingBool("COMMISSIONS_ENABLED");
}

/**
 * Check if pack purchases are enabled
 */
export async function isPackPurchasesEnabled(): Promise<boolean> {
  return getSettingBool("PACKS_PURCHASES_ENABLED");
}

/**
 * Check if payouts are enabled
 */
export async function isPayoutsEnabled(): Promise<boolean> {
  return getSettingBool("PAYOUTS_ENABLED");
}

/**
 * Check if guarantee deposits are enabled
 */
export async function isGuaranteeDepositsEnabled(): Promise<boolean> {
  return getSettingBool("GUARANTEE_DEPOSITS_ENABLED");
}

/**
 * Check if visibility orders are enabled (always true in Phase 1)
 */
export async function isVisibilityOrdersEnabled(): Promise<boolean> {
  return getSettingBool("VISIBILITY_ORDERS_ENABLED");
}

// ============================================================================
// Invalidate cache (call when settings are updated externally)
// ============================================================================

export function invalidateSettingsCache(): void {
  settingsCache = null;
  cacheTimestamp = 0;
}
