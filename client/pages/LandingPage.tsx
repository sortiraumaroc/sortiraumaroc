// ============================================================================
// Landing Page SEO — /restaurants-casablanca, /sushi-tanger, etc.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronRight,
  Star,
  MapPin,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  List,
  X,
  BadgePercent,
  SlidersHorizontal,
} from "lucide-react";
import { Header } from "@/components/Header";
import { EstablishmentCard } from "@/components/results/EstablishmentCard";
import { EstablishmentCardSkeleton } from "@/components/results/EstablishmentCardSkeleton";
import { ResultsMap, type ResultsMapItem } from "@/components/results/ResultsMap";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import {
  applySeo,
  buildI18nSeoFields,
  setJsonLd,
  clearJsonLd,
  generateBreadcrumbSchema,
} from "@/lib/seo";
import {
  getPublicLanding,
  type LandingPageResponse,
} from "@/lib/landingApi";
import type { PublicEstablishmentListItem } from "@/lib/publicApi";
import { localizeLandingPage } from "../../shared/landingPageTypes";
import type { RelatedLanding } from "../../shared/landingPageTypes";
import { getFavorites, addFavorite, removeFavorite } from "@/lib/userData";
import { isAuthed, openAuthModal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Reserved paths — safety guard so the `:landingSlug` catch-all route never
// accidentally matches a real static route.
// ---------------------------------------------------------------------------
const RESERVED_PATHS = new Set([
  "results",
  "restaurant",
  "hotel",
  "hotel-booking",
  "booking",
  "profile",
  "mon-qr",
  "faq",
  "aide",
  "reset-password",
  "content",
  "privacy",
  "terms",
  "blog",
  "videos",
  "pro",
  "partner",
  "parrainage",
  "ajouter-mon-etablissement",
  "shopping",
  "loisir",
  "wellness",
  "culture",
  "packs",
  "wheel",
  "villes",
  "book",
  "quotes",
  "invoices",
  "media",
  "form",
  "review",
  "my-qr",
  "admin",
  "partners",
]);

// ---------------------------------------------------------------------------
// Universe label helpers
// ---------------------------------------------------------------------------
const UNIVERSE_LABELS_FR: Record<string, string> = {
  restaurant: "Restaurants",
  loisir: "Loisirs",
  wellness: "Bien-être",
  hebergement: "Hébergement",
  culture: "Culture",
};

function getUniverseLabel(universe: string): string {
  return UNIVERSE_LABELS_FR[universe] ?? universe;
}

// ---------------------------------------------------------------------------
// Fix Mojibake encoding: √© → é, √† → à, etc.
// This handles UTF-8 bytes that were misinterpreted as Latin-1/Windows-1252.
// ---------------------------------------------------------------------------
function fixMojibake(text: string): string {
  return text
    // √ + char patterns (Mac OS encoding corruption)
    .replace(/√©/g, "é").replace(/√®/g, "î").replace(/√¢/g, "â")
    .replace(/√†/g, "à").replace(/√π/g, "ù").replace(/√¥/g, "å")
    .replace(/√™/g, "ê").replace(/√´/g, "ô").replace(/√ª/g, "ë")
    .replace(/√ß/g, "ç").replace(/√Æ/g, "è").replace(/√º/g, "û")
    .replace(/√¶/g, "ö").replace(/√ü/g, "ü").replace(/√∫/g, "ú")
    .replace(/√¨/g, "è").replace(/√Ä/g, "à").replace(/√â/g, "â")
    .replace(/√¯/g, "ï").replace(/√Å/g, "É").replace(/√á/g, "á")
    // Ã + char patterns (classic UTF-8 → Latin-1 misread)
    .replace(/Ã©/g, "é").replace(/Ã¨/g, "è").replace(/Ã /g, "à")
    .replace(/Ã®/g, "î").replace(/Ã´/g, "ô").replace(/Ã¢/g, "â")
    .replace(/Ã§/g, "ç").replace(/Ã¹/g, "ù").replace(/Ã¼/g, "ü")
    .replace(/Ãª/g, "ê").replace(/Ã«/g, "ë").replace(/Ã¯/g, "ï")
    .replace(/Ã»/g, "û").replace(/Ã¶/g, "ö").replace(/Ã¤/g, "ä")
    // Smart quotes and dashes
    .replace(/â€™/g, "'").replace(/â€"/g, "–").replace(/â€"/g, "—")
    .replace(/â€œ/g, "\u201C").replace(/â€\u009D/g, "\u201D")
    // Non-breaking space artifacts
    .replace(/Â /g, " ").replace(/Â·/g, "\u00B7");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LandingPage() {
  const { landingSlug } = useParams<{ landingSlug: string }>();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const href = (path: string) => addLocalePrefix(path, locale);

  // Guard: if slug matches a reserved path, redirect to NotFound
  useEffect(() => {
    if (landingSlug && RESERVED_PATHS.has(landingSlug.split("/")[0] ?? "")) {
      navigate(href("/404"), { replace: true });
    }
  }, [landingSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Infinite Query — fetch landing page + paginated establishments
  // ---------------------------------------------------------------------------
  const {
    data: infiniteData,
    isLoading,
    isError,
    error: errorObj,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["landing", landingSlug],
    queryFn: async ({ pageParam }) => {
      return getPublicLanding(landingSlug!, {
        cursor: pageParam?.cursor ?? null,
        cursorScore: pageParam?.cursorScore ?? null,
        cursorDate: pageParam?.cursorDate ?? null,
        limit: 12,
      });
    },
    initialPageParam: null as {
      cursor: string;
      cursorScore: number | null;
      cursorDate: string | null;
    } | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.has_more || !lastPage.pagination?.next_cursor) {
        return undefined;
      }
      return {
        cursor: lastPage.pagination.next_cursor,
        cursorScore: lastPage.pagination.next_cursor_score ?? null,
        cursorDate: lastPage.pagination.next_cursor_date ?? null,
      };
    },
    enabled: !!landingSlug && !RESERVED_PATHS.has(landingSlug.split("/")[0] ?? ""),
    staleTime: 3 * 60_000, // 3 minutes
    retry: (failureCount, error) => {
      // Don't retry on 404
      if (error && typeof error === "object" && "status" in error && (error as any).status === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const firstPage = infiniteData?.pages[0];
  const landing = firstPage?.landing ?? null;
  const localized = useMemo(
    () => (landing ? localizeLandingPage(landing, locale) : null),
    [landing, locale],
  );
  const relatedLandings = firstPage?.related_landings ?? [];
  const totalCount = firstPage?.stats?.total_count ?? firstPage?.pagination?.total_count ?? null;

  const items = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  );

  // ---------------------------------------------------------------------------
  // 404 detection
  // ---------------------------------------------------------------------------
  const is404 = isError && errorObj && typeof errorObj === "object" && "status" in errorObj && (errorObj as any).status === 404;

  // ---------------------------------------------------------------------------
  // SEO text collapse (bottom of page)
  // ---------------------------------------------------------------------------
  const [seoTextExpanded, setSeoTextExpanded] = useState(false);

  // Fix Mojibake encoding on ALL localized text fields (DB data is corrupted)
  const fixedH1 = useMemo(() => (localized?.h1 ? fixMojibake(localized.h1) : ""), [localized?.h1]);
  const fixedCity = useMemo(() => (landing?.city ? fixMojibake(landing.city) : null), [landing?.city]);
  const fixedCuisineType = useMemo(() => (landing?.cuisine_type ? fixMojibake(landing.cuisine_type) : null), [landing?.cuisine_type]);
  const introText = useMemo(() => {
    if (!localized?.intro_text) return null;
    return fixMojibake(localized.intro_text);
  }, [localized?.intro_text]);

  // ---------------------------------------------------------------------------
  // Map state — same pattern as Results.tsx
  // ---------------------------------------------------------------------------
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [highlightedRestaurant, setHighlightedRestaurant] = useState<string | null>(null);
  const [mobileBottomCard, setMobileBottomCard] = useState<ResultsMapItem | null>(null);

  // ---------------------------------------------------------------------------
  // Client-side filters (quick filters: promotions, best rated)
  // ---------------------------------------------------------------------------
  const [filterPromo, setFilterPromo] = useState(false);
  const [filterBestRated, setFilterBestRated] = useState(false);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterPromo) {
      result = result.filter(
        (item) => typeof item.promo_percent === "number" && item.promo_percent > 0,
      );
    }
    if (filterBestRated) {
      result = [...result].sort((a, b) => {
        const ra = typeof a.google_rating === "number" ? a.google_rating : 0;
        const rb = typeof b.google_rating === "number" ? b.google_rating : 0;
        return rb - ra;
      });
    }
    return result;
  }, [items, filterPromo, filterBestRated]);

  const activeFilterCount = [filterPromo, filterBestRated].filter(Boolean).length;

  // ---------------------------------------------------------------------------
  // Map items — filter to items with valid coordinates
  // ---------------------------------------------------------------------------
  const mapItems = useMemo(
    () =>
      filteredItems
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .map((item) => {
          const name = (item.name ?? "Établissement").trim() || "Établissement";
          const category =
            item.subcategory && item.subcategory !== "general"
              ? item.subcategory.includes("/")
                ? item.subcategory.split("/").pop()?.trim()
                : item.subcategory
              : undefined;
          const promoPercent =
            typeof item.promo_percent === "number" && item.promo_percent > 0
              ? `${item.promo_percent}%`
              : null;
          return {
            id: item.id,
            name,
            lat: item.lat as number,
            lng: item.lng as number,
            rating: typeof item.google_rating === "number" ? item.google_rating : undefined,
            reviews: typeof item.google_review_count === "number" ? item.google_review_count : undefined,
            promotionLabel: promoPercent,
            detailPath: buildEstablishmentUrl({
              id: item.id,
              slug: item.slug,
              name: item.name,
              universe: landing?.universe ?? "restaurant",
            }),
            image: item.cover_url ?? undefined,
            nextSlot: item.next_slot_at ?? undefined,
            bookingEnabled: item.booking_enabled === true,
            category,
          } satisfies ResultsMapItem;
        }),
    [filteredItems, landing?.universe],
  );

  const hasMapItems = mapItems.length > 0;

  // ---------------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------------
  const [favIds, setFavIds] = useState<Set<string>>(() => {
    const favs = getFavorites();
    return new Set(favs.map((f) => f.id));
  });

  const handleToggleFavorite = useCallback((id: string, name: string, universe: string) => {
    if (!isAuthed()) {
      openAuthModal();
      return;
    }
    const kind: "restaurant" | "hotel" =
      universe === "hebergement" ? "hotel" : "restaurant";

    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        removeFavorite({ kind, id });
      } else {
        next.add(id);
        addFavorite({ kind, id, title: name, createdAtIso: new Date().toISOString() });
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // IntersectionObserver for infinite scroll on mobile
  // ---------------------------------------------------------------------------
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (!isMobile || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ---------------------------------------------------------------------------
  // Scroll to card when selecting from map
  // ---------------------------------------------------------------------------
  const scrollToCard = useCallback((id: string) => {
    const el = document.getElementById(`est-card-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // SEO — meta tags
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localized) return;

    applySeo({
      title: localized.title,
      description: localized.description,
      robots: landing?.robots ?? "index,follow",
      keywords: localized.keywords ?? undefined,
      ogImageUrl: landing?.og_image_url ?? undefined,
      ogType: "website",
      ...buildI18nSeoFields(locale as any),
    });
  }, [localized, landing, locale]);

  // ---------------------------------------------------------------------------
  // SEO — JSON-LD BreadcrumbList
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localized) return;

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://sam.ma";

    const breadcrumbItems: Array<{ name: string; url: string }> = [
      { name: "Accueil", url: `${baseUrl}/` },
    ];

    if (localized.universe) {
      breadcrumbItems.push({
        name: getUniverseLabel(localized.universe),
        url: `${baseUrl}/results?universe=${encodeURIComponent(localized.universe === "restaurant" ? "restaurants" : localized.universe)}`,
      });
    }

    if (localized.city) {
      breadcrumbItems.push({
        name: fixMojibake(localized.city),
        url: `${baseUrl}/${landingSlug}`,
      });
    } else {
      breadcrumbItems.push({
        name: fixMojibake(localized.h1),
        url: `${baseUrl}/${landingSlug}`,
      });
    }

    setJsonLd("breadcrumb", generateBreadcrumbSchema(breadcrumbItems));

    return () => {
      clearJsonLd("breadcrumb");
    };
  }, [localized, landingSlug]);

  // ---------------------------------------------------------------------------
  // SEO — JSON-LD ItemList (top 10 results)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (items.length === 0) return;

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://sam.ma";
    const top10 = items.slice(0, 10);

    const itemListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: top10.map((item, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${baseUrl}${buildEstablishmentUrl({
          id: item.id,
          slug: item.slug,
          name: item.name,
          universe: landing?.universe,
        })}`,
        name: item.name ?? "Établissement",
      })),
    };

    setJsonLd("itemlist", itemListSchema);

    return () => {
      clearJsonLd("itemlist");
    };
  }, [items, landing?.universe]);

  // ---------------------------------------------------------------------------
  // Helper: build establishment card props from API item
  // ---------------------------------------------------------------------------
  const getDetailsHref = useCallback(
    (item: PublicEstablishmentListItem) => {
      const path = buildEstablishmentUrl({
        id: item.id,
        slug: item.slug,
        name: item.name,
        universe: landing?.universe ?? "restaurant",
      });
      const qs = new URLSearchParams();
      if (item.name) qs.set("title", item.name);
      if (item.subcategory) qs.set("category", item.subcategory);
      const neighborhood = [item.neighborhood, item.city].filter(Boolean).join(", ");
      if (neighborhood) qs.set("neighborhood", neighborhood);
      if (fixedCity) qs.set("city", fixedCity);
      const query = qs.toString();
      return query ? `${path}?${query}` : path;
    },
    [landing, fixedCity],
  );

  const getActionLabel = useCallback(() => {
    switch (landing?.universe) {
      case "hebergement":
        return "Voir l'hôtel";
      case "culture":
      case "shopping":
        return "Voir";
      default:
        return "Réserver";
    }
  }, [landing?.universe]);

  // ---------------------------------------------------------------------------
  // Render: 404
  // ---------------------------------------------------------------------------
  if (is404) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="container mx-auto px-4 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-6xl font-bold text-primary mb-4">404</div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Page introuvable
            </h1>
            <p className="text-slate-600 text-lg mb-8">
              Cette page n'existe pas ou a été supprimée.
            </p>
            <div className="flex gap-4 justify-center">
              <Link to={href("/")}>
                <Button className="bg-primary hover:bg-primary/90 text-white">
                  Retour à l'accueil
                </Button>
              </Link>
              <Link to={href("/results")}>
                <Button variant="outline">Explorer</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb skeleton */}
          <div className="flex items-center gap-2 mb-4">
            <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
          </div>
          {/* H1 skeleton */}
          <div className="h-8 w-80 bg-slate-200 rounded animate-pulse mb-3" />
          {/* Stats skeleton */}
          <div className="h-5 w-64 bg-slate-100 rounded animate-pulse mb-4" />
          {/* Filter bar skeleton */}
          <div className="flex gap-2 mb-6">
            <div className="h-9 w-28 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-9 w-24 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-9 w-24 bg-slate-100 rounded-full animate-pulse" />
          </div>
          {/* Grid skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EstablishmentCardSkeleton count={6} />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error (non-404)
  // ---------------------------------------------------------------------------
  if (isError) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-lg text-slate-600 mb-4">
            Une erreur est survenue lors du chargement de cette page.
          </p>
          <Button onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!localized || !landing) return null;

  // ---------------------------------------------------------------------------
  // Render: Main content
  // Page order: Header → Breadcrumb → H1 → Counter → Filter pills → Results
  //             → SEO text (bottom) → Related landings → Footer
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="container mx-auto px-4 py-4 md:py-6">
        {/* ── 1. Breadcrumb ───────────────────────────────────────── */}
        <nav
          aria-label="Fil d'Ariane"
          className="flex items-center gap-1.5 text-sm text-slate-500 mb-3 overflow-x-auto whitespace-nowrap"
        >
          <Link
            to={href("/")}
            className="hover:text-primary transition-colors shrink-0"
          >
            Accueil
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <Link
            to={href(`/results?universe=${encodeURIComponent(landing.universe === "restaurant" ? "restaurants" : landing.universe)}`)}
            className="hover:text-primary transition-colors shrink-0"
          >
            {getUniverseLabel(landing.universe)}
          </Link>
          {fixedCity && (
            <>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span className="text-slate-700 font-medium shrink-0">
                {fixedCity}
              </span>
            </>
          )}
          {fixedCuisineType && (
            <>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span className="text-slate-700 font-medium shrink-0">
                {fixedCuisineType}
              </span>
            </>
          )}
        </nav>

        {/* ── 2. H1 ───────────────────────────────────────────────── */}
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2">
          {fixedH1}
        </h1>

        {/* ── 3. Counter ──────────────────────────────────────────── */}
        {totalCount != null && totalCount > 0 && (
          <p className="text-sm text-slate-500 mb-4">
            <strong className="text-foreground">{totalCount}</strong>
            {" "}
            {getUniverseLabel(landing.universe).toLowerCase()}
            {fixedCity ? ` à ${fixedCity}` : " au Maroc"}
          </p>
        )}

      </main>

        {/* ── 4. Filter pill bar (sticky, full-width) ──────────── */}
        <div className="sticky top-16 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 py-2.5 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {/* Promotions */}
          <button
            onClick={() => setFilterPromo((v) => !v)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
              filterPromo
                ? "bg-primary/10 border-primary text-primary"
                : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
            )}
          >
            <BadgePercent className="w-4 h-4" />
            Promotions
          </button>

          {/* Best rated */}
          <button
            onClick={() => setFilterBestRated((v) => !v)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
              filterBestRated
                ? "bg-primary/10 border-primary text-primary"
                : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
            )}
          >
            <Star className="w-4 h-4" />
            Mieux notés
          </button>

          {/* Reset filters (shown when filters active) */}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterPromo(false); setFilterBestRated(false); }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-primary hover:text-primary/80 whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              Effacer
            </button>
          )}

          {/* Spacer to push map toggle to right */}
          <div className="flex-1" />

          {/* Mobile map toggle button */}
          {hasMapItems && (
            <button
              onClick={() => setMobileView(mobileView === "map" ? "list" : "map")}
              className={cn(
                "md:hidden flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border transition-colors",
                mobileView === "map"
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-white border-slate-200 text-slate-500"
              )}
              aria-label={mobileView === "map" ? "Voir la liste" : "Voir la carte"}
            >
              {mobileView === "map" ? <List className="w-4.5 h-4.5" /> : <MapIcon className="w-4.5 h-4.5" />}
            </button>
          )}
        </div>
        </div>
        </div>

      <div className="container mx-auto px-4 pb-4 md:pb-6">
        {/* ── 5. Results: split view (list + map) ─────────────────── */}
        {filteredItems.length === 0 && !isLoading ? (
          <div className="text-center py-16 px-4">
            {activeFilterCount > 0 ? (
              <>
                <SlidersHorizontal className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-lg text-slate-500 mb-2">Aucun résultat avec ces filtres</p>
                <button
                  onClick={() => { setFilterPromo(false); setFilterBestRated(false); }}
                  className="mt-2 text-sm font-medium text-primary hover:text-primary/80"
                >
                  Réinitialiser les filtres
                </button>
              </>
            ) : (
              <>
                <p className="text-lg text-slate-500 mb-2">Aucun résultat pour le moment</p>
                <p className="text-sm text-slate-400">
                  Revenez bientôt, de nouveaux établissements sont ajoutés régulièrement.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className={cn(
            "grid gap-6 items-start",
            hasMapItems ? "grid-cols-1 md:grid-cols-12" : "grid-cols-1",
          )}>
            {/* ── List column ─────────────────────────────────────── */}
            <div className={cn(
              hasMapItems ? "md:col-span-7" : "",
              mobileView === "map" ? "hidden md:block" : "block",
            )}>
              {/* Filter count on desktop */}
              {activeFilterCount > 0 && (
                <p className="text-sm text-slate-500 mb-3">
                  <strong className="text-foreground">{filteredItems.length}</strong> résultats filtrés
                </p>
              )}

              <div className={cn(
                "grid gap-4",
                hasMapItems
                  ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}>
                {filteredItems.map((item) => {
                  const name = (item.name ?? "Établissement").trim() || "Établissement";
                  const neighborhood = [item.neighborhood, item.city]
                    .filter(Boolean)
                    .join(", ");
                  const category =
                    item.subcategory && item.subcategory !== "general"
                      ? item.subcategory.includes("/")
                        ? item.subcategory.split("/").pop()?.trim()
                        : item.subcategory
                      : undefined;

                  const promoPercent =
                    typeof item.promo_percent === "number" && item.promo_percent > 0
                      ? item.promo_percent
                      : undefined;

                  return (
                    <div key={item.id} id={`est-card-${item.id}`}>
                      <EstablishmentCard
                        id={item.id}
                        name={name}
                        image={item.cover_url ?? "/placeholder.svg"}
                        neighborhood={neighborhood || undefined}
                        category={category}
                        rating={
                          typeof item.google_rating === "number"
                            ? item.google_rating
                            : undefined
                        }
                        reviews={
                          typeof item.google_review_count === "number"
                            ? item.google_review_count
                            : undefined
                        }
                        bookingEnabled={item.booking_enabled === true}
                        nextSlot={item.next_slot_at ?? null}
                        slotDiscount={
                          typeof item.promo_percent === "number"
                            ? item.promo_percent
                            : null
                        }
                        promoPercent={promoPercent}
                        isVerified={item.verified === true}
                        isPremium={item.premium === true}
                        isCurated={item.curated === true}
                        isSelected={selectedRestaurant === item.id}
                        isHighlighted={highlightedRestaurant === item.id}
                        isFavorite={favIds.has(item.id)}
                        onFavoriteToggle={() =>
                          handleToggleFavorite(
                            item.id,
                            name,
                            landing.universe,
                          )
                        }
                        onSelect={() => setSelectedRestaurant(item.id)}
                        onHover={(hovering) => setHighlightedRestaurant(hovering ? item.id : null)}
                        detailsHref={getDetailsHref(item)}
                        actionLabel={getActionLabel()}
                        universe={landing.universe}
                        hideActionButton
                      />
                    </div>
                  );
                })}

                {isFetchingNextPage && <EstablishmentCardSkeleton count={3} />}
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={loadMoreRef} className="h-1" aria-hidden />

              {/* Load more button */}
              {hasNextPage && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-6"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                  >
                    {isFetchingNextPage && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    Charger plus
                    {totalCount != null && totalCount > items.length && (
                      <span className="ml-1 text-slate-400 font-normal">
                        ({totalCount - items.length})
                      </span>
                    )}
                  </Button>
                  {totalCount != null && (
                    <p className="text-xs text-slate-400">
                      {items.length} sur {totalCount}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Map column ──────────────────────────────────────── */}
            {hasMapItems && (
              <div
                className={cn(
                  "md:col-span-5 self-start",
                  mobileView === "map" ? "block" : "hidden md:block",
                  "h-[calc(100dvh-13rem)]",
                  "md:sticky md:top-[5rem]",
                  "relative z-10 overflow-hidden rounded-xl",
                )}
              >
                <ResultsMap
                  items={mapItems}
                  selectedId={selectedRestaurant}
                  highlightedId={highlightedRestaurant}
                  userLocation={null}
                  onRequestUserLocation={() => {}}
                  onSelect={(id) => setSelectedRestaurant(id)}
                  onMarkerNavigateToCard={(id) => {
                    setSelectedRestaurant(id);
                    setHighlightedRestaurant(id);
                    setMobileView("list");
                    scrollToCard(id);
                  }}
                  onMarkerHover={(id) => setHighlightedRestaurant(id)}
                  geoStatus="idle"
                  cityName={fixedCity ?? null}
                  isMobile={mobileView === "map"}
                  onMobileMarkerTap={(item) => setMobileBottomCard(item)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Mobile bottom card — shown when tapping a marker on mobile map ── */}
        {mobileBottomCard && mobileView === "map" && (
          <div className="fixed bottom-0 inset-x-0 z-[600] md:hidden">
            <div className="bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 p-4 pb-6 animate-in slide-in-from-bottom duration-300">
              {/* Drag handle */}
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-3" />
              {/* Close button */}
              <button
                onClick={() => setMobileBottomCard(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
                aria-label="Fermer"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
              <div className="flex gap-3">
                {/* Image */}
                <img
                  src={mobileBottomCard.image || "/Logo_SAM_Megaphone_Blanc.png"}
                  alt={mobileBottomCard.name}
                  className="w-24 h-20 rounded-xl object-cover flex-shrink-0 bg-slate-100"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground text-sm truncate">
                    {mobileBottomCard.name}
                  </h3>
                  {mobileBottomCard.category && (
                    <p className="text-xs text-slate-500 truncate">{mobileBottomCard.category}</p>
                  )}
                  {typeof mobileBottomCard.rating === "number" && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-xs font-medium">{mobileBottomCard.rating.toFixed(1)}</span>
                    </div>
                  )}
                  {mobileBottomCard.promotionLabel && (
                    <span className="inline-block mt-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      -{mobileBottomCard.promotionLabel}
                    </span>
                  )}
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <Link
                  to={mobileBottomCard.detailPath || "#"}
                  className="flex-1"
                  onClick={() => setMobileBottomCard(null)}
                >
                  <Button className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-sm">
                    Voir les détails
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── 6. SEO text (bottom, collapsible) ───────────────────── */}
        {introText && (
          <section className="mt-12 md:mt-16 pt-8 border-t border-slate-200">
            <div>
              <div className="relative">
                <div
                  className={cn(
                    "text-slate-600 text-sm md:text-base leading-relaxed",
                    !seoTextExpanded && "max-h-[3.5em] overflow-hidden",
                  )}
                >
                  {introText}
                </div>
                {/* Gradient fade overlay when collapsed */}
                {!seoTextExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                )}
              </div>
              <button
                type="button"
                className="mt-2 text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                onClick={() => setSeoTextExpanded((v) => !v)}
              >
                {seoTextExpanded ? (
                  <>
                    Réduire <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Lire plus <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        {/* ── 7. Related landing pages (footer SEO links) ─────────── */}
        {relatedLandings.length > 0 && (() => {
          // Split related landings into cuisine-type links vs other-city links
          const currentCity = fixedCity?.toLowerCase().trim() ?? "";
          const cuisineLinks = relatedLandings.filter(
            (rl) => rl.cuisine_type && rl.city?.toLowerCase().trim() === currentCity,
          );
          const cityLinks = relatedLandings.filter(
            (rl) => !rl.cuisine_type || rl.city?.toLowerCase().trim() !== currentCity,
          );

          // Helper to get the display label for a related landing (prefer h1 over title)
          const getLabel = (rl: RelatedLanding) => {
            const raw = locale === "en" && rl.h1_en
              ? rl.h1_en
              : rl.h1_fr
                ? rl.h1_fr
                : locale === "en" && rl.title_en
                  ? rl.title_en
                  : rl.title_fr;
            return fixMojibake(raw);
          };

          const linkClass = "block rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:border-primary hover:text-primary transition-colors hover:bg-primary/5";

          return (
            <section className={cn(
              "pt-8 border-t border-slate-200",
              introText ? "mt-8 md:mt-10" : "mt-12 md:mt-16",
            )}>
              {/* Group 1: By cuisine type */}
              {cuisineLinks.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg md:text-xl font-semibold text-foreground mb-4">
                    {fixedCity
                      ? `Par type de cuisine à ${fixedCity}`
                      : "Par type de cuisine"}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {cuisineLinks.map((rl) => (
                      <Link key={rl.slug} to={href(`/${rl.slug}`)} className={linkClass}>
                        {getLabel(rl)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Group 2: Other cities */}
              {cityLinks.length > 0 && (
                <div>
                  <h2 className="text-lg md:text-xl font-semibold text-foreground mb-4">
                    Dans d'autres villes
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {cityLinks.map((rl) => (
                      <Link key={rl.slug} to={href(`/${rl.slug}`)} className={linkClass}>
                        {getLabel(rl)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })()}
      </div>
    </div>
  );
}
