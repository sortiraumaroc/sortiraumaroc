/**
 * PackDetailDialog — Popup de détail d'un pack
 *
 * Desktop : layout horizontal (image gauche, contenu droite), max-w-3xl
 * Mobile : bottom sheet vertical classique
 *
 * Affiche : photo, titre, description détaillée, inclusions/exclusions,
 * prix, adresse, boutons Waze / Appel / Réserver.
 */

import { Link } from "react-router-dom";
import {
  X, Gift, Percent, MapPin, Phone, Navigation, ShoppingBag,
  Users, Clock, Calendar, Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { usePackDetail } from "@/hooks/usePacksV2";

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

function validDaysLabel(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "Tous les jours";
  const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return days.map((d) => DAYS[d] ?? "").join(", ");
}

type EstablishmentInfo = {
  id?: string;
  name?: string;
  slug?: string;
  city?: string;
  address?: string;
  cover_url?: string;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
};

// =============================================================================
// Component
// =============================================================================

type Props = {
  packId: string | null;
  open: boolean;
  onClose: () => void;
};

export function PackDetailDialog({ packId, open, onClose }: Props) {
  const { pack, loading, error } = usePackDetail(packId);

  if (!open) return null;

  const est: EstablishmentInfo | null = (pack as any)?.establishments ?? null;
  const discount = pack ? discountPercent(pack.original_price ?? 0, pack.price) : 0;
  const stock = pack?.stock;
  const sold = pack?.sold_count ?? 0;
  const remaining = stock ? stock - sold : null;
  const isSoldOut = remaining !== null && remaining <= 0;

  const wazeUrl =
    est?.lat != null && est?.lng != null
      ? `https://www.waze.com/ul?ll=${est.lat},${est.lng}&navigate=yes`
      : est?.address
        ? `https://www.waze.com/ul?q=${encodeURIComponent(est.address + (est.city ? `, ${est.city}` : ""))}&navigate=yes`
        : null;

  const phoneUrl = est?.phone ? `tel:${est.phone.replace(/\s/g, "")}` : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog — bottom sheet mobile, horizontal centré desktop */}
      <div
        className={cn(
          "relative z-10 w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl",
          // Mobile : pleine largeur verticale
          // Desktop : horizontal layout, plus large
          "sm:max-w-3xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle mobile */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="sm:flex">
            <div className="sm:w-[45%] sm:shrink-0 aspect-[2/1] sm:aspect-auto sm:min-h-[360px] bg-slate-200 animate-pulse sm:rounded-l-2xl" />
            <div className="flex-1 p-5 space-y-3">
              <div className="h-6 w-3/4 bg-slate-100 animate-pulse rounded" />
              <div className="h-4 w-full bg-slate-100 animate-pulse rounded" />
              <div className="h-4 w-2/3 bg-slate-100 animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-slate-100 animate-pulse rounded" />
            </div>
          </div>
        ) : error || !pack ? (
          <div className="p-8 text-center">
            <Gift className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">{error ?? "Pack introuvable"}</p>
            <button onClick={onClose} className="mt-4 text-sm text-[#a3001d] font-semibold">Fermer</button>
          </div>
        ) : (
          /* ═══ Desktop : flex horizontal | Mobile : vertical stack ═══ */
          <div className="sm:flex">

            {/* ── Image column (gauche desktop, top mobile) ── */}
            <div className="relative sm:w-[45%] sm:shrink-0">
              <div className="relative aspect-[2/1] sm:aspect-auto sm:h-full sm:min-h-[380px] overflow-hidden sm:rounded-l-2xl bg-slate-100">
                {pack.cover_url ? (
                  <img
                    src={pack.cover_url}
                    alt={pack.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-gradient-to-br from-[#a3001d]/10 to-[#a3001d]/5">
                    <Gift className="h-14 w-14 text-[#a3001d]/20" />
                  </div>
                )}

                {/* Discount badge */}
                {discount > 0 && (
                  <div className="absolute top-3 left-3 flex items-center gap-1 bg-[#a3001d] text-white rounded-full px-2.5 py-1 text-xs font-bold">
                    <Percent className="h-3 w-3" /> -{discount}%
                  </div>
                )}

                {/* Sold out overlay */}
                {isSoldOut && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="bg-white text-slate-700 font-bold text-sm px-4 py-2 rounded-full">Épuisé</span>
                  </div>
                )}
              </div>

              {/* Close button — toujours visible */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Content column (droite desktop, bottom mobile) ── */}
            <div className="flex-1 flex flex-col p-4 sm:p-5 overflow-y-auto sm:max-h-[85vh]">

              {/* Title */}
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mb-2">
                {pack.title}
              </h2>

              {/* Establishment info */}
              {est?.name && (
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-3.5 w-3.5 text-[#a3001d] shrink-0" />
                  <span className="text-xs sm:text-sm text-slate-600">
                    {est.name}{est.address ? ` · ${est.address}` : ""}{est.city ? `, ${est.city}` : ""}
                  </span>
                </div>
              )}

              {/* Description détaillée */}
              {(pack.short_description || pack.detailed_description) && (
                <div className="mb-3">
                  {pack.short_description && (
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {pack.short_description}
                    </p>
                  )}
                  {pack.detailed_description && (
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5 whitespace-pre-line">
                      {pack.detailed_description}
                    </p>
                  )}
                </div>
              )}

              {/* Info chips */}
              <div className="flex flex-wrap gap-2 mb-3">
                {pack.party_size && pack.party_size > 1 && (
                  <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                    <Users className="h-3 w-3 text-blue-500" /> {pack.party_size} pers.
                  </span>
                )}
                {pack.valid_time_start && pack.valid_time_end && (
                  <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                    <Clock className="h-3 w-3 text-amber-500" /> {pack.valid_time_start} - {pack.valid_time_end}
                  </span>
                )}
                {pack.valid_days && pack.valid_days.length > 0 && pack.valid_days.length < 7 && (
                  <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                    <Calendar className="h-3 w-3 text-indigo-500" /> {validDaysLabel(pack.valid_days)}
                  </span>
                )}
              </div>

              {/* Inclusions */}
              {pack.inclusions && pack.inclusions.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">Inclus dans l'offre</div>
                  <ul className="space-y-1">
                    {pack.inclusions.map((inc, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-medium">{inc.label}</span>
                          {inc.description && <span className="text-slate-400 ms-1">— {inc.description}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Exclusions */}
              {pack.exclusions && pack.exclusions.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">Non inclus</div>
                  <ul className="space-y-1">
                    {pack.exclusions.map((exc, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <X className="h-3 w-3 text-red-400 shrink-0" />
                        <span>{exc.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Conditions */}
              {pack.conditions && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-3">
                  <div className="text-[10px] sm:text-xs font-semibold text-amber-800 mb-0.5">Conditions</div>
                  <p className="text-[10px] sm:text-xs text-amber-700 whitespace-pre-line">{pack.conditions}</p>
                </div>
              )}

              {/* Spacer pour pousser prix/CTA en bas */}
              <div className="flex-1" />

              {/* ── Prix + Action buttons (toujours en bas) ── */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                {/* Prix */}
                <div className="flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-extrabold text-[#a3001d]">
                    {formatCurrency(pack.price)}
                  </span>
                  {pack.original_price && pack.original_price > pack.price && (
                    <span className="text-xs sm:text-sm text-slate-400 line-through">
                      {formatCurrency(pack.original_price)}
                    </span>
                  )}
                </div>

                {/* Action buttons row */}
                <div className="flex items-center gap-2">
                  {/* Waze */}
                  {wazeUrl && (
                    <a
                      href={wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#a3001d] transition"
                      title="Localisation (Waze)"
                    >
                      <Navigation className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                    </a>
                  )}

                  {/* Appel */}
                  {phoneUrl && (
                    <a
                      href={phoneUrl}
                      className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition"
                      title="Appeler"
                    >
                      <Phone className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                    </a>
                  )}

                  {/* Réserver */}
                  <Link
                    to={
                      est?.slug
                        ? `/restaurant/${est.slug}?action=book`
                        : `/packs/${pack.id}`
                    }
                    onClick={onClose}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 h-10 sm:h-11 rounded-xl font-bold text-sm transition",
                      isSoldOut
                        ? "bg-slate-200 text-slate-500 cursor-not-allowed pointer-events-none"
                        : "bg-[#a3001d] hover:bg-[#a3001d]/90 text-white",
                    )}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    {isSoldOut ? "Épuisé" : "Réserver"}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
