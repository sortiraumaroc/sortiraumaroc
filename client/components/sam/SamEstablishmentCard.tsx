/**
 * SamEstablishmentCard — Carte enrichie d'établissement dans le chat Sam
 *
 * Design vertical : photo cover (160px) + section info avec :
 *   - Nom (font-weight 600, 1 ligne, ellipsis)
 *   - Subcategory · Ville (gris, petit, 1 ligne)
 *   - Note Google ⭐ (si disponible)
 *   - Note sam.ma ★ (si disponible)
 *   - Statut ouvert/fermé (🟢/🔴)
 *   - Bouton "Voir la fiche →" full-width
 *
 * Desktop : 3 cartes côte à côte (grid géré par le parent)
 * Mobile : 1 carte par ligne
 */

import { Star, ArrowRight, UtensilsCrossed, Coffee, Bed, Dumbbell, Palette, ShoppingBag } from "lucide-react";
import type { SamEstablishmentItem } from "../../lib/samApi";

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

/** Initiales du nom pour le placeholder (2 lettres max) */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Icône placeholder selon l'univers */
function PlaceholderIcon({ universe }: { universe: string }) {
  const cls = "h-8 w-8 text-slate-300";
  switch (universe) {
    case "restaurant":
    case "restaurants":
      return <UtensilsCrossed className={cls} />;
    case "hebergement":
    case "hotel":
    case "hotels":
      return <Bed className={cls} />;
    case "wellness":
      return <Dumbbell className={cls} />;
    case "culture":
      return <Palette className={cls} />;
    case "shopping":
      return <ShoppingBag className={cls} />;
    default:
      return <Coffee className={cls} />;
  }
}

/** Formater le nombre d'avis : 2341 → "2 341" */
function fmtCount(n: number): string {
  return n.toLocaleString("fr-FR");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SamEstablishmentCardProps {
  item: SamEstablishmentItem;
}

export function SamEstablishmentCard({ item }: SamEstablishmentCardProps) {
  const url = getEstablishmentUrl(item);
  const hasGoogleRating = item.google_rating != null && item.google_rating > 0;
  const hasSamRating = item.avg_rating != null && item.avg_rating > 0;
  const hasAnyRating = hasGoogleRating || hasSamRating;

  // Sous-titre : subcategory · ville
  const subtitleParts: string[] = [];
  if (item.subcategory) subtitleParts.push(item.subcategory);
  if (item.city) subtitleParts.push(item.city);
  const subtitle = subtitleParts.join(" · ");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      {/* ── Cover photo ── */}
      <div className="relative h-[160px] w-full overflow-hidden bg-slate-100">
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50">
            <PlaceholderIcon universe={item.universe} />
            <span className="text-lg font-semibold text-slate-300">
              {getInitials(item.name)}
            </span>
          </div>
        )}

        {/* Promo badge */}
        {item.promo_percent != null && item.promo_percent > 0 && (
          <span className="absolute end-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white shadow">
            -{item.promo_percent}%
          </span>
        )}
      </div>

      {/* ── Info section ── */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Nom */}
        <h4
          className="text-[14px] font-semibold leading-tight text-slate-900 truncate"
          title={item.name}
        >
          {item.name}
        </h4>

        {/* Subcategory · Ville */}
        {subtitle && (
          <p className="text-[12px] text-slate-500 truncate capitalize">
            {subtitle}
          </p>
        )}

        {/* ── Ratings ── */}
        <div className="flex flex-col gap-1">
          {/* Google rating */}
          {hasGoogleRating && (
            <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
              <span className="font-medium">{item.google_rating!.toFixed(1)}</span>
              {item.google_review_count != null && item.google_review_count > 0 && (
                <span className="text-slate-400">
                  ({fmtCount(item.google_review_count)} avis Google)
                </span>
              )}
            </div>
          )}

          {/* sam.ma rating */}
          {hasSamRating && (
            <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
              <Star className="h-3.5 w-3.5 fill-slate-700 text-slate-700 flex-shrink-0" />
              <span className="font-medium">{item.avg_rating!.toFixed(1)}</span>
              {item.review_count != null && item.review_count > 0 && (
                <span className="text-slate-400">
                  ({fmtCount(item.review_count)} avis sam.ma)
                </span>
              )}
            </div>
          )}

          {/* Aucune note */}
          {!hasAnyRating && (
            <p className="text-[12px] text-slate-400 italic">Pas encore noté</p>
          )}
        </div>

        {/* ── Statut ouvert/fermé ── */}
        <div className="flex items-center gap-1.5 text-[12px]">
          {item.is_online ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-emerald-600 font-medium">Ouvert maintenant</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-red-500 font-medium">Fermé</span>
            </>
          )}
        </div>

        {/* ── Spacer push button to bottom ── */}
        <div className="flex-1" />

        {/* ── CTA Button ── */}
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[12px] font-medium text-white transition-colors group-hover:bg-primary">
          <span>Voir la fiche</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </a>
  );
}
