import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { ArrowLeft, ArrowRight, ExternalLink, Loader2 } from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  getPublicBlogAuthorBySlug,
  isPublicBlogListItemV2,
  type PublicBlogAuthor,
  type PublicBlogListItem,
} from "@/lib/blog";
import { useI18n } from "@/lib/i18n";
import { applySeo, clearJsonLd, setJsonLd, buildI18nSeoFields } from "@/lib/seo";

function ArticleCard({ item, to }: { item: PublicBlogListItem; to: string }) {
  const title = isPublicBlogListItemV2(item) ? String(item.resolved.title || "").trim() : String(item.title || "").trim();
  const excerpt = isPublicBlogListItemV2(item)
    ? String(item.resolved.excerpt || "").trim()
    : String((item as any).short || (item as any).description_google || "").trim();

  const image = (() => {
    const mini = isPublicBlogListItemV2(item) ? String(item.miniature || "").trim() : String((item as any).miniature || "").trim();
    const img = isPublicBlogListItemV2(item) ? String(item.img || "").trim() : String((item as any).img || "").trim();
    return mini || img || null;
  })();

  return (
    <Link
      to={to}
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
        <div className="font-extrabold text-foreground leading-snug line-clamp-2">{title || item.slug}</div>

        <div className="mt-2 flex-1">
          {excerpt ? <div className="text-sm text-slate-600 line-clamp-3">{excerpt}</div> : null}
        </div>

        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <span>Lire</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function roleLabel(role: string): string {
  const r = String(role || "").trim().toLowerCase();
  if (r === "sam") return "Sortir Au Maroc";
  if (r === "team") return "Équipe";
  if (r === "guest") return "Auteur invité";
  if (r === "editor") return "Rédaction";
  return "";
}

function safeAbsoluteUrl(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function BlogAuthor() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const prefix = locale === "en" ? "/en" : "";

  const page = useMemo(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.floor(raw));
  }, [searchParams]);

  const limit = 12;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useState<PublicBlogAuthor | null>(null);
  const [items, setItems] = useState<PublicBlogListItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const s = String(slug || "").trim();
    if (!s) {
      setLoading(false);
      setAuthor(null);
      setItems([]);
      setTotal(0);
      setError("Auteur introuvable.");
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await getPublicBlogAuthorBySlug({ slug: s, locale, page, limit });
        if (cancelled) return;

        if (!res) {
          setAuthor(null);
          setItems([]);
          setTotal(0);
          setError("Auteur introuvable.");
          return;
        }

        setAuthor(res.author);
        setItems(res.items);
        setTotal(typeof res.total === "number" ? res.total : 0);
      } catch {
        if (cancelled) return;
        setAuthor(null);
        setItems([]);
        setTotal(0);
        setError("Impossible de charger l’auteur.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, locale, page]);

  const pageCount = useMemo(() => {
    if (!Number.isFinite(total) || total <= 0) return 1;
    return Math.max(1, Math.ceil(total / limit));
  }, [total]);

  const visible = useMemo(
    () => items.filter((it) => (isPublicBlogListItemV2(it) ? Boolean(it.is_published) : (it as any).active === 1)),
    [items],
  );

  useEffect(() => {
    if (!author) {
      clearJsonLd("blog-author");
      return;
    }

    const displayName = String(author.display_name || "").trim();
    const desc = String(author.bio_short || "").trim();

    applySeo({
      title: displayName ? `${displayName} — Auteur — Sortir Au Maroc` : "Auteur — Sortir Au Maroc",
      description: desc || undefined,
      ogType: "profile",
      ...buildI18nSeoFields(locale),
    });

    const canonical = (() => {
      if (typeof window === "undefined") return "";
      const url = new URL(window.location.href);
      url.hash = "";
      url.search = "";
      return url.toString();
    })();

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const personId = canonical ? `${canonical}#person` : "#person";

    const articles = visible
      .filter(isPublicBlogListItemV2)
      .map((it) => {
        const articleUrl = origin ? `${origin}${prefix}/blog/${encodeURIComponent(it.slug)}` : `${prefix}/blog/${it.slug}`;
        const publishedAt = it.published_at ? String(it.published_at) : null;

        return {
          "@type": "Article",
          "@id": `${articleUrl}#article`,
          mainEntityOfPage: articleUrl,
          headline: String(it.resolved.title || it.title || "").trim(),
          datePublished: publishedAt || undefined,
          author: { "@id": personId },
        };
      })
      .filter((a) => Boolean(a.headline));

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Person",
          "@id": personId,
          name: displayName || undefined,
          url: canonical || undefined,
          description: desc || undefined,
          image: author.avatar_url || undefined,
          sameAs: [safeAbsoluteUrl(author.profile_url ?? "")].filter(Boolean),
        },
        ...articles,
      ],
    };

    setJsonLd("blog-author", jsonLd);

    return () => {
      clearJsonLd("blog-author");
    };
  }, [author, visible, prefix]);

  const onPageChange = (nextPage: number) => {
    const p = Math.max(1, Math.min(pageCount, Math.floor(nextPage)));
    const next = new URLSearchParams(searchParams);

    if (p <= 1) next.delete("page");
    else next.set("page", String(p));

    setSearchParams(next, { replace: true });
  };

  const authorLabel = author ? roleLabel(author.role) : "";

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
                  <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-foreground">{author?.display_name || "Auteur"}</h1>
                  {authorLabel ? <div className="mt-2 text-sm font-semibold text-slate-700">{authorLabel}</div> : null}
                </div>

                <Link to={`${prefix}/blog`} className="hidden sm:block">
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Retour au blog
                  </Button>
                </Link>
              </div>

              {author ? (
                <div className="mt-6 flex flex-col sm:flex-row gap-4 sm:items-center">
                  <div className="h-16 w-16 shrink-0 rounded-full bg-slate-200 overflow-hidden">
                    {author.avatar_url ? (
                      <img src={author.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-slate-200 to-slate-300" />
                    )}
                  </div>

                  <div className="flex-1">
                    {author.bio_short ? <div className="text-slate-700 leading-relaxed">{author.bio_short}</div> : null}

                    {author.profile_url ? (
                      <div className="mt-3">
                        <a href={author.profile_url} target="_blank" rel="noreferrer">
                          <Button variant="outline" className="gap-2">
                            Profil
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-6 md:p-8">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-700">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
              ) : !visible.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-700">
                  <div className="font-bold text-foreground">Aucun article</div>
                  <div className="mt-1">Cet auteur n’a pas encore publié d’articles.</div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-slate-600">
                      {total > 0 ? (
                        <span>
                          {total} article{total > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </div>

                    {pageCount > 1 ? (
                      <div className="text-sm font-semibold text-slate-700">
                        Page {page} / {pageCount}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map((it) => (
                      <ArticleCard key={it.slug} item={it} to={`${prefix}/blog/${it.slug}`} />
                    ))}
                  </div>

                  {pageCount > 1 ? (
                    <div className="mt-8 flex items-center justify-between gap-3">
                      <Button variant="outline" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
                        Précédent
                      </Button>

                      <Button variant="outline" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
                        Suivant
                      </Button>
                    </div>
                  ) : null}
                </>
              )}

              <div className="mt-8">
                <Link to={`${prefix}/blog`} className="inline-flex">
                  <Button variant="outline">Retour au blog</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
