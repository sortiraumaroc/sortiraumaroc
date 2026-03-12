/**
 * RamadanHomeFeedSection — Section Ramadan sur la page d'accueil
 *
 * Affiche les offres Ramadan dans un carrousel horizontal (comme les cartes
 * établissements) avec chevrons gauche/droite et filtres par type.
 * Format : une offre complète + un aperçu de la suivante visible à droite.
 *
 * Conditionnel : ne s'affiche que quand Ramadan est actif.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RamadanOfferCard } from "./RamadanOfferCard";
import { listPublicRamadanOffers, trackRamadanOfferEvent } from "@/lib/ramadanApi";
import type { RamadanOfferWithEstablishment } from "@/lib/ramadanApi";
import type { RamadanOfferType } from "../../../shared/ramadanTypes";
import { RAMADAN_OFFER_TYPE_LABELS } from "../../../shared/ramadanTypes";

// =============================================================================
// Types
// =============================================================================

type Props = {
  onReserve?: (offerId: string) => void;
  /** Ville sélectionnée — filtre les offres. Ignoré si géolocalisation. */
  city?: string | null;
};

const TYPE_ORDER: RamadanOfferType[] = ["ftour", "shour", "traiteur", "pack_famille", "special"];

// =============================================================================
// Component
// =============================================================================

// Geo-like values that should NOT be passed as city filter
const GEO_PATTERN = /autour|position|geo:/i;

export function RamadanHomeFeedSection({ onReserve, city }: Props) {
  const [offers, setOffers] = useState<RamadanOfferWithEstablishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<RamadanOfferType | "all">("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Effective city for API filter (ignore geo-like values)
  const effectiveCity = city && !GEO_PATTERN.test(city) ? city : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await listPublicRamadanOffers({ limit: 50, city: effectiveCity });
        if (!cancelled) setOffers(res.offers);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [effectiveCity]);

  // Track impressions (une seule fois par offre par session)
  const trackedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!offers.length) return;
    for (const o of offers) {
      if (!trackedRef.current.has(o.id)) {
        trackedRef.current.add(o.id);
        trackRamadanOfferEvent(o.id, "impression");
      }
    }
  }, [offers]);

  // Types disponibles
  const availableTypes = useMemo(() => {
    const types = new Set(offers.map((o) => o.type));
    return TYPE_ORDER.filter((t) => types.has(t));
  }, [offers]);

  // Offres filtrées
  const filteredOffers = useMemo(() => {
    if (activeType === "all") return offers;
    return offers.filter((o) => o.type === activeType);
  }, [offers, activeType]);

  // Scroll state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollState);
      window.addEventListener("resize", updateScrollState);
      return () => {
        el.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
      };
    }
  }, [filteredOffers, updateScrollState]);

  const scroll = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll par ~1.5 cartes pour montrer l'aperçu de la suivante
    const cardWidth = 300;
    el.scrollBy({
      left: direction === "left" ? -cardWidth : cardWidth,
      behavior: "smooth",
    });
  }, []);

  // Ne rien afficher s'il n'y a pas d'offres
  if (!loading && !offers.length) return null;

  return (
    <section className="py-8">
      {/* Header thématique — Mille et Une Nuits */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-ramadan-night to-ramadan-deep text-ramadan-gold shadow-md">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-ramadan-gold ramadan-title-underline">
              🌙 Spécial Ramadan
            </h2>
            <p className="text-sm text-ramadan-gold-light/80">
              Ftour, S'hour & formules exceptionnelles
            </p>
          </div>
        </div>

        {/* Chevrons de navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="h-8 w-8 rounded-full border border-ramadan-gold/30 flex items-center justify-center text-ramadan-gold-light hover:bg-ramadan-deep disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="h-8 w-8 rounded-full border border-ramadan-gold/30 flex items-center justify-center text-ramadan-gold-light hover:bg-ramadan-deep disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filtres par type */}
      {availableTypes.length > 1 ? (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <Button
            variant={activeType === "all" ? "default" : "outline"}
            size="sm"
            className="text-xs shrink-0"
            onClick={() => setActiveType("all")}
          >
            Tout
          </Button>
          {availableTypes.map((t) => (
            <Button
              key={t}
              variant={activeType === t ? "default" : "outline"}
              size="sm"
              className="text-xs shrink-0"
              onClick={() => setActiveType(t)}
            >
              {RAMADAN_OFFER_TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Carrousel horizontal d'offres */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-56 md:w-60 aspect-[4/3] rounded-xl bg-ramadan-deep/50 animate-pulse"
            />
          ))
        ) : (
          filteredOffers.map((offer) => (
            <RamadanOfferCard
              key={offer.id}
              offer={{
                ...offer,
                establishment: offer.establishments
                  ? {
                      id: offer.establishments.id,
                      name: offer.establishments.name,
                      slug: offer.establishments.slug,
                      city: offer.establishments.city,
                      logo_url: offer.establishments.logo_url,
                      universe: offer.establishments.universe,
                      service_types: offer.establishments.service_types,
                      phone: offer.establishments.phone,
                      google_maps_url: offer.establishments.google_maps_url,
                    }
                  : null,
              }}
              onReserve={onReserve}
              className="shrink-0 w-56 md:w-60"
            />
          ))
        )}
      </div>
    </section>
  );
}
