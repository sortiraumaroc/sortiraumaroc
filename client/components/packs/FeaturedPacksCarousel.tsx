/**
 * FeaturedPacksCarousel — 5.2: Intégration Packs page d'accueil
 *
 * Affiche les packs is_featured ou les plus populaires dans un carrousel.
 * S'intègre dans la section "Nos meilleures offres" de Index.tsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, ChevronLeft, ChevronRight, Percent, MapPin, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { listActivePacks } from "@/lib/packsV2Api";
import type { PackV2 } from "../../../shared/packsBillingTypes";

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
// PackCarouselCard
// =============================================================================

function PackCarouselCard({ pack }: { pack: PackV2 }) {
  const discount = discountPercent(pack.original_price ?? 0, pack.price);
  const stock = pack.stock;
  const sold = pack.sold_count ?? 0;
  const remaining = stock ? stock - sold : null;
  const lowStock = remaining !== null && stock ? remaining / stock <= 0.2 : false;

  return (
    <Link
      to={`/packs/${pack.id}`}
      className="group shrink-0 w-[260px] sm:w-[280px] rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-[#a3001d]/20 transition-all snap-start"
    >
      {/* Image */}
      <div className="relative h-36 sm:h-40 bg-slate-100">
        {pack.cover_url ? (
          <img
            src={pack.cover_url}
            alt={pack.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#a3001d]/10 to-[#a3001d]/5">
            <Gift className="h-8 w-8 text-[#a3001d]/30" />
          </div>
        )}
        {discount > 0 && (
          <div className="absolute top-2 start-2 flex items-center gap-1 bg-[#a3001d] text-white rounded-full px-2 py-0.5 text-[11px] font-bold">
            <Percent className="h-2.5 w-2.5" /> -{discount}%
          </div>
        )}
        {lowStock && remaining !== null && (
          <div className="absolute top-2 end-2 bg-red-500 text-white rounded-full px-2 py-0.5 text-[11px] font-bold">
            {remaining} restant{remaining > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-1.5">
        <h4 className="text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-[#a3001d] transition-colors">
          {pack.title}
        </h4>

        {pack.short_description && (
          <p className="text-xs text-slate-500 line-clamp-1">{pack.short_description}</p>
        )}

        <div className="flex items-end justify-between gap-2 pt-0.5">
          <div>
            <span className="text-base font-bold text-[#a3001d]">{formatCurrency(pack.price)}</span>
            {pack.original_price && pack.original_price > pack.price && (
              <span className="ms-1.5 text-xs text-slate-400 line-through">{formatCurrency(pack.original_price)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// =============================================================================
// FeaturedPacksCarousel — main export
// =============================================================================

export function FeaturedPacksCarousel({ className }: { className?: string }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<PackV2[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listActivePacks({ sort: "popularity", per_page: 10 });
        if (!cancelled) setPacks(res.packs);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 290;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }, []);

  // Don't render if no packs
  if (!loading && packs.length === 0) return null;

  return (
    <section className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-[#a3001d]" />
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Packs & Offres</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll("left")}
            className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Link
            to="/packs"
            className="ms-2 text-sm text-[#a3001d] font-semibold hover:text-[#a3001d]/80 flex items-center gap-1"
          >
            Voir tout <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Carousel */}
      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="shrink-0 w-[260px] sm:w-[280px] h-56 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {packs.map((pack) => (
            <PackCarouselCard key={pack.id} pack={pack} />
          ))}
        </div>
      )}
    </section>
  );
}
