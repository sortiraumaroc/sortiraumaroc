/**
 * RamadanOfferCard — Carte d'offre Ramadan
 *
 * Affiche une offre Ramadan avec : photo, titre, type badge, prix, horaires,
 * nom de l'établissement, bouton Réserver, et popup détails au clic.
 */

import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Clock, MapPin, Users, Info, X, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackRamadanOfferEvent } from "@/lib/ramadanApi";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import {
  RAMADAN_OFFER_TYPE_LABELS,
  calculateRamadanDiscount,
} from "../../../shared/ramadanTypes";
import type { RamadanOfferType, RamadanOfferTimeSlot } from "../../../shared/ramadanTypes";

// =============================================================================
// Types
// =============================================================================

export type RamadanOfferCardData = {
  id: string;
  title: string;
  type: RamadanOfferType;
  price: number; // centimes
  original_price?: number | null;
  cover_url?: string | null;
  time_slots: RamadanOfferTimeSlot[];
  capacity_per_slot: number;
  is_featured?: boolean;
  description?: string | null;
  conditions?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  establishment?: {
    id: string;
    name: string;
    slug: string;
    city: string;
    logo_url?: string | null;
    universe?: string | null;
  } | null;
};

type Props = {
  offer: RamadanOfferCardData;
  onReserve?: (offerId: string) => void;
  className?: string;
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
  return `${(centimes / 100).toFixed(0)} MAD`;
}

function formatTimeSlots(slots: RamadanOfferTimeSlot[]): string {
  if (!slots.length) return "";
  return slots.map((s) => `${s.label} ${s.start}–${s.end}`).join(" · ");
}

function getEstablishmentHref(est: RamadanOfferCardData["establishment"]): string | null {
  if (!est) return null;
  return buildEstablishmentUrl({
    id: est.id,
    slug: est.slug,
    name: est.name,
    universe: est.universe as Parameters<typeof buildEstablishmentUrl>[0]["universe"],
  });
}

function formatDateRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return "";
  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    } catch { return d; }
  };
  if (from && to) return `Du ${fmtDate(from)} au ${fmtDate(to)}`;
  if (from) return `À partir du ${fmtDate(from)}`;
  return `Jusqu'au ${fmtDate(to!)}`;
}

// =============================================================================
// Detail Dialog
// =============================================================================

function RamadanOfferDetailDialog({
  offer,
  open,
  onClose,
  onReserve,
}: {
  offer: RamadanOfferCardData;
  open: boolean;
  onClose: () => void;
  onReserve?: (offerId: string) => void;
}) {
  if (!open) return null;

  const discount =
    offer.original_price && offer.original_price > offer.price
      ? calculateRamadanDiscount(offer.original_price, offer.price)
      : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog — bottom sheet sur mobile, centré sur desktop */}
      <div
        className="relative z-10 w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle mobile */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Cover image */}
        <div className="relative aspect-[2/1] sm:aspect-[16/9] overflow-hidden sm:rounded-t-2xl bg-slate-100">
          {offer.cover_url ? (
            <img src={offer.cover_url} alt={offer.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full text-5xl sm:text-6xl bg-gradient-to-br from-[#0f1b3d] to-[#1a2d5e]">
              🌙
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"
          >
            <X className="h-4 w-4" />
          </button>
          <Badge className={cn("absolute top-3 left-3 text-xs px-2 py-0.5", typeBadgeColor(offer.type))}>
            {RAMADAN_OFFER_TYPE_LABELS[offer.type] ?? offer.type}
          </Badge>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
          {/* Title */}
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">{offer.title}</h2>

          {/* Description */}
          {offer.description ? (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {offer.description}
            </p>
          ) : null}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {/* Horaires */}
            {offer.time_slots.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 sm:p-3 rounded-lg bg-slate-50">
                <Clock className="h-3.5 sm:h-4 w-3.5 sm:w-4 mt-0.5 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-700">Horaires</div>
                  {offer.time_slots.map((slot, i) => (
                    <div key={i} className="text-xs sm:text-sm text-slate-600 truncate">
                      {slot.label}: {slot.start} – {slot.end}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Places disponibles */}
            <div className="flex items-start gap-2 p-2.5 sm:p-3 rounded-lg bg-slate-50">
              <Users className="h-3.5 sm:h-4 w-3.5 sm:w-4 mt-0.5 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs font-semibold text-slate-700">Places</div>
                <div className="text-xs sm:text-sm text-slate-600">{offer.capacity_per_slot} /créneau</div>
              </div>
            </div>

            {/* Validité */}
            {(offer.valid_from || offer.valid_to) && (
              <div className="flex items-start gap-2 p-2.5 sm:p-3 rounded-lg bg-slate-50">
                <Info className="h-3.5 sm:h-4 w-3.5 sm:w-4 mt-0.5 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-700">Période</div>
                  <div className="text-xs sm:text-sm text-slate-600 truncate">{formatDateRange(offer.valid_from, offer.valid_to)}</div>
                </div>
              </div>
            )}

            {/* Lieu */}
            {offer.establishment && (
              <div className="flex items-start gap-2 p-2.5 sm:p-3 rounded-lg bg-slate-50">
                <MapPin className="h-3.5 sm:h-4 w-3.5 sm:w-4 mt-0.5 text-rose-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-700">Lieu</div>
                  <div className="text-xs sm:text-sm text-slate-600 truncate">
                    {offer.establishment.name}
                    {offer.establishment.city ? `, ${offer.establishment.city}` : ""}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conditions */}
          {offer.conditions ? (
            <div className="p-2.5 sm:p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-[10px] sm:text-xs font-semibold text-amber-800 mb-1">Conditions</div>
              <p className="text-[10px] sm:text-xs text-amber-700 whitespace-pre-line">{offer.conditions}</p>
            </div>
          ) : null}

          {/* CTA Voir l'établissement */}
          {offer.establishment && getEstablishmentHref(offer.establishment) && (
            <Link
              to={getEstablishmentHref(offer.establishment)!}
              className="flex items-center justify-center gap-2 w-full py-2.5 sm:py-3 rounded-xl bg-ramadan-gold/10 text-ramadan-gold-dark hover:bg-ramadan-gold/20 font-bold text-sm sm:text-base transition"
              onClick={onClose}
            >
              <MapPin className="h-4 w-4" />
              Voir l'établissement
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}

          {/* Prix + CTA */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 pb-safe">
            <div>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-xl sm:text-2xl font-extrabold text-ramadan-gold">{formatPrice(offer.price)}</span>
                <span className="text-xs sm:text-sm text-slate-500">/pers.</span>
              </div>
              {offer.original_price && offer.original_price > offer.price ? (
                <div className="flex items-baseline gap-1.5 sm:gap-2 mt-0.5">
                  <span className="text-xs sm:text-sm text-slate-400 line-through">{formatPrice(offer.original_price)}</span>
                  {discount > 0 && <span className="text-[10px] sm:text-xs font-bold text-red-500">-{discount}%</span>}
                </div>
              ) : null}
            </div>

            {onReserve ? (
              <Button
                size="lg"
                className="bg-[#0f1b3d] hover:bg-[#1a2d5e] text-white font-bold px-4 sm:px-6 text-sm sm:text-base"
                onClick={() => { onReserve(offer.id); onClose(); }}
              >
                Réserver
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function RamadanOfferCard({ offer, onReserve, className }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);

  const handleCardClick = useCallback(() => {
    setDetailOpen(true);
    trackRamadanOfferEvent(offer.id, "click");
  }, [offer.id]);

  const discount =
    offer.original_price && offer.original_price > offer.price
      ? calculateRamadanDiscount(offer.original_price, offer.price)
      : 0;

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border border-ramadan-gold/30 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col",
          offer.is_featured && "ring-2 ring-ramadan-gold",
          className,
        )}
        onClick={handleCardClick}
      >
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {offer.cover_url ? (
            <img
              src={offer.cover_url}
              alt={offer.title}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-3xl bg-gradient-to-br from-[#0f1b3d] to-[#1a2d5e]">🌙</div>
          )}
          <Badge className={cn("absolute top-2 left-2 text-[10px] px-1.5 py-0.5", typeBadgeColor(offer.type))}>
            {RAMADAN_OFFER_TYPE_LABELS[offer.type] ?? offer.type}
          </Badge>
          {discount > 0 ? (
            <Badge className="absolute top-2 right-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5">-{discount}%</Badge>
          ) : null}
          {offer.is_featured ? (
            <div className="absolute bottom-2 left-2 bg-ramadan-gold text-ramadan-night text-[10px] font-bold px-2 py-0.5 rounded">En vedette</div>
          ) : null}
        </div>

        {/* Contenu */}
        <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
          <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">{offer.title}</h3>
          {offer.establishment ? (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{offer.establishment.name}{offer.establishment.city ? ` · ${offer.establishment.city}` : ""}</span>
            </div>
          ) : null}
          {offer.time_slots.length > 0 ? (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">{formatTimeSlots(offer.time_slots)}</span>
            </div>
          ) : null}
          <div className="flex-1" />

          {/* Bouton CTA "Voir l'établissement" */}
          {offer.establishment && getEstablishmentHref(offer.establishment) && (
            <Link
              to={getEstablishmentHref(offer.establishment)!}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-ramadan-gold/10 text-ramadan-gold-dark hover:bg-ramadan-gold/20 font-semibold text-[11px] transition"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Voir l'établissement
            </Link>
          )}

          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-extrabold text-ramadan-gold">{formatPrice(offer.price)}</span>
              <span className="text-[10px] text-slate-400">/pers.</span>
              {offer.original_price && offer.original_price > offer.price ? (
                <span className="text-[10px] text-slate-400 line-through">{formatPrice(offer.original_price)}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Detail dialog */}
      <RamadanOfferDetailDialog
        offer={offer}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onReserve={onReserve}
      />
    </>
  );
}
