/**
 * AdminRamadanModerationPage — Page de modération des offres Ramadan
 *
 * Queue de modération avec actions : approuver, rejeter, demander modification.
 * Dashboard de stats rapides.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Moon,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Star,
  BarChart3,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AdminReservationsNav } from "./reservations/AdminReservationsNav";
import { useToast } from "@/hooks/use-toast";
import {
  getRamadanModerationQueue,
  getRamadanStats,
  approveRamadanOffer,
  rejectRamadanOffer,
  requestRamadanOfferModification,
  featureRamadanOffer,
  unfeatureRamadanOffer,
  suspendRamadanOffer,
  resumeRamadanOffer,
  deleteRamadanOffer,
} from "@/lib/ramadanAdminApi";
import type { RamadanOfferWithEstablishment } from "@/lib/ramadanAdminApi";
import {
  RAMADAN_OFFER_TYPE_LABELS,
  RAMADAN_OFFER_STATUS_LABELS,
} from "../../../shared/ramadanTypes";

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

export default function AdminRamadanModerationPage() {
  const { toast } = useToast();

  // State
  const [offers, setOffers] = useState<RamadanOfferWithEstablishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending_moderation");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [totalReservations, setTotalReservations] = useState(0);
  const [totalScans, setTotalScans] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialogs
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [modifDialogOpen, setModifDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dialogOfferId, setDialogOfferId] = useState("");
  const [dialogText, setDialogText] = useState("");

  const loadOffers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRamadanModerationQueue(statusFilter);
      setOffers(res.offers);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await getRamadanStats();
      setStats(res.stats.by_status);
      setTotalReservations(res.stats.total_reservations);
      setTotalScans(res.stats.total_valid_scans);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { loadOffers(); }, [loadOffers]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Actions
  const handleApprove = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await approveRamadanOffer(offerId);
      toast({ title: "Offre approuvée" });
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!dialogText.trim()) return;
    setActionLoading(dialogOfferId);
    try {
      await rejectRamadanOffer(dialogOfferId, dialogText.trim());
      toast({ title: "Offre rejetée" });
      setRejectDialogOpen(false);
      setDialogText("");
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestModification = async () => {
    if (!dialogText.trim()) return;
    setActionLoading(dialogOfferId);
    try {
      await requestRamadanOfferModification(dialogOfferId, dialogText.trim());
      toast({ title: "Modification demandée" });
      setModifDialogOpen(false);
      setDialogText("");
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFeature = async (offerId: string, featured: boolean) => {
    try {
      if (featured) {
        await featureRamadanOffer(offerId);
      } else {
        await unfeatureRamadanOffer(offerId);
      }
      toast({ title: featured ? "Mise en avant" : "Retirée de la mise en avant" });
      await loadOffers();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  const handleSuspend = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await suspendRamadanOffer(offerId);
      toast({ title: "Offre suspendue" });
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await resumeRamadanOffer(offerId);
      toast({ title: "Offre réactivée" });
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading(dialogOfferId);
    try {
      await deleteRamadanOffer(dialogOfferId);
      toast({ title: "Offre supprimée" });
      setDeleteDialogOpen(false);
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const STATUS_TABS = [
    { value: "pending_moderation", label: "En attente", count: stats.pending_moderation ?? 0 },
    { value: "active", label: "Actives", count: stats.active ?? 0 },
    { value: "approved", label: "Approuvées", count: stats.approved ?? 0 },
    { value: "suspended", label: "Suspendues", count: stats.suspended ?? 0 },
    { value: "rejected", label: "Rejetées", count: stats.rejected ?? 0 },
    { value: "modification_requested", label: "Modif. demandée", count: stats.modification_requested ?? 0 },
    { value: "draft", label: "Brouillons", count: stats.draft ?? 0 },
    { value: "expired", label: "Expirées", count: stats.expired ?? 0 },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Nav tabs */}
      <AdminReservationsNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon className="h-7 w-7 text-amber-500" />
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Modération Ramadan 2026
            </h1>
            <p className="text-sm text-slate-500">
              {totalReservations} réservations · {totalScans} scans QR validés
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadOffers(); loadStats(); }}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Actualiser
        </Button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              "rounded-lg border p-3 text-left transition",
              statusFilter === tab.value
                ? "border-primary bg-primary/5"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <div className="text-xl font-extrabold text-slate-900">{tab.count}</div>
            <div className="text-xs text-slate-500 truncate">{tab.label}</div>
          </button>
        ))}
      </div>

      {/* Liste des offres */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : !offers.length ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          Aucune offre avec le statut sélectionné.
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const isLoading = actionLoading === offer.id;
            const isPending = offer.moderation_status === "pending_moderation";

            return (
              <div
                key={offer.id}
                className="rounded-lg border bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Cover */}
                  <div className="w-24 h-24 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    {offer.cover_url ? (
                      <img src={offer.cover_url} alt={offer.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-3xl">🌙</div>
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
                      {offer.is_featured ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700">
                          ⭐ En vedette
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{offer.title}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {offer.establishments?.name ?? "—"} · {offer.establishments?.city ?? ""}
                    </div>
                    <div className="text-sm text-primary font-bold mt-0.5">
                      {formatPrice(offer.price)}
                      {offer.original_price ? (
                        <span className="text-xs text-slate-400 line-through ml-2">
                          {formatPrice(offer.original_price)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {offer.valid_from} → {offer.valid_to} · {offer.capacity_per_slot} places
                    </div>
                    {offer.description_fr ? (
                      <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {offer.description_fr}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {/* Pending: Approuver, Demander modif, Rejeter */}
                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          disabled={isLoading}
                          onClick={() => handleApprove(offer.id)}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-600 border-blue-200 text-xs"
                          disabled={isLoading}
                          onClick={() => {
                            setDialogOfferId(offer.id);
                            setDialogText("");
                            setModifDialogOpen(true);
                          }}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          Demander modif
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 text-xs"
                          disabled={isLoading}
                          onClick={() => {
                            setDialogOfferId(offer.id);
                            setDialogText("");
                            setRejectDialogOpen(true);
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Rejeter
                        </Button>
                      </>
                    )}

                    {/* Active: Suspendre, Toggle vedette */}
                    {offer.moderation_status === "active" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-orange-600 border-orange-200 text-xs"
                          disabled={isLoading}
                          onClick={() => handleSuspend(offer.id)}
                        >
                          <PauseCircle className="h-3.5 w-3.5 mr-1" />
                          Suspendre
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => handleFeature(offer.id, !offer.is_featured)}
                        >
                          <Star className={cn("h-3.5 w-3.5 mr-1", offer.is_featured ? "fill-amber-400 text-amber-400" : "")} />
                          {offer.is_featured ? "Retirer vedette" : "Mettre en vedette"}
                        </Button>
                      </>
                    )}

                    {/* Approved: Suspendre */}
                    {offer.moderation_status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-orange-600 border-orange-200 text-xs"
                        disabled={isLoading}
                        onClick={() => handleSuspend(offer.id)}
                      >
                        <PauseCircle className="h-3.5 w-3.5 mr-1" />
                        Suspendre
                      </Button>
                    )}

                    {/* Suspended: Réactiver, Supprimer */}
                    {offer.moderation_status === "suspended" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          disabled={isLoading}
                          onClick={() => handleResume(offer.id)}
                        >
                          <PlayCircle className="h-3.5 w-3.5 mr-1" />
                          Réactiver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 text-xs"
                          disabled={isLoading}
                          onClick={() => {
                            setDialogOfferId(offer.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Supprimer
                        </Button>
                      </>
                    )}

                    {/* Rejected, Draft, Modification requested, Expired: Supprimer */}
                    {["rejected", "draft", "modification_requested", "expired"].includes(offer.moderation_status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 text-xs"
                        disabled={isLoading}
                        onClick={() => {
                          setDialogOfferId(offer.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Supprimer
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Rejet */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter l'offre Ramadan</DialogTitle>
          </DialogHeader>
          <Textarea
            value={dialogText}
            onChange={(e) => setDialogText(e.target.value)}
            placeholder="Motif du rejet..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!dialogText.trim() || !!actionLoading}
            >
              Rejeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Modification */}
      <Dialog open={modifDialogOpen} onOpenChange={setModifDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander une modification</DialogTitle>
          </DialogHeader>
          <Textarea
            value={dialogText}
            onChange={(e) => setDialogText(e.target.value)}
            placeholder="Indiquez les modifications nécessaires..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleRequestModification}
              disabled={!dialogText.trim() || !!actionLoading}
            >
              Demander la modification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'offre Ramadan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Êtes-vous sûr de vouloir supprimer cette offre ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!!actionLoading}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
