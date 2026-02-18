/**
 * MyLoyaltySection — Espace "Ma Fidélité" client (spec 4.3)
 *
 * 3 onglets : Mes cartes actives | Mes cadeaux | Historique
 * Chaque carte affiche le design personnalisé par le pro.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useMyLoyalty, useMyGifts, useClaimGift } from "@/hooks/useLoyaltyV2";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";

// =============================================================================
// Helpers
// =============================================================================

function estUrl(est: Record<string, unknown> | null): string | null {
  if (!est?.id) return null;
  return buildEstablishmentUrl({
    id: String(est.id),
    slug: est.slug ? String(est.slug) : null,
    name: est.name ? String(est.name) : null,
    universe: est.universe ? String(est.universe) : undefined,
  });
}

// =============================================================================
// Sub-components
// =============================================================================

function CardItem({ card }: { card: Record<string, unknown> }) {
  const program = card.program as Record<string, unknown> | null;
  const establishment = card.establishment as Record<string, unknown> | null;
  const design = (program?.card_design ?? {}) as Record<string, unknown>;

  const stampsCount = Number(card.stamps_count ?? 0);
  const stampsRequired = Number(program?.stamps_required ?? card.stamps_required ?? 10);
  const progress = Math.min(100, (stampsCount / stampsRequired) * 100);
  const status = String(card.status ?? "active");

  const isCompleted = status === "completed" || status === "reward_pending";
  const isFrozen = status === "frozen";
  const url = estUrl(establishment);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border shadow-sm transition-all
        ${isFrozen ? "opacity-60 grayscale" : ""}
        ${isCompleted ? "border-amber-300 ring-2 ring-amber-100" : "border-gray-200"}`}
      style={{
        background: design.secondary_color
          ? `linear-gradient(135deg, ${String(design.primary_color ?? "#6366f1")}, ${String(design.secondary_color)})`
          : String(design.primary_color ?? "#6366f1"),
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <h4 className="text-white font-bold text-lg leading-tight">
            {String(program?.name ?? "Programme Fidélité")}
          </h4>
          {url ? (
            <Link to={url} className="text-white/70 text-sm mt-0.5 hover:text-white/90 underline underline-offset-2">
              {String(establishment?.name ?? "")}
            </Link>
          ) : (
            <p className="text-white/70 text-sm mt-0.5">
              {String(establishment?.name ?? "")}
            </p>
          )}
        </div>
        {establishment?.logo_url && (
          <img
            src={String(establishment.logo_url)}
            alt=""
            className="w-10 h-10 rounded-lg bg-white/20 object-contain"
          />
        )}
      </div>

      {/* Stamps progress */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {Array.from({ length: stampsRequired }, (_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                ${i < stampsCount
                  ? "bg-white text-gray-800"
                  : "bg-white/20 text-white/50"}`}
            >
              {i < stampsCount ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-black/10 flex items-center justify-between">
        <div>
          {isCompleted ? (
            <span className="text-white font-semibold text-sm">
              Cadeau débloqué : {String(card.reward_description ?? program?.reward_description ?? "")}
            </span>
          ) : (
            <span className="text-white/80 text-sm">
              {stampsRequired - stampsCount} tampon{stampsRequired - stampsCount > 1 ? "s" : ""} restant{stampsRequired - stampsCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {card.expires_at && (
          <span className="text-white/50 text-xs">
            Exp. {new Date(String(card.expires_at)).toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>

      {/* Frozen overlay */}
      {isFrozen && (
        <div className="absolute inset-0 bg-gray-900/30 flex items-center justify-center">
          <span className="bg-gray-800/80 text-white px-3 py-1 rounded-full text-sm font-medium">
            Programme en pause
          </span>
        </div>
      )}

      {/* Conditional badge */}
      {program?.stamp_conditional && (
        <div className="absolute top-3 end-3 bg-white/90 text-gray-700 px-2 py-0.5 rounded-md text-xs font-medium">
          Min. {String(program.stamp_minimum_amount ?? 0)} {String(program.stamp_minimum_currency ?? "MAD")}
        </div>
      )}
    </div>
  );
}

function RewardItem({ reward }: { reward: Record<string, unknown> }) {
  const establishment = reward.establishment as Record<string, unknown> | null;
  const expiresAt = reward.expires_at ? new Date(String(reward.expires_at)) : null;
  const daysLeft = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isUrgent = daysLeft !== null && daysLeft <= 7;
  const url = estUrl(establishment);

  return (
    <div className={`p-4 rounded-xl border ${isUrgent ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start justify-between">
        <div>
          <h5 className="font-semibold text-gray-900">
            {String(reward.reward_description ?? "Cadeau")}
          </h5>
          {url ? (
            <Link to={url} className="text-sm text-primary mt-0.5 hover:underline">
              {String(establishment?.name ?? "")}
            </Link>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">
              {String(establishment?.name ?? "")}
            </p>
          )}
        </div>
        {isUrgent && (
          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
            J-{daysLeft}
          </span>
        )}
      </div>
      {expiresAt && (
        <p className="text-xs text-gray-400 mt-2">
          Expire le {expiresAt.toLocaleDateString("fr-FR")}
        </p>
      )}
      <p className="text-xs text-gray-400 mt-1">
        Présentez votre QR code au pro pour utiliser ce cadeau
      </p>
    </div>
  );
}

function GiftItem({
  gift,
  status,
}: {
  gift: Record<string, unknown>;
  status: "distributed" | "consumed" | "expired";
}) {
  const giftData = gift.gift as Record<string, unknown> | null;
  const establishment = (giftData?.establishment ?? null) as Record<string, unknown> | null;
  const url = estUrl(establishment);

  return (
    <div className={`p-4 rounded-xl border ${
      status === "distributed" ? "border-emerald-200 bg-emerald-50" :
      status === "consumed" ? "border-gray-200 bg-gray-50" :
      "border-gray-200 bg-gray-50 opacity-60"
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <h5 className="font-semibold text-gray-900">
            {String(giftData?.description ?? "Cadeau sam.ma")}
          </h5>
          {url ? (
            <Link to={url} className="text-sm text-primary mt-0.5 hover:underline">
              {String(establishment?.name ?? "")}
            </Link>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">
              {String(establishment?.name ?? "")}
            </p>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          status === "distributed" ? "bg-emerald-100 text-emerald-700" :
          status === "consumed" ? "bg-gray-200 text-gray-600" :
          "bg-gray-200 text-gray-400"
        }`}>
          {status === "distributed" ? "À utiliser" :
           status === "consumed" ? "Utilisé" : "Expiré"}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type Tab = "cards" | "rewards" | "history";

export function MyLoyaltySection() {
  const [tab, setTab] = useState<Tab>("cards");
  const { data: loyaltyData, loading: loyaltyLoading, refresh: refreshLoyalty } = useMyLoyalty();
  const { data: giftsData, loading: giftsLoading, refresh: refreshGifts } = useMyGifts();

  const loading = loyaltyLoading || giftsLoading;

  // Auto-refresh when switching to "rewards" tab (fixes stale cache issue)
  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    if (newTab === "rewards") {
      void refreshLoyalty();
      void refreshGifts();
    }
  }, [refreshLoyalty, refreshGifts]);

  // Refresh when page becomes visible again (e.g. after scanning QR at establishment)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void refreshLoyalty();
        void refreshGifts();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshLoyalty, refreshGifts]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    {
      key: "cards",
      label: "Mes cartes",
      count: loyaltyData?.active_cards?.length ?? 0,
    },
    {
      key: "rewards",
      label: "Mes cadeaux",
      count:
        (loyaltyData?.pending_rewards?.length ?? 0) +
        (giftsData?.distributed?.length ?? 0),
    },
    {
      key: "history",
      label: "Historique",
    },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors
              ${tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ms-1.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-xs">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-400">Chargement...</div>
      )}

      {/* Mes cartes actives */}
      {!loading && tab === "cards" && (
        <div>
          {(loyaltyData?.active_cards ?? []).length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>Aucune carte de fidélité active</p>
              <p className="text-sm mt-1">
                Vos cartes s'activeront automatiquement lors de votre prochaine visite !
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(loyaltyData?.active_cards ?? []).map((card, i) => (
                <CardItem key={i} card={card as Record<string, unknown>} />
              ))}
            </div>
          )}

          {/* Cartes gelées */}
          {(loyaltyData?.frozen_cards ?? []).length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Programmes en pause</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(loyaltyData?.frozen_cards ?? []).map((card, i) => (
                  <CardItem key={i} card={card as Record<string, unknown>} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mes cadeaux */}
      {!loading && tab === "rewards" && (
        <div className="space-y-4">
          {/* Cadeaux fidélité */}
          {(loyaltyData?.pending_rewards ?? []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Cadeaux fidélité</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(loyaltyData?.pending_rewards ?? []).map((r, i) => (
                  <RewardItem key={i} reward={r as Record<string, unknown>} />
                ))}
              </div>
            </div>
          )}

          {/* Cadeaux sam.ma */}
          {(giftsData?.distributed ?? []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Cadeaux sam.ma</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(giftsData?.distributed ?? []).map((g, i) => (
                  <GiftItem key={i} gift={g as Record<string, unknown>} status="distributed" />
                ))}
              </div>
            </div>
          )}

          {(loyaltyData?.pending_rewards ?? []).length === 0 &&
            (giftsData?.distributed ?? []).length === 0 && (
              <div className="text-center py-8 text-gray-400">
                Aucun cadeau à utiliser pour le moment
              </div>
            )}
        </div>
      )}

      {/* Historique */}
      {!loading && tab === "history" && (
        <div className="space-y-4">
          {/* Cartes complétées */}
          {(loyaltyData?.completed_cards ?? []).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(loyaltyData?.completed_cards ?? []).map((card, i) => {
              const c = card as Record<string, unknown>;
              const est = c.establishment as Record<string, unknown> | null;
              return (
                <div key={i} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {String((c.program as Record<string, unknown>)?.name ?? "Programme")}
                      </span>
                      <span className="text-xs text-gray-400 ms-2">
                        {String(est?.name ?? "")}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.status === "reward_used"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-500"
                    }`}>
                      {c.status === "reward_used" ? "Cadeau utilisé" : "Expirée"}
                    </span>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              Aucun historique pour le moment
            </div>
          )}

          {/* Cadeaux sam.ma consommés */}
          {(giftsData?.consumed ?? []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Cadeaux sam.ma utilisés</h4>
              {(giftsData?.consumed ?? []).map((g, i) => (
                <GiftItem key={i} gift={g as Record<string, unknown>} status="consumed" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MyLoyaltySection;
