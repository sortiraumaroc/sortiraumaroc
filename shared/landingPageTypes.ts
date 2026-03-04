// ============================================================================
// Landing Pages SEO — Shared Types
// ============================================================================

/** Raw landing page row from the database (all multilingual fields). */
export type LandingPage = {
  id: string;
  slug: string;
  universe: string;
  city: string | null;
  category: string | null;
  cuisine_type: string | null;

  title_fr: string;
  title_en: string | null;
  title_es: string | null;
  title_it: string | null;
  title_ar: string | null;

  description_fr: string;
  description_en: string | null;
  description_es: string | null;
  description_it: string | null;
  description_ar: string | null;

  h1_fr: string;
  h1_en: string | null;
  h1_es: string | null;
  h1_it: string | null;
  h1_ar: string | null;

  intro_text_fr: string | null;
  intro_text_en: string | null;
  intro_text_es: string | null;
  intro_text_it: string | null;
  intro_text_ar: string | null;

  keywords: string | null;
  og_image_url: string | null;
  robots: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Localized (resolved to single locale) landing page for frontend use. */
export type LandingPageLocalized = {
  id: string;
  slug: string;
  universe: string;
  city: string | null;
  category: string | null;
  cuisine_type: string | null;
  title: string;
  description: string;
  h1: string;
  intro_text: string | null;
  keywords: string | null;
  og_image_url: string | null;
  robots: string;
  priority: number;
};

/** Lightweight entry for the slug lookup cache (redirect + sitemap). */
export type LandingSlugEntry = {
  slug: string;
  universe: string;
  city: string | null;
  cuisine_type: string | null;
  category: string | null;
};

/** Related landing page link (for footer SEO links section). */
export type RelatedLanding = {
  slug: string;
  title_fr: string;
  title_en: string | null;
  h1_fr: string | null;
  h1_en: string | null;
  city: string | null;
  cuisine_type: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LocaleSuffix = "fr" | "en" | "es" | "it" | "ar";

/**
 * Resolve multilingual fields to a single locale with FR fallback.
 */
export function localizeLandingPage(
  page: LandingPage,
  locale: string,
): LandingPageLocalized {
  const l = (locale || "fr") as LocaleSuffix;
  return {
    id: page.id,
    slug: page.slug,
    universe: page.universe,
    city: page.city,
    category: page.category,
    cuisine_type: page.cuisine_type,
    title: page[`title_${l}`] || page.title_fr,
    description: page[`description_${l}`] || page.description_fr,
    h1: page[`h1_${l}`] || page.h1_fr,
    intro_text: page[`intro_text_${l}`] || page.intro_text_fr,
    keywords: page.keywords,
    og_image_url: page.og_image_url,
    robots: page.robots,
    priority: page.priority,
  };
}
