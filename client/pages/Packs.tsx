/**
 * Page /packs — 5.3: Listing filtrable de tous les packs actifs
 *
 * Filtres: catégorie, ville, fourchette de prix, réduction minimum
 * Tri: popularité, réduction, nouveautés, prix
 * Pagination
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Gift, SlidersHorizontal, Search, ChevronLeft, ChevronRight, Percent, Users, Clock, MapPin, X } from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useScrollContext } from "@/lib/scrollContext";
import { listActivePacks, type PackListFilters, type PacksListResponse } from "@/lib/packsV2Api";
import type { PackV2 } from "../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function discountPercent(original: number, price: number): number {
  if (!original || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

// =============================================================================
// PackGridCard — card for the listing grid
// =============================================================================

function PackGridCard({ pack }: { pack: PackV2 }) {
  const discount = discountPercent(pack.original_price ?? 0, pack.price);
  const stock = pack.stock;
  const sold = pack.sold_count ?? 0;
  const remaining = stock ? stock - sold : null;
  const lowStock = remaining !== null && stock ? remaining / stock <= 0.2 : false;

  return (
    <Link
      to={`/packs/${pack.id}`}
      className="group rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-[#a3001d]/20 transition-all"
    >
      {/* Image */}
      <div className="relative h-40 sm:h-44 bg-slate-100">
        {pack.cover_url ? (
          <img
            src={pack.cover_url}
            alt={pack.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#a3001d]/10 to-[#a3001d]/5">
            <Gift className="h-10 w-10 text-[#a3001d]/30" />
          </div>
        )}
        {discount > 0 && (
          <div className="absolute top-2.5 start-2.5 flex items-center gap-1 bg-[#a3001d] text-white rounded-full px-2.5 py-1 text-xs font-bold shadow-sm">
            <Percent className="h-3 w-3" />
            -{discount}%
          </div>
        )}
        {lowStock && remaining !== null && (
          <div className="absolute top-2.5 end-2.5 bg-red-500 text-white rounded-full px-2.5 py-1 text-xs font-bold shadow-sm">
            {remaining} restant{remaining > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 sm:p-4 space-y-2">
        {/* Establishment name */}
        {(pack as any).establishments?.name && (
          <p className="text-xs text-slate-500 font-medium truncate flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {(pack as any).establishments.name}
          </p>
        )}

        <h3 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 group-hover:text-[#a3001d] transition-colors">
          {pack.title}
        </h3>

        {pack.short_description && (
          <p className="text-xs text-slate-500 line-clamp-2">{pack.short_description}</p>
        )}

        {/* Details chips */}
        <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
          {pack.party_size && pack.party_size > 1 && (
            <span className="inline-flex items-center gap-0.5 bg-slate-50 rounded-full px-2 py-0.5">
              <Users className="h-2.5 w-2.5" /> {pack.party_size}p
            </span>
          )}
          {pack.valid_time_start && pack.valid_time_end && (
            <span className="inline-flex items-center gap-0.5 bg-slate-50 rounded-full px-2 py-0.5">
              <Clock className="h-2.5 w-2.5" /> {pack.valid_time_start}-{pack.valid_time_end}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-end justify-between gap-2 pt-1">
          <div>
            <span className="text-lg font-bold text-[#a3001d]">{formatCurrency(pack.price)}</span>
            {pack.original_price && pack.original_price > pack.price && (
              <span className="ms-2 text-sm text-slate-400 line-through">{formatCurrency(pack.original_price)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// =============================================================================
// Sort options
// =============================================================================

const SORT_OPTIONS = [
  { id: "popularity", label: "Populaires" },
  { id: "discount", label: "Meilleures offres" },
  { id: "newest", label: "Nouveautés" },
  { id: "price_asc", label: "Prix croissant" },
  { id: "price_desc", label: "Prix décroissant" },
] as const;

// =============================================================================
// Packs Page
// =============================================================================

export default function Packs() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const [packs, setPacks] = useState<PackV2[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from URL
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("min_price") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max_price") ?? "");
  const [minDiscount, setMinDiscount] = useState(searchParams.get("min_discount") ?? "");
  const [sort, setSort] = useState<string>(searchParams.get("sort") ?? "popularity");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: PackListFilters = {
        sort: sort as PackListFilters["sort"],
        page,
        per_page: perPage,
      };
      if (category) filters.category = category;
      if (city) filters.city = city;
      if (minPrice) filters.min_price = Number(minPrice) * 100;
      if (maxPrice) filters.max_price = Number(maxPrice) * 100;
      if (minDiscount) filters.min_discount = Number(minDiscount);

      const res = await listActivePacks(filters);
      setPacks(res.packs);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [sort, page, perPage, category, city, minPrice, maxPrice, minDiscount]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (city) params.set("city", city);
    if (minPrice) params.set("min_price", minPrice);
    if (maxPrice) params.set("max_price", maxPrice);
    if (minDiscount) params.set("min_discount", minDiscount);
    if (sort && sort !== "popularity") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    setSearchParams(params, { replace: true });
  }, [category, city, minPrice, maxPrice, minDiscount, sort, page, setSearchParams]);

  const totalPages = Math.ceil(total / perPage);
  const hasFilters = !!(category || city || minPrice || maxPrice || minDiscount);

  const clearFilters = () => {
    setCategory("");
    setCity("");
    setMinPrice("");
    setMaxPrice("");
    setMinDiscount("");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="container mx-auto px-4 pt-6 pb-12 max-w-7xl">
        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#a3001d]/10">
              <Gift className="h-5 w-5 text-[#a3001d]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Packs & Offres</h1>
              <p className="text-sm text-slate-500">
                {total > 0 ? `${total} pack${total > 1 ? "s" : ""} disponible${total > 1 ? "s" : ""}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar: sort + filter toggle */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Sort pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setSort(opt.id); setPage(1); }}
                className={cn(
                  "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition",
                  sort === opt.id
                    ? "bg-[#a3001d] text-white border-[#a3001d]"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition flex items-center gap-2",
              filtersOpen || hasFilters
                ? "bg-[#a3001d]/10 text-[#a3001d] border-[#a3001d]/30"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtres
            {hasFilters && (
              <span className="bg-[#a3001d] text-white rounded-full h-5 w-5 flex items-center justify-center text-[10px] font-bold">
                !
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {filtersOpen && (
          <div className="mb-6 p-4 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Catégorie</label>
                <input
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                  placeholder="Ex: restaurant, spa..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Ville</label>
                <input
                  value={city}
                  onChange={(e) => { setCity(e.target.value); setPage(1); }}
                  placeholder="Ex: Casablanca, Marrakech..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Prix min (Dhs)</label>
                <input
                  value={minPrice}
                  onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
                  type="number"
                  min={0}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Prix max (Dhs)</label>
                <input
                  value={maxPrice}
                  onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }}
                  type="number"
                  min={0}
                  placeholder="1000"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="w-48">
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Réduction min (%)</label>
                <input
                  value={minDiscount}
                  onChange={(e) => { setMinDiscount(e.target.value); setPage(1); }}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="10"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-[#a3001d] font-semibold hover:text-[#a3001d]/80 flex items-center gap-1"
                >
                  <X className="h-4 w-4" /> Effacer les filtres
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
            <p className="mt-3 text-sm text-slate-500">Chargement des packs...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button onClick={fetchPacks} className="mt-4 bg-[#a3001d] text-white rounded-xl h-10 px-6 text-sm font-semibold">
              Réessayer
            </Button>
          </div>
        ) : packs.length === 0 ? (
          <div className="py-16 text-center">
            <Gift className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-base font-semibold text-slate-700">Aucun pack trouvé</p>
            <p className="mt-1 text-sm text-slate-500">Essayez de modifier vos filtres</p>
            {hasFilters && (
              <Button onClick={clearFilters} className="mt-4 bg-[#a3001d] text-white rounded-xl h-10 px-6 text-sm font-semibold">
                Effacer les filtres
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {packs.map((pack) => (
                <PackGridCard key={pack.id} pack={pack} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
