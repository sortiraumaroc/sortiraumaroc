import type { AppLocale } from "./i18n/types";
import { SUPPORTED_APP_LOCALES, DEFAULT_APP_LOCALE, stripLocalePrefix, addLocalePrefix } from "./i18n/types";

// ---------------------------------------------------------------------------
// OG locale mapping (spec §2)
// ---------------------------------------------------------------------------
const OG_LOCALE_MAP: Record<AppLocale, string> = {
  fr: "fr_MA",
  en: "en_US",
  es: "es_ES",
  it: "it_IT",
  ar: "ar_SA",
};

/**
 * Returns the OG `og:locale` value for the given app locale.
 */
export function getOgLocale(locale: AppLocale): string {
  return OG_LOCALE_MAP[locale] ?? OG_LOCALE_MAP[DEFAULT_APP_LOCALE];
}

/**
 * Returns all OG `og:locale:alternate` values (all except the current locale).
 */
export function getOgLocaleAlternates(locale: AppLocale): string[] {
  return SUPPORTED_APP_LOCALES
    .filter((l) => l !== locale)
    .map((l) => OG_LOCALE_MAP[l]);
}

// ---------------------------------------------------------------------------
// Hreflang builder (spec §1 + §5)
// ---------------------------------------------------------------------------

/**
 * Builds the full hreflang map for all 5 locales + x-default, given:
 *  - The current pathname (may or may not contain a locale prefix)
 *  - An optional baseUrl (defaults to window.location.origin)
 *
 * @example
 *   buildSeoHreflangs("/en/restaurant/123")
 *   → { fr: "https://sam.ma/restaurant/123", en: "https://sam.ma/en/restaurant/123", es: "https://sam.ma/es/restaurant/123", it: "https://sam.ma/it/restaurant/123", ar: "https://sam.ma/ar/restaurant/123", "x-default": "https://sam.ma/restaurant/123" }
 */
export function buildSeoHreflangs(pathname?: string, baseUrl?: string): Record<string, string> | undefined {
  const base = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return undefined;

  const rawPath = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const strippedPath = stripLocalePrefix(rawPath);

  const hreflangs: Record<string, string> = {};
  for (const locale of SUPPORTED_APP_LOCALES) {
    const localizedPath = addLocalePrefix(strippedPath, locale);
    hreflangs[locale] = `${base}${localizedPath}`;
  }
  // x-default → FR (default locale, no prefix)
  hreflangs["x-default"] = `${base}${strippedPath}`;

  return hreflangs;
}

/**
 * Returns the canonical URL for the current page, correctly including the locale prefix.
 */
export function buildCanonicalUrl(pathname?: string, baseUrl?: string): string {
  const base = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return "";
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  return `${base}${path}`;
}

// ---------------------------------------------------------------------------
// Convenience: build a full SeoInput with all i18n fields pre-filled
// ---------------------------------------------------------------------------

/**
 * Builds the i18n-related subset of SeoInput for a given locale.
 * Can be spread into an `applySeo()` call.
 *
 * @example
 *   applySeo({
 *     title: t("seo.home.title"),
 *     description: t("seo.home.description"),
 *     ...buildI18nSeoFields(locale),
 *   });
 */
export function buildI18nSeoFields(
  locale: AppLocale,
  options?: { pathname?: string; baseUrl?: string },
): Pick<SeoInput, "ogLocale" | "ogLocaleAlternates" | "hreflangs" | "canonicalUrl"> {
  return {
    ogLocale: getOgLocale(locale),
    ogLocaleAlternates: getOgLocaleAlternates(locale),
    hreflangs: buildSeoHreflangs(options?.pathname, options?.baseUrl),
    canonicalUrl: buildCanonicalUrl(options?.pathname, options?.baseUrl),
  };
}

export type SeoInput = {
  title?: string;
  description?: string;
  /** Absolute URL. If omitted, will be derived from window.location */
  canonicalUrl?: string;
  /** If true, canonical will strip query params (recommended for indexable pages). Default: true */
  canonicalStripQuery?: boolean;
  /** If true, removes previous page tags when the next page doesn't provide them. Default: true */
  clearPrevious?: boolean;
  /** e.g. 'index,follow' or 'noindex,nofollow' */
  robots?: string;
  ogImageUrl?: string;
  ogType?: string;
  ogLocale?: string;
  /** Optional OG-specific title. If omitted, uses title. */
  ogTitle?: string;
  /** Optional OG-specific description. If omitted, uses description. */
  ogDescription?: string;
  ogLocaleAlternates?: string[];
  /** hreflang alternates: record of language code to URL (e.g. { fr: "...", en: "..." }) */
  hreflangs?: Record<string, string>;
  /** Keywords for the page */
  keywords?: string;
};

function ensureMeta(name: string, attr: "name" | "property" = "name"): HTMLMetaElement {
  const selector = attr === "name" ? `meta[name="${name}"]` : `meta[property="${name}"]`;
  const existing = document.querySelector(selector);
  if (existing instanceof HTMLMetaElement) return existing;

  const el = document.createElement("meta");
  el.setAttribute(attr, name);
  document.head.appendChild(el);
  return el;
}

function ensureLink(rel: string): HTMLLinkElement {
  const selector = `link[rel="${rel}"]`;
  const existing = document.querySelector(selector);
  if (existing instanceof HTMLLinkElement) return existing;

  const el = document.createElement("link");
  el.setAttribute("rel", rel);
  document.head.appendChild(el);
  return el;
}

function defaultCanonicalUrl(args?: { stripQuery?: boolean }): string {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  url.hash = "";
  if (args?.stripQuery !== false) url.search = "";
  return url.toString();
}

function removeMeta(name: string, attr: "name" | "property" = "name"): void {
  const selector = attr === "name" ? `meta[name="${name}"]` : `meta[property="${name}"]`;
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

function removeLink(rel: string): void {
  document.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.remove());
}

export function applySeo(input: SeoInput): void {
  if (typeof document === "undefined") return;

  const clearPrevious = input.clearPrevious !== false;

  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  const canonicalUrl = (input.canonicalUrl ?? defaultCanonicalUrl({ stripQuery: input.canonicalStripQuery })).trim();
  const robots = (input.robots ?? "").trim();
  const ogImageUrl = (input.ogImageUrl ?? "").trim();
  const ogType = (input.ogType ?? "website").trim();
  const ogTitle = (input.ogTitle ?? "").trim();
  const ogDescription = (input.ogDescription ?? "").trim();
  const keywords = (input.keywords ?? "").trim();
  const ogLocale = (input.ogLocale ?? "").trim();
  const ogLocaleAlternates = Array.isArray(input.ogLocaleAlternates) ? input.ogLocaleAlternates.map((v) => String(v).trim()).filter(Boolean) : [];

  if (clearPrevious) {
    // Clear stale tags from previous route when the new route doesn't set them.
    if (!title && !ogTitle) {
      removeMeta("og:title", "property");
      removeMeta("twitter:title");
    }

    if (!description && !ogDescription) {
      removeMeta("description");
      removeMeta("og:description", "property");
      removeMeta("twitter:description");
    }

    if (!keywords) removeMeta("keywords");
    if (!robots) removeMeta("robots");

    if (!ogImageUrl) {
      removeMeta("og:image", "property");
      removeMeta("twitter:image");
    }

    // Always clear hreflangs on client navigation unless explicitly set for the current route.
    document.querySelectorAll("link[rel='alternate'][hreflang]").forEach((el) => el.remove());

    // Clear locale fields unless provided
    if (!ogLocale) removeMeta("og:locale", "property");
    removeMeta("og:locale:alternate", "property");
  }

  const finalOgTitle = ogTitle || title;
  const finalOgDescription = ogDescription || description;

  if (title) {
    document.title = title;
  }

  if (finalOgTitle) {
    ensureMeta("og:title", "property").setAttribute("content", finalOgTitle);
    ensureMeta("twitter:title").setAttribute("content", finalOgTitle);
  }

  if (description) {
    ensureMeta("description").setAttribute("content", description);
  }

  if (finalOgDescription) {
    ensureMeta("og:description", "property").setAttribute("content", finalOgDescription);
    ensureMeta("twitter:description").setAttribute("content", finalOgDescription);
  }

  if (keywords) {
    ensureMeta("keywords").setAttribute("content", keywords);
  }

  if (canonicalUrl) {
    ensureLink("canonical").setAttribute("href", canonicalUrl);
    ensureMeta("og:url", "property").setAttribute("content", canonicalUrl);
  } else if (clearPrevious) {
    removeLink("canonical");
    removeMeta("og:url", "property");
  }

  if (robots) {
    ensureMeta("robots").setAttribute("content", robots);
  }

  if (ogLocale) {
    ensureMeta("og:locale", "property").setAttribute("content", ogLocale);
    for (const alt of ogLocaleAlternates) {
      const el = document.createElement("meta");
      el.setAttribute("property", "og:locale:alternate");
      el.setAttribute("content", alt);
      document.head.appendChild(el);
    }
  }

  // Handle hreflang for language alternates
  if (input.hreflangs && Object.keys(input.hreflangs).length > 0) {
    for (const [lang, url] of Object.entries(input.hreflangs)) {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = lang;
      link.href = url;
      document.head.appendChild(link);
    }
  }

  ensureMeta("og:type", "property").setAttribute("content", ogType || "website");
  ensureMeta("og:site_name", "property").setAttribute("content", "Sortir Au Maroc");

  if (ogImageUrl) {
    ensureMeta("og:image", "property").setAttribute("content", ogImageUrl);
    ensureMeta("twitter:image").setAttribute("content", ogImageUrl);
  }

  ensureMeta("twitter:card").setAttribute("content", ogImageUrl ? "summary_large_image" : "summary");
}

export function setJsonLd(id: string, json: unknown): void {
  if (typeof document === "undefined") return;

  const scriptId = `sam-jsonld-${id}`;
  const existing = document.getElementById(scriptId);

  const el = existing instanceof HTMLScriptElement ? existing : document.createElement("script");
  el.id = scriptId;
  el.type = "application/ld+json";
  el.text = JSON.stringify(json);

  if (!existing) document.head.appendChild(el);
}

export function clearJsonLd(id: string): void {
  if (typeof document === "undefined") return;
  const scriptId = `sam-jsonld-${id}`;
  const existing = document.getElementById(scriptId);
  if (existing) existing.remove();
}

/**
 * Utility to generate clean slugs from establishment names or titles
 * @example generateSlug("The Grand Hotel") => "the-grand-hotel"
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

/**
 * Generate a BreadcrumbList JSON-LD schema
 * @example
 * generateBreadcrumbSchema([
 *   { name: "Home", url: "https://example.com/" },
 *   { name: "Restaurants", url: "https://example.com/restaurants" },
 *   { name: "The Grand Hotel", url: "https://example.com/restaurant/123" }
 * ])
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Generate a LocalBusiness JSON-LD schema for establishment pages
 */
export function generateLocalBusinessSchema(data: {
  name: string;
  url: string;
  telephone?: string;
  address: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  geo?: {
    latitude: number;
    longitude: number;
  };
  images?: string[];
  description?: string;
  priceRange?: string;
  openingHours?: string[];
  openingHoursSpecification?: Array<{ dayOfWeek: string | string[]; opens: string; closes: string }>;
  aggregateRating?: { ratingValue: number; reviewCount: number };
}) {
  const address = {
    "@type": "PostalAddress",
    ...(data.address.streetAddress && { streetAddress: data.address.streetAddress }),
    ...(data.address.addressLocality && { addressLocality: data.address.addressLocality }),
    ...(data.address.addressRegion && { addressRegion: data.address.addressRegion }),
    ...(data.address.postalCode && { postalCode: data.address.postalCode }),
    ...(data.address.addressCountry && { addressCountry: data.address.addressCountry }),
  };

  const geo =
    data.geo && typeof data.geo.latitude === "number" && typeof data.geo.longitude === "number"
      ? {
          "@type": "GeoCoordinates",
          latitude: data.geo.latitude,
          longitude: data.geo.longitude,
        }
      : undefined;

  const aggregateRating =
    data.aggregateRating && Number.isFinite(data.aggregateRating.ratingValue) && Number.isFinite(data.aggregateRating.reviewCount)
      ? {
          "@type": "AggregateRating",
          ratingValue: data.aggregateRating.ratingValue,
          reviewCount: data.aggregateRating.reviewCount,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: data.name,
    url: data.url,
    ...(data.telephone && { telephone: data.telephone }),
    address,
    ...(geo && { geo }),
    ...(data.images && data.images.length > 0 && { image: data.images }),
    ...(data.description && { description: data.description }),
    ...(data.priceRange && { priceRange: data.priceRange }),
    ...(data.openingHoursSpecification && data.openingHoursSpecification.length > 0 && { openingHoursSpecification: data.openingHoursSpecification }),
    ...(data.openingHours && data.openingHours.length > 0 && { openingHours: data.openingHours }),
    ...(aggregateRating && { aggregateRating }),
  };
}

export function hoursToOpeningHoursSpecification(hours: Record<string, { lunch?: string; dinner?: string; closed?: boolean }>) {
  const dayMap: Record<string, string> = {
    lundi: "Monday",
    mardi: "Tuesday",
    mercredi: "Wednesday",
    jeudi: "Thursday",
    vendredi: "Friday",
    samedi: "Saturday",
    dimanche: "Sunday",
  };

  const parseRange = (raw: string | null | undefined): { opens: string; closes: string } | null => {
    const v = String(raw ?? "").trim();
    if (!v) return null;
    if (v.toLowerCase().includes("ferm")) return null;

    const match = v.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
    if (!match) return null;

    const opens = match[1] ?? "";
    const closes = match[2] ?? "";

    if (!/^\d{1,2}:\d{2}$/.test(opens) || !/^\d{1,2}:\d{2}$/.test(closes)) return null;
    return { opens, closes };
  };

  const out: Array<{ "@type": "OpeningHoursSpecification"; dayOfWeek: string; opens: string; closes: string }> = [];

  for (const [dayRaw, ranges] of Object.entries(hours ?? {})) {
    const key = String(dayRaw ?? "").trim().toLowerCase();
    const dayOfWeek = dayMap[key];
    if (!dayOfWeek) continue;

    const lunch = parseRange((ranges as any)?.lunch);
    const dinner = parseRange((ranges as any)?.dinner);

    if (lunch) out.push({ "@type": "OpeningHoursSpecification", dayOfWeek, opens: lunch.opens, closes: lunch.closes });
    if (dinner) out.push({ "@type": "OpeningHoursSpecification", dayOfWeek, opens: dinner.opens, closes: dinner.closes });
  }

  return out;
}

/**
 * Generate FAQPage schema
 */
export function generateFaqSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
