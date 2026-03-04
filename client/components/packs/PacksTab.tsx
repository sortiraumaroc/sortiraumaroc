/**
 * PacksTab — 5.1: Onglet "Packs" dédié sur la fiche établissement
 *
 * Affiche les packs actifs d'un établissement dans un onglet séparé
 * du menu/prestations. S'intègre via EstablishmentTabs.
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Gift, Clock, Users, Tag, ChevronRight, Percent, Calendar, ShoppingBag } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { Button } from "@/components/ui/button";
import { useEstablishmentPacks } from "@/hooks/usePacksV2";
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

function urgencyBadge(pack: PackV2): { text: string; color: string } | null {
  const stock = pack.stock;
  const sold = pack.sold_count ?? 0;
  if (stock && stock > 0) {
    const remaining = stock - sold;
    const pct = remaining / stock;
    if (pct <= 0) return { text: "Épuisé", color: "bg-slate-400 text-white" };
    if (pct <= 0.2) return { text: `${remaining} restant${remaining > 1 ? "s" : ""}`, color: "bg-red-500 text-white" };
    if (pct <= 0.5) return { text: `${remaining} restants`, color: "bg-orange-500 text-white" };
  }
  return null;
}

function validDaysLabel(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "Tous les jours";
  const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return days.map((d) => DAYS[d] ?? "").join(", ");
}

// =============================================================================
// PackCardV2 — carte de pack enrichie pour l'onglet dédié
// =============================================================================

function PackCardV2({
  pack,
  onBuy,
}: {
  pack: PackV2;
  onBuy: () => void;
}) {
  const { t } = useI18n();
  const discount = discountPercent(pack.original_price ?? 0, pack.price);
  const badge = urgencyBadge(pack);
  const isSoldOut = pack.stock && (pack.stock - (pack.sold_count ?? 0)) <= 0;

  return (
    <div className="rounded-2xl border border-[#a3001d]/15 bg-white overflow-hidden hover:shadow-md transition-shadow">
      {/* Cover image */}
      {pack.cover_url ? (
        <div className="relative h-40 sm:h-48 bg-slate-100">
          <img
            src={pack.cover_url}
            alt={pack.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {discount > 0 && (
            <div className="absolute top-3 start-3 flex items-center gap-1 bg-[#a3001d] text-white rounded-full px-3 py-1 text-xs font-bold">
              <Percent className="h-3 w-3" />
              -{discount}%
            </div>
          )}
          {badge && (
            <div className={cn("absolute top-3 end-3 rounded-full px-3 py-1 text-xs font-bold", badge.color)}>
              {badge.text}
            </div>
          )}
        </div>
      ) : (
        <div className="relative h-28 bg-gradient-to-r from-[#a3001d]/10 to-[#a3001d]/5 flex items-center justify-center">
          <Gift className="h-10 w-10 text-[#a3001d]/40" />
          {discount > 0 && (
            <div className="absolute top-3 start-3 flex items-center gap-1 bg-[#a3001d] text-white rounded-full px-3 py-1 text-xs font-bold">
              <Percent className="h-3 w-3" />
              -{discount}%
            </div>
          )}
          {badge && (
            <div className={cn("absolute top-3 end-3 rounded-full px-3 py-1 text-xs font-bold", badge.color)}>
              {badge.text}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4 sm:p-5 space-y-3">
        <div>
          <h4 className="text-base sm:text-lg font-bold text-slate-900 line-clamp-2">{pack.title}</h4>
          {pack.short_description && (
            <p className="mt-1 text-sm text-slate-600 line-clamp-2">{pack.short_description}</p>
          )}
        </div>

        {/* Inclusions */}
        {pack.inclusions && pack.inclusions.length > 0 && (
          <ul className="space-y-1">
            {pack.inclusions.slice(0, 4).map((inc, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-emerald-500 shrink-0">✓</span>
                <span className="line-clamp-1">{inc.label}</span>
              </li>
            ))}
            {pack.inclusions.length > 4 && (
              <li className="text-xs text-slate-500 ps-5">+{pack.inclusions.length - 4} inclus</li>
            )}
          </ul>
        )}

        {/* Details chips */}
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {pack.party_size && pack.party_size > 1 && (
            <span className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-1">
              <Users className="h-3 w-3" /> {pack.party_size} pers.
            </span>
          )}
          {pack.valid_days && pack.valid_days.length > 0 && pack.valid_days.length < 7 && (
            <span className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-1">
              <Calendar className="h-3 w-3" /> {validDaysLabel(pack.valid_days)}
            </span>
          )}
          {pack.valid_time_start && pack.valid_time_end && (
            <span className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-1">
              <Clock className="h-3 w-3" /> {pack.valid_time_start}-{pack.valid_time_end}
            </span>
          )}
          {pack.is_multi_use && pack.total_uses && pack.total_uses > 1 && (
            <span className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-1">
              <Tag className="h-3 w-3" /> {pack.total_uses} utilisations
            </span>
          )}
        </div>

        {/* Price + CTA */}
        <div className="flex items-end justify-between gap-3 pt-1">
          <div>
            <div className="text-xl font-bold text-[#a3001d]">{formatCurrency(pack.price)}</div>
            {pack.original_price && pack.original_price > pack.price && (
              <div className="text-sm text-slate-500 line-through">{formatCurrency(pack.original_price)}</div>
            )}
          </div>
          <Button
            type="button"
            onClick={onBuy}
            disabled={!!isSoldOut}
            className={cn(
              "h-10 px-5 text-sm font-semibold rounded-xl",
              isSoldOut
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : "bg-[#a3001d] hover:bg-[#a3001d]/90 text-white",
            )}
          >
            {isSoldOut ? "Épuisé" : "Acheter"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PacksTab — main export
// =============================================================================

export function PacksTab({
  establishmentId,
  className,
}: {
  establishmentId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { packs, loading, error } = useEstablishmentPacks(establishmentId);

  const [authOpen, setAuthOpen] = React.useState(false);
  const [pendingPackId, setPendingPackId] = React.useState<string | null>(null);

  const handleBuy = (pack: PackV2) => {
    if (!isAuthed()) {
      setPendingPackId(pack.id);
      setAuthOpen(true);
      return;
    }
    navigate(`/packs/${pack.id}`);
  };

  const onAuthSuccess = () => {
    setAuthOpen(false);
    if (pendingPackId) {
      navigate(`/packs/${pendingPackId}`);
      setPendingPackId(null);
    }
  };

  if (loading) {
    return (
      <div className={cn("py-8 text-center text-slate-500", className)}>
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
        <p className="mt-2 text-sm">Chargement des packs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("py-8 text-center text-red-600 text-sm", className)}>
        {error}
      </div>
    );
  }

  if (!packs.length) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <Gift className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">Aucun pack disponible pour le moment.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-[#a3001d]" />
          <h3 className="text-lg font-bold text-slate-900">
            Packs & Offres
          </h3>
        </div>
        <span className="text-sm text-slate-500">{packs.length} pack{packs.length > 1 ? "s" : ""}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {packs.map((pack) => (
          <PackCardV2 key={pack.id} pack={pack} onBuy={() => handleBuy(pack)} />
        ))}
      </div>

      <AuthModalV2
        isOpen={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingPackId(null);
        }}
        onAuthed={onAuthSuccess}
      />
    </div>
  );
}

/**
 * Utility: check if establishment has packs for conditional tab rendering.
 * Can be used by the parent page to decide whether to add the "Packs" tab.
 */
export { useEstablishmentPacks } from "@/hooks/usePacksV2";
