import type { Locale as DateFnsLocale } from "date-fns";
import { enGB, fr } from "date-fns/locale";

export type AppLocale = "fr" | "en";

export const SUPPORTED_APP_LOCALES: readonly AppLocale[] = ["fr", "en"] as const;

export const DEFAULT_APP_LOCALE: AppLocale = "fr";

export function normalizeAppLocale(input: unknown): AppLocale | null {
  if (input === "fr" || input === "en") return input;
  return null;
}

export function detectBrowserAppLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_APP_LOCALE;

  const rawCandidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];

  for (const raw of rawCandidates) {
    const v = String(raw ?? "").toLowerCase();
    if (v.startsWith("fr")) return "fr";
    if (v.startsWith("en")) return "en";
  }

  return DEFAULT_APP_LOCALE;
}

export function appLocaleToIntlLocale(locale: AppLocale): string {
  // Keep it simple and predictable.
  // Use en-GB so date formatting matches the Morocco-friendly dd/mm pattern while still rendering English labels.
  return locale === "en" ? "en-GB" : "fr-FR";
}

export function appLocaleToDateFnsLocale(locale: AppLocale): DateFnsLocale {
  return locale === "en" ? enGB : fr;
}

export function getPathnameLocale(pathname: string): AppLocale {
  const p = String(pathname ?? "").trim();
  return p === "/en" || p.startsWith("/en/") ? "en" : "fr";
}

export function stripLocalePrefix(pathname: string): string {
  const p = String(pathname ?? "").trim();
  if (p === "/en") return "/";
  if (p.startsWith("/en/")) return p.slice(3) || "/";
  return p || "/";
}

export function addLocalePrefix(pathname: string, locale: AppLocale): string {
  const base = stripLocalePrefix(pathname);

  if (locale === "en") {
    if (base === "/") return "/en/";
    return base.startsWith("/") ? `/en${base}` : `/en/${base}`;
  }

  // fr
  return base;
}

export function localizePath(pathname: string, locale: AppLocale): string {
  // Keep admin routes unprefixed.
  const base = stripLocalePrefix(pathname);
  if (base === "/admin" || base.startsWith("/admin/")) return base;
  return addLocalePrefix(base, locale);
}
