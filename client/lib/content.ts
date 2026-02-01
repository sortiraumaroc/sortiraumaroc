import type { AppLocale } from "@/lib/i18n/types";

export type ContentLocale = "fr" | "en";

export type PublicContentBlock = {
  id: string;
  sort_order: number;
  type: string;
  data: unknown;
  resolved: {
    lang: ContentLocale;
    data: unknown;
  };
};

export type PublicContentPage = {
  page_key: string;
  slug: string;
  slug_fr: string;
  slug_en: string;
  status: string;
  is_published: boolean;
  updated_at: string | null;

  // bilingual fields
  title_fr: string;
  title_en: string;
  page_subtitle_fr: string;
  page_subtitle_en: string;
  body_html_fr: string;
  body_html_en: string;

  // SEO (preferred)
  seo_title_fr: string;
  seo_title_en: string;
  seo_description_fr: string;
  seo_description_en: string;

  // SEO legacy (compat)
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;

  // OG
  og_title_fr: string;
  og_title_en: string;
  og_description_fr: string;
  og_description_en: string;
  og_image_url: string | null;

  canonical_url_fr: string;
  canonical_url_en: string;
  robots: string;

  show_toc: boolean;
  related_links: unknown;

  schema_jsonld_fr: unknown;
  schema_jsonld_en: unknown;

  blocks?: PublicContentBlock[];

  resolved: {
    lang: ContentLocale;
    title: string;
    page_subtitle: string;
    body_html: string;

    seo_title: string;
    seo_description: string;

    meta_title: string;
    meta_description: string;

    og_title: string;
    og_description: string;
    og_image_url: string | null;

    canonical_url: string;
    robots: string;

    related_links: unknown;
    schema_jsonld: unknown;

    blocks?: Array<{ id: string; sort_order: number; type: string; data: unknown }>;
  };
};

function localeToContentLocale(locale: AppLocale): ContentLocale {
  return locale === "en" ? "en" : "fr";
}

export async function getPublicContentPage(args: {
  slug: string;
  locale: AppLocale;
}): Promise<PublicContentPage | null> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) throw new Error("missing_slug");

  const qs = new URLSearchParams();
  qs.set("lang", localeToContentLocale(args.locale));

  const res = await fetch(`/api/public/content/pages/${encodeURIComponent(slug)}?${qs.toString()}`, {
    credentials: "omit",
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load content page (${res.status})`);

  const payload = (await res.json()) as { item?: unknown };
  if (!payload || typeof payload !== "object" || !payload.item) return null;

  return payload.item as PublicContentPage;
}
