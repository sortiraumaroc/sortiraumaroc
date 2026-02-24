/**
 * Page /ramadan-offers — Listing filtrable des offres Ramadan
 *
 * Filtres : type d'offre, ville, fourchette de prix
 * Tri : populaires, nouveautés, prix
 * Pagination
 * Thème : "Mille et Une Nuits" (dark navy + gold)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Moon,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
} from "lucide-react";

import { Header } from "@/components/Header";
import { RamadanOfferCard } from "@/components/ramadan/RamadanOfferCard";
import { RamadanStarryBackground } from "@/components/ramadan/RamadanStarryBackground";
import { CrescentMoonSvg } from "@/components/ramadan/ramadan-assets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listPublicRamadanOffers } from "@/lib/ramadanApi";
import type { RamadanOfferWithEstablishment } from "@/lib/ramadanApi";
import type { RamadanOfferType } from "../../shared/ramadanTypes";

// =============================================================================
// Constants
// =============================================================================

const SORT_OPTIONS = [
  { id: "featured", label: "Populaires" },
  { id: "newest", label: "Nouveautés" },
  { id: "price_asc", label: "Prix croissant" },
  { id: "price_desc", label: "Prix décroissant" },
] as const;

const TYPE_FILTERS: { id: RamadanOfferType | "all"; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "ftour", label: "Ftour" },
  { id: "shour", label: "S'hour" },
  { id: "traiteur", label: "Traiteur" },
  { id: "pack_famille", label: "Pack Famille" },
  { id: "special", label: "Spécial Ramadan" },
];

const CITY_OPTIONS = [
  "Casablanca",
  "Marrakech",
  "Rabat",
  "Tanger",
  "Fes",
  "Agadir",
  "Meknes",
  "Oujda",
  "Kenitra",
  "Mohammedia",
];

const PER_PAGE = 12;

// =============================================================================
// Page
// =============================================================================

export default function RamadanOffers() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Data
  const [offers, setOffers] = useState<RamadanOfferWithEstablishment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from URL
  const [activeType, setActiveType] = useState<RamadanOfferType | "all">(
    (searchParams.get("type") as RamadanOfferType) || "all",
  );
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("min_price") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max_price") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "featured");
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Derived
  const totalPages = Math.ceil(total / PER_PAGE);
  const hasFilters = !!(
    (activeType !== "all") ||
    city ||
    minPrice ||
    maxPrice
  );

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Parameters<typeof listPublicRamadanOffers>[0] = {
        sort: sort as "featured" | "price_asc" | "price_desc" | "newest",
        page,
        per_page: PER_PAGE,
      };
      if (activeType !== "all") filters.type = activeType;
      if (city) filters.city = city;
      if (minPrice) filters.min_price = Number(minPrice) * 100; // centimes
      if (maxPrice) filters.max_price = Number(maxPrice) * 100;

      const res = await listPublicRamadanOffers(filters);
      setOffers(res.offers);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [sort, page, activeType, city, minPrice, maxPrice]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // ---------------------------------------------------------------------------
  // Sync filters → URL
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeType !== "all") params.set("type", activeType);
    if (city) params.set("city", city);
    if (minPrice) params.set("min_price", minPrice);
    if (maxPrice) params.set("max_price", maxPrice);
    if (sort && sort !== "featured") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    setSearchParams(params, { replace: true });
  }, [activeType, city, minPrice, maxPrice, sort, page, setSearchParams]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const clearFilters = () => {
    setActiveType("all");
    setCity("");
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
  };

  // Map offers to RamadanOfferCard data shape
  const cardOffers = useMemo(
    () =>
      offers.map((offer) => ({
        ...offer,
        establishment: offer.establishments
          ? {
              id: offer.establishments.id,
              name: offer.establishments.name,
              slug: offer.establishments.slug,
              city: offer.establishments.city,
              logo_url: offer.establishments.logo_url,
              universe: offer.establishments.universe,
            }
          : null,
      })),
    [offers],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-ramadan-night">
      <Header isRamadan />

      {/* =====================================================================
          Hero Section
          ===================================================================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-ramadan-night via-ramadan-deep to-ramadan-night py-12 md:py-16">
        <RamadanStarryBackground />
        <div className="relative z-10 container mx-auto px-4 text-center max-w-3xl">
          <CrescentMoonSvg className="w-14 h-14 md:w-20 md:h-20 mx-auto mb-4" />
          <h1 className="text-2xl md:text-4xl font-extrabold text-ramadan-cream mb-2 tracking-tight">
            Offres Ramadan
          </h1>
          <p className="text-sm md:text-lg text-ramadan-gold-light/80 max-w-xl mx-auto mb-4">
            Ftour, S'hour & formules exceptionnelles
          </p>
          {total > 0 && !loading && (
            <span className="inline-flex items-center gap-1.5 bg-ramadan-gold/20 text-ramadan-gold px-4 py-1.5 rounded-full text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              {total} offre{total > 1 ? "s" : ""} disponible
              {total > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </section>

      {/* =====================================================================
          Content
          ===================================================================== */}
      <main className="container mx-auto px-4 pt-6 pb-12 max-w-7xl">
        {/* -----------------------------------------------------------------
            Type filter chips
            ----------------------------------------------------------------- */}
        <div
          className="flex gap-2 overflow-x-auto pb-2 mb-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {TYPE_FILTERS.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => {
                setActiveType(tf.id as RamadanOfferType | "all");
                setPage(1);
              }}
              className={cn(
                "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition whitespace-nowrap",
                activeType === tf.id
                  ? "bg-ramadan-gold text-ramadan-night border-ramadan-gold"
                  : "bg-ramadan-deep/50 text-ramadan-gold-light border-ramadan-gold/30 hover:bg-ramadan-deep",
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* -----------------------------------------------------------------
            Sort pills + Filter toggle
            ----------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div
            className="flex gap-2 overflow-x-auto pb-1 flex-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setSort(opt.id);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition",
                  sort === opt.id
                    ? "bg-ramadan-bordeaux text-ramadan-cream border-ramadan-bordeaux"
                    : "bg-white/5 text-ramadan-gold-light border-ramadan-gold/20 hover:bg-white/10",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition flex items-center gap-2",
              filtersOpen || hasFilters
                ? "bg-ramadan-gold/10 text-ramadan-gold border-ramadan-gold/30"
                : "bg-white/5 text-ramadan-gold-light border-ramadan-gold/20 hover:bg-white/10",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtres
            {hasFilters && (
              <span className="bg-ramadan-gold text-ramadan-night rounded-full h-5 w-5 flex items-center justify-center text-[10px] font-bold">
                !
              </span>
            )}
          </button>
        </div>

        {/* -----------------------------------------------------------------
            Filters panel (collapsible)
            ----------------------------------------------------------------- */}
        {filtersOpen && (
          <div className="mb-6 p-4 rounded-2xl border border-ramadan-gold/20 bg-ramadan-deep/30 space-y-4">
            {/* Ville */}
            <div>
              <label className="text-xs font-semibold text-ramadan-gold-light mb-2 block">
                Ville
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCity("");
                    setPage(1);
                  }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition",
                    !city
                      ? "bg-ramadan-gold text-ramadan-night border-ramadan-gold"
                      : "border-ramadan-gold/30 text-ramadan-gold-light hover:bg-ramadan-deep",
                  )}
                >
                  Toutes
                </button>
                {CITY_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCity(c);
                      setPage(1);
                    }}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border transition",
                      city.toLowerCase() === c.toLowerCase()
                        ? "bg-ramadan-gold text-ramadan-night border-ramadan-gold"
                        : "border-ramadan-gold/30 text-ramadan-gold-light hover:bg-ramadan-deep",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Prix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-ramadan-gold-light mb-1 block">
                  Prix min (Dhs)
                </label>
                <input
                  value={minPrice}
                  onChange={(e) => {
                    setMinPrice(e.target.value);
                    setPage(1);
                  }}
                  type="number"
                  min={0}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-xl border border-ramadan-gold/20 bg-ramadan-night/50 text-ramadan-cream text-sm focus:outline-none focus:ring-2 focus:ring-ramadan-gold/30 placeholder:text-ramadan-gold-light/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ramadan-gold-light mb-1 block">
                  Prix max (Dhs)
                </label>
                <input
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(e.target.value);
                    setPage(1);
                  }}
                  type="number"
                  min={0}
                  placeholder="1000"
                  className="w-full h-10 px-3 rounded-xl border border-ramadan-gold/20 bg-ramadan-night/50 text-ramadan-cream text-sm focus:outline-none focus:ring-2 focus:ring-ramadan-gold/30 placeholder:text-ramadan-gold-light/40"
                />
              </div>
            </div>

            {/* Clear */}
            {hasFilters && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-ramadan-gold font-semibold hover:text-ramadan-gold-light flex items-center gap-1 transition"
                >
                  <X className="h-4 w-4" /> Effacer les filtres
                </button>
              </div>
            )}
          </div>
        )}

        {/* -----------------------------------------------------------------
            Content: loading / error / empty / grid
            ----------------------------------------------------------------- */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-ramadan-gold/20 bg-ramadan-deep/30 overflow-hidden"
              >
                <div className="aspect-[4/3] bg-ramadan-deep/50 animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-ramadan-deep/50 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-ramadan-deep/50 rounded animate-pulse w-1/2" />
                  <div className="h-5 bg-ramadan-deep/50 rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              onClick={fetchOffers}
              className="mt-4 bg-ramadan-bordeaux text-ramadan-cream rounded-xl h-10 px-6 text-sm font-semibold hover:bg-ramadan-bordeaux/80"
            >
              Réessayer
            </Button>
          </div>
        ) : cardOffers.length === 0 ? (
          <div className="py-16 text-center">
            <Moon className="mx-auto h-12 w-12 text-ramadan-gold/30" />
            <p className="mt-3 text-base font-semibold text-ramadan-cream">
              Aucune offre trouvée
            </p>
            <p className="mt-1 text-sm text-ramadan-gold-light/60">
              Essayez de modifier vos filtres
            </p>
            {hasFilters && (
              <Button
                onClick={clearFilters}
                className="mt-4 bg-ramadan-bordeaux text-ramadan-cream rounded-xl h-10 px-6 text-sm font-semibold hover:bg-ramadan-bordeaux/80"
              >
                Effacer les filtres
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {cardOffers.map((offer) => (
                <RamadanOfferCard key={offer.id} offer={offer} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="h-10 w-10 rounded-xl border border-ramadan-gold/20 flex items-center justify-center text-ramadan-gold-light disabled:opacity-40 hover:bg-ramadan-deep/50 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-ramadan-gold-light">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="h-10 w-10 rounded-xl border border-ramadan-gold/20 flex items-center justify-center text-ramadan-gold-light disabled:opacity-40 hover:bg-ramadan-deep/50 transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
