/**
 * CeHomeFeedSection — CE advantages carousel on the home page
 *
 * Renders only if the user is an active CE employee.
 * Shows a horizontal scrollable list of establishments with CE advantages.
 */

import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Star,
  Percent,
  Tag,
  Gift,
  Package,
  BadgePercent,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCeStatus } from "@/hooks/useCeStatus";
import { getConsumerAccessToken } from "@/lib/auth";
import type { AdvantageType } from "../../../shared/ceTypes";

interface CeHomeFeedItem {
  establishment_id: string;
  establishment_name: string;
  establishment_slug: string | null;
  establishment_cover_url: string | null;
  establishment_city: string | null;
  establishment_universe: string | null;
  establishment_category: string | null;
  establishment_rating: number | null;
  advantage_type: AdvantageType;
  advantage_value: number | null;
  description: string | null;
}

function advantageLabel(type: AdvantageType, value: number | null): string {
  if (type === "percentage" && value) return `-${value}%`;
  if (type === "fixed" && value) return `-${value} DH`;
  return { special_offer: "Offre spéciale", gift: "Cadeau", pack: "Pack" }[type] ?? "";
}

const ADVANTAGE_COLORS: Record<AdvantageType, string> = {
  percentage: "bg-green-600",
  fixed: "bg-blue-600",
  special_offer: "bg-purple-600",
  gift: "bg-pink-600",
  pack: "bg-orange-600",
};

function universeDetailPath(universe: string | null, slug: string | null, id: string): string {
  const base = universe === "hotel" ? "hotel" : universe === "wellness" ? "wellness" : universe === "loisir" ? "loisir" : universe === "shopping" ? "shopping" : universe === "culture" ? "culture" : "restaurant";
  return `/${base}/${slug ?? id}`;
}

export function CeHomeFeedSection() {
  const { isCeActive, company, loading: ceLoading } = useCeStatus();
  const [items, setItems] = useState<CeHomeFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ceLoading || !isCeActive || fetched) return;
    setLoading(true);

    (async () => {
      try {
        const token = await getConsumerAccessToken();
        if (!token) return;
        const res = await fetch("/api/ce/home-feed?limit=12", {
          headers: { authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok && json.data) setItems(json.data);
      } catch {
        // Silently ignore — non-critical
      } finally {
        setLoading(false);
        setFetched(true);
      }
    })();
  }, [ceLoading, isCeActive, fetched]);

  // Don't render if not CE or no items
  if (ceLoading || !isCeActive || (!loading && items.length === 0)) return null;

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="mb-8 md:mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-100 p-1.5">
            <Building2 className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Vos avantages exclusifs</h2>
            {company && (
              <p className="text-xs text-slate-500">{company.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8" onClick={() => scroll("left")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8" onClick={() => scroll("right")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Link to="/ce/avantages" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            Voir tout <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Carousel */}
      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-52 shrink-0 animate-pulse">
              <div className="aspect-[4/3] rounded-xl bg-slate-200" />
              <div className="mt-2 h-4 w-3/4 rounded bg-slate-200" />
              <div className="mt-1 h-3 w-1/2 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
        >
          {items.map((item) => {
            const label = advantageLabel(item.advantage_type, item.advantage_value);
            const color = ADVANTAGE_COLORS[item.advantage_type] ?? "bg-blue-600";
            const href = universeDetailPath(item.establishment_universe, item.establishment_slug, item.establishment_id);

            return (
              <Link
                key={item.establishment_id}
                to={href}
                className="group w-52 shrink-0"
              >
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
                  {item.establishment_cover_url ? (
                    <img
                      src={item.establishment_cover_url}
                      alt={item.establishment_name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Building2 className="h-8 w-8 text-slate-300" />
                    </div>
                  )}
                  {label && (
                    <span className={cn("absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-bold text-white shadow", color)}>
                      {label}
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-0.5">
                  <h3 className="text-sm font-semibold line-clamp-1 group-hover:text-primary">
                    {item.establishment_name}
                  </h3>
                  {item.establishment_city && (
                    <p className="text-xs text-slate-500 flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" /> {item.establishment_city}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {item.establishment_rating != null && item.establishment_rating > 0 && (
                      <span className="text-xs font-medium text-yellow-600 flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {item.establishment_rating.toFixed(1)}
                      </span>
                    )}
                    {item.description && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{item.description}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
