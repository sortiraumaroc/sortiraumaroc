/**
 * i18n message loader — lazy loading per locale.
 *
 * FR is imported statically (always in the main bundle).
 * EN is preloaded in background on mount.
 * ES, IT, AR are loaded on demand when the user switches locale.
 *
 * Once loaded, a locale's messages are cached in `messageCache` forever (never re-fetched).
 */

import type { AppLocale } from "./types";

import frMessages from "./locales/fr";

export type MessagesDict = Record<string, string>;

// ---------------------------------------------------------------------------
// In-memory cache (module-level singleton — survives HMR in dev)
// ---------------------------------------------------------------------------
const messageCache: Partial<Record<AppLocale, MessagesDict>> = {
  fr: frMessages,
};

/** Synchronous read of whatever is already cached. */
export function getCachedMessages(locale: AppLocale): MessagesDict | undefined {
  return messageCache[locale];
}

/** FR is always available synchronously (static import). */
export function getFrMessages(): MessagesDict {
  return frMessages;
}

// ---------------------------------------------------------------------------
// Dynamic loaders — Vite will code-split each into its own chunk
// ---------------------------------------------------------------------------
const loaders: Record<AppLocale, () => Promise<{ default: MessagesDict }>> = {
  fr: () => Promise.resolve({ default: frMessages }),
  en: () => import("./locales/en"),
  es: () => import("./locales/es"),
  it: () => import("./locales/it"),
  ar: () => import("./locales/ar"),
};

// Prevent duplicate in-flight requests
const pending = new Map<AppLocale, Promise<MessagesDict>>();

/**
 * Load messages for a locale. Returns immediately if already cached.
 * Deduplicates concurrent requests for the same locale.
 */
export async function loadMessages(locale: AppLocale): Promise<MessagesDict> {
  const cached = messageCache[locale];
  if (cached) return cached;

  const existing = pending.get(locale);
  if (existing) return existing;

  const promise = loaders[locale]()
    .then((mod) => {
      const dict = mod.default;
      messageCache[locale] = dict;
      pending.delete(locale);
      return dict;
    })
    .catch((err) => {
      pending.delete(locale);
      throw err;
    });

  pending.set(locale, promise);
  return promise;
}

/**
 * Preload a locale in the background (fire-and-forget).
 */
export function preloadMessages(locale: AppLocale): void {
  if (messageCache[locale]) return;
  void loadMessages(locale).catch(() => {
    // Silently ignore preload failures — will retry on demand.
  });
}

// ---------------------------------------------------------------------------
// Legacy compat: `messages` object used by reservationStatus.ts
// This returns whatever is currently cached. FR is always present.
// ---------------------------------------------------------------------------
export const messages: Partial<Record<AppLocale, MessagesDict>> = messageCache;
