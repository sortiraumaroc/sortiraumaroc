import type { Locale as DateFnsLocale } from "date-fns";
import { enGB, es, fr, it } from "date-fns/locale";

export type AppLocale = "fr" | "en" | "es" | "it" | "ar";

export const SUPPORTED_APP_LOCALES: readonly AppLocale[] = ["fr", "en", "es", "it", "ar"] as const;

export const DEFAULT_APP_LOCALE: AppLocale = "fr";

export const RTL_LOCALES: AppLocale[] = ["ar"];

export const LOCALE_NAMES: Record<AppLocale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  ar: "العربية",
};

export function normalizeAppLocale(input: unknown): AppLocale | null {
  if (input === "fr" || input === "en" || input === "es" || input === "it" || input === "ar") return input;
  return null;
}

export function detectBrowserAppLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_APP_LOCALE;

  const rawCandidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];

  for (const raw of rawCandidates) {
    const v = String(raw ?? "").toLowerCase();
    if (v.startsWith("fr")) return "fr";
    if (v.startsWith("en")) return "en";
    if (v.startsWith("es")) return "es";
    if (v.startsWith("it")) return "it";
    if (v.startsWith("ar")) return "ar";
  }

  return DEFAULT_APP_LOCALE;
}

export function appLocaleToIntlLocale(locale: AppLocale): string {
  switch (locale) {
    case "en": return "en-GB";
    case "es": return "es-ES";
    case "it": return "it-IT";
    case "ar": return "ar-MA";
    default: return "fr-FR";
  }
}

export function appLocaleToDateFnsLocale(locale: AppLocale): DateFnsLocale {
  switch (locale) {
    case "en": return enGB;
    case "es": return es;
    case "it": return it;
    case "ar": return fr; // date-fns has ar locale but it's not commonly bundled; use fr as fallback for now
    default: return fr;
  }
}

/** Non-default locale prefixes used in URL paths */
const LOCALE_PREFIXES: AppLocale[] = ["en", "es", "it", "ar"];

export function getPathnameLocale(pathname: string): AppLocale {
  const p = String(pathname ?? "").trim();
  for (const loc of LOCALE_PREFIXES) {
    if (p === `/${loc}` || p.startsWith(`/${loc}/`)) return loc;
  }
  return "fr";
}

export function stripLocalePrefix(pathname: string): string {
  const p = String(pathname ?? "").trim();
  for (const loc of LOCALE_PREFIXES) {
    if (p === `/${loc}`) return "/";
    if (p.startsWith(`/${loc}/`)) return p.slice(loc.length + 1) || "/";
  }
  return p || "/";
}

export function addLocalePrefix(pathname: string, locale: AppLocale): string {
  const base = stripLocalePrefix(pathname);

  // French (default) has no prefix
  if (locale === "fr") return base;

  // All other locales get a prefix
  if (base === "/") return `/${locale}/`;
  return base.startsWith("/") ? `/${locale}${base}` : `/${locale}/${base}`;
}

export function localizePath(pathname: string, locale: AppLocale): string {
  // Keep admin and partners routes unprefixed.
  const base = stripLocalePrefix(pathname);
  if (base === "/admin" || base.startsWith("/admin/")) return base;
  if (base === "/partners" || base.startsWith("/partners/")) return base;
  return addLocalePrefix(base, locale);
}

export function isRtlLocale(locale: AppLocale): boolean {
  return RTL_LOCALES.includes(locale);
}
