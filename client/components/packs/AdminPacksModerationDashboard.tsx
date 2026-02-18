/**
 * AdminPacksModerationDashboard — 5.8: Dashboard Admin modération Packs
 *
 * File d'attente des Packs à modérer.
 * Outils: approuver, rejeter (motif), demander modification.
 * Mise en avant sur la page d'accueil (featured).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Shield, CheckCircle, XCircle, Edit, Star, StarOff,
  AlertTriangle, Gift, Eye, RefreshCw, ChevronDown, ChevronUp,
  Clock, Filter,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AdminPacksNav } from "@/pages/admin/packs/AdminPacksNav";
import {
  getModerationQueue, approvePack, rejectPack,
  requestPackModification, featurePack, unfeaturePack,
} from "@/lib/packsV2AdminApi";
import type { PackV2 } from "../../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// =============================================================================
// Moderation status filter
// =============================================================================

const STATUS_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "pending_moderation", label: "En attente" },
  { id: "active", label: "Actifs" },
  { id: "rejected", label: "Rejetés" },
  { id: "modification_requested", label: "Modification" },
] as const;

// =============================================================================
// ModerationPackCard
// =============================================================================

function ModerationPackCard({
  pack,
  onAction,
  actionLoading,
}: {
  pack: PackV2;
  onAction: (action: string, packId: string, payload?: string) => void;
  actionLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [modNote, setModNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showMod, setShowMod] = useState(false);

  const isPending = pack.moderation_status === "pending_moderation";
  const isActive = pack.moderation_status === "active" || pack.moderation_status === "approved";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {pack.is_featured && (
                <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
              )}
              <h4 className="text-base font-bold text-slate-900 truncate">{pack.title}</h4>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{formatCurrency(pack.price)}</span>
              {pack.original_price && pack.original_price > pack.price && (
                <span className="line-through">{formatCurrency(pack.original_price)}</span>
              )}
              <span>Stock: {pack.stock ?? "∞"}</span>
              <span>Créé: {formatDate(pack.created_at)}</span>
            </div>
            {pack.short_description && (
              <p className="mt-1 text-sm text-slate-600 line-clamp-2">{pack.short_description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 space-y-3 text-sm">
            {pack.detailed_description && (
              <div>
                <span className="font-semibold text-slate-700">Description :</span>
                <p className="text-slate-600">{pack.detailed_description}</p>
              </div>
            )}
            {pack.inclusions && pack.inclusions.length > 0 && (
              <div>
                <span className="font-semibold text-slate-700">Inclusions :</span>
                <ul className="list-disc ms-5 text-slate-600">
                  {pack.inclusions.map((inc, i) => <li key={i}>{inc.label}{inc.description ? ` — ${inc.description}` : ""}</li>)}
                </ul>
              </div>
            )}
            {pack.conditions && (
              <div>
                <span className="font-semibold text-slate-700">Conditions :</span>
                <p className="text-slate-600">{pack.conditions}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {isPending && (
            <>
              <Button
                onClick={() => onAction("approve", pack.id)}
                disabled={actionLoading}
                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg"
              >
                <CheckCircle className="h-3.5 w-3.5 me-1" /> Approuver
              </Button>
              <Button
                onClick={() => setShowReject(!showReject)}
                variant="outline"
                className="h-9 px-4 border-red-200 text-red-600 text-sm font-semibold rounded-lg"
              >
                <XCircle className="h-3.5 w-3.5 me-1" /> Rejeter
              </Button>
              <Button
                onClick={() => setShowMod(!showMod)}
                variant="outline"
                className="h-9 px-4 border-orange-200 text-orange-600 text-sm font-semibold rounded-lg"
              >
                <Edit className="h-3.5 w-3.5 me-1" /> Modifier
              </Button>
            </>
          )}
          {isActive && !pack.is_featured && (
            <Button
              onClick={() => onAction("feature", pack.id)}
              disabled={actionLoading}
              variant="outline"
              className="h-9 px-4 border-amber-200 text-amber-600 text-sm font-semibold rounded-lg"
            >
              <Star className="h-3.5 w-3.5 me-1" /> Mettre en avant
            </Button>
          )}
          {isActive && pack.is_featured && (
            <Button
              onClick={() => onAction("unfeature", pack.id)}
              disabled={actionLoading}
              variant="outline"
              className="h-9 px-4 border-slate-200 text-slate-600 text-sm font-semibold rounded-lg"
            >
              <StarOff className="h-3.5 w-3.5 me-1" /> Retirer mise en avant
            </Button>
          )}
        </div>

        {/* Reject form */}
        {showReject && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motif du rejet..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <Button
              onClick={() => { onAction("reject", pack.id, rejectReason); setShowReject(false); }}
              disabled={!rejectReason.trim() || actionLoading}
              className="h-8 px-4 bg-red-600 text-white text-xs font-semibold rounded-lg"
            >
              Confirmer le rejet
            </Button>
          </div>
        )}

        {/* Modification form */}
        {showMod && (
          <div className="mt-3 p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
            <textarea
              value={modNote}
              onChange={(e) => setModNote(e.target.value)}
              placeholder="Détails des modifications demandées..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <Button
              onClick={() => { onAction("request_modification", pack.id, modNote); setShowMod(false); }}
              disabled={!modNote.trim() || actionLoading}
              className="h-8 px-4 bg-orange-600 text-white text-xs font-semibold rounded-lg"
            >
              Envoyer la demande
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// AdminPacksModerationDashboard — main export
// =============================================================================

export function AdminPacksModerationDashboard({ className }: { className?: string }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<PackV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_moderation");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getModerationQueue(filter);
      setPacks(res.packs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = useCallback(async (action: string, packId: string, payload?: string) => {
    setActionLoading(true);
    setMsg(null);
    try {
      switch (action) {
        case "approve":
          await approvePack(packId);
          setMsg({ type: "success", text: "Pack approuvé" });
          break;
        case "reject":
          await rejectPack(packId, payload ?? "");
          setMsg({ type: "success", text: "Pack rejeté" });
          break;
        case "request_modification":
          await requestPackModification(packId, payload ?? "");
          setMsg({ type: "success", text: "Demande de modification envoyée" });
          break;
        case "feature":
          await featurePack(packId);
          setMsg({ type: "success", text: "Pack mis en avant" });
          break;
        case "unfeature":
          await unfeaturePack(packId);
          setMsg({ type: "success", text: "Mise en avant retirée" });
          break;
      }
      fetchQueue();
    } catch (e: any) {
      setMsg({ type: "error", text: e.message ?? "Erreur" });
    } finally {
      setActionLoading(false);
    }
  }, [fetchQueue]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Packs sub-navigation */}
      <AdminPacksNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#a3001d]" />
          <h2 className="text-lg font-bold text-slate-900">Modération Packs</h2>
        </div>
        <button onClick={fetchQueue} disabled={loading} className="text-sm text-slate-500 hover:text-slate-700">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 h-8 rounded-full px-3.5 text-xs font-semibold border transition",
              filter === f.id
                ? "bg-[#a3001d] text-white border-[#a3001d]"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {msg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {msg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-8 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
        </div>
      ) : packs.length === 0 ? (
        <div className="py-8 text-center">
          <Gift className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Aucun pack dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packs.map((pack) => (
            <ModerationPackCard key={pack.id} pack={pack} onAction={handleAction} actionLoading={actionLoading} />
          ))}
        </div>
      )}
    </div>
  );
}
