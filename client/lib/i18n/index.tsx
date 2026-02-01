import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_TIME_ZONE } from "../../../shared/datetime";

import { isStaleConsumerAuthError, resetConsumerAuth } from "../auth";
import { consumerSupabase } from "../supabase";

import { messages, type MessagesDict } from "./messages";
import { hardcodedStringKeys, type HardcodedStringKey } from "./hardcoded-strings";
import {
  DEFAULT_APP_LOCALE,
  SUPPORTED_APP_LOCALES,
  appLocaleToDateFnsLocale,
  appLocaleToIntlLocale,
  detectBrowserAppLocale,
  normalizeAppLocale,
  type AppLocale,
} from "./types";

export type TranslateParams = Record<string, string | number | null | undefined>;

export type I18nContextValue = {
  locale: AppLocale;
  intlLocale: string;
  dateFnsLocale: ReturnType<typeof appLocaleToDateFnsLocale>;
  source: "stored" | "browser";
  setLocale: (locale: AppLocale, opts?: { persist?: boolean }) => void;
  t: (key: string, params?: TranslateParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrencyMAD: (amount: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  dismissLanguageSuggestion: () => void;
  shouldShowLanguageSuggestion: boolean;
};

const STORAGE_KEY = "sam_locale";
const SUGGESTION_DISMISSED_KEY = "sam_locale_suggestion_dismissed";

// In dev (HMR), the i18n module can be re-evaluated. If the Context instance changes,
// components using an old useI18n() reference will not see the new Provider value.
// We keep a single Context instance on globalThis to avoid "useI18n must be used within <I18nProvider>" crashes.
const I18N_CONTEXT_GLOBAL_KEY = "__sam_i18n_context_v1";
const I18N_LAST_VALUE_GLOBAL_KEY = "__sam_i18n_last_value_v1";

const I18nContext: React.Context<I18nContextValue | null> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[I18N_CONTEXT_GLOBAL_KEY] as React.Context<I18nContextValue | null> | undefined) ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (((globalThis as any)[I18N_CONTEXT_GLOBAL_KEY] = createContext<I18nContextValue | null>(null)) as React.Context<
    I18nContextValue | null
  >);

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v == null ? "" : String(v);
  });
}

function readStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeAppLocale(raw);
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

function readSuggestionDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SUGGESTION_DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

function writeSuggestionDismissed(): void {
  try {
    window.localStorage.setItem(SUGGESTION_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const initialStored = readStoredLocale();
  const initialDetected = detectBrowserAppLocale();

  const [locale, setLocaleState] = useState<AppLocale>(initialStored ?? initialDetected ?? DEFAULT_APP_LOCALE);
  const [source, setSource] = useState<"stored" | "browser">(initialStored ? "stored" : "browser");
  const [suggestionDismissed, setSuggestionDismissed] = useState<boolean>(() => readSuggestionDismissed());

  const localeRef = useRef(locale);
  const isUpdatingServerRef = useRef(false); // Prevent onAuthStateChange loop
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const intlLocale = useMemo(() => appLocaleToIntlLocale(locale), [locale]);
  const dateFnsLocale = useMemo(() => appLocaleToDateFnsLocale(locale), [locale]);

  // Avoid memoizing on locale only: during dev/HMR the imported `messages` object can be refreshed,
  // and we still want components to see new keys without requiring a full reload.
  const dict: MessagesDict = messages[locale] ?? messages[DEFAULT_APP_LOCALE];

  const missingKeysRef = useRef<Set<string>>(new Set());

  const t = useCallback(
    (key: string, params?: TranslateParams) => {
      const defaultDict = messages[DEFAULT_APP_LOCALE] ?? {};
      const hasCurrent = Object.prototype.hasOwnProperty.call(dict, key);
      const hasDefault = Object.prototype.hasOwnProperty.call(defaultDict, key);

      // Try hardcoded strings as fallback
      const hardcodedEntry = hardcodedStringKeys[key as HardcodedStringKey];
      const hasHardcoded = !!hardcodedEntry;

      const raw = (hasCurrent ? dict[key] : undefined) ?? (hasDefault ? defaultDict[key] : undefined) ?? (hasHardcoded ? hardcodedEntry[locale] : undefined) ?? key;

      if (import.meta.env.DEV && raw === key && !hasCurrent && !hasDefault && !hasHardcoded) {
        if (!missingKeysRef.current.has(key)) {
          missingKeysRef.current.add(key);
          // eslint-disable-next-line no-console
          console.error(`[i18n] Missing translation key: ${key} (locale: ${locale})`);
        }
      }

      return interpolate(raw, params);
    },
    [dict, locale],
  );

  const setLocale = useCallback(
    (next: AppLocale, opts?: { persist?: boolean }) => {
      if (!SUPPORTED_APP_LOCALES.includes(next)) return;
      setLocaleState(next);
      setSource(opts?.persist === false ? "browser" : "stored");
      if (opts?.persist !== false) writeStoredLocale(next);
      setSuggestionDismissed(true);
      writeSuggestionDismissed();

      if (opts?.persist === false) return;
      if (typeof window === "undefined") return;

      // If signed-in, also persist the locale server-side (Supabase Auth user_metadata).
      // This keeps the preference across devices without requiring a DB migration.
      isUpdatingServerRef.current = true;
      void consumerSupabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) {
            if (isStaleConsumerAuthError(error)) void resetConsumerAuth();
            return;
          }

          const user = data.session?.user;
          if (!user) return;

          const existing = normalizeAppLocale((user.user_metadata as Record<string, unknown> | null | undefined)?.locale);
          if (existing === next) return;

          return consumerSupabase.auth.updateUser({ data: { locale: next } });
        })
        .catch((e) => {
          if (isStaleConsumerAuthError(e)) void resetConsumerAuth();
          // Non-blocking: UI must not depend on this network call.
        })
        .finally(() => {
          isUpdatingServerRef.current = false;
        });
    },
    [],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const applyLocaleFromUser = async () => {
      const { data, error } = await consumerSupabase.auth.getSession();
      if (error) {
        if (isStaleConsumerAuthError(error)) void resetConsumerAuth();
        return;
      }
      if (cancelled) return;

      const user = data.session?.user;
      const metaLocale = normalizeAppLocale((user?.user_metadata as Record<string, unknown> | null | undefined)?.locale);

      if (!metaLocale) return;
      if (metaLocale === localeRef.current) return;

      // Prefer server-stored locale (when available) for signed-in users.
      setLocale(metaLocale, { persist: true });
    };

    void applyLocaleFromUser().catch((e) => {
      if (isStaleConsumerAuthError(e)) void resetConsumerAuth();
      // ignore
    });

    const { data: sub } = consumerSupabase.auth.onAuthStateChange((_event, session) => {
      // Skip if we triggered this change ourselves (avoid infinite loop)
      if (isUpdatingServerRef.current) return;

      const user = session?.user;
      const metaLocale = normalizeAppLocale((user?.user_metadata as Record<string, unknown> | null | undefined)?.locale);
      if (!metaLocale) return;
      if (metaLocale === localeRef.current) return;

      setLocale(metaLocale, { persist: true });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount - setLocale is stable

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => {
      try {
        return new Intl.NumberFormat(intlLocale, options).format(value);
      } catch {
        return String(value);
      }
    },
    [intlLocale],
  );

  const formatCurrencyMAD = useCallback(
    (amount: number, options?: Intl.NumberFormatOptions) => {
      try {
        return new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency: "MAD",
          currencyDisplay: "code",
          ...(options ?? {}),
        }).format(amount);
      } catch {
        return `${amount} MAD`;
      }
    },
    [intlLocale],
  );

  const formatDate = useCallback(
    (dateInput: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
      try {
        return new Intl.DateTimeFormat(intlLocale, {
          timeZone: DEFAULT_TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          ...(options ?? {}),
        }).format(date);
      } catch {
        return date.toISOString();
      }
    },
    [intlLocale],
  );

  const formatTime = useCallback(
    (dateInput: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
      try {
        return new Intl.DateTimeFormat(intlLocale, {
          timeZone: DEFAULT_TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          ...(options ?? {}),
        }).format(date);
      } catch {
        return "";
      }
    },
    [intlLocale],
  );

  const dismissLanguageSuggestion = useCallback(() => {
    setSuggestionDismissed(true);
    writeSuggestionDismissed();
  }, []);

  const shouldShowLanguageSuggestion = source === "browser" && !suggestionDismissed;

  const value: I18nContextValue = useMemo(
    () => ({
      locale,
      intlLocale,
      dateFnsLocale,
      source,
      setLocale,
      t,
      formatNumber,
      formatCurrencyMAD,
      formatDate,
      formatTime,
      dismissLanguageSuggestion,
      shouldShowLanguageSuggestion,
    }),
    [
      dateFnsLocale,
      dismissLanguageSuggestion,
      formatCurrencyMAD,
      formatDate,
      formatNumber,
      formatTime,
      intlLocale,
      locale,
      setLocale,
      shouldShowLanguageSuggestion,
      source,
      t,
    ],
  );

  // Keep a copy for dev/HMR fallback (see useI18n).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)[I18N_LAST_VALUE_GLOBAL_KEY] = value;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (ctx) return ctx;

  // Dev/HMR safety: if we end up with mismatched module instances, avoid crashing the UI.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallback = (globalThis as any)[I18N_LAST_VALUE_GLOBAL_KEY] as I18nContextValue | undefined;
  if (fallback) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[i18n] useI18n used outside <I18nProvider> (HMR mismatch?). Using fallback value.");
    }
    return fallback;
  }

  throw new Error("useI18n must be used within <I18nProvider>");
}
