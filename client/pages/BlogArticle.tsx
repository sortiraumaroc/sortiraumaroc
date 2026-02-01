import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Header } from "@/components/Header";
import { CmsBlocksRenderer } from "@/components/content/CmsBlocksRenderer";
import { Button } from "@/components/ui/button";
import {
  getPublicBlogArticleBySlug,
  isPublicBlogArticleV2,
  isPublicBlogListItemV2,
  listPublicBlogRelatedArticles,
  markPublicBlogArticleRead,
  type PublicBlogArticle,
  type PublicBlogListItem,
} from "@/lib/blog";
import { useI18n } from "@/lib/i18n";
import { sanitizeRichTextHtml, stripHtmlToText } from "@/lib/richText";
import { applySeo } from "@/lib/seo";

export default function BlogArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<PublicBlogArticle | null>(null);

  const [related, setRelated] = useState<PublicBlogListItem[]>([]);

  useEffect(() => {
    const s = String(slug || "").trim();
    if (!s) {
      setLoading(false);
      setItem(null);
      setError("Article introuvable.");
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await getPublicBlogArticleBySlug({ slug: s, locale });
        if (cancelled) return;

        setItem(res);
        if (!res) {
          setError("Article introuvable.");
          return;
        }

        const titleCandidate = isPublicBlogArticleV2(res)
          ? String(res.resolved.meta_title || "").trim() || String(res.resolved.title || "").trim()
          : String(res.title || "").trim();

        const desc = isPublicBlogArticleV2(res)
          ? String(res.resolved.meta_description || "").trim()
          : String((res as any).description_google || "").trim();

        applySeo({
          title: titleCandidate ? `${titleCandidate} — Sortir Au Maroc` : "Sortir Au Maroc",
          description: desc || undefined,
          ogType: "article",
        });
      } catch {
        if (!cancelled) {
          setItem(null);
          setError("Impossible de charger l’article.");
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
    const s = String(slug || "").trim();
    if (!s) return;
    if (!item || !isPublicBlogArticleV2(item)) return;

    // Anti-spam: 1 view per browser session per article.
    const key = `sam_blog_read:${s}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, new Date().toISOString());
    } catch {
      // ignore
    }

    void markPublicBlogArticleRead({ slug: s })
      .then((r) => {
        if (typeof r.read_count !== "number") return;
        setItem((prev) => {
          if (!prev || !isPublicBlogArticleV2(prev)) return prev;
          return { ...prev, read_count: r.read_count };
        });
      })
      .catch(() => {
        // ignore
      });
  }, [item, slug]);

  useEffect(() => {
    const s = String(slug || "").trim();
    if (!s) return;
    if (!item || !isPublicBlogArticleV2(item)) {
      setRelated([]);
      return;
    }

    let cancelled = false;

    void listPublicBlogRelatedArticles({ slug: s, locale, limit: 6 })
      .then((items) => {
        if (cancelled) return;
        setRelated(items);
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      });

    return () => {
      cancelled = true;
    };
  }, [item, slug, locale]);

  const blocks = useMemo(() => {
    if (!item || !isPublicBlogArticleV2(item)) return [];
    const raw = item.resolved.blocks;
    return Array.isArray(raw) ? raw : [];
  }, [item]);

  const html = useMemo(() => {
    if (item && isPublicBlogArticleV2(item)) {
      return sanitizeRichTextHtml(String(item.resolved.body_html ?? ""));
    }
    return sanitizeRichTextHtml(String((item as any)?.content ?? ""));
  }, [item]);

  const readingTimeMinutes = useMemo(() => {
    const wpm = 220;

    let text = "";
    if (blocks.length) {
      const parts: string[] = [];
      for (const blk of blocks as Array<{ type: string; data: unknown }>) {
        const data = (blk as any)?.data;
        if (!data || typeof data !== "object") continue;

        const rec = data as Record<string, unknown>;
        const htmlCandidate = typeof rec.html === "string" ? rec.html : null;
        if (htmlCandidate) {
          parts.push(stripHtmlToText(htmlCandidate));
          continue;
        }

        for (const key of ["title", "heading", "subtitle", "text", "body", "content"]) {
          const v = rec[key];
          if (typeof v === "string" && v.trim()) parts.push(v.trim());
        }
      }
      text = parts.join(" ");
    } else {
      text = stripHtmlToText(html);
    }

    const words = text
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean).length;

    if (!words) return null;
    return Math.max(1, Math.round(words / wpm));
  }, [blocks, html]);

  const readCount = useMemo(() => {
    if (!item || !isPublicBlogArticleV2(item)) return null;
    if (item.show_read_count !== true) return null;
    const n = typeof item.read_count === "number" && Number.isFinite(item.read_count) ? Math.max(0, Math.floor(item.read_count)) : 0;
    return n;
  }, [item]);

  const relatedVisible = useMemo(() => {
    const currentSlug = String(slug || "").trim();
    return related
      .filter((it) => (isPublicBlogListItemV2(it) ? Boolean(it.is_published) : (it as any).active === 1))
      .filter((it) => !currentSlug || it.slug !== currentSlug)
      .slice(0, 6);
  }, [related, slug]);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
            <div className="p-6 md:p-8 bg-primary/5 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-600">Blog</div>
                  <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-foreground">
                    {(() => {
                      if (item && isPublicBlogArticleV2(item)) return item.resolved.title || "Article";
                      return item?.title ?? "Article";
                    })()}
                  </h1>
                  {(() => {
                    if (item && isPublicBlogArticleV2(item)) {
                      const excerpt = String(item.resolved.excerpt || "").trim();
                      return excerpt ? <div className="mt-2 text-slate-700">{excerpt}</div> : null;
                    }
                    const desc = String((item as any)?.description_google || "").trim();
                    return desc ? <div className="mt-2 text-slate-700">{desc}</div> : null;
                  })()}

                  {item && isPublicBlogArticleV2(item) ? (
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                      {String(item.category ?? "").trim() ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-slate-700">
                          {String(item.category).replace(/-/g, " ")}
                        </span>
                      ) : null}
                      {readingTimeMinutes ? <span>{readingTimeMinutes} min de lecture</span> : null}
                      {readCount !== null ? <span>{readCount} lectures</span> : null}
                    </div>
                  ) : null}
                </div>

                <Link to="/" className="hidden sm:block">
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Retour
                  </Button>
                </Link>
              </div>
            </div>

            <div className="p-6 md:p-8">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-700">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
              ) : !item ? (
                <div className="text-sm text-slate-600">Article introuvable.</div>
              ) : blocks.length ? (
                <CmsBlocksRenderer blocks={blocks} blogSlug={slug} />
              ) : (
                <div
                  className="text-slate-800 leading-relaxed
                    [&_p]:mb-4
                    [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3
                    [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
                    [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6
                    [&_li]:my-1
                    [&_a]:text-primary [&_a:hover]:underline
                    [&_strong]:font-bold"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}

              {!loading && !error && relatedVisible.length ? (
                <div className="mt-10 border-t border-slate-200 pt-8">
                  <div className="text-sm font-extrabold text-foreground">Articles liés</div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {relatedVisible.map((it) => {
                      const title = isPublicBlogListItemV2(it)
                        ? String(it.resolved.title || "").trim()
                        : String((it as any).title || "").trim();
                      const excerpt = isPublicBlogListItemV2(it)
                        ? String(it.resolved.excerpt || "").trim()
                        : String((it as any).short || (it as any).description_google || "").trim();

                      const image = (() => {
                        const mini = isPublicBlogListItemV2(it) ? String(it.miniature || "").trim() : String((it as any).miniature || "").trim();
                        const img = isPublicBlogListItemV2(it) ? String(it.img || "").trim() : String((it as any).img || "").trim();
                        return mini || img || null;
                      })();

                      return (
                        <Link
                          key={it.slug}
                          to={`/blog/${encodeURIComponent(it.slug)}`}
                          className={
                            "group flex h-full flex-col rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition"
                          }
                        >
                          <div className="aspect-[16/9] bg-slate-100 overflow-hidden">
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-200" />
                            )}
                          </div>

                          <div className="flex flex-1 flex-col p-4">
                            <div className="font-extrabold text-foreground leading-snug line-clamp-2">{title || it.slug}</div>

                            <div className="mt-2 flex-1">
                              {excerpt ? <div className="text-sm text-slate-600 line-clamp-3">{excerpt}</div> : null}
                            </div>

                            <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                              <span>Lire</span>
                              <span aria-hidden>→</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 sm:hidden">
                <Link to="/">
                  <Button variant="outline" className="w-full gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Retour
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
