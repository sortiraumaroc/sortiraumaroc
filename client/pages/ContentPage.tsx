import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Header } from "@/components/Header";
import { CmsBlocksRenderer } from "@/components/content/CmsBlocksRenderer";
import { Button } from "@/components/ui/button";
import { getPublicContentPage, type PublicContentPage } from "@/lib/content";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";
import { sanitizeRichTextHtml } from "@/lib/richText";
import { applySeo, clearJsonLd, setJsonLd, buildI18nSeoFields } from "@/lib/seo";

function resolveBrandSuffix(): string {
  return "Sortir Au Maroc";
}

type RelatedLink = { href: string; label: string };

function resolveRelatedLinks(raw: unknown, locale: string): RelatedLink[] {
  if (!Array.isArray(raw)) return [];

  const out: RelatedLink[] = [];

  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ href: item.trim(), label: item.trim() });
      continue;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;

    const hrefLocaleKey = locale === "en" ? "href_en" : "href_fr";
    const hrefRaw = rec[hrefLocaleKey] ?? rec.href ?? rec.url ?? rec.link;
    const href = typeof hrefRaw === "string" ? hrefRaw.trim() : "";
    if (!href) continue;

    const labelLocaleKey = locale === "en" ? "label_en" : "label_fr";
    const labelRaw = rec[labelLocaleKey] ?? rec.label ?? rec.title ?? rec.text;
    const label = typeof labelRaw === "string" ? labelRaw.trim() : href;

    out.push({ href, label: label || href });
  }

  return out;
}

export default function ContentPage() {
  const { slug } = useParams<{ slug: string }>();
  const { locale, t } = useI18n();
  const href = (path: string) => addLocalePrefix(path, locale);

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<PublicContentPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const effectiveSlug = String(slug ?? "").trim();
    if (!effectiveSlug) {
      setLoading(false);
      setFailed(true);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setFailed(false);

      try {
        const item = await getPublicContentPage({ slug: effectiveSlug, locale });
        if (cancelled) return;

        setPage(item);

        const seoTitle = String(item?.resolved?.seo_title ?? "").trim() || String(item?.resolved?.title ?? "").trim();
        const seoDescription = String(item?.resolved?.seo_description ?? "").trim();

        const canonicalUrl = String(item?.resolved?.canonical_url ?? "").trim();
        const robots = String(item?.resolved?.robots ?? "").trim();

        const ogTitle = String(item?.resolved?.og_title ?? "").trim();
        const ogDescription = String(item?.resolved?.og_description ?? "").trim();
        const ogImageUrl = String(item?.resolved?.og_image_url ?? "").trim();

        // Custom hreflangs from DB (override auto-generated if present)
        const customHreflangs: Record<string, string> = {};
        const canonicalFr = String((item as any)?.canonical_url_fr ?? "").trim();
        const canonicalEn = String((item as any)?.canonical_url_en ?? "").trim();
        if (canonicalFr) customHreflangs.fr = canonicalFr;
        if (canonicalEn) customHreflangs.en = canonicalEn;
        if (canonicalFr) customHreflangs["x-default"] = canonicalFr;
        const hasCustomHreflangs = Object.keys(customHreflangs).length > 0;

        const brand = resolveBrandSuffix();
        const finalTitle = seoTitle ? (seoTitle.includes(brand) ? seoTitle : `${seoTitle} — ${brand}`) : brand;

        applySeo({
          title: finalTitle,
          description: seoDescription || undefined,
          robots: robots || undefined,
          ogTitle: ogTitle || undefined,
          ogDescription: ogDescription || undefined,
          ogImageUrl: ogImageUrl || undefined,
          ...buildI18nSeoFields(locale),
          // DB overrides: custom canonical and hreflangs take priority
          ...(canonicalUrl ? { canonicalUrl } : {}),
          ...(hasCustomHreflangs ? { hreflangs: customHreflangs } : {}),
        });

        if (item?.resolved?.schema_jsonld) {
          setJsonLd("content-page", item.resolved.schema_jsonld);
        } else {
          clearJsonLd("content-page");
        }
      } catch {
        if (!cancelled) {
          setPage(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, locale]);

  useEffect(() => {
    if (!page?.resolved?.schema_jsonld) {
      clearJsonLd("content-page");
      return;
    }

    setJsonLd("content-page", page.resolved.schema_jsonld);
    return () => {
      clearJsonLd("content-page");
    };
  }, [page?.resolved?.schema_jsonld]);

  const blocks = useMemo(() => {
    const raw = page?.resolved?.blocks;
    return Array.isArray(raw) ? raw : [];
  }, [page]);

  const relatedLinks = useMemo(() => resolveRelatedLinks(page?.resolved?.related_links, locale), [page, locale]);

  const html = useMemo(() => {
    const raw = String(page?.resolved?.body_html ?? "");
    return sanitizeRichTextHtml(raw);
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="container mx-auto px-4 py-10">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-lg border-2 border-slate-200 bg-white p-6 md:p-8 text-slate-700">{t("common.loading")}</div>
          </div>
        </main>
      </div>
    );
  }

  if (failed || !page) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="container mx-auto px-4 py-10">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-lg border-2 border-slate-200 bg-white p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">{t("not_found.title")}</h1>
              <p className="mt-2 text-slate-700">{t("not_found.body")}</p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to={href("/")}>
                  <Button className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {t("not_found.back_home")}
                  </Button>
                </Link>
                <Link to={href("/results")}>
                  <Button variant="outline">{t("not_found.view_results")}</Button>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
            <div className="p-6 md:p-8 bg-primary/5 border-b border-slate-200">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">{page.resolved.title}</h1>
                  {page.resolved.page_subtitle ? (
                    <p className="mt-2 text-slate-700 max-w-3xl">{page.resolved.page_subtitle}</p>
                  ) : null}
                </div>
                <Link to={href("/results")} className="hidden sm:block">
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {t("common.back")}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="p-6 md:p-8">
              {blocks.length ? (
                <CmsBlocksRenderer blocks={blocks} />
              ) : (
                <div
                  className="text-slate-800 leading-relaxed
                    [&_p]:mb-4
                    [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3
                    [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
                    [&_ul]:my-4 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:ps-6
                    [&_li]:my-1
                    [&_a]:text-primary [&_a:hover]:underline
                    [&_strong]:font-bold"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}

              {relatedLinks.length ? (
                <div className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm font-extrabold text-slate-900">{t("content.related_links")}</div>
                  <ul className="mt-3 space-y-2">
                    {relatedLinks.map((link) => (
                      <li key={link.href}>
                        {link.href.startsWith("/") ? (
                          <Link to={href(link.href)} className="text-primary hover:underline font-medium">
                            {link.label}
                          </Link>
                        ) : (
                          <a href={link.href} className="text-primary hover:underline font-medium" target="_blank" rel="noreferrer">
                            {link.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-8 sm:hidden">
                <Link to={href("/results")}>
                  <Button variant="outline" className="w-full gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {t("common.back")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
