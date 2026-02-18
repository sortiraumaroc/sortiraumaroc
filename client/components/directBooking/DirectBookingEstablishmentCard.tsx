/**
 * DirectBookingEstablishmentCard
 *
 * Mobile-optimized establishment info card for the direct booking page.
 * Shows cover image, name, category, address, hours, and rating.
 *
 * Features:
 * - Optimized image loading with aspect ratio
 * - Touch-friendly phone link (min 44px tap target)
 * - Compact layout for mobile
 */

import { MapPin, Clock, Star, Phone, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DirectBookingEstablishment } from "@/lib/directBookingApi";

type Props = {
  establishment: DirectBookingEstablishment;
};

function formatHours(hours: unknown): string | null {
  if (!hours || typeof hours !== "object") return null;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const hoursObj = hours as Record<string, unknown>;

  // Try to find today's hours
  const todayHours = hoursObj[today];
  if (todayHours && typeof todayHours === "string") {
    return todayHours;
  }

  return null;
}

function getUniverseLabel(universe: string | null): string {
  if (!universe) return "Etablissement";

  const u = universe.toLowerCase();
  if (u === "restaurant" || u === "restaurants") return "Restaurant";
  if (u === "hotel" || u === "hotels" || u === "hebergement") return "Hebergement";
  if (u === "wellness" || u === "bien-etre") return "Bien-etre";
  if (u === "loisir" || u === "loisirs") return "Loisir";
  if (u === "culture") return "Culture";
  if (u === "shopping") return "Shopping";
  return universe;
}

function getUniverseEmoji(universe: string | null): string {
  if (!universe) return "📍";

  const u = universe.toLowerCase();
  if (u === "restaurant" || u === "restaurants") return "🍽️";
  if (u === "hotel" || u === "hotels" || u === "hebergement") return "🏨";
  if (u === "wellness" || u === "bien-etre") return "💆";
  if (u === "loisir" || u === "loisirs") return "🎯";
  if (u === "culture") return "🎭";
  if (u === "shopping") return "🛍️";
  if (u === "sport" || u === "sports") return "⚽";
  return "📍";
}

export function DirectBookingEstablishmentCard({ establishment }: Props) {
  const {
    name,
    universe,
    subcategory,
    city,
    address,
    cover_url,
    gallery_urls,
    hours,
    phone,
    avg_rating,
    review_count,
  } = establishment;

  const todayHours = formatHours(hours);
  const coverImage = cover_url || gallery_urls?.[0] || null;

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      {/* Cover Image - Mobile optimized aspect ratio */}
      {coverImage && (
        <div className="relative aspect-[16/9] bg-slate-100">
          <img
            src={coverImage}
            alt={name || "Etablissement"}
            className="w-full h-full object-cover"
            loading="eager"
            decoding="async"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Rating badge - top right */}
          {avg_rating != null && avg_rating > 0 && (
            <div className="absolute top-3 end-3">
              <Badge className="bg-white/95 text-slate-900 backdrop-blur-sm flex items-center gap-1 shadow-sm px-2 py-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-bold text-sm">{avg_rating.toFixed(1)}</span>
                {review_count != null && review_count > 0 && (
                  <span className="text-slate-500 text-xs">({review_count})</span>
                )}
              </Badge>
            </div>
          )}

          {/* Name overlay on image */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <Badge
              variant="secondary"
              className="mb-2 bg-white/95 text-slate-700 backdrop-blur-sm shadow-sm"
            >
              <span className="me-1">{getUniverseEmoji(universe)}</span>
              {getUniverseLabel(universe)}
              {subcategory && <span className="text-slate-500"> · {subcategory}</span>}
            </Badge>
            <h1 className="text-xl font-bold text-white drop-shadow-lg line-clamp-2">
              {name || "Etablissement"}
            </h1>
          </div>
        </div>
      )}

      <CardContent className={cn("p-4", !coverImage && "pt-4")}>
        {/* If no cover image, show name here */}
        {!coverImage && (
          <div className="pb-3 mb-3 border-b border-slate-100">
            <Badge variant="secondary" className="mb-2">
              <span className="me-1">{getUniverseEmoji(universe)}</span>
              {getUniverseLabel(universe)}
              {subcategory && <span className="text-slate-500"> · {subcategory}</span>}
            </Badge>
            <h1 className="text-xl font-bold text-slate-900">
              {name || "Etablissement"}
            </h1>
            {avg_rating != null && avg_rating > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-bold text-sm">{avg_rating.toFixed(1)}</span>
                {review_count != null && review_count > 0 && (
                  <span className="text-slate-500 text-xs">({review_count} avis)</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Info rows - Touch optimized */}
        <div className="space-y-3">
          {/* Address */}
          {(address || city) && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-sm text-slate-700 leading-snug">
                  {address && <span>{address}</span>}
                  {address && city && <span>, </span>}
                  {city && <span className="font-medium">{city}</span>}
                </p>
              </div>
            </div>
          )}

          {/* Hours */}
          {todayHours && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-sm text-slate-700">
                  <span className="text-slate-500">Aujourd'hui :</span>{" "}
                  <span className="font-medium">{todayHours}</span>
                </p>
              </div>
            </div>
          )}

          {/* Phone - Touch optimized link (min 44px tap target) */}
          {phone && (
            <a
              href={`tel:${phone}`}
              className={cn(
                "flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg",
                "min-h-[44px]", // iOS minimum tap target
                "transition-colors active:bg-slate-100 touch-manipulation"
              )}
            >
              <div className="w-8 h-8 rounded-full bg-[#a3001d]/10 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-[#a3001d]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#a3001d]">
                  {phone}
                </p>
                <p className="text-xs text-slate-500">Appuyer pour appeler</p>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
