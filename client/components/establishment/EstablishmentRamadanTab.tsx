/**
 * EstablishmentRamadanTab — Onglet "🌙 Ramadan 2026" sur la page établissement
 *
 * Affiche toutes les offres Ramadan actives de l'établissement.
 * Conditionnel : ne s'affiche que si Ramadan est actif + offres existent.
 *
 * Design compact : cartes en row horizontale sur mobile (scroll) et grille 3-4 cols
 * sur desktop pour éviter des cartes trop grandes.
 */

import { useEffect, useState } from "react";
import { Moon, Clock, MapPin, Users, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getEstablishmentRamadanOffers } from "@/lib/ramadanApi";
import { trackRamadanOfferEvent } from "@/lib/ramadanApi";
import type { RamadanOfferRow, RamadanOfferType, RamadanOfferTimeSlot } from "../../../shared/ramadanTypes";
import {
  RAMADAN_OFFER_TYPE_LABELS,
  calculateRamadanDiscount,
} from "../../../shared/ramadanTypes";

// =============================================================================
// Types
// =============================================================================

type Props = {
  establishmentId: string;
  establishmentName?: string;
  onReserve?: (offerId: string) => void;
};

// =============================================================================
// Helpers
// =============================================================================

function typeBadgeColor(type: RamadanOfferType): string {
  switch (type) {
    case "ftour":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "shour":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "traiteur":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "pack_famille":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "special":
      return "bg-violet-100 text-violet-800 border-violet-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function formatPrice(centimes: number): string {
  return `${(centimes / 100).toFixed(0)} Dhs`;
}

function formatTimeSlots(slots: RamadanOfferTimeSlot[]): string {
  if (!slots.length) return "";
  return slots.map((s) => `${s.label} ${s.start}–${s.end}`).join(" · ");
}

// =============================================================================
// Compact Offer Card (inline pour la page établissement)
// =============================================================================

function CompactRamadanCard({
  offer,
  onReserve,
}: {
  offer: RamadanOfferRow;
  onReserve?: (offerId: string) => void;
}) {
  const discount =
    offer.original_price && offer.original_price > offer.price
      ? calculateRamadanDiscount(offer.original_price, offer.price)
      : 0;

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-row w-full"
      onClick={() => {
        trackRamadanOfferEvent(offer.id, "click");
        onReserve?.(offer.id);
      }}
    >
      {/* Contenu à gauche — prend toute la place restante */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-1">
        {/* Type badge + title */}
        <div className="space-y-1">
          <Badge
            className={cn(
              "text-[10px] px-1.5 py-0.5 font-semibold w-fit",
              typeBadgeColor(offer.type),
            )}
          >
            {RAMADAN_OFFER_TYPE_LABELS[offer.type] ?? offer.type}
          </Badge>
          <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
            {offer.title}
          </h3>
        </div>

        {/* Infos */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          {offer.time_slots.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {formatTimeSlots(offer.time_slots)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3 shrink-0" />
            {offer.capacity_per_slot} pl.
          </span>
        </div>

        {/* Prix */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold text-[#a3001d]">
            {formatPrice(offer.price)}
          </span>
          <span className="text-[10px] text-slate-400">/pers.</span>
          {offer.original_price && offer.original_price > offer.price && (
            <span className="text-[10px] text-slate-400 line-through">
              {formatPrice(offer.original_price)}
            </span>
          )}
          {discount > 0 && (
            <span className="text-[10px] font-bold text-red-500">-{discount}%</span>
          )}
        </div>
      </div>

      {/* Vignette carrée à droite */}
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 overflow-hidden bg-slate-100 self-center rounded-lg m-2">
        {offer.cover_url ? (
          <img
            src={offer.cover_url}
            alt={offer.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xl bg-gradient-to-br from-[#0f1b3d] to-[#1a2d5e]">
            🌙
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function EstablishmentRamadanTab({
  establishmentId,
  establishmentName,
  onReserve,
}: Props) {
  const [offers, setOffers] = useState<RamadanOfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!establishmentId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await getEstablishmentRamadanOffers(establishmentId);
        if (!cancelled) setOffers(res.offers);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [establishmentId]);

  if (!loading && !offers.length) {
    return (
      <div className="py-12 text-center text-slate-500 text-sm">
        Aucune offre Ramadan disponible pour le moment.
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4">
      {/* Header compact */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <Moon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
            Offres Ramadan
          </h2>
          {establishmentName ? (
            <p className="text-[11px] sm:text-xs text-slate-500">
              Formules spéciales chez {establishmentName}
            </p>
          ) : null}
        </div>
      </div>

      {/* Liste full-width : cartes horizontales empilées */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex rounded-xl bg-slate-100 animate-pulse h-28"
            >
              <div className="flex-1 p-3 space-y-2">
                <div className="h-3 bg-slate-200 rounded w-1/4" />
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
              </div>
              <div className="w-24 sm:w-28 h-24 sm:h-28 bg-slate-200 rounded-lg m-2 shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <CompactRamadanCard
              key={offer.id}
              offer={offer}
              onReserve={onReserve}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hook pour vérifier si un établissement a des offres Ramadan actives.
 * Utile pour conditionner l'affichage du tab.
 */
export function useHasRamadanOffers(establishmentId: string | null): boolean {
  const [hasOffers, setHasOffers] = useState(false);

  useEffect(() => {
    if (!establishmentId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await getEstablishmentRamadanOffers(establishmentId);
        if (!cancelled) setHasOffers(res.offers.length > 0);
      } catch {
        // silent
      }
    })();

    return () => { cancelled = true; };
  }, [establishmentId]);

  return hasOffers;
}
