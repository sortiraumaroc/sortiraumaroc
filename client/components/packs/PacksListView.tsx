/**
 * PacksListView — Vue unifiée de la liste des packs (Admin + Pro)
 *
 * Composant partagé qui affiche les packs en format cartes avec des actions
 * contextuelles selon le rôle (admin ou pro). Utilisé par :
 * - AdminEstablishmentDetailsPage (rôle admin)
 * - ProPacksDashboard (rôle pro)
 */

import { useState } from "react";
import {
  Gift, Eye, Pause, Play, Copy, BarChart3,
  Edit, Send, XCircle, CheckCircle, RefreshCw,
  AlertTriangle, Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// =============================================================================
// Types
// =============================================================================

export type PackListPack = {
  id: string;
  title: string;
  price: number; // centimes
  original_price?: number | null;
  stock?: number | null;
  sold_count?: number | null;
  moderation_status: string;
  active?: boolean;
  cover_url?: string | null;
  short_description?: string | null;
};

type PackStats = {
  soldCount: number;
  consumedCount: number;
  remaining: number | null;
  totalRevenue: number;
};

export type PacksListViewProps = {
  packs: PackListPack[];
  loading?: boolean;
  role: "admin" | "pro";
  // Pro actions
  onEdit?: (packId: string) => void;
  onSubmit?: (packId: string) => void;
  onSuspend?: (packId: string) => void;
  onResume?: (packId: string) => void;
  onDuplicate?: (packId: string) => void;
  onClose?: (packId: string) => void;
  onDelete?: (packId: string) => void;
  onGetStats?: (packId: string) => Promise<PackStats>;
  // Admin actions
  onApprove?: (packId: string) => void;
  onReject?: (packId: string) => void;
  onRequestModification?: (packId: string) => void;
  // Common
  actionLoading?: string | null;
  className?: string;
};

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function moderationBadge(status: string): { text: string; className: string } {
  switch (status) {
    case "draft": return { text: "Brouillon", className: "bg-slate-100 text-slate-600" };
    case "pending_moderation": return { text: "En attente", className: "bg-amber-100 text-amber-700" };
    case "approved": return { text: "Approuvé", className: "bg-blue-100 text-blue-700" };
    case "active": return { text: "Actif", className: "bg-emerald-100 text-emerald-700" };
    case "rejected": return { text: "Rejeté", className: "bg-red-100 text-red-700" };
    case "modification_requested": return { text: "Modification", className: "bg-orange-100 text-orange-700" };
    case "suspended": return { text: "Suspendu", className: "bg-slate-200 text-slate-600" };
    case "ended": return { text: "Terminé", className: "bg-slate-100 text-slate-500" };
    case "sold_out": return { text: "Épuisé", className: "bg-red-50 text-red-600" };
    default: return { text: status, className: "bg-slate-100 text-slate-600" };
  }
}

// =============================================================================
// PackCard — single card
// =============================================================================

function PackCard({
  pack,
  role,
  onEdit,
  onSubmit,
  onSuspend,
  onResume,
  onDuplicate,
  onClose,
  onDelete,
  onGetStats,
  onApprove,
  onReject,
  onRequestModification,
  actionLoading,
}: {
  pack: PackListPack;
  role: "admin" | "pro";
  onEdit?: (packId: string) => void;
  onSubmit?: (packId: string) => void;
  onSuspend?: (packId: string) => void;
  onResume?: (packId: string) => void;
  onDuplicate?: (packId: string) => void;
  onClose?: (packId: string) => void;
  onDelete?: (packId: string) => void;
  onGetStats?: (packId: string) => Promise<PackStats>;
  onApprove?: (packId: string) => void;
  onReject?: (packId: string) => void;
  onRequestModification?: (packId: string) => void;
  actionLoading?: string | null;
}) {
  const badge = moderationBadge(pack.moderation_status);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<PackStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const isLoading = actionLoading === pack.id;

  const loadStats = async () => {
    if (!onGetStats) return;
    if (stats) { setShowStats(!showStats); return; }
    setStatsLoading(true);
    try {
      const s = await onGetStats(pack.id);
      setStats(s);
      setShowStats(true);
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  };

  const isPending = pack.moderation_status === "pending_moderation";
  const isDraft = pack.moderation_status === "draft";
  const isModifRequested = pack.moderation_status === "modification_requested";
  const isActive = pack.moderation_status === "active";
  const isSuspended = pack.moderation_status === "suspended";
  const canReject = isPending || pack.moderation_status === "approved" || isActive;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-bold", badge.className)}>
              {badge.text}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 truncate">{pack.title}</h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
            <span>{formatCurrency(pack.price)}</span>
            {pack.original_price && pack.original_price > pack.price && (
              <span className="line-through text-slate-400">{formatCurrency(pack.original_price)}</span>
            )}
            {pack.stock != null && (
              <span>Stock: {pack.sold_count ?? 0}/{pack.stock}</span>
            )}
            {pack.active !== undefined && (
              <span>{pack.active ? "Actif" : "Inactif"}</span>
            )}
          </div>
          {pack.short_description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-1">{pack.short_description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5">
          {/* === PRO ACTIONS === */}
          {role === "pro" && (isDraft || isModifRequested) && onEdit && (
            <button onClick={() => onEdit(pack.id)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Modifier">
              <Edit className="h-3.5 w-3.5" />
            </button>
          )}
          {role === "pro" && (isDraft || isModifRequested) && onSubmit && (
            <button onClick={() => onSubmit(pack.id)} className="h-8 w-8 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100" title="Soumettre">
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
          {role === "pro" && isActive && onSuspend && (
            <button onClick={() => onSuspend(pack.id)} className="h-8 w-8 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center text-amber-600 hover:bg-amber-100" title="Suspendre">
              <Pause className="h-3.5 w-3.5" />
            </button>
          )}
          {role === "pro" && isSuspended && onResume && (
            <button onClick={() => onResume(pack.id)} className="h-8 w-8 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100" title="Reprendre">
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {role === "pro" && onDuplicate && (
            <button onClick={() => onDuplicate(pack.id)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Dupliquer">
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {role === "pro" && !["ended", "sold_out", "draft", "rejected"].includes(pack.moderation_status) && onClose && (
            <button onClick={() => onClose(pack.id)} className="h-8 w-8 rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100" title="Clôturer">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {role === "pro" && (isDraft || pack.moderation_status === "rejected" || pack.moderation_status === "ended") && onDelete && (
            <button onClick={() => onDelete(pack.id)} className="h-8 w-8 rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100" title="Supprimer">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* === ADMIN ACTIONS === */}
          {role === "admin" && isPending && onApprove && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              disabled={isLoading}
              onClick={() => onApprove(pack.id)}
            >
              {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              <span className="ml-1">Approuver</span>
            </Button>
          )}
          {role === "admin" && isPending && onRequestModification && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-sky-700 border-sky-300 hover:bg-sky-50"
              disabled={isLoading}
              onClick={() => onRequestModification(pack.id)}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="ml-1">Modifier</span>
            </Button>
          )}
          {role === "admin" && canReject && onReject && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-red-700 border-red-300 hover:bg-red-50"
              disabled={isLoading}
              onClick={() => onReject(pack.id)}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span className="ml-1">Refuser</span>
            </Button>
          )}

          {/* Stats (pro only) */}
          {role === "pro" && onGetStats && (
            <button onClick={loadStats} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Statistiques">
              {statsLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Stats panel (pro) */}
      {showStats && stats && (
        <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500">Vendus</span>
            <div className="font-bold text-slate-900">{stats.soldCount}</div>
          </div>
          <div>
            <span className="text-slate-500">Consommés</span>
            <div className="font-bold text-slate-900">{stats.consumedCount}</div>
          </div>
          <div>
            <span className="text-slate-500">Stock restant</span>
            <div className="font-bold text-slate-900">{stats.remaining ?? "∞"}</div>
          </div>
          <div>
            <span className="text-slate-500">CA brut</span>
            <div className="font-bold text-[#a3001d]">{formatCurrency(stats.totalRevenue)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PacksListView — main export
// =============================================================================

export function PacksListView({
  packs,
  loading,
  role,
  onEdit,
  onSubmit,
  onSuspend,
  onResume,
  onDuplicate,
  onClose,
  onDelete,
  onGetStats,
  onApprove,
  onReject,
  onRequestModification,
  actionLoading,
  className,
}: PacksListViewProps) {
  if (loading) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <Gift className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">Aucun pack</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {packs.map((pack) => (
        <PackCard
          key={pack.id}
          pack={pack}
          role={role}
          onEdit={onEdit}
          onSubmit={onSubmit}
          onSuspend={onSuspend}
          onResume={onResume}
          onDuplicate={onDuplicate}
          onClose={onClose}
          onDelete={onDelete}
          onGetStats={onGetStats}
          onApprove={onApprove}
          onReject={onReject}
          onRequestModification={onRequestModification}
          actionLoading={actionLoading}
        />
      ))}
    </div>
  );
}
