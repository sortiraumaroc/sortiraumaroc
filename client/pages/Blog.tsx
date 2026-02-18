import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ArrowRight, BookOpen, Calendar, LayoutGrid, List, Loader2, User } from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useI18n } from "@/lib/i18n";
import { applySeo, buildI18nSeoFields } from "@/lib/seo";
import { isPublicBlogListItemV2, listPublicBlogArticles, type PublicBlogListItem } from "@/lib/blog";

// Default blog hero settings
const DEFAULT_BLOG_HERO = {
  title: "Blog",
  subtitle: "Actualités, guides et conseils pour vos sorties au Maroc.",
  background_image_url: null as string | null,
  overlay_opacity: 0.7,
};

function formatDate(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function FeaturedArticleCard({ item, locale }: { item: PublicBlogListItem; locale: string }) {
  const title = isPublicBlogListItemV2(item) ? String(item.resolved.title || "").trim() : String(item.title || "").trim();
  const excerpt = isPublicBlogListItemV2(item)
    ? String(item.resolved.excerpt || "").trim()
    : String((item as any).short || (item as any).description_google || "").trim();

  const image = (() => {
    const mini = isPublicBlogListItemV2(item) ? String(item.miniature || "").trim() : String((item as any).miniature || "").trim();
    const img = isPublicBlogListItemV2(item) ? String(item.img || "").trim() : String((item as any).img || "").trim();
    return mini || img || null;
  })();

  const category = isPublicBlogListItemV2(item) ? String(item.category || "").trim() : "";
  const author = isPublicBlogListItemV2(item) ? String(item.author_name || "").trim() : "";
  const date = isPublicBlogListItemV2(item) ? item.published_at : null;

  return (
    <Link
      to={item.slug}
      className="group block rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-lg transition-all"
    >
      <div className="grid md:grid-cols-2 gap-0">
        <div className="aspect-[16/10] md:aspect-auto bg-slate-100 overflow-hidden">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <BookOpen className="h-16 w-16 text-primary/30" />
            </div>
          )}
        </div>

        <div className="flex flex-col p-6 md:p-8">
          {category && (
            <Badge variant="secondary" className="w-fit mb-3 text-xs">
              {category}
            </Badge>
          )}

          <h2 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight line-clamp-3 group-hover:text-primary transition-colors">
            {title || item.slug}
          </h2>

          {excerpt && (
            <p className="mt-3 text-slate-600 line-clamp-3 flex-1">{excerpt}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            {author && (
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {author}
              </span>
            )}
            {date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(date, locale)}
              </span>
            )}
          </div>

          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">
            <span>{locale === "en" ? "Read article" : "Lire l'article"}</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function ArticleCardList({ item, locale }: { item: PublicBlogListItem; locale: string }) {
  const title = isPublicBlogListItemV2(item) ? String(item.resolved.title || "").trim() : String(item.title || "").trim();
  const excerpt = isPublicBlogListItemV2(item)
    ? String(item.resolved.excerpt || "").trim()
    : String((item as any).short || (item as any).description_google || "").trim();

  const image = (() => {
    const mini = isPublicBlogListItemV2(item) ? String(item.miniature || "").trim() : String((item as any).miniature || "").trim();
    const img = isPublicBlogListItemV2(item) ? String(item.img || "").trim() : String((item as any).img || "").trim();
    return mini || img || null;
  })();

  const category = isPublicBlogListItemV2(item) ? String(item.category || "").trim() : "";
  const author = isPublicBlogListItemV2(item) ? String(item.author_name || "").trim() : "";
  const date = isPublicBlogListItemV2(item) ? item.published_at : null;

  return (
    <Link
      to={item.slug}
      className="group flex rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-md transition-all"
    >
      <div className="w-48 md:w-64 flex-shrink-0 bg-slate-100 overflow-hidden">
        {image ? (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <BookOpen className="h-10 w-10 text-primary/30" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3 mb-2">
          {category && (
            <Badge variant="secondary" className="text-xs">
              {category}
            </Badge>
          )}
          {date && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(date, locale)}
            </span>
          )}
        </div>

        <h3 className="font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {title || item.slug}
        </h3>

        {excerpt && (
          <p className="mt-2 text-sm text-slate-600 line-clamp-2 flex-1">{excerpt}</p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          {author && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {author}
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:gap-1.5 transition-all">
            {locale === "en" ? "Read article" : "Lire l'article"}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ArticleCard({ item, locale }: { item: PublicBlogListItem; locale: string }) {
  const title = isPublicBlogListItemV2(item) ? String(item.resolved.title || "").trim() : String(item.title || "").trim();
  const excerpt = isPublicBlogListItemV2(item)
    ? String(item.resolved.excerpt || "").trim()
    : String((item as any).short || (item as any).description_google || "").trim();

  const image = (() => {
    const mini = isPublicBlogListItemV2(item) ? String(item.miniature || "").trim() : String((item as any).miniature || "").trim();
    const img = isPublicBlogListItemV2(item) ? String(item.img || "").trim() : String((item as any).img || "").trim();
    return mini || img || null;
  })();

  const category = isPublicBlogListItemV2(item) ? String(item.category || "").trim() : "";
  const date = isPublicBlogListItemV2(item) ? item.published_at : null;

  return (
    <Link
      to={item.slug}
      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-md transition-all"
    >
      <div className="aspect-[16/9] bg-slate-100 overflow-hidden relative">
        {image ? (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <BookOpen className="h-10 w-10 text-primary/30" />
          </div>
        )}
        {category && (
          <Badge className="absolute top-3 start-3 bg-white/90 text-foreground text-xs backdrop-blur-sm">
            {category}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {title || item.slug}
        </h3>

        {excerpt && (
          <p className="mt-2 text-sm text-slate-600 line-clamp-2 flex-1">{excerpt}</p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          {date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(date, locale)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:gap-1.5 transition-all">
            {locale === "en" ? "Read" : "Lire"}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Blog() {
  const { t, locale } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PublicBlogListItem[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Blog hero settings (can be customized via admin)
  const [heroSettings, setHeroSettings] = useState(DEFAULT_BLOG_HERO);

  useEffect(() => {
    applySeo({
      title: `${heroSettings.title || t("blog.index.title")} — Sortir Au Maroc`,
      description: heroSettings.subtitle || t("blog.index.subtitle"),
      ogType: "website",
      ...buildI18nSeoFields(locale),
    });
  }, [t, locale, heroSettings]);

  // Load blog settings from localStorage (set via admin)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sam_blog_hero");
      if (stored) {
        const parsed = JSON.parse(stored);
        setHeroSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore
    }
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPublicBlogArticles({ locale, limit: 100 });
      setItems(res);
    } catch {
      setItems([]);
      setError(t("blog.index.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [locale]);

  const visible = useMemo(() => items.filter((it) => (isPublicBlogListItemV2(it) ? Boolean(it.is_published) : (it as any).active === 1)), [items]);

  const featured = visible[0] ?? null;
  const rest = visible.slice(1);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      {/* Hero Section - Same style as homepage */}
      <section className="relative text-white py-12 md:py-16">
        {/* Background: Image or Gradient */}
        {heroSettings.background_image_url ? (
          <>
            <img
              src={heroSettings.background_image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
              style={{ opacity: heroSettings.overlay_opacity ?? 0.7 }}
              aria-hidden="true"
            />
          </>
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-r from-primary to-[#6a000f]"
            aria-hidden="true"
          />
        )}

        {/* Content */}
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-start max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
              {heroSettings.title || t("blog.index.title")}
            </h1>
            <p className="text-lg text-white/90 max-w-2xl">
              {heroSettings.subtitle || t("blog.index.subtitle")}
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="max-w-xl mx-auto">
            <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
              <div className="text-red-800 font-medium">{error}</div>
              <Button variant="outline" onClick={() => void refresh()} className="mt-4">
                {t("common.retry")}
              </Button>
            </div>
          </div>
        ) : !visible.length ? (
          <div className="max-w-xl mx-auto">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
                <BookOpen className="h-8 w-8 text-slate-400" />
              </div>
              <div className="font-bold text-foreground text-lg">{t("blog.index.empty.title")}</div>
              <div className="mt-2 text-slate-600">{t("blog.index.empty.subtitle")}</div>
              <Link to="/" className="inline-block mt-6">
                <Button>{t("blog.index.back_home")}</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Featured Article */}
            {featured && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                    {locale === "en" ? "Featured" : "À la une"}
                  </h2>
                </div>
                <FeaturedArticleCard item={featured} locale={locale} />
              </section>
            )}

            {/* Rest of Articles */}
            {rest.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                      {locale === "en" ? "All articles" : "Tous les articles"}
                    </h2>
                    <span className="text-sm text-slate-500">
                      {visible.length} article{visible.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded-md transition-all ${
                        viewMode === "grid"
                          ? "bg-white text-primary shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      title={locale === "en" ? "Grid view" : "Vue colonnes"}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded-md transition-all ${
                        viewMode === "list"
                          ? "bg-white text-primary shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      title={locale === "en" ? "List view" : "Vue liste"}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rest.map((it) => (
                      <ArticleCard key={it.slug} item={it} locale={locale} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {rest.map((it) => (
                      <ArticleCardList key={it.slug} item={it} locale={locale} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Back home */}
            <div className="pt-6 border-t border-slate-200">
              <Link to="/" className="inline-flex">
                <Button variant="outline">{t("blog.index.back_home")}</Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
