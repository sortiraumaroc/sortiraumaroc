/**
 * AdminRamadanModerationPage — Page de modération des offres Ramadan
 *
 * Queue de modération avec actions : approuver, rejeter, demander modification.
 * Dashboard de stats rapides.
 */

import { useEffect, useState, useCallback, useRef } from "react";
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
  Upload,
  Loader2,
  Zap,
  Eye,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  uploadRamadanOfferImage,
  updateRamadanOfferCover,
  activateRamadanOffer as activateRamadanOfferApi,
  bulkFtourSlotAction,
  updateFtourSlot,
  updateFtourGroupCover,
  featureFtourGroup,
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

function formatPrice(centimes: number | null | undefined): string {
  if (centimes == null || Number.isNaN(centimes)) return "—";
  return `${(centimes / 100).toFixed(0)} MAD`;
}

/** Formater une date YYYY-MM-DD en DD/MM/YYYY */
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Indicateur visuel de période (en cours / à venir / expirée) */
function dateRangeIndicator(validFrom: string, validTo: string): {
  label: string;
  className: string;
} {
  const today = new Date().toISOString().split("T")[0];
  if (validTo && validTo < today) {
    return { label: "Expirée", className: "text-red-600 bg-red-50" };
  }
  if (validFrom && validFrom > today) {
    return { label: `Commence le ${fmtDate(validFrom)}`, className: "text-amber-600 bg-amber-50" };
  }
  return { label: "En cours", className: "text-emerald-600 bg-emerald-50" };
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

  // Upload cover
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ offerId: string; establishmentId: string; slotIds?: string[] } | null>(null);

  // Dialogs
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [modifDialogOpen, setModifDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dialogOfferId, setDialogOfferId] = useState("");
  const [dialogText, setDialogText] = useState("");

  // Ftour detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<any>(null);
  const [editingSlots, setEditingSlots] = useState<Record<string, { price: string; capacity: string }>>({});
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);

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

  // Cover upload
  const handleCoverUploadClick = (offerId: string, establishmentId: string, slotIds?: string[]) => {
    uploadTargetRef.current = { offerId, establishmentId, slotIds };
    coverInputRef.current?.click();
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadTargetRef.current) return;

    const { offerId, establishmentId, slotIds } = uploadTargetRef.current;
    setUploadingCoverId(offerId);

    try {
      const result = await uploadRamadanOfferImage({ establishmentId, file });
      if (slotIds?.length) {
        // Ftour group: update cover on all slots
        await updateFtourGroupCover(slotIds, result.url);
      } else {
        // Regular ramadan offer
        await updateRamadanOfferCover(offerId, result.url);
      }
      toast({ title: "Photo mise à jour" });
      await loadOffers();
    } catch (err) {
      toast({
        title: "Erreur d'upload",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setUploadingCoverId(null);
      uploadTargetRef.current = null;
    }
  };

  // Actions — route to correct API based on item_type
  const getItem = (id: string) => offers.find((o) => o.id === id) as any;

  const handleApprove = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      const item = getItem(offerId);
      if (item?.item_type === "ftour_group") {
        await bulkFtourSlotAction(item.slot_ids, "approve");
      } else {
        await approveRamadanOffer(offerId);
      }
      toast({ title: "Offre approuvée" });
      await loadOffers();
      await loadStats();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await activateRamadanOfferApi(offerId);
      toast({ title: "Offre publiée immédiatement" });
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
      const item = getItem(dialogOfferId);
      if (item?.item_type === "ftour_group") {
        await bulkFtourSlotAction(item.slot_ids, "reject", dialogText.trim());
      } else {
        await rejectRamadanOffer(dialogOfferId, dialogText.trim());
      }
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
      const item = getItem(offerId);
      if (item?.item_type === "ftour_group") {
        await featureFtourGroup(item.slot_ids, featured);
      } else if (featured) {
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
      const item = getItem(offerId);
      if (item?.item_type === "ftour_group") {
        await bulkFtourSlotAction(item.slot_ids, "suspend");
      } else {
        await suspendRamadanOffer(offerId);
      }
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
      const item = getItem(offerId);
      if (item?.item_type === "ftour_group") {
        await bulkFtourSlotAction(item.slot_ids, "resume");
      } else {
        await resumeRamadanOffer(offerId);
      }
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
      const item = getItem(dialogOfferId);
      if (item?.item_type === "ftour_group") {
        await bulkFtourSlotAction(item.slot_ids, "delete");
      } else {
        await deleteRamadanOffer(dialogOfferId);
      }
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

  // Ftour detail dialog handlers
  const openDetailDialog = (group: any) => {
    setDetailGroup(group);
    const initial: Record<string, { price: string; capacity: string }> = {};
    for (const s of group.slots ?? []) {
      initial[s.id] = {
        price: s.base_price != null ? String(Math.round(s.base_price / 100)) : "",
        capacity: s.capacity != null ? String(s.capacity) : "",
      };
    }
    setEditingSlots(initial);
    setDetailDialogOpen(true);
  };

  const handleSaveSlot = async (slotId: string) => {
    const edit = editingSlots[slotId];
    if (!edit) return;

    setSavingSlotId(slotId);
    try {
      const updates: Record<string, unknown> = {};
      const priceMAD = Number(edit.price);
      if (!Number.isNaN(priceMAD) && priceMAD >= 0) updates.base_price = Math.round(priceMAD * 100);
      const cap = Number(edit.capacity);
      if (!Number.isNaN(cap) && cap > 0) updates.capacity = Math.round(cap);

      if (!Object.keys(updates).length) return;

      await updateFtourSlot(slotId, updates as any);
      toast({ title: "Créneau modifié" });
      await loadOffers();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setSavingSlotId(null);
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
            const isFtourGroup = (offer as any).item_type === "ftour_group";
            const d = offer as any;

            return (
              <div
                key={offer.id}
                className="rounded-lg border bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Cover + Upload */}
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <div className="w-24 h-24 rounded-lg bg-slate-100 overflow-hidden">
                      {uploadingCoverId === offer.id ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : offer.cover_url ? (
                        <img src={offer.cover_url} alt={isFtourGroup ? "Ftour" : offer.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-3xl">{isFtourGroup ? "🍽️" : "🌙"}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                      onClick={() => handleCoverUploadClick(
                        offer.id,
                        offer.establishment_id,
                        isFtourGroup ? (d as any).slot_ids : undefined,
                      )}
                      disabled={uploadingCoverId === offer.id}
                    >
                      <Upload className="h-3 w-3" />
                      Photo
                    </button>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn("text-[10px] px-1.5 py-0", statusBadgeColor(offer.moderation_status))}>
                        {RAMADAN_OFFER_STATUS_LABELS[offer.moderation_status] ?? offer.moderation_status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {isFtourGroup ? "Créneau Ftour" : (RAMADAN_OFFER_TYPE_LABELS[offer.type] ?? offer.type)}
                      </Badge>
                      {!isFtourGroup && offer.is_featured ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700">
                          ⭐ En vedette
                        </Badge>
                      ) : null}
                    </div>

                    {isFtourGroup ? (
                      (() => {
                        const dateFrom = d.date_from?.split("T")[0] ?? "";
                        const dateTo = d.date_to?.split("T")[0] ?? "";
                        const sameDate = dateFrom === dateTo;
                        return (
                          <>
                            <h3 className="text-sm font-bold text-slate-900">
                              Ftour — {d.establishments?.name ?? "—"}
                            </h3>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {d.establishments?.city ?? ""}
                            </div>
                            <div className="text-sm text-primary font-bold mt-0.5">
                              {formatPrice(d.base_price)}
                              {d.promo_type === "percent" && d.promo_value ? (
                                <span className="ml-2 text-xs text-emerald-600 font-bold">-{d.promo_value}%</span>
                              ) : null}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>
                                {sameDate
                                  ? fmtDate(dateFrom)
                                  : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`}
                              </span>
                              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", dateRangeIndicator(dateFrom, dateTo).className)}>
                                {dateRangeIndicator(dateFrom, dateTo).label}
                              </span>
                              <span>· {d.slot_count ?? 0} créneau{(d.slot_count ?? 0) > 1 ? "x" : ""}</span>
                              <span>· {d.total_capacity ?? 0} places</span>
                            </div>
                            {d.promo_label && (
                              <div className="text-xs text-slate-600 mt-1">{d.promo_label}</div>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <h3 className="text-sm font-bold text-slate-900">{offer.title || "Sans titre"}</h3>
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
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{fmtDate(offer.valid_from ?? "")} → {fmtDate(offer.valid_to ?? "")}</span>
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", dateRangeIndicator(offer.valid_from ?? "", offer.valid_to ?? "").className)}>
                            {dateRangeIndicator(offer.valid_from ?? "", offer.valid_to ?? "").label}
                          </span>
                          <span>· {offer.capacity_per_slot ?? 0} places</span>
                        </div>
                        {offer.description_fr ? (
                          <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                            {offer.description_fr}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-1.5 shrink-0">
                    {/* Pending ftour: icon-only row */}
                    {isPending && isFtourGroup && (
                      <div className="col-span-2 flex flex-row gap-1.5">
                        <Button size="icon" variant="outline" className="h-8 w-8" title="Détail" onClick={() => openDetailDialog(d)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white" title="Approuver" disabled={isLoading} onClick={() => handleApprove(offer.id)}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 border-red-200" title="Rejeter" disabled={isLoading} onClick={() => { setDialogOfferId(offer.id); setDialogText(""); setRejectDialogOpen(true); }}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 border-red-200" title="Supprimer" disabled={isLoading} onClick={() => { setDialogOfferId(offer.id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {/* Pending offers: normal buttons */}
                    {isPending && !isFtourGroup && (
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

                    {/* Active: 4 icon-only buttons for all items */}
                    {offer.moderation_status === "active" && (
                      <div className="col-span-2 flex flex-row gap-1.5">
                        <Button size="icon" variant="outline" className="h-8 w-8" title="Détail" onClick={() => isFtourGroup ? openDetailDialog(d) : undefined}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className={cn("h-8 w-8", offer.is_featured ? "border-amber-400" : "")} title={offer.is_featured ? "Retirer vedette" : "Mettre en vedette"} onClick={() => handleFeature(offer.id, !offer.is_featured)}>
                          <Star className={cn("h-4 w-4", offer.is_featured ? "fill-amber-400 text-amber-400" : "")} />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-orange-600 border-orange-200" title="Suspendre" disabled={isLoading} onClick={() => handleSuspend(offer.id)}>
                          <PauseCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 border-red-200" title="Supprimer" disabled={isLoading} onClick={() => { setDialogOfferId(offer.id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {/* Approved: Publier maintenant, Suspendre (ramadan offers only) */}
                    {!isFtourGroup && offer.moderation_status === "approved" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          disabled={isLoading}
                          onClick={() => handleActivate(offer.id)}
                        >
                          <Zap className="h-3.5 w-3.5 mr-1" />
                          Publier maintenant
                        </Button>
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
                      </>
                    )}

                    {/* Suspended ftour: icon-only */}
                    {offer.moderation_status === "suspended" && isFtourGroup && (
                      <div className="col-span-2 flex flex-row gap-1.5">
                        <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white" title="Réactiver" disabled={isLoading} onClick={() => handleResume(offer.id)}>
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 border-red-200" title="Supprimer" disabled={isLoading} onClick={() => { setDialogOfferId(offer.id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {/* Suspended offers: normal buttons */}
                    {offer.moderation_status === "suspended" && !isFtourGroup && (
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

                    {/* Rejected/Draft/etc ftour: icon-only delete */}
                    {isFtourGroup && ["rejected", "draft", "modification_requested", "expired"].includes(offer.moderation_status) && (
                      <div className="col-span-2 flex flex-row gap-1.5">
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 border-red-200" title="Supprimer" disabled={isLoading} onClick={() => { setDialogOfferId(offer.id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {/* Rejected, Draft, Modification requested, Expired: Supprimer (offers) */}
                    {!isFtourGroup && ["rejected", "draft", "modification_requested", "expired"].includes(offer.moderation_status) && (
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

                    {/* Approved, Pending (non-ftour): Supprimer — active handled in icon row above */}
                    {!isFtourGroup && ["approved", "pending_moderation"].includes(offer.moderation_status) && (
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

      {/* Hidden file input for cover upload */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/avif"
        className="hidden"
        onChange={handleCoverFileChange}
      />

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

      {/* Dialog Détail Ftour */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Détail — {detailGroup?.establishments?.name ?? "Ftour"}
            </DialogTitle>
          </DialogHeader>
          {detailGroup?.slots?.length ? (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Horaire</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Prix (MAD)</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Capacité</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(detailGroup.slots as any[]).map((slot: any) => {
                    const edit = editingSlots[slot.id];
                    const isSaving = savingSlotId === slot.id;
                    return (
                      <tr key={slot.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {fmtDate(slot.starts_at?.split("T")[0] ?? "")}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">
                          {new Date(slot.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          {" → "}
                          {new Date(slot.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-7 w-24 text-xs text-right ml-auto"
                            value={edit?.price ?? ""}
                            onChange={(e) =>
                              setEditingSlots((prev) => ({
                                ...prev,
                                [slot.id]: { ...prev[slot.id], price: e.target.value },
                              }))
                            }
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            className="h-7 w-20 text-xs text-right ml-auto"
                            value={edit?.capacity ?? ""}
                            onChange={(e) =>
                              setEditingSlots((prev) => ({
                                ...prev,
                                [slot.id]: { ...prev[slot.id], capacity: e.target.value },
                              }))
                            }
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => handleSaveSlot(slot.id)}
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Aucun créneau.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
