/**
 * Carte riche d'établissement affichée dans le chat Sam
 * Design carrousel : image de fond + overlay avec nom, distance, rating
 */

import { Star, MapPin, Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import type { SamEstablishmentItem } from "../../lib/samApi";
import { formatDistanceBetweenCoords, type LatLng } from "../../lib/geo";

interface SamEstablishmentCardProps {
  item: SamEstablishmentItem;
  userLocation?: LatLng | null;
}

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

function computeDistance(
  item: SamEstablishmentItem,
  userLocation?: LatLng | null,
): string | null {
  if (
    !userLocation ||
    item.lat == null ||
    item.lng == null ||
    !Number.isFinite(item.lat) ||
    !Number.isFinite(item.lng)
  ) {
    return null;
  }
  return formatDistanceBetweenCoords(userLocation, {
    lat: item.lat,
    lng: item.lng,
  });
}

export function SamEstablishmentCard({
  item,
  userLocation,
}: SamEstablishmentCardProps) {
  const url = getEstablishmentUrl(item);
  const distance = computeDistance(item, userLocation);

  return (
    <Link
      to={url}
      className="group relative block w-[180px] flex-shrink-0 snap-start overflow-hidden rounded-xl bg-slate-100"
    >
      {/* Image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-200 text-slate-400 text-xs">
            Photo
          </div>
        )}

        {/* Promo badge */}
        {item.promo_percent != null && item.promo_percent > 0 && (
          <span className="absolute end-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            -{item.promo_percent}%
          </span>
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2.5 pt-10">
          {/* Name */}
          <h4 className="text-[13px] font-semibold leading-tight text-white line-clamp-2 drop-shadow-sm">
            {item.name}
          </h4>

          {/* Meta row */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/90">
            {/* Rating */}
            {item.google_rating != null && item.google_rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                {item.google_rating.toFixed(1)}
              </span>
            )}

            {/* Subcategory */}
            {item.subcategory && (
              <span className="capitalize truncate max-w-[80px]">
                {item.subcategory}
              </span>
            )}
          </div>

          {/* Distance or city */}
          <div className="mt-1 flex items-center gap-1 text-[10px] text-white/80">
            {distance ? (
              <>
                <Navigation className="h-2.5 w-2.5" />
                <span>{distance}</span>
              </>
            ) : item.city ? (
              <>
                <MapPin className="h-2.5 w-2.5" />
                <span>{item.city}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
