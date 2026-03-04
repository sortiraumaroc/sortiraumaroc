/**
 * ProRamadanTab — Onglet Ramadan dans l'espace Pro
 *
 * Liste les offres Ramadan de l'établissement sélectionné.
 * Permet de créer, modifier, soumettre, suspendre, supprimer les offres.
 */

import { useEffect, useState, useCallback } from "react";
import { Moon, Plus, Send, Pause, Play, Trash2, Edit, Eye, BarChart3, MousePointerClick, Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  listMyRamadanOffers,
  submitRamadanOfferForModeration,
  suspendRamadanOffer,
  resumeRamadanOffer,
  deleteRamadanOffer,
  getRamadanOfferStats,
} from "@/lib/pro/ramadanApi";
import { ProRamadanOfferForm } from "@/components/pro/ramadan/ProRamadanOfferForm";
import type { RamadanOfferRow } from "../../../../shared/ramadanTypes";
import {
  RAMADAN_OFFER_TYPE_LABELS,
  RAMADAN_OFFER_STATUS_LABELS,
} from "../../../../shared/ramadanTypes";

// =============================================================================
// Types
// =============================================================================

type Props = {
  establishmentId: string;
};

// =============================================================================
// Helpers
// =============================================================================

function statusBadgeColor(status: string): string {
  switch (status) {
    case "draft": return "bg-slate-100 text-slate-700";
    case "pending_moderation": return "bg-amber-100 text-amber-700";
    case "approved": return "bg-blue-100 text-blue-700";
    case "active": return "bg-emerald-100 text-emerald-700";
    case "rejected": return "bg-red-100 text-red-700";
    case "modification_requested": return "bg-orange-100 text-orange-700";
    case "suspended": return "bg-slate-200 text-slate-600";
    case "expired": return "bg-slate-200 text-slate-500";
    default: return "bg-slate-100 text-slate-700";
  }
}

function formatPrice(centimes: number): string {
  return `${(centimes / 100).toFixed(0)} MAD`;
}

// =============================================================================
// Component
// =============================================================================

export function ProRamadanTab({ establishmentId }: Props) {
  const [offers, setOffers] = useState<RamadanOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<RamadanOfferRow | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, { total_clicks: number; total_impressions: number; unique_click_visitors: number; unique_impression_visitors: number } | null>>({});
  const [statsLoadingId, setStatsLoadingId] = useState<string | null>(null);
  const [expandedStatsId, setExpandedStatsId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadOffers = useCallback(async () => {
    try {
      const res = await listMyRamadanOffers(establishmentId);
      setOffers(res.offers);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [establishmentId, toast]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const handleSubmit = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await submitRamadanOfferForModeration(offerId, establishmentId);
      toast({ title: "Offre soumise", description: "Votre offre a été envoyée pour modération." });
      await loadOffers();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await suspendRamadanOffer(offerId, establishmentId);
      toast({ title: "Offre suspendue" });
      await loadOffers();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await resumeRamadanOffer(offerId, establishmentId);
      toast({ title: "Offre réactivée" });
      await loadOffers();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await deleteRamadanOffer(offerId);
      toast({ title: "Offre supprimée" });
      await loadOffers();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStats = async (offerId: string) => {
    // Toggle collapse
    if (expandedStatsId === offerId) {
      setExpandedStatsId(null);
      return;
    }
    setExpandedStatsId(offerId);
    // If already loaded, just expand
    if (statsMap[offerId]) return;
    // Load stats
    setStatsLoadingId(offerId);
    try {
      const res = await getRamadanOfferStats(offerId);
      setStatsMap((prev) => ({
        ...prev,
        [offerId]: {
          total_clicks: res.stats.total_clicks,
          total_impressions: res.stats.total_impressions,
          unique_click_visitors: res.stats.unique_click_visitors,
          unique_impression_visitors: res.stats.unique_impression_visitors,
        },
      }));
    } catch {
      // silent
    } finally {
      setStatsLoadingId(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingOffer(null);
    loadOffers();
  };

  // Formulaire de création/édition
  if (showForm || editingOffer) {
    return (
      <ProRamadanOfferForm
        establishmentId={establishmentId}
        existingOffer={editingOffer}
        onSuccess={handleFormSuccess}
        onCancel={() => { setShowForm(false); setEditingOffer(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon className="h-6 w-6 text-amber-500" />
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Offres Ramadan</h2>
            <p className="text-sm text-slate-500">
              {offers.length} offre{offers.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {/* Un seul bouton : "Créer ma première offre" quand 0, sinon "Nouvelle offre" */}
        {!loading && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {offers.length === 0 ? "Créer ma première offre" : "Nouvelle offre"}
          </Button>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : !offers.length ? (
        <div className="text-center py-12 text-slate-500">
          <Moon className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Aucune offre Ramadan créée.</p>
          <p className="text-xs text-slate-400 mt-1">Cliquez sur le bouton ci-dessus pour commencer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const isLoading = actionLoading === offer.id;
            const canEdit = ["draft", "modification_requested", "rejected"].includes(offer.moderation_status);
            const canSubmit = ["draft", "modification_requested"].includes(offer.moderation_status);
            const canSuspend = offer.moderation_status === "active";
            const canResume = offer.moderation_status === "suspended";
            const canDelete = ["draft", "rejected"].includes(offer.moderation_status);

            return (
              <div
                key={offer.id}
                className="rounded-lg border bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Cover */}
                  <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    {offer.cover_url ? (
                      <img src={offer.cover_url} alt={offer.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-2xl">🌙</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn("text-[10px] px-1.5 py-0", statusBadgeColor(offer.moderation_status))}>
                        {RAMADAN_OFFER_STATUS_LABELS[offer.moderation_status] ?? offer.moderation_status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {RAMADAN_OFFER_TYPE_LABELS[offer.type] ?? offer.type}
                      </Badge>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{offer.title}</h3>
                    <div className="text-sm text-primary font-bold mt-0.5">
                      {formatPrice(offer.price)}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {offer.valid_from} → {offer.valid_to} · {offer.capacity_per_slot} places/créneau
                    </div>

                    {/* Rejection reason */}
                    {offer.rejection_reason ? (
                      <div className="mt-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                        Motif : {offer.rejection_reason}
                      </div>
                    ) : null}

                    {/* Modification note */}
                    {offer.moderation_note && offer.moderation_status === "modification_requested" ? (
                      <div className="mt-1 text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                        Note : {offer.moderation_note}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canEdit ? (
                      <Button variant="outline" size="sm" onClick={() => setEditingOffer(offer)} disabled={isLoading}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canSubmit ? (
                      <Button variant="outline" size="sm" onClick={() => handleSubmit(offer.id)} disabled={isLoading}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canSuspend ? (
                      <Button variant="outline" size="sm" onClick={() => handleSuspend(offer.id)} disabled={isLoading}>
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canResume ? (
                      <Button variant="outline" size="sm" onClick={() => handleResume(offer.id)} disabled={isLoading}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(offer.id)} disabled={isLoading}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {/* Stats toggle */}
                    <Button variant="outline" size="sm" onClick={() => handleToggleStats(offer.id)} disabled={statsLoadingId === offer.id}>
                      {statsLoadingId === offer.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Stats panel */}
                {expandedStatsId === offer.id && (
                  <div className="border-t border-slate-100 mt-3 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {statsMap[offer.id] ? (
                      <>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-medium">Impressions</span>
                          </div>
                          <div className="text-lg font-bold text-slate-900">{statsMap[offer.id]!.total_impressions}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                            <MousePointerClick className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-medium">Clics</span>
                          </div>
                          <div className="text-lg font-bold text-slate-900">{statsMap[offer.id]!.total_clicks}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                            <Users className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-medium">Visiteurs</span>
                          </div>
                          <div className="text-lg font-bold text-slate-900">{statsMap[offer.id]!.unique_impression_visitors}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1 text-amber-500 mb-0.5">
                            <MousePointerClick className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-medium">Cliqueurs</span>
                          </div>
                          <div className="text-lg font-bold text-amber-600">{statsMap[offer.id]!.unique_click_visitors}</div>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-4 text-center text-xs text-slate-400">Chargement...</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ProRamadanTab;
