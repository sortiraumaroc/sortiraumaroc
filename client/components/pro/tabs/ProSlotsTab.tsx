import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { toast } from "@/hooks/use-toast";
import {
  deleteProSlot,
  listProOffers,
  listProReservations,
  upsertProSlots,
} from "@/lib/pro/api";
import type { Establishment, ProRole, ProSlot, Reservation } from "@/lib/pro/types";
import { isReservationInPast } from "@/components/pro/reservations/reservationHelpers";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type SortColumn = "starts_at" | "capacity" | "base_price" | "remaining" | "service_label";
type SortDirection = "asc" | "desc";
type TimeFilter = "all" | "future" | "past";
type StatusFilter = "all" | "available" | "full" | "waitlist";

type SlotWithRemaining = ProSlot & { remaining_capacity?: number | null };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function canWrite(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "marketing";
}

function formatMoney(amount: number | null | undefined, currency: string): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("fr-MA", { style: "currency", currency }).format(n / 100);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSlotInPast(slot: ProSlot): boolean {
  const d = new Date(slot.starts_at);
  return d.getTime() < Date.now();
}

function isSlotFull(slot: SlotWithRemaining): boolean {
  return typeof slot.remaining_capacity === "number" && slot.remaining_capacity <= 0;
}

const SERVICE_OPTIONS = [
  { value: "__auto__", label: "(Auto)" },
  { value: "Petit-déjeuner", label: "Petit-déjeuner" },
  { value: "Déjeuner", label: "Déjeuner" },
  { value: "Tea Time", label: "Tea Time" },
  { value: "Happy Hour", label: "Happy Hour" },
  { value: "Dîner", label: "Dîner" },
];

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export function ProSlotsTab({ establishment, role }: Props) {
  // Data state
  const [slots, setSlots] = useState<SlotWithRemaining[]>([]);
  const [waitlistBySlotId, setWaitlistBySlotId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("future");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("starts_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editSlot, setEditSlot] = useState<SlotWithRemaining | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<SlotWithRemaining | null>(null);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);

  // Form state
  const emptyForm = {
    startsAt: "",
    endsAt: "",
    intervalMinutes: "30",
    serviceLabel: "__auto__",
    capacity: "",
    basePrice: "",
    promoType: "percent",
    promoValue: "",
    promoLabel: "",
  };
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    setError(null);

    const [offersRes, reservationsRes] = await Promise.all([
      listProOffers(establishment.id).catch(() => null),
      listProReservations(establishment.id).catch(() => null),
    ]);

    if (!offersRes) {
      setError("Impossible de charger les créneaux.");
      setLoading(false);
      return;
    }

    const slotsData = ((offersRes as { slots?: unknown[] } | null)?.slots ?? []) as SlotWithRemaining[];
    setSlots(slotsData);

    const reservations = ((reservationsRes as { reservations?: unknown[] } | null)?.reservations ?? []) as Reservation[];
    const wl: Record<string, number> = {};
    const nowMs = Date.now();
    for (const r of reservations) {
      if (!r || r.status !== "waitlist") continue;
      if (isReservationInPast(r, nowMs)) continue;
      if (!r.slot_id) continue;
      wl[r.slot_id] = (wl[r.slot_id] ?? 0) + 1;
    }
    setWaitlistBySlotId(wl);

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [establishment.id]);

  // ─────────────────────────────────────────────────────────────
  // Filtering & Sorting
  // ─────────────────────────────────────────────────────────────

  const filteredSlots = useMemo(() => {
    let result = [...slots];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          (s.service_label || "").toLowerCase().includes(q) ||
          (s.promo_label || "").toLowerCase().includes(q)
      );
    }

    // Time filter
    if (timeFilter === "future") {
      result = result.filter((s) => !isSlotInPast(s));
    } else if (timeFilter === "past") {
      result = result.filter((s) => isSlotInPast(s));
    }

    // Status filter
    if (statusFilter === "available") {
      result = result.filter((s) => !isSlotFull(s) && !isSlotInPast(s));
    } else if (statusFilter === "full") {
      result = result.filter((s) => isSlotFull(s));
    } else if (statusFilter === "waitlist") {
      result = result.filter((s) => (waitlistBySlotId[s.id] ?? 0) > 0);
    }

    // Service filter
    if (serviceFilter !== "all") {
      result = result.filter((s) => (s.service_label || "") === serviceFilter);
    }

    // Sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "starts_at":
          cmp = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
          break;
        case "capacity":
          cmp = a.capacity - b.capacity;
          break;
        case "base_price":
          cmp = (a.base_price ?? 0) - (b.base_price ?? 0);
          break;
        case "remaining":
          cmp = (a.remaining_capacity ?? 0) - (b.remaining_capacity ?? 0);
          break;
        case "service_label":
          cmp = (a.service_label || "").localeCompare(b.service_label || "");
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [slots, searchQuery, timeFilter, statusFilter, serviceFilter, sortColumn, sortDirection, waitlistBySlotId]);

  // Pagination
  const totalPages = Math.ceil(filteredSlots.length / pageSize);
  const paginatedSlots = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSlots.slice(start, start + pageSize);
  }, [filteredSlots, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, timeFilter, statusFilter, serviceFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = slots.length;
    const future = slots.filter((s) => !isSlotInPast(s)).length;
    const available = slots.filter((s) => !isSlotInPast(s) && !isSlotFull(s)).length;
    const full = slots.filter((s) => isSlotFull(s)).length;
    const withWaitlist = slots.filter((s) => (waitlistBySlotId[s.id] ?? 0) > 0).length;
    return { total, future, available, full, withWaitlist };
  }, [slots, waitlistBySlotId]);

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-4 w-4 text-slate-400" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 text-primary" />
    ) : (
      <ArrowDown className="h-4 w-4 text-primary" />
    );
  };

  const resetFilters = () => {
    setSearchQuery("");
    setTimeFilter("future");
    setStatusFilter("all");
    setServiceFilter("all");
  };

  const openCreateDialog = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setShowCreateDialog(true);
  };

  const openEditDialog = (slot: SlotWithRemaining) => {
    setFormData({
      startsAt: slot.starts_at.slice(0, 16),
      endsAt: slot.ends_at ? slot.ends_at.slice(0, 16) : "",
      intervalMinutes: "30",
      serviceLabel: slot.service_label || "__auto__",
      capacity: String(slot.capacity),
      basePrice: slot.base_price ? String(slot.base_price / 100) : "",
      promoType: slot.promo_type || "percent",
      promoValue: slot.promo_value ? String(slot.promo_value) : "",
      promoLabel: slot.promo_label || "",
    });
    setFormErrors({});
    setEditSlot(slot);
  };

  const duplicateSlot = (slot: SlotWithRemaining) => {
    const tomorrow = new Date(slot.starts_at);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEnd = slot.ends_at ? new Date(slot.ends_at) : null;
    if (tomorrowEnd) tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    setFormData({
      startsAt: tomorrow.toISOString().slice(0, 16),
      endsAt: tomorrowEnd ? tomorrowEnd.toISOString().slice(0, 16) : "",
      intervalMinutes: "30",
      serviceLabel: slot.service_label || "__auto__",
      capacity: String(slot.capacity),
      basePrice: slot.base_price ? String(slot.base_price / 100) : "",
      promoType: slot.promo_type || "percent",
      promoValue: slot.promo_value ? String(slot.promo_value) : "",
      promoLabel: slot.promo_label || "",
    });
    setFormErrors({});
    setShowCreateDialog(true);
    toast({ title: "Duplication", description: "Créneau dupliqué pour demain. Modifiez si besoin." });
  };

  const saveSlot = async (isEdit: boolean) => {
    if (!canWrite(role)) return;
    setSaving(true);
    setError(null);
    setFormErrors({});

    const startsDt = formData.startsAt ? new Date(formData.startsAt) : null;
    const endsRangeDt = formData.endsAt ? new Date(formData.endsAt) : null;
    const capacity = Number(formData.capacity);
    const intervalMinutes = Math.round(Number(formData.intervalMinutes) || 30);

    // Validation avec indication visuelle
    const errors: Record<string, boolean> = {};

    if (!startsDt || !Number.isFinite(startsDt.getTime())) {
      errors.startsAt = true;
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
      errors.capacity = true;
    }

    // Validation prix négatif
    const basePriceNum = formData.basePrice.trim() ? Number(formData.basePrice) : 0;
    if (basePriceNum < 0) {
      errors.basePrice = true;
    }

    // Validation promo négative
    const promoValueNum = formData.promoValue.trim() ? Number(formData.promoValue) : 0;
    if (promoValueNum < 0) {
      errors.promoValue = true;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast({ title: "Erreur", description: "Veuillez corriger les champs en rouge." });
      setSaving(false);
      return;
    }

    if (![15, 30, 45, 60].includes(intervalMinutes)) {
      toast({ title: "Erreur", description: "Intervalle invalide (15 / 30 / 45 / 60 min)." });
      setSaving(false);
      return;
    }

    if (endsRangeDt && Number.isFinite(endsRangeDt.getTime()) && endsRangeDt.getTime() <= startsDt.getTime()) {
      setFormErrors({ endsAt: true });
      toast({ title: "Erreur", description: "La fin doit être après le début." });
      setSaving(false);
      return;
    }

    const basePrice = formData.basePrice.trim() ? Math.round(Number(formData.basePrice) * 100) : null;
    const promoValue = formData.promoValue.trim() ? Math.round(Number(formData.promoValue)) : null;
    const serviceLabel = formData.serviceLabel === "__auto__" ? null : (formData.serviceLabel.trim() || null);

    const rows: Array<Record<string, unknown>> = [];

    if (isEdit && editSlot) {
      // Update existing slot - calculer la vraie fin basée sur l'intervalle original
      const originalStart = new Date(editSlot.starts_at);
      const originalEnd = editSlot.ends_at ? new Date(editSlot.ends_at) : null;
      const originalDuration = originalEnd ? originalEnd.getTime() - originalStart.getTime() : intervalMinutes * 60 * 1000;
      const newEndDt = new Date(startsDt.getTime() + originalDuration);

      rows.push({
        id: editSlot.id,
        establishment_id: establishment.id,
        starts_at: startsDt.toISOString(),
        ends_at: newEndDt.toISOString(),
        capacity,
        base_price: basePrice,
        promo_type: promoValue ? formData.promoType : null,
        promo_value: promoValue,
        promo_label: formData.promoLabel.trim() || null,
        service_label: serviceLabel,
        active: true,
      });
    } else {
      // Create new slot(s)
      const rangeEnd = endsRangeDt && Number.isFinite(endsRangeDt.getTime()) ? endsRangeDt : null;
      const slotEnd = (start: Date) => {
        const dt = new Date(start);
        dt.setMinutes(dt.getMinutes() + intervalMinutes);
        return dt;
      };

      if (!rangeEnd) {
        rows.push({
          establishment_id: establishment.id,
          starts_at: startsDt.toISOString(),
          ends_at: slotEnd(startsDt).toISOString(),
          capacity,
          base_price: basePrice,
          promo_type: promoValue ? formData.promoType : null,
          promo_value: promoValue,
          promo_label: formData.promoLabel.trim() || null,
          service_label: serviceLabel,
          active: true,
        });
      } else {
        let cursor = new Date(startsDt);
        let guard = 0;
        while (cursor.getTime() < rangeEnd.getTime() && guard < 500) {
          const s = new Date(cursor);
          const e = slotEnd(s);
          if (e.getTime() > rangeEnd.getTime()) break;

          rows.push({
            establishment_id: establishment.id,
            starts_at: s.toISOString(),
            ends_at: e.toISOString(),
            capacity,
            base_price: basePrice,
            promo_type: promoValue ? formData.promoType : null,
            promo_value: promoValue,
            promo_label: formData.promoLabel.trim() || null,
            service_label: serviceLabel,
            active: true,
          });

          cursor = e;
          guard += 1;
        }

        if (!rows.length) {
          toast({ title: "Erreur", description: "Aucun créneau généré. Vérifiez le début/fin et l'intervalle." });
          setSaving(false);
          return;
        }
      }
    }

    try {
      await upsertProSlots({ establishmentId: establishment.id, slots: rows });
      toast({
        title: isEdit ? "Créneau modifié" : "Créneau(x) créé(s)",
        description: isEdit ? "Le créneau a été mis à jour." : `${rows.length} créneau(x) ajouté(s).`,
      });
      setShowCreateDialog(false);
      setEditSlot(null);
      setFormData(emptyForm);
      await load();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Impossible de sauvegarder." });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteSlotId || !canWrite(role)) return;
    try {
      await deleteProSlot({ establishmentId: establishment.id, slotId: deleteSlotId });
      toast({ title: "Supprimé", description: "Le créneau a été supprimé." });
      await load();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Impossible de supprimer." });
    } finally {
      setDeleteSlotId(null);
    }
  };

  const copySlotId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast({ title: "Copié", description: id });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier." });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Status Badge
  // ─────────────────────────────────────────────────────────────

  const getSlotStatusBadge = (slot: SlotWithRemaining) => {
    const isPast = isSlotInPast(slot);
    const isFull = isSlotFull(slot);
    const hasWaitlist = (waitlistBySlotId[slot.id] ?? 0) > 0;

    if (isPast) {
      return <Badge className="bg-slate-100 text-slate-500 border-slate-200">Passé</Badge>;
    }
    if (isFull) {
      return <Badge className="bg-red-50 text-red-700 border-red-200">Complet</Badge>;
    }
    if (hasWaitlist) {
      return <Badge className="bg-blue-50 text-blue-700 border-blue-200">{waitlistBySlotId[slot.id]} en attente</Badge>;
    }
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Disponible</Badge>;
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSlotId} onOpenChange={(open) => !open && setDeleteSlotId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce créneau ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le créneau sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || !!editSlot}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditSlot(null);
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50">
            <DialogTitle className="text-xl">
              {editSlot ? "Modifier le créneau" : "Nouveau créneau"}
            </DialogTitle>
            <DialogDescription>
              {editSlot
                ? "Modifiez les informations du créneau."
                : "Créez un ou plusieurs créneaux de réservation."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-6">
            {/* Section Date & Heure */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Calendar className="h-4 w-4" />
                Date et heure
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className={`text-xs ${formErrors.startsAt ? "text-red-500" : "text-slate-500"}`}>
                    Date et heure de début *
                  </Label>
                  <Input
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, startsAt: e.target.value }));
                      setFormErrors((p) => ({ ...p, startsAt: false }));
                    }}
                    className={`h-11 ${formErrors.startsAt ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  />
                </div>

                {!editSlot && (
                  <div className="space-y-1.5">
                    <Label className={`text-xs ${formErrors.endsAt ? "text-red-500" : "text-slate-500"}`}>
                      Date et heure de fin
                    </Label>
                    <Input
                      type="datetime-local"
                      value={formData.endsAt}
                      onChange={(e) => {
                        setFormData((p) => ({ ...p, endsAt: e.target.value }));
                        setFormErrors((p) => ({ ...p, endsAt: false }));
                      }}
                      className={`h-11 ${formErrors.endsAt ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <p className={`text-[11px] ${formErrors.endsAt ? "text-red-500" : "text-slate-400"}`}>
                      {formErrors.endsAt ? "La fin doit être après le début" : "Optionnel - génère plusieurs créneaux"}
                    </p>
                  </div>
                )}
              </div>

              {!editSlot && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Durée de chaque créneau</Label>
                  <div className="flex gap-2">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, intervalMinutes: opt.value }))}
                        className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-lg border transition-all ${
                          formData.intervalMinutes === opt.value
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section Configuration */}
            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users className="h-4 w-4" />
                Configuration
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className={`text-xs ${formErrors.capacity ? "text-red-500" : "text-slate-500"}`}>
                    Capacité *
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      value={formData.capacity}
                      onChange={(e) => {
                        setFormData((p) => ({ ...p, capacity: e.target.value }));
                        setFormErrors((p) => ({ ...p, capacity: false }));
                      }}
                      placeholder="20"
                      className={`h-11 pr-16 ${formErrors.capacity ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">places</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-xs ${formErrors.basePrice ? "text-red-500" : "text-slate-500"}`}>
                    Prix
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.basePrice}
                      onChange={(e) => {
                        setFormData((p) => ({ ...p, basePrice: e.target.value }));
                        setFormErrors((p) => ({ ...p, basePrice: false }));
                      }}
                      placeholder="0"
                      className={`h-11 pr-14 ${formErrors.basePrice ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">MAD</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Service</Label>
                  <Select
                    value={formData.serviceLabel}
                    onValueChange={(v) => setFormData((p) => ({ ...p, serviceLabel: v }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="(Auto)" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section Promotion */}
            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="text-amber-500">%</span>
                  Promotion
                </div>
                <span className="text-[11px] text-slate-400">Optionnel</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Label affiché</Label>
                  <Input
                    value={formData.promoLabel}
                    onChange={(e) => setFormData((p) => ({ ...p, promoLabel: e.target.value }))}
                    placeholder="Ex: -15%"
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Type de réduction</Label>
                  <Select
                    value={formData.promoType}
                    onValueChange={(v) => setFormData((p) => ({ ...p, promoType: v }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Pourcentage</SelectItem>
                      <SelectItem value="amount">Montant fixe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className={`text-xs ${formErrors.promoValue ? "text-red-500" : "text-slate-500"}`}>
                    Valeur
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={formData.promoValue}
                      onChange={(e) => {
                        setFormData((p) => ({ ...p, promoValue: e.target.value }));
                        setFormErrors((p) => ({ ...p, promoValue: false }));
                      }}
                      placeholder="0"
                      className={`h-11 pr-12 ${formErrors.promoValue ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      {formData.promoType === "percent" ? "%" : "MAD"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-slate-50 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditSlot(null);
              }}
              className="flex-1 sm:flex-none"
            >
              Annuler
            </Button>
            <Button
              onClick={() => saveSlot(!!editSlot)}
              disabled={saving || !canWrite(role)}
              className="flex-1 sm:flex-none min-w-[120px]"
            >
              {saving ? "Enregistrement..." : editSlot ? "Enregistrer" : "Créer le créneau"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={!!detailsSlot} onOpenChange={(open) => !open && setDetailsSlot(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails du créneau</DialogTitle>
          </DialogHeader>

          {detailsSlot && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {getSlotStatusBadge(detailsSlot)}
                <Button variant="outline" size="sm" onClick={() => copySlotId(detailsSlot.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copier ID
                </Button>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500">Début</div>
                    <div className="font-medium">{formatDateTime(detailsSlot.starts_at)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Fin</div>
                    <div className="font-medium">
                      {detailsSlot.ends_at ? formatDateTime(detailsSlot.ends_at) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Service</div>
                    <div className="font-medium">{detailsSlot.service_label || "Auto"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Prix</div>
                    <div className="font-medium">{formatMoney(detailsSlot.base_price, "MAD")}</div>
                  </div>
                </div>

                <div className="border-t pt-3 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500">Capacité</div>
                    <div className="font-semibold text-lg">{detailsSlot.capacity}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Restant</div>
                    <div className="font-semibold text-lg">
                      {typeof detailsSlot.remaining_capacity === "number" ? detailsSlot.remaining_capacity : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Liste d'attente</div>
                    <div className="font-semibold text-lg text-blue-600">
                      {waitlistBySlotId[detailsSlot.id] ?? 0}
                    </div>
                  </div>
                </div>

                {detailsSlot.promo_type && (
                  <div className="border-t pt-3">
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                      {detailsSlot.promo_label || "Promo"}{" "}
                      {detailsSlot.promo_type === "percent"
                        ? `${detailsSlot.promo_value}%`
                        : `${detailsSlot.promo_value} MAD`}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400 font-mono break-all">ID: {detailsSlot.id}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setTimeFilter("all"); setStatusFilter("all"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100">
                <Calendar className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setTimeFilter("future"); setStatusFilter("all"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.future}</div>
                <div className="text-xs text-slate-500">À venir</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setTimeFilter("future"); setStatusFilter("available"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.available}</div>
                <div className="text-xs text-slate-500">Disponibles</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setTimeFilter("all"); setStatusFilter("full"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.full}</div>
                <div className="text-xs text-slate-500">Complets</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setTimeFilter("all"); setStatusFilter("waitlist"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.withWaitlist}</div>
                <div className="text-xs text-slate-500">Liste d'attente</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <SectionHeader
              title="Gestion des créneaux"
              description="Créez, modifiez et gérez vos créneaux de réservation."
            />
            {canWrite(role) && (
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau créneau
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher par ID, service, promo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="future">À venir</SelectItem>
                <SelectItem value="past">Passés</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="available">Disponibles</SelectItem>
                <SelectItem value="full">Complets</SelectItem>
                <SelectItem value="waitlist">Avec liste d'attente</SelectItem>
              </SelectContent>
            </Select>

            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous services</SelectItem>
                {SERVICE_OPTIONS.filter((o) => o.value !== "__auto__").map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchQuery || timeFilter !== "future" || statusFilter !== "all" || serviceFilter !== "all") && (
              <Button variant="ghost" size="icon" onClick={resetFilters} title="Réinitialiser les filtres">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Results info */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {filteredSlots.length} créneau{filteredSlots.length > 1 ? "x" : ""} trouvé{filteredSlots.length > 1 ? "s" : ""}
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="text-center py-8 text-slate-500">Chargement...</div>
          ) : filteredSlots.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {slots.length === 0 ? "Aucun créneau créé." : "Aucun créneau ne correspond aux filtres."}
            </div>
          ) : (
            <>
              {/* Mobile View - Cards */}
              <div className="md:hidden space-y-3">
                {paginatedSlots.map((slot) => {
                  const isPast = isSlotInPast(slot);
                  return (
                    <div
                      key={slot.id}
                      className={`rounded-xl border p-4 space-y-3 ${isPast ? "bg-slate-50 opacity-60" : "bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{formatDateTimeShort(slot.starts_at)}</div>
                          <div className="text-sm text-slate-500">{slot.service_label || "Auto"}</div>
                        </div>
                        {getSlotStatusBadge(slot)}
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-slate-500">Capacité</div>
                          <div className="font-semibold">{slot.capacity}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Restant</div>
                          <div className="font-semibold">
                            {typeof slot.remaining_capacity === "number" ? slot.remaining_capacity : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Prix</div>
                          <div className="font-semibold">{formatMoney(slot.base_price, "MAD")}</div>
                        </div>
                      </div>

                      {slot.promo_type && (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                          {slot.promo_label || "Promo"}{" "}
                          {slot.promo_type === "percent" ? `${slot.promo_value}%` : `${slot.promo_value} MAD`}
                        </Badge>
                      )}

                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button variant="outline" size="sm" onClick={() => setDetailsSlot(slot)}>
                          <Eye className="h-4 w-4 mr-1" />
                          Détails
                        </Button>
                        {canWrite(role) && !isPast && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(slot)}>
                              <Pencil className="h-4 w-4 mr-1" />
                              Modifier
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => duplicateSlot(slot)}>
                              <Copy className="h-4 w-4 mr-1" />
                              Dupliquer
                            </Button>
                          </>
                        )}
                        {canWrite(role) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteSlotId(slot.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Supprimer
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View - Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleSort("starts_at")}
                      >
                        <div className="flex items-center gap-2">
                          Début
                          <SortIcon column="starts_at" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleSort("service_label")}
                      >
                        <div className="flex items-center gap-2">
                          Service
                          <SortIcon column="service_label" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleSort("capacity")}
                      >
                        <div className="flex items-center gap-2">
                          Capacité
                          <SortIcon column="capacity" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleSort("remaining")}
                      >
                        <div className="flex items-center gap-2">
                          Restant
                          <SortIcon column="remaining" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleSort("base_price")}
                      >
                        <div className="flex items-center gap-2">
                          Prix
                          <SortIcon column="base_price" />
                        </div>
                      </TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Promo</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSlots.map((slot) => {
                      const isPast = isSlotInPast(slot);
                      return (
                        <TableRow key={slot.id} className={isPast ? "opacity-50 bg-slate-50" : ""}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {formatDateTime(slot.starts_at)}
                          </TableCell>
                          <TableCell>{slot.service_label || "Auto"}</TableCell>
                          <TableCell className="tabular-nums">{slot.capacity}</TableCell>
                          <TableCell className="tabular-nums">
                            {typeof slot.remaining_capacity === "number" ? slot.remaining_capacity : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatMoney(slot.base_price, "MAD")}</TableCell>
                          <TableCell>{getSlotStatusBadge(slot)}</TableCell>
                          <TableCell>
                            {slot.promo_type ? (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                                {slot.promo_label || "Promo"}{" "}
                                {slot.promo_type === "percent" ? `${slot.promo_value}%` : `${slot.promo_value} MAD`}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setDetailsSlot(slot)} title="Détails">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canWrite(role) && !isPast && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(slot)}
                                    title="Modifier"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => duplicateSlot(slot)}
                                    title="Dupliquer"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {canWrite(role) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteSlotId(slot.id)}
                                  title="Supprimer"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-slate-500">
                    Page {currentPage} sur {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Role Warning */}
      {!canWrite(role) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Votre rôle ne permet pas de créer ou modifier les créneaux.
        </div>
      )}
    </div>
  );
}
