/**
 * SamRamadanOfferCard — Carte d'offre Ramadan dans le chat Sam
 *
 * Affiche une offre Ramadan avec : badge type/service, cover,
 * titre offre, établissement, horaires, notes, prix (MAD), réduction, CTA.
 *
 * Design distinct des SamEstablishmentCard :
 *   - Bordure dorée subtile (amber-200)
 *   - Badge type coloré (ftour=amber, shour=indigo, traiteur=emerald…)
 *   - Prix en or bold (text-amber-600)
 *   - CTA bleu nuit → amber au hover
 */

import { Star, ArrowRight, Clock, MapPin } from "lucide-react";
import type { SamEstablishmentItem } from "../../lib/samApi";
import { RAMADAN_OFFER_TYPE_LABELS } from "../../../shared/ramadanTypes";
import type { RamadanOfferType } from "../../../shared/ramadanTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEstablishmentUrl(item: SamEstablishmentItem): string {
  const ref = item.slug || item.id;
  const universeMap: Record<string, string> = {
    restaurant: "restaurant",
    restaurants: "restaurant",
    hebergement: "hotel",
    hotels: "hotel",
    hotel: "hotel",
    wellness: "wellness",
    loisir: "loisir",
    loisirs: "loisir",
    culture: "culture",
    shopping: "shopping",
  };
  const path = universeMap[item.universe] ?? "restaurant";
  return `/${path}/${encodeURIComponent(ref)}`;
}

function typeBadgeStyle(type: string): string {
  switch (type) {
    case "ftour":
      return "bg-amber-100 text-amber-800";
    case "shour":
      return "bg-indigo-100 text-indigo-800";
    case "traiteur":
      return "bg-emerald-100 text-emerald-800";
    case "pack_famille":
      return "bg-rose-100 text-rose-800";
    case "special":
      return "bg-violet-100 text-violet-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  buffet: "Buffet",
  buffet_a_volonte: "Buffet \u00e0 volont\u00e9",
  servi_a_table: "Servi \u00e0 table",
  a_la_carte: "\u00c0 la carte",
};

function fmtCount(n: number): string {
  return n.toLocaleString("fr-FR");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SamRamadanOfferCardProps {
  item: SamEstablishmentItem;
}

export function SamRamadanOfferCard({ item }: SamRamadanOfferCardProps) {
  const offer = item.ramadan_offer!;
  const url = getEstablishmentUrl(item);
  const typeLabel =
    RAMADAN_OFFER_TYPE_LABELS[offer.offer_type as RamadanOfferType] ?? offer.offer_type;

  // Service type badge (affiché en priorité si disponible)
  const serviceText = offer.service_types?.[0]
    ? SERVICE_TYPE_LABELS[offer.service_types[0]] ?? offer.service_types[0]
    : null;

  // Prix & réduction
  const hasDiscount =
    offer.original_price != null &&
    offer.price != null &&
    offer.original_price > offer.price;
  const discountPercent = hasDiscount
    ? Math.round(((offer.original_price! - offer.price!) / offer.original_price!) * 100)
    : 0;

  // Horaires
  const timeSlotsText = offer.time_slots?.length
    ? offer.time_slots
        .map((s) => `${s.start}\u2013${s.end}`)
        .join(" / ")
    : null;

  // Localisation
  const locationParts: string[] = [];
  if (item.neighborhood) locationParts.push(item.neighborhood);
  if (item.city) locationParts.push(item.city);
  const locationText = locationParts.join(", ");

  const hasGoogleRating = item.google_rating != null && item.google_rating > 0;
  const hasSamRating = item.avg_rating != null && item.avg_rating > 0;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-amber-200/60 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      {/* ── Cover photo ── */}
      <div className="relative h-[140px] w-full overflow-hidden bg-gradient-to-br from-[#0f1b3d] to-[#1a2d5e]">
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt={offer.offer_title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            {"\ud83c\udf19"}
          </div>
        )}

        {/* Badge type / service */}
        <span
          className={`absolute top-2 start-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-sm ${typeBadgeStyle(offer.offer_type)}`}
        >
          {serviceText ?? typeLabel}
        </span>

        {/* Badge réduction */}
        {discountPercent > 0 && (
          <span className="absolute top-2 end-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            -{discountPercent}%
          </span>
        )}
      </div>

      {/* ── Info section ── */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Titre offre */}
        <h4
          className="text-[13px] font-bold leading-tight text-slate-900 line-clamp-2"
          title={`${typeLabel} — ${offer.offer_title}`}
        >
          {typeLabel} — {offer.offer_title}
        </h4>

        {/* Établissement + localisation */}
        {(item.name || locationText) && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {item.name}
              {locationText ? ` \u00b7 ${locationText}` : ""}
            </span>
          </div>
        )}

        {/* Horaires */}
        {timeSlotsText && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="truncate">{timeSlotsText}</span>
          </div>
        )}

        {/* Notes */}
        {(hasGoogleRating || hasSamRating) && (
          <div className="flex items-center gap-3">
            {hasGoogleRating && (
              <div className="flex items-center gap-1 text-[11px] text-slate-700">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                <span className="font-medium">
                  {item.google_rating!.toFixed(1)}
                </span>
                {item.google_review_count != null && item.google_review_count > 0 && (
                  <span className="text-slate-400">
                    ({fmtCount(item.google_review_count)})
                  </span>
                )}
              </div>
            )}
            {hasSamRating && (
              <div className="flex items-center gap-1 text-[11px] text-slate-700">
                <Star className="h-3 w-3 fill-slate-700 text-slate-700 flex-shrink-0" />
                <span className="font-medium">
                  {item.avg_rating!.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Prix */}
        <div className="flex items-baseline gap-1.5 pt-1">
          {offer.price != null && (
            <span className="text-[15px] font-extrabold text-amber-600">
              {offer.price} MAD
            </span>
          )}
          <span className="text-[10px] text-slate-400">/pers.</span>
          {hasDiscount && (
            <span className="text-[11px] text-slate-400 line-through">
              {offer.original_price} MAD
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA */}
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0f1b3d] px-3 py-2 text-[12px] font-medium text-white transition-colors group-hover:bg-amber-600">
          <span>Voir l'offre</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </a>
  );
}
