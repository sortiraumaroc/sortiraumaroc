/**
 * AdminFtourDashboard — Gestion centralisée des créneaux Ftour
 *
 * Onglet dédié sous la section Packs.
 * Permet de : lister, créer (multi-établissement), éditer, supprimer et batch-supprimer.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Moon,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  Repeat,
  Search,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  ImagePlus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AdminReservationsNav } from "@/pages/admin/reservations/AdminReservationsNav";
import {
  listAdminFtourSlots,
  adminUpsertSlots,
  adminDeleteSlot,
  adminBulkDeleteSlots,
  searchEstablishmentsByName,
  uploadAdminSlotImage,
  AdminApiError,
} from "@/lib/adminApi";
import type { FtourSlotWithEstablishment } from "@/lib/adminApi";
import { PriceTypeField } from "@/components/ui/PriceTypeField";
import { formatPriceByType, inferPriceType, PRICE_TYPE_LABELS } from "../../../shared/priceTypes";
import type { PriceType } from "../../../shared/priceTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatPrice(cents: number | null, priceType?: string | null): string {
  return formatPriceByType(priceType, cents);
}

function formatPromo(slot: FtourSlotWithEstablishment): string {
  if (slot.promo_label) return slot.promo_label;
  if (slot.promo_value && slot.promo_value > 0) {
    return slot.promo_type === "percent"
      ? `${slot.promo_value}%`
      : `${slot.promo_value} MAD`;
  }
  return "—";
}

type PickedEstablishment = { id: string; name: string; city: string | null };

// =============================================================================
// Sub-components
// =============================================================================

/** Barre de recherche multi-sélect d'établissements */
function EstablishmentPicker({
  selected,
  onChange,
}: {
  selected: PickedEstablishment[];
  onChange: (v: PickedEstablishment[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedEstablishment[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchEstablishmentsByName(query.trim());
        setResults(
          (res.items ?? []).map((e) => ({
            id: e.id,
            name: e.name,
            city: e.city,
          })),
        );
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (est: PickedEstablishment) => {
    const exists = selected.find((s) => s.id === est.id);
    if (exists) {
      onChange(selected.filter((s) => s.id !== est.id));
    } else {
      onChange([...selected, est]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">Établissements</Label>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((est) => (
            <Badge key={est.id} variant="secondary" className="gap-1 pr-1">
              {est.name}
              {est.city ? ` (${est.city})` : ""}
              <button
                type="button"
                onClick={() => toggle(est)}
                className="ml-0.5 rounded-full hover:bg-slate-300/50 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <Input
          type="text"
          placeholder="Rechercher un établissement…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="pl-8 h-9 text-sm"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
      </div>
      {/* Dropdown results */}
      {showDropdown && results.length > 0 && (
        <div className="border rounded-md shadow-sm max-h-48 overflow-y-auto bg-white">
          {results.map((est) => {
            const isSelected = selected.some((s) => s.id === est.id);
            return (
              <button
                key={est.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50",
                  isSelected && "bg-blue-50",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(est)}
              >
                <span>
                  {est.name}
                  {est.city ? (
                    <span className="text-slate-400 ml-1">({est.city})</span>
                  ) : null}
                </span>
                {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main dashboard
// =============================================================================

export function AdminFtourDashboard() {
  const { toast } = useToast();

  // ── Listing state ──
  const [slots, setSlots] = useState<FtourSlotWithEstablishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Selection (batch) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Create dialog ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createEstablishments, setCreateEstablishments] = useState<PickedEstablishment[]>([]);
  const [createDateStart, setCreateDateStart] = useState("");
  const [createDateEnd, setCreateDateEnd] = useState("");
  const [createTimeStart, setCreateTimeStart] = useState("19:15");
  const [createDurationMin, setCreateDurationMin] = useState(180);
  const [createCapacity, setCreateCapacity] = useState(30);
  const [createBasePrice, setCreateBasePrice] = useState("");
  const [createPriceType, setCreatePriceType] = useState<PriceType>("free");
  const [createServiceLabel, setCreateServiceLabel] = useState("Ftour");
  const [createPromoLabel, setCreatePromoLabel] = useState("");
  const [createPromoType, setCreatePromoType] = useState<"percent" | "amount">("percent");
  const [createPromoValue, setCreatePromoValue] = useState("");
  const [createPaidPercent, setCreatePaidPercent] = useState(88);
  const [createFreePercent, setCreateFreePercent] = useState(6);
  const [createBufferPercent, setCreateBufferPercent] = useState(6);
  const [createRepeatEnabled, setCreateRepeatEnabled] = useState(false);
  const [createRepeatDays, setCreateRepeatDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [createCoverUrl, setCreateCoverUrl] = useState("");
  const [createCoverUploading, setCreateCoverUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── Edit dialog ──
  const [editOpen, setEditOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<FtourSlotWithEstablishment | null>(null);
  const [editCapacity, setEditCapacity] = useState(30);
  const [editBasePrice, setEditBasePrice] = useState("");
  const [editPriceType, setEditPriceType] = useState<PriceType>("free");
  const [editPromoLabel, setEditPromoLabel] = useState("");
  const [editPromoType, setEditPromoType] = useState<"percent" | "amount">("percent");
  const [editPromoValue, setEditPromoValue] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editCoverUploading, setEditCoverUploading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // ── Delete confirmation ──
  const [deleteSlot, setDeleteSlot] = useState<FtourSlotWithEstablishment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);

  // ── Fetch slots ──
  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminFtourSlots(undefined);
      setSlots(res.slots ?? []);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  // ── Selection helpers ──
  const allSelected = slots.length > 0 && selectedIds.size === slots.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(slots.map((s) => s.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Groupement par établissement ──
  const [expandedEstabs, setExpandedEstabs] = useState<Set<string>>(new Set());

  type EstabGroup = {
    establishmentId: string;
    name: string;
    city: string | null;
    slots: FtourSlotWithEstablishment[];
    totalCapacity: number;
    priceDisplay: string;
    promoDisplay: string;
  };

  const groupedByEstab = useMemo<EstabGroup[]>(() => {
    const map = new Map<string, FtourSlotWithEstablishment[]>();
    for (const slot of slots) {
      const eid = slot.establishment_id;
      if (!map.has(eid)) map.set(eid, []);
      map.get(eid)!.push(slot);
    }

    const groups: EstabGroup[] = [];
    for (const [eid, estabSlots] of map) {
      const first = estabSlots[0];
      const totalCapacity = estabSlots.reduce((sum, s) => sum + s.capacity, 0);

      // Prix : valeur unique ou plage
      const priceTypes = [...new Set(estabSlots.map((s) => s.price_type ?? inferPriceType(s.base_price)))];
      let priceDisplay: string;
      if (priceTypes.length === 1 && priceTypes[0] !== "fixed") {
        priceDisplay = formatPrice(null, priceTypes[0]);
      } else {
        const fixedSlots = estabSlots.filter((s) => (s.price_type ?? inferPriceType(s.base_price)) === "fixed");
        if (fixedSlots.length === 0) {
          priceDisplay = formatPrice(null, priceTypes[0]);
        } else {
          const prices = fixedSlots.map((s) => s.base_price ?? 0);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          priceDisplay = min === max ? formatPrice(min, "fixed") : `${formatPrice(min, "fixed")} — ${formatPrice(max, "fixed")}`;
        }
      }

      // Promo : identique ou "Variable"
      const promos = [...new Set(estabSlots.map((s) => formatPromo(s)))];
      const promoDisplay = promos.length === 1 ? promos[0] : "Variable";

      groups.push({
        establishmentId: eid,
        name: first.establishments?.name ?? "—",
        city: first.establishments?.city ?? null,
        slots: estabSlots,
        totalCapacity,
        priceDisplay,
        promoDisplay,
      });
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [slots]);

  const toggleExpand = (eid: string) => {
    setExpandedEstabs((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });
  };

  const toggleSelectGroup = (group: EstabGroup) => {
    const groupIds = group.slots.map((s) => s.id);
    const allGroupSelected = groupIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allGroupSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // ── Create handler ──
  const handleCreate = async () => {
    if (createEstablishments.length === 0 || !createDateStart || !createTimeStart) return;
    if (createRepeatEnabled && !createDateEnd) return;
    if (createPaidPercent + createFreePercent + createBufferPercent !== 100) {
      toast({ title: "Erreur", description: "La répartition des places doit totaliser 100%.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const startDate = new Date(createDateStart);
      if (isNaN(startDate.getTime())) {
        toast({ title: "Erreur", description: "Date de début invalide", variant: "destructive" });
        return;
      }

      const endDate = createRepeatEnabled && createDateEnd ? new Date(createDateEnd) : new Date(startDate);
      if (isNaN(endDate.getTime()) || endDate < startDate) {
        toast({ title: "Erreur", description: "Dates invalides", variant: "destructive" });
        return;
      }

      const [hours, minutes] = createTimeStart.split(":").map(Number);
      const basePrice = createBasePrice.trim() ? Math.round(Number(createBasePrice) * 100) : null;
      const promoValueNum = createPromoValue.trim() ? Math.round(Number(createPromoValue)) : null;
      const promoValue = promoValueNum && promoValueNum > 0 ? promoValueNum : null;

      // Build slot array
      const slotDefs: Array<{
        starts_at: string;
        ends_at: string;
        capacity: number;
        base_price?: number | null;
        price_type?: string;
        service_label: string;
        promo_type?: string | null;
        promo_value?: number | null;
        promo_label?: string | null;
        cover_url?: string | null;
      }> = [];

      const current = new Date(startDate);
      while (current <= endDate) {
        if (createRepeatEnabled && createRepeatDays.length > 0 && !createRepeatDays.includes(current.getDay())) {
          current.setDate(current.getDate() + 1);
          continue;
        }

        const slotStart = new Date(current);
        slotStart.setHours(hours, minutes, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + createDurationMin);

        slotDefs.push({
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          capacity: createCapacity,
          base_price: createPriceType === "fixed" ? basePrice : null,
          price_type: createPriceType,
          service_label: createServiceLabel || "Ftour",
          promo_type: promoValue ? createPromoType : null,
          promo_value: promoValue,
          promo_label: promoValue ? (createPromoLabel.trim() || null) : null,
          cover_url: createCoverUrl.trim() || null,
        });

        current.setDate(current.getDate() + 1);
      }

      if (slotDefs.length === 0) {
        toast({ title: "Erreur", description: "Aucun créneau à créer avec ces paramètres.", variant: "destructive" });
        return;
      }

      // Upsert per establishment
      let totalUpserted = 0;
      for (const est of createEstablishments) {
        const res = await adminUpsertSlots(undefined, est.id, slotDefs);
        totalUpserted += res.upserted;
      }

      toast({
        title: "Créneaux créés",
        description: `${totalUpserted} créneau(x) créé(s) pour ${createEstablishments.length} établissement(s)`,
      });

      setCreateOpen(false);
      resetCreateForm();
      void fetchSlots();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateEstablishments([]);
    setCreateDateStart("");
    setCreateDateEnd("");
    setCreateTimeStart("19:15");
    setCreateDurationMin(180);
    setCreateCapacity(30);
    setCreateBasePrice("");
    setCreatePriceType("free");
    setCreateServiceLabel("Ftour");
    setCreatePromoLabel("");
    setCreatePromoType("percent");
    setCreatePromoValue("");
    setCreatePaidPercent(88);
    setCreateFreePercent(6);
    setCreateBufferPercent(6);
    setCreateRepeatEnabled(false);
    setCreateRepeatDays([1, 2, 3, 4, 5, 6, 0]);
    setCreateCoverUrl("");
  };

  // ── Edit handler ──
  const openEdit = (slot: FtourSlotWithEstablishment) => {
    setEditSlot(slot);
    setEditCapacity(slot.capacity);
    setEditBasePrice(slot.base_price !== null ? String(Math.round(slot.base_price / 100)) : "");
    setEditPromoLabel(slot.promo_label ?? "");
    setEditPromoType((slot.promo_type as "percent" | "amount") ?? "percent");
    setEditPromoValue(slot.promo_value !== null ? String(slot.promo_value) : "");
    setEditCoverUrl((slot as any).cover_url ?? "");
    setEditPriceType((slot.price_type as PriceType) ?? inferPriceType(slot.base_price));
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editSlot) return;
    setEditSaving(true);
    try {
      const basePrice = editBasePrice.trim() ? Math.round(Number(editBasePrice) * 100) : null;
      const promoValueNum = editPromoValue.trim() ? Math.round(Number(editPromoValue)) : null;
      const promoValue = promoValueNum && promoValueNum > 0 ? promoValueNum : null;

      await adminUpsertSlots(undefined, editSlot.establishment_id, [
        {
          starts_at: editSlot.starts_at,
          ends_at: editSlot.ends_at ?? new Date(new Date(editSlot.starts_at).getTime() + 180 * 60000).toISOString(),
          capacity: editCapacity,
          base_price: editPriceType === "fixed" ? basePrice : null,
          price_type: editPriceType,
          service_label: editSlot.service_label || "Ftour",
          promo_type: promoValue ? editPromoType : null,
          promo_value: promoValue,
          promo_label: promoValue ? (editPromoLabel.trim() || null) : null,
          cover_url: editCoverUrl.trim() || null,
        },
      ]);

      toast({ title: "Créneau modifié" });
      setEditOpen(false);
      setEditSlot(null);
      void fetchSlots();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete handler ──
  const handleDelete = async () => {
    if (!deleteSlot) return;
    setDeleting(true);
    try {
      await adminDeleteSlot(undefined, deleteSlot.establishment_id, deleteSlot.id);
      toast({ title: "Créneau supprimé" });
      setDeleteSlot(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteSlot.id);
        return next;
      });
      void fetchSlots();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // ── Batch delete handler ──
  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      // Group by establishment_id
      const groups = new Map<string, string[]>();
      for (const id of selectedIds) {
        const slot = slots.find((s) => s.id === id);
        if (!slot) continue;
        const list = groups.get(slot.establishment_id) ?? [];
        list.push(slot.id);
        groups.set(slot.establishment_id, list);
      }

      let totalDeleted = 0;
      let totalDeactivated = 0;
      for (const [estId, ids] of groups) {
        const res = await adminBulkDeleteSlots(undefined, estId, ids);
        totalDeleted += res.deleted;
        totalDeactivated += res.deactivated ?? 0;
      }

      const parts: string[] = [];
      if (totalDeleted > 0) parts.push(`${totalDeleted} supprimé(s)`);
      if (totalDeactivated > 0) parts.push(`${totalDeactivated} désactivé(s) (réservations liées)`);

      toast({
        title: "Suppression en lot",
        description: parts.join(", ") || "Aucun créneau traité",
      });

      setSelectedIds(new Set());
      setBatchDeleteConfirmOpen(false);
      void fetchSlots();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setBatchDeleting(false);
    }
  };

  // ── Summary for creation ──
  const createSummary = useMemo(() => {
    if (!createDateStart) return null;
    const start = new Date(createDateStart);
    if (isNaN(start.getTime())) return "Date invalide";

    let days = 1;
    if (createRepeatEnabled && createDateEnd) {
      const end = new Date(createDateEnd);
      if (isNaN(end.getTime()) || end < start) return "Dates invalides";

      days = 0;
      if (createRepeatDays.length > 0) {
        const cursor = new Date(start);
        while (cursor <= end) {
          if (createRepeatDays.includes(cursor.getDay())) days++;
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    const totalSlots = days * createEstablishments.length;
    const priceStr = createPriceType === "fixed" && createBasePrice.trim() ? `${createBasePrice} MAD` : PRICE_TYPE_LABELS[createPriceType];
    return `${days} créneau(x)/établissement × ${createEstablishments.length} établissement(s) = ${totalSlots} total (${createTimeStart} — ${createCapacity} places — ${priceStr})`;
  }, [createDateStart, createDateEnd, createRepeatEnabled, createRepeatDays, createEstablishments.length, createTimeStart, createCapacity, createBasePrice, createPriceType]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Navigation */}
      <AdminReservationsNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-amber-600" />
          <h2 className="text-xl font-bold">Créneaux Ftour</h2>
          <Badge variant="outline" className="ml-2">
            {slots.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchSlots()}
            disabled={loading}
            className="gap-1"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualiser
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Créer créneaux
          </Button>
        </div>
      </div>

      {/* Batch actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2">
          <span className="text-sm font-medium text-red-800">
            {selectedIds.size} sélectionné(s)
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1 h-7 text-xs"
            onClick={() => setBatchDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
            Supprimer ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Tout désélectionner
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && slots.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && slots.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-slate-400">
          Aucun créneau Ftour trouvé.
        </div>
      )}

      {/* Slots table — grouped by establishment */}
      {slots.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">
                    Établissement
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium text-slate-600">
                    Créneaux
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">
                    Capacité
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">
                    Prix
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">
                    Promo
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium text-slate-600">
                    Statut
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">
                    Détail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {groupedByEstab.map((group) => {
                  const isExpanded = expandedEstabs.has(group.establishmentId);
                  const groupIds = group.slots.map((s) => s.id);
                  const allGroupSelected = groupIds.every((id) => selectedIds.has(id));
                  const someGroupSelected = !allGroupSelected && groupIds.some((id) => selectedIds.has(id));

                  return (
                    <React.Fragment key={group.establishmentId}>
                      {/* ── Ligne groupée (1 par établissement) ── */}
                      <tr
                        className={cn(
                          "hover:bg-slate-50 transition-colors cursor-pointer",
                          allGroupSelected && "bg-blue-50/50",
                        )}
                        onClick={() => toggleExpand(group.establishmentId)}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={allGroupSelected}
                            indeterminate={someGroupSelected}
                            onCheckedChange={() => toggleSelectGroup(group)}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">{group.name}</div>
                          {group.city && (
                            <div className="text-xs text-slate-400">{group.city}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant="secondary" className="text-xs">
                            {group.slots.length} créneau{group.slots.length > 1 ? "x" : ""}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {group.totalCapacity}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {group.priceDisplay}
                        </td>
                        <td className="px-3 py-2.5">
                          {group.promoDisplay !== "—" ? (
                            <Badge variant="secondary" className="text-xs">
                              {group.promoDisplay}
                            </Badge>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {(() => {
                            const statuses = [...new Set(group.slots.map((s: any) => s.moderation_status ?? "active"))];
                            if (statuses.length === 1) {
                              const st = statuses[0];
                              return (
                                <Badge className={cn("text-[10px]",
                                  st === "pending_moderation" ? "bg-amber-100 text-amber-700" :
                                  st === "active" ? "bg-emerald-100 text-emerald-700" :
                                  st === "suspended" ? "bg-slate-200 text-slate-600" :
                                  st === "rejected" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                                )}>
                                  {st === "pending_moderation" ? "En attente" : st === "active" ? "Actif" : st === "suspended" ? "Suspendu" : st === "rejected" ? "Rejeté" : st}
                                </Badge>
                              );
                            }
                            return <span className="text-[10px] text-slate-400">Mixte</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(group.establishmentId); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Détail
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                      </tr>

                      {/* ── Sous-lignes détail (slots individuels) ── */}
                      {isExpanded && group.slots.map((slot) => {
                        const isSelected = selectedIds.has(slot.id);
                        return (
                          <tr
                            key={slot.id}
                            className={cn(
                              "bg-slate-50/60 hover:bg-slate-100/80 transition-colors border-t border-slate-100",
                              isSelected && "bg-blue-50/50",
                            )}
                          >
                            <td className="px-3 py-1.5 pl-6">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectOne(slot.id)}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-xs text-slate-500 pl-6">
                              {formatDate(slot.starts_at)}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-slate-500 text-center whitespace-nowrap">
                              {formatTime(slot.starts_at)}{slot.ends_at ? ` — ${formatTime(slot.ends_at)}` : ""}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                              {slot.capacity}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums whitespace-nowrap">
                              {formatPrice(slot.base_price, slot.price_type)}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {formatPromo(slot) !== "—" ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {formatPromo(slot)}
                                </Badge>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {(() => {
                                const st = (slot as any).moderation_status ?? "active";
                                return (
                                  <Badge className={cn("text-[10px]",
                                    st === "pending_moderation" ? "bg-amber-100 text-amber-700" :
                                    st === "active" ? "bg-emerald-100 text-emerald-700" :
                                    st === "suspended" ? "bg-slate-200 text-slate-600" :
                                    st === "rejected" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                                  )}>
                                    {st === "pending_moderation" ? "En attente" : st === "active" ? "Actif" : st === "suspended" ? "Suspendu" : st === "rejected" ? "Rejeté" : st}
                                  </Badge>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => openEdit(slot)}
                                  title="Modifier"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteSlot(slot)}
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Dialog : Créer créneaux                                           */}
      {/* ================================================================= */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5" />
              Créer créneaux
            </DialogTitle>
            <DialogDescription>
              Génère un créneau par jour sur la période sélectionnée pour chaque établissement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Établissements ── */}
            <EstablishmentPicker
              selected={createEstablishments}
              onChange={setCreateEstablishments}
            />

            {/* ── Date de début ── */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Date de début</Label>
              <Input
                type="date"
                value={createDateStart}
                onChange={(e) => setCreateDateStart(e.target.value)}
              />
            </div>

            {/* ── Heure & Service ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Heure début</Label>
                <Input
                  type="time"
                  value={createTimeStart}
                  onChange={(e) => setCreateTimeStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Service</Label>
                <Select value={createServiceLabel} onValueChange={setCreateServiceLabel}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Petit-déjeuner">Petit-déjeuner</SelectItem>
                    <SelectItem value="Déjeuner">Déjeuner</SelectItem>
                    <SelectItem value="Tea Time">Tea Time</SelectItem>
                    <SelectItem value="Happy Hour">Happy Hour</SelectItem>
                    <SelectItem value="Dîner">Dîner</SelectItem>
                    <SelectItem value="Ftour">Ftour (Ramadan)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Durée (boutons) ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Durée</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: 15, label: "15 min" },
                  { value: 30, label: "30 min" },
                  { value: 45, label: "45 min" },
                  { value: 60, label: "1h" },
                  { value: 90, label: "1h30" },
                  { value: 120, label: "2h" },
                  { value: 180, label: "3h" },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={createDurationMin === opt.value ? "default" : "outline"}
                    className="text-xs h-7 px-2.5"
                    onClick={() => setCreateDurationMin(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* ── Capacité & Prix ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Capacité par créneau</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={createCapacity}
                  onChange={(e) => setCreateCapacity(Number(e.target.value) || 30)}
                />
              </div>
              <PriceTypeField
                priceType={createPriceType}
                onPriceTypeChange={setCreatePriceType}
                price={createBasePrice}
                onPriceChange={setCreateBasePrice}
                label="Prix (MAD)"
                compact
              />
            </div>

            {/* ── Répartition des places ── */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs font-medium">Répartition des places</Label>
              <div className="flex gap-1.5 mb-2">
                {[
                  { label: "Priorité payante", paid: 88, free: 6, buffer: 6 },
                  { label: "Équilibré", paid: 50, free: 30, buffer: 20 },
                  { label: "Gratuit généreux", paid: 30, free: 60, buffer: 10 },
                ].map((profile) => (
                  <Button
                    key={profile.label}
                    type="button"
                    size="sm"
                    variant={
                      createPaidPercent === profile.paid &&
                      createFreePercent === profile.free &&
                      createBufferPercent === profile.buffer
                        ? "default"
                        : "outline"
                    }
                    className="text-xs h-7 px-2"
                    onClick={() => {
                      setCreatePaidPercent(profile.paid);
                      setCreateFreePercent(profile.free);
                      setCreateBufferPercent(profile.buffer);
                    }}
                  >
                    {profile.label}
                  </Button>
                ))}
                {(() => {
                  const profiles = [
                    { paid: 88, free: 6, buffer: 6 },
                    { paid: 50, free: 30, buffer: 20 },
                    { paid: 30, free: 60, buffer: 10 },
                  ];
                  const matchesAny = profiles.some(
                    (p) =>
                      createPaidPercent === p.paid &&
                      createFreePercent === p.free &&
                      createBufferPercent === p.buffer,
                  );
                  return (
                    <Button
                      type="button"
                      size="sm"
                      variant={!matchesAny ? "default" : "outline"}
                      className="text-xs h-7 px-2"
                      onClick={() => {
                        if (matchesAny) {
                          setCreatePaidPercent(0);
                          setCreateFreePercent(0);
                          setCreateBufferPercent(0);
                        }
                      }}
                    >
                      Personnalisé
                    </Button>
                  );
                })()}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Payant %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={createPaidPercent}
                    onChange={(e) => setCreatePaidPercent(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Gratuit %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={createFreePercent}
                    onChange={(e) => setCreateFreePercent(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Buffer %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={createBufferPercent}
                    onChange={(e) => setCreateBufferPercent(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              {createPaidPercent + createFreePercent + createBufferPercent !== 100 && (
                <p className="text-xs text-red-500 mt-1">
                  Total : {createPaidPercent + createFreePercent + createBufferPercent}% — doit
                  être 100%
                </p>
              )}
              {/* Visual bar */}
              <div className="flex h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-blue-500" style={{ width: `${createPaidPercent}%` }} />
                <div className="bg-green-500" style={{ width: `${createFreePercent}%` }} />
                <div className="bg-slate-300" style={{ width: `${createBufferPercent}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Payant {createPaidPercent}%</span>
                <span>Gratuit {createFreePercent}%</span>
                <span>Buffer {createBufferPercent}%</span>
              </div>
            </div>

            {/* ── Promotion (optionnel) ── */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs font-medium">Promotion (optionnel)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Label affiché</Label>
                  <Input
                    type="text"
                    placeholder="-15%"
                    value={createPromoLabel}
                    onChange={(e) => setCreatePromoLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Type</Label>
                  <Select
                    value={createPromoType}
                    onValueChange={(v) => setCreatePromoType(v as "percent" | "amount")}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Pourcentage</SelectItem>
                      <SelectItem value="amount">Montant (MAD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Valeur</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={createPromoValue}
                    onChange={(e) => setCreatePromoValue(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* ── Photo de l'offre (optionnel) ── */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Photo de l'offre
                </Label>
                <span className="text-[10px] text-slate-400">Optionnel — affichée en page d'accueil</span>
              </div>

              {createCoverUrl ? (
                <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-slate-100 border">
                  <img src={createCoverUrl} alt="Photo de l'offre" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setCreateCoverUrl("")}
                    className="absolute top-1.5 end-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  className={cn(
                    "relative block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                    createCoverUploading ? "border-primary/50 bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-primary/50",
                  )}
                >
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif"
                    disabled={createCoverUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: "Erreur", description: "Fichier trop volumineux (max 5 MB).", variant: "destructive" });
                        return;
                      }
                      setCreateCoverUploading(true);
                      try {
                        const res = await uploadAdminSlotImage(undefined, { file, fileName: file.name });
                        setCreateCoverUrl(res.item.public_url);
                      } catch (err) {
                        toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur upload.", variant: "destructive" });
                      } finally {
                        setCreateCoverUploading(false);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-1">
                    {createCoverUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <>
                        <ImagePlus className="w-5 h-5 text-slate-400" />
                        <span className="text-xs text-slate-500">Ajouter une photo</span>
                      </>
                    )}
                  </div>
                </label>
              )}
            </div>

            {/* ── Répéter sur plusieurs jours ── */}
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={createRepeatEnabled}
                  onCheckedChange={(checked) => setCreateRepeatEnabled(!!checked)}
                />
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Repeat className="h-3.5 w-3.5" />
                  Répéter sur plusieurs jours
                </div>
              </label>

              {createRepeatEnabled && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Répéter jusqu'au</Label>
                    <Input
                      type="date"
                      value={createDateEnd}
                      min={createDateStart || undefined}
                      onChange={(e) => setCreateDateEnd(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-slate-500">Jours de la semaine</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { value: 1, label: "Lun" },
                        { value: 2, label: "Mar" },
                        { value: 3, label: "Mer" },
                        { value: 4, label: "Jeu" },
                        { value: 5, label: "Ven" },
                        { value: 6, label: "Sam" },
                        { value: 0, label: "Dim" },
                      ] as const).map((day) => {
                        const isActive = createRepeatDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              setCreateRepeatDays((prev) =>
                                isActive
                                  ? prev.filter((d) => d !== day.value)
                                  : [...prev, day.value],
                              );
                            }}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${
                              isActive
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Résumé ── */}
            {createSummary && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                {createSummary}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={
                creating ||
                createEstablishments.length === 0 ||
                !createDateStart ||
                (createRepeatEnabled && !createDateEnd)
              }
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Créer les créneaux
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Dialog : Modifier créneau                                         */}
      {/* ================================================================= */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Modifier le créneau
            </DialogTitle>
            {editSlot && (
              <DialogDescription>
                {editSlot.establishments?.name} — {formatDate(editSlot.starts_at)}{" "}
                {formatTime(editSlot.starts_at)}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Capacité</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(Number(e.target.value) || 1)}
                />
              </div>
              <PriceTypeField
                priceType={editPriceType}
                onPriceTypeChange={setEditPriceType}
                price={editBasePrice}
                onPriceChange={setEditBasePrice}
                label="Prix (MAD)"
                compact
              />
            </div>

            {/* Promo */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs font-medium">Promotion</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Label</Label>
                  <Input
                    type="text"
                    placeholder="-15%"
                    value={editPromoLabel}
                    onChange={(e) => setEditPromoLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Type</Label>
                  <Select
                    value={editPromoType}
                    onValueChange={(v) => setEditPromoType(v as "percent" | "amount")}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">MAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Valeur</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={editPromoValue}
                    onChange={(e) => setEditPromoValue(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* ── Photo de l'offre ── */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" />
                Photo de l'offre
              </Label>

              {editCoverUrl ? (
                <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-slate-100 border">
                  <img src={editCoverUrl} alt="Photo de l'offre" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditCoverUrl("")}
                    className="absolute top-1.5 end-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  className={cn(
                    "relative block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                    editCoverUploading ? "border-primary/50 bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-primary/50",
                  )}
                >
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif"
                    disabled={editCoverUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: "Erreur", description: "Fichier trop volumineux (max 5 MB).", variant: "destructive" });
                        return;
                      }
                      setEditCoverUploading(true);
                      try {
                        const res = await uploadAdminSlotImage(undefined, { file, fileName: file.name });
                        setEditCoverUrl(res.item.public_url);
                      } catch (err) {
                        toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur upload.", variant: "destructive" });
                      } finally {
                        setEditCoverUploading(false);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-1">
                    {editCoverUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <>
                        <ImagePlus className="w-5 h-5 text-slate-400" />
                        <span className="text-xs text-slate-500">Ajouter une photo</span>
                      </>
                    )}
                  </div>
                </label>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void handleEdit()} disabled={editSaving}>
              {editSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Dialog : Supprimer un créneau                                     */}
      {/* ================================================================= */}
      <AlertDialog open={!!deleteSlot} onOpenChange={(open) => !open && setDeleteSlot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce créneau ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSlot && (
                <>
                  {deleteSlot.establishments?.name} — {formatDate(deleteSlot.starts_at)}{" "}
                  {formatTime(deleteSlot.starts_at)}
                  <br />
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Suppression...
                </>
              ) : (
                "Supprimer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================= */}
      {/* Dialog : Supprimer en lot                                         */}
      {/* ================================================================= */}
      <AlertDialog open={batchDeleteConfirmOpen} onOpenChange={setBatchDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedIds.size} créneau(x) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les {selectedIds.size} créneau(x) sélectionné(s)
              seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBatchDelete()}
              disabled={batchDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {batchDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Suppression...
                </>
              ) : (
                `Supprimer ${selectedIds.size} créneau(x)`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
