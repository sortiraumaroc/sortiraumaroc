/**
 * MyPacksSection — 5.5: Espace "Mes Packs" (Client)
 *
 * Packs actifs avec QR Code, utilisations restantes, date d'expiration.
 * Packs consommés (historique). Packs expirés.
 * Bouton remboursement si éligible.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Gift, QrCode, Calendar, Clock, Tag, ChevronDown, ChevronUp,
  RefreshCw, Download, CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useMyPacks } from "@/hooks/usePacksV2";
import type { PackPurchaseV2 } from "../../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

type PurchaseGroup = "active" | "consumed" | "expired";

function classifyPurchase(p: PackPurchaseV2): PurchaseGroup {
  if (p.status === "consumed" || p.status === "fully_consumed") return "consumed";
  if (p.status === "expired" || p.status === "refunded") return "expired";
  return "active";
}

function statusBadge(p: PackPurchaseV2): { text: string; className: string } {
  switch (p.status) {
    case "active":
      return { text: "Actif", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "consumed":
    case "fully_consumed":
      return { text: "Consommé", className: "bg-slate-100 text-slate-600 border-slate-200" };
    case "expired":
      return { text: "Expiré", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "refunded":
      return { text: "Remboursé", className: "bg-slate-100 text-slate-500 border-slate-200" };
    case "partially_consumed":
      return { text: "En cours", className: "bg-blue-100 text-blue-700 border-blue-200" };
    default:
      return { text: p.status ?? "—", className: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

// =============================================================================
// PurchaseCard
// =============================================================================

function PurchaseCard({
  purchase,
  onRefund,
  refundLoading,
}: {
  purchase: PackPurchaseV2;
  onRefund?: (purchaseId: string) => void;
  refundLoading?: boolean;
}) {
  const badge = statusBadge(purchase);
  const isActive = classifyPurchase(purchase) === "active";
  const usesRemaining = purchase.is_multi_use
    ? (purchase.uses_remaining ?? 0)
    : purchase.status === "active" ? 1 : 0;

  const isRefundEligible = isActive && purchase.payment_status === "completed";
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[#a3001d]/[0.04] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Gift className="h-5 w-5 text-[#a3001d] shrink-0" />
          <span className="font-bold text-slate-900 truncate">{(purchase as any).pack_title ?? "Pack"}</span>
        </div>
        <span className={cn("shrink-0 px-3 py-1 rounded-full border text-xs font-bold", badge.className)}>
          {badge.text}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Details row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          {purchase.total_price != null && (
            <span className="font-semibold text-slate-900">{formatCurrency(purchase.total_price)}</span>
          )}
          {purchase.expires_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Expire le {formatDate(purchase.expires_at)}
            </span>
          )}
        </div>

        {/* Multi-use progress */}
        {purchase.is_multi_use && purchase.uses_total && purchase.uses_total > 1 && (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span>Utilisations</span>
              <span className="font-semibold">{(purchase.uses_total - (purchase.uses_remaining ?? 0))} / {purchase.uses_total}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#a3001d] rounded-full transition-all"
                style={{ width: `${Math.min(100, ((purchase.uses_total - (purchase.uses_remaining ?? 0)) / purchase.uses_total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* QR Code area */}
        {isActive && purchase.qr_code_token && (
          <div>
            <button
              type="button"
              onClick={() => setShowQr(!showQr)}
              className="flex items-center gap-2 text-sm text-[#a3001d] font-semibold hover:text-[#a3001d]/80"
            >
              <QrCode className="h-4 w-4" />
              {showQr ? "Masquer le QR Code" : "Afficher le QR Code"}
              {showQr ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showQr && (
              <div className="mt-3 flex flex-col items-center gap-2 p-4 bg-white border border-slate-200 rounded-xl">
                {/* QR Code via a simple data display — in production use a QR library */}
                <div className="h-40 w-40 bg-slate-100 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300">
                  <div className="text-center">
                    <QrCode className="h-12 w-12 text-slate-400 mx-auto" />
                    <p className="mt-1 text-xs text-slate-500 font-mono break-all max-w-[140px]">
                      {purchase.qr_code_token}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 text-center">
                  Présentez ce code au moment de la consommation
                </p>
                {usesRemaining > 0 && (
                  <p className="text-xs font-semibold text-[#a3001d]">
                    {usesRemaining} utilisation{usesRemaining > 1 ? "s" : ""} restante{usesRemaining > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {isRefundEligible && onRefund && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onRefund(purchase.id)}
              disabled={refundLoading}
              className="h-9 px-4 text-xs font-semibold rounded-lg border-slate-200"
            >
              {refundLoading ? "..." : "Demander un remboursement"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MyPacksSection — main export
// =============================================================================

export function MyPacksSection({ className }: { className?: string }) {
  const { purchases, loading, error, fetch: fetchPacks, refund } = useMyPacks();
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<PurchaseGroup>("active");

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const grouped = {
    active: purchases.filter((p) => classifyPurchase(p) === "active"),
    consumed: purchases.filter((p) => classifyPurchase(p) === "consumed"),
    expired: purchases.filter((p) => classifyPurchase(p) === "expired"),
  };

  const handleRefund = useCallback(
    async (purchaseId: string) => {
      setRefundLoading(true);
      setRefundMsg(null);
      try {
        await refund(purchaseId, "Demande de remboursement depuis l'espace Mes Packs");
        setRefundMsg({ type: "success", text: "Demande de remboursement envoyée !" });
        fetchPacks();
      } catch (e: any) {
        setRefundMsg({ type: "error", text: e.message ?? "Erreur lors de la demande" });
      } finally {
        setRefundLoading(false);
      }
    },
    [refund, fetchPacks],
  );

  const tabs: Array<{ id: PurchaseGroup; label: string; count: number }> = [
    { id: "active", label: "Actifs", count: grouped.active.length },
    { id: "consumed", label: "Consommés", count: grouped.consumed.length },
    { id: "expired", label: "Expirés", count: grouped.expired.length },
  ];

  const currentList = grouped[activeTab];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-[#a3001d]" />
          <h2 className="text-lg font-bold text-slate-900">Mes Packs</h2>
        </div>
        <button
          type="button"
          onClick={() => fetchPacks()}
          disabled={loading}
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition",
              activeTab === tab.id
                ? "bg-[#a3001d] text-white border-[#a3001d]"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Refund message */}
      {refundMsg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          refundMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {refundMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {refundMsg.text}
        </div>
      )}

      {/* Content */}
      {loading && purchases.length === 0 ? (
        <div className="py-8 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
          <p className="mt-2 text-sm text-slate-500">Chargement...</p>
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-600">{error}</div>
      ) : currentList.length === 0 ? (
        <div className="py-8 text-center">
          <Gift className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            {activeTab === "active" ? "Aucun pack actif" : activeTab === "consumed" ? "Aucun pack consommé" : "Aucun pack expiré"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((p) => (
            <PurchaseCard
              key={p.id}
              purchase={p}
              onRefund={activeTab === "active" ? handleRefund : undefined}
              refundLoading={refundLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
