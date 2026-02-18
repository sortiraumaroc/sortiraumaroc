import { useEffect, useMemo, useState, useCallback } from "react";
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
  Repeat,
  Search,
  Trash2,
  Users,
  Layers,
  X,
} from "lucide-react";

import { DatePickerInput } from "@/components/DatePickerInput";
import { TimePickerInput } from "@/components/TimePickerInput";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { proUpdateCapacity, proGetCapacity } from "@/lib/reservationV2ProApi";
import type { Establishment, ProRole, ProSlot, Reservation } from "@/lib/pro/types";
import { isReservationInPast } from "@/components/pro/reservations/reservationHelpers";

// Capacity allocation profiles
const CAPACITY_PROFILES = [
  { id: "paid_priority", label: "Priorité payante", paid: 88, free: 6, buffer: 6 },
  { id: "balanced", label: "Équilibré", paid: 50, free: 30, buffer: 20 },
  { id: "generous_free", label: "Gratuit généreux", paid: 30, free: 60, buffer: 10 },
] as const;

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
  const datePart = d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}  |  ${timePart}`;
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
  { value: "Ftour", label: "Ftour (Ramadan)" },
];

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1h" },
  { value: "90", label: "1h30" },
  { value: "120", label: "2h" },
  { value: "180", label: "3h" },
];

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
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
  const [pageSize, setPageSize] = useState(10);

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editSlot, setEditSlot] = useState<SlotWithRemaining | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<SlotWithRemaining | null>(null);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);

  // Form state
  const emptyForm = {
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    intervalMinutes: "30",
    serviceLabel: "__auto__",
    capacity: "",
    basePrice: "",
    promoType: "percent",
    promoValue: "",
    promoLabel: "",
    paidPercent: "88",
    freePercent: "6",
    bufferPercent: "6",
    repeatEnabled: false as boolean,
    repeatUntilDate: "",
    repeatDays: [1, 2, 3, 4, 5, 6, 0] as number[], // 0=Dim, 1=Lun..6=Sam — tous par défaut
  };
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Track which picker is currently open so only one shows at a time
  type PickerId = "startDate" | "startTime" | "endDate" | "endTime" | "repeatUntilDate" | null;
  const [openPicker, setOpenPicker] = useState<PickerId>(null);

  // Capacity configs cache (for pre-filling edit forms)
  const [capacityConfigs, setCapacityConfigs] = useState<Array<{ time_slot_start: string; time_slot_end: string; paid_stock_percentage: number; free_stock_percentage: number; buffer_percentage: number }>>([]);

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

    // Load capacity configs for pre-filling
    try {
      const capRes = await proGetCapacity(establishment.id);
      setCapacityConfigs((capRes.capacity ?? []).map((c: any) => ({
        time_slot_start: c.time_slot_start,
        time_slot_end: c.time_slot_end,
        paid_stock_percentage: c.paid_stock_percentage ?? 88,
        free_stock_percentage: c.free_stock_percentage ?? 6,
        buffer_percentage: c.buffer_percentage ?? 6,
      })));
    } catch { /* silent */ }

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

  // Find capacity config matching a slot's time range
  const findCapacityForSlot = (slotStartIso: string): { paid: string; free: string; buffer: string } => {
    const startHHMM = new Date(slotStartIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
    const match = capacityConfigs.find((c) => c.time_slot_start <= startHHMM && c.time_slot_end > startHHMM);
    if (match) return { paid: String(match.paid_stock_percentage), free: String(match.free_stock_percentage), buffer: String(match.buffer_percentage) };
    return { paid: "88", free: "6", buffer: "6" };
  };

  const openEditDialog = (slot: SlotWithRemaining) => {
    const cap = findCapacityForSlot(slot.starts_at);
    setFormData({
      startDate: slot.starts_at.slice(0, 10),
      startTime: slot.starts_at.slice(11, 16),
      endDate: slot.ends_at ? slot.ends_at.slice(0, 10) : "",
      endTime: slot.ends_at ? slot.ends_at.slice(11, 16) : "",
      intervalMinutes: "30",
      serviceLabel: slot.service_label || "__auto__",
      capacity: String(slot.capacity),
      basePrice: slot.base_price ? String(slot.base_price / 100) : "",
      promoType: slot.promo_type || "percent",
      promoValue: slot.promo_value ? String(slot.promo_value) : "",
      promoLabel: slot.promo_label || "",
      paidPercent: cap.paid,
      freePercent: cap.free,
      bufferPercent: cap.buffer,
      repeatEnabled: false,
      repeatUntilDate: "",
      repeatDays: [1, 2, 3, 4, 5, 6, 0],
    });
    setFormErrors({});
    setEditSlot(slot);
  };

  const duplicateSlot = (slot: SlotWithRemaining) => {
    const tomorrow = new Date(slot.starts_at);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEnd = slot.ends_at ? new Date(slot.ends_at) : null;
    if (tomorrowEnd) tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const cap = findCapacityForSlot(slot.starts_at);
    setFormData({
      startDate: tomorrow.toISOString().slice(0, 10),
      startTime: tomorrow.toISOString().slice(11, 16),
      endDate: tomorrowEnd ? tomorrowEnd.toISOString().slice(0, 10) : "",
      endTime: tomorrowEnd ? tomorrowEnd.toISOString().slice(11, 16) : "",
      intervalMinutes: "30",
      serviceLabel: slot.service_label || "__auto__",
      capacity: String(slot.capacity),
      basePrice: slot.base_price ? String(slot.base_price / 100) : "",
      promoType: slot.promo_type || "percent",
      promoValue: slot.promo_value ? String(slot.promo_value) : "",
      promoLabel: slot.promo_label || "",
      paidPercent: cap.paid,
      freePercent: cap.free,
      bufferPercent: cap.buffer,
      repeatEnabled: false,
      repeatUntilDate: "",
      repeatDays: [1, 2, 3, 4, 5, 6, 0],
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

    const startsDt = formData.startDate && formData.startTime ? new Date(`${formData.startDate}T${formData.startTime}`) : null;
    const endsRangeDt = formData.endDate && formData.endTime ? new Date(`${formData.endDate}T${formData.endTime}`) : null;
    const capacity = Number(formData.capacity);
    const intervalMinutes = Math.round(Number(formData.intervalMinutes) || 30);

    // Validation avec indication visuelle
    const errors: Record<string, boolean> = {};

    if (!startsDt || !Number.isFinite(startsDt.getTime())) {
      errors.startDate = true;
      errors.startTime = true;
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

    // Validation répartition des places (doit faire 100%)
    const paidPct = Number(formData.paidPercent) || 0;
    const freePct = Number(formData.freePercent) || 0;
    const bufferPct = Number(formData.bufferPercent) || 0;
    if (paidPct + freePct + bufferPct !== 100) {
      errors.paidPercent = true;
      errors.freePercent = true;
      errors.bufferPercent = true;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast({ title: "Erreur", description: "Veuillez corriger les champs en rouge." });
      setSaving(false);
      return;
    }

    if (![15, 30, 45, 60, 90, 120, 180].includes(intervalMinutes)) {
      toast({ title: "Erreur", description: "Intervalle invalide." });
      setSaving(false);
      return;
    }

    if (endsRangeDt && Number.isFinite(endsRangeDt.getTime()) && endsRangeDt.getTime() <= startsDt.getTime()) {
      setFormErrors({ endDate: true, endTime: true });
      toast({ title: "Erreur", description: "La fin doit être après le début." });
      setSaving(false);
      return;
    }

    const basePrice = formData.basePrice.trim() ? Math.round(Number(formData.basePrice) * 100) : null;
    const promoValueRaw = formData.promoValue.trim() ? Math.round(Number(formData.promoValue)) : null;
    const promoValue = promoValueRaw && promoValueRaw > 0 ? promoValueRaw : null;
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
        promo_label: promoValue ? (formData.promoLabel.trim() || null) : null,
        service_label: serviceLabel,
        active: true,
      });
    } else {
      // Create new slot(s)
      const rangeEnd = endsRangeDt && Number.isFinite(endsRangeDt.getTime()) ? endsRangeDt : null;
      const slotDurationMs = intervalMinutes * 60 * 1000;
      const slotEnd = (start: Date) => new Date(start.getTime() + slotDurationMs);

      // Determine which days to generate for
      const daysToGenerate: string[] = []; // YYYY-MM-DD strings

      if (formData.repeatEnabled && formData.repeatUntilDate) {
        // Validate
        if (!formData.repeatUntilDate) {
          setFormErrors({ repeatUntilDate: true });
          toast({ title: "Erreur", description: "Veuillez indiquer la date de fin de répétition." });
          setSaving(false);
          return;
        }
        if (formData.repeatDays.length === 0) {
          toast({ title: "Erreur", description: "Veuillez sélectionner au moins un jour de la semaine." });
          setSaving(false);
          return;
        }
        const repeatEnd = new Date(formData.repeatUntilDate);
        if (repeatEnd.getTime() <= new Date(formData.startDate).getTime()) {
          setFormErrors({ repeatUntilDate: true });
          toast({ title: "Erreur", description: "La date de fin de répétition doit être après la date de début." });
          setSaving(false);
          return;
        }

        // Generate list of days
        const cursor = new Date(formData.startDate);
        let guard = 0;
        while (cursor <= repeatEnd && guard < 366) {
          if (formData.repeatDays.includes(cursor.getDay())) {
            daysToGenerate.push(cursor.toISOString().slice(0, 10));
          }
          cursor.setDate(cursor.getDate() + 1);
          guard++;
        }

        if (daysToGenerate.length === 0) {
          toast({ title: "Erreur", description: "Aucun jour ne correspond aux jours sélectionnés dans la plage." });
          setSaving(false);
          return;
        }
      } else {
        // Single day only
        daysToGenerate.push(formData.startDate);
      }

      // Generate slots for each day
      const startTimeStr = formData.startTime; // "HH:MM"
      const endTimeStr = formData.endTime; // "HH:MM" or ""

      for (const dayStr of daysToGenerate) {
        const dayStartDt = new Date(`${dayStr}T${startTimeStr}`);

        if (!rangeEnd && daysToGenerate.length === 1) {
          // Single slot, single day
          rows.push({
            establishment_id: establishment.id,
            starts_at: dayStartDt.toISOString(),
            ends_at: slotEnd(dayStartDt).toISOString(),
            capacity,
            base_price: basePrice,
            promo_type: promoValue ? formData.promoType : null,
            promo_value: promoValue,
            promo_label: promoValue ? (formData.promoLabel.trim() || null) : null,
            service_label: serviceLabel,
            active: true,
          });
        } else {
          // Multiple slots for this day: from startTime to endTime
          const dayEndDt = endTimeStr
            ? new Date(`${dayStr}T${endTimeStr}`)
            : slotEnd(dayStartDt); // if no end time, generate one slot

          let cursor = new Date(dayStartDt);
          let guard = 0;
          while (cursor.getTime() < dayEndDt.getTime() && guard < 500) {
            const s = new Date(cursor);
            const e = slotEnd(s);
            if (e.getTime() > dayEndDt.getTime()) break;

            rows.push({
              establishment_id: establishment.id,
              starts_at: s.toISOString(),
              ends_at: e.toISOString(),
              capacity,
              base_price: basePrice,
              promo_type: promoValue ? formData.promoType : null,
              promo_value: promoValue,
              promo_label: promoValue ? (formData.promoLabel.trim() || null) : null,
              service_label: serviceLabel,
              active: true,
            });

            cursor = e;
            guard++;
          }
        }
      }

      if (!rows.length) {
        toast({ title: "Erreur", description: "Aucun créneau généré. Vérifiez les dates, heures et l'intervalle." });
        setSaving(false);
        return;
      }

      // Safety cap: warn if generating too many slots
      if (rows.length > 2000) {
        toast({ title: "Erreur", description: `Trop de créneaux (${rows.length}). Réduisez la plage de dates ou augmentez l'intervalle.` });
        setSaving(false);
        return;
      }
    }

    try {
      await upsertProSlots({ establishmentId: establishment.id, slots: rows });

      // Sync capacity allocation to establishment_capacity (best-effort)
      try {
        const firstRow = rows[0] as { starts_at: string; ends_at: string; capacity: number };
        const startTime = new Date(firstRow.starts_at as string).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
        const endTime = new Date((rows[rows.length - 1] as { ends_at: string }).ends_at as string).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
        await proUpdateCapacity(establishment.id, [{
          time_slot_start: startTime,
          time_slot_end: endTime,
          slot_interval_minutes: ([15, 30, 60, 90, 120].includes(intervalMinutes) ? intervalMinutes : 30) as 15 | 30 | 60 | 90 | 120,
          total_capacity: capacity,
          paid_stock_percentage: paidPct,
          free_stock_percentage: freePct,
          buffer_percentage: bufferPct,
          occupation_duration_minutes: 90,
          is_closed: false,
        }]);
      } catch {
        // Sync failed silently — slot was still saved successfully
      }

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

  // ── Multi-selection helpers ──────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const pageIds = paginatedSlots.map((s) => s.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [paginatedSlots, selectedIds]);

  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0 || !canWrite(role)) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selectedIds).map((slotId) =>
          deleteProSlot({ establishmentId: establishment.id, slotId }),
        ),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast({ title: "Suppression partielle", description: `${succeeded} supprimé(s), ${failed} échoué(s).` });
      } else {
        toast({ title: "Supprimés", description: `${succeeded} créneau(x) supprimé(s).` });
      }
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Impossible de supprimer." });
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  // Clear selection when filters/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [timeFilter, statusFilter, serviceFilter, searchQuery]);

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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={(open) => !open && setShowBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedIds.size} créneau(x) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les {selectedIds.size} créneaux sélectionnés seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-red-600 hover:bg-red-700" disabled={bulkDeleting}>
              {bulkDeleting ? "Suppression…" : `Supprimer ${selectedIds.size} créneau(x)`}
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
        <DialogContent
          className="max-w-xl max-h-[90vh] overflow-y-auto p-0"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
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

              {/* Début */}
              <div className="space-y-1.5">
                <Label className={`text-xs ${formErrors.startDate || formErrors.startTime ? "text-red-500" : "text-slate-500"}`}>
                  Date et heure de début *
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <DatePickerInput
                    value={formData.startDate}
                    onChange={(d) => {
                      setFormData((p) => ({ ...p, startDate: d }));
                      setFormErrors((p) => ({ ...p, startDate: false }));
                    }}
                    minDate={new Date()}
                    forcePopover
                    open={openPicker === "startDate"}
                    onOpenChange={(o) => setOpenPicker(o ? "startDate" : null)}
                  />
                  <TimePickerInput
                    value={formData.startTime}
                    onChange={(t) => {
                      setFormData((p) => ({ ...p, startTime: t }));
                      setFormErrors((p) => ({ ...p, startTime: false }));
                    }}
                    forcePopover
                    open={openPicker === "startTime"}
                    onOpenChange={(o) => setOpenPicker(o ? "startTime" : null)}
                  />
                </div>
              </div>

              {/* Fin (uniquement en création) */}
              {!editSlot && (
                <div className="space-y-1.5">
                  <Label className={`text-xs ${formErrors.endDate || formErrors.endTime ? "text-red-500" : "text-slate-500"}`}>
                    Date et heure de fin
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <DatePickerInput
                      value={formData.endDate}
                      onChange={(d) => {
                        setFormData((p) => ({ ...p, endDate: d }));
                        setFormErrors((p) => ({ ...p, endDate: false }));
                      }}
                      minDate={formData.startDate ? new Date(formData.startDate) : new Date()}
                      forcePopover
                      open={openPicker === "endDate"}
                      onOpenChange={(o) => setOpenPicker(o ? "endDate" : null)}
                    />
                    <TimePickerInput
                      value={formData.endTime}
                      onChange={(t) => {
                        setFormData((p) => ({ ...p, endTime: t }));
                        setFormErrors((p) => ({ ...p, endTime: false }));
                      }}
                      forcePopover
                      open={openPicker === "endTime"}
                      onOpenChange={(o) => setOpenPicker(o ? "endTime" : null)}
                    />
                  </div>
                  <p className={`text-[11px] ${formErrors.endDate || formErrors.endTime ? "text-red-500" : "text-slate-400"}`}>
                    {formErrors.endDate || formErrors.endTime ? "La fin doit être après le début" : "Optionnel - génère plusieurs créneaux"}
                  </p>
                </div>
              )}

              {!editSlot && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Durée de chaque créneau</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, intervalMinutes: opt.value }))}
                        className={`py-2 px-4 text-sm font-medium rounded-lg border transition-all ${
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

            {/* Section Répétition multi-jours (uniquement en création) */}
            {!editSlot && (
              <div className="space-y-3 pt-2 border-t">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.repeatEnabled}
                    onCheckedChange={(checked) =>
                      setFormData((p) => ({ ...p, repeatEnabled: !!checked }))
                    }
                  />
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Repeat className="h-4 w-4" />
                    Répéter sur plusieurs jours
                  </div>
                </label>

                {formData.repeatEnabled && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className={`text-xs ${formErrors.repeatUntilDate ? "text-red-500" : "text-slate-500"}`}>
                        Répéter jusqu'au *
                      </Label>
                      <DatePickerInput
                        value={formData.repeatUntilDate}
                        onChange={(d) => {
                          setFormData((p) => ({ ...p, repeatUntilDate: d }));
                          setFormErrors((p) => ({ ...p, repeatUntilDate: false }));
                        }}
                        minDate={formData.startDate ? new Date(new Date(formData.startDate).getTime() + 86400000) : new Date()}
                        forcePopover
                        open={openPicker === "repeatUntilDate"}
                        onOpenChange={(o) => setOpenPicker(o ? "repeatUntilDate" : null)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Jours de la semaine</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((day) => {
                          const isActive = formData.repeatDays.includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => {
                                setFormData((p) => ({
                                  ...p,
                                  repeatDays: isActive
                                    ? p.repeatDays.filter((d) => d !== day.value)
                                    : [...p.repeatDays, day.value],
                                }));
                              }}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
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
                      <p className="text-[11px] text-slate-400">
                        {(() => {
                          if (!formData.startDate || !formData.repeatUntilDate || formData.repeatDays.length === 0) return null;
                          const start = new Date(formData.startDate);
                          const end = new Date(formData.repeatUntilDate);
                          let count = 0;
                          const cursor = new Date(start);
                          while (cursor <= end && count < 366) {
                            if (formData.repeatDays.includes(cursor.getDay())) count++;
                            cursor.setDate(cursor.getDate() + 1);
                          }
                          const slotsPerDay = formData.endTime && formData.startTime
                            ? (() => {
                                const [sh, sm] = formData.startTime.split(":").map(Number);
                                const [eh, em] = formData.endTime.split(":").map(Number);
                                const totalMin = (eh * 60 + em) - (sh * 60 + sm);
                                return totalMin > 0 ? Math.floor(totalMin / (Number(formData.intervalMinutes) || 30)) : 1;
                              })()
                            : 1;
                          return `${count} jour${count > 1 ? "s" : ""} × ${slotsPerDay} créneau${slotsPerDay > 1 ? "x" : ""} = ~${count * slotsPerDay} créneaux au total`;
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                      className={`h-11 pe-16 ${formErrors.capacity ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">places</span>
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
                      className={`h-11 pe-14 ${formErrors.basePrice ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">MAD</span>
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

            {/* Section Répartition des places */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Layers className="h-4 w-4" />
                Répartition des places
              </div>

              {/* Profils rapides */}
              <div className="flex flex-wrap gap-1.5">
                {CAPACITY_PROFILES.map((p) => {
                  const isActive = formData.paidPercent === String(p.paid) && formData.freePercent === String(p.free) && formData.bufferPercent === String(p.buffer);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, paidPercent: String(p.paid), freePercent: String(p.free), bufferPercent: String(p.buffer) }))}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                        isActive
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {/* Personnalisé — actif quand les % ne correspondent à aucun profil */}
                {(() => {
                  const matchesAnyProfile = CAPACITY_PROFILES.some(
                    (p) => formData.paidPercent === String(p.paid) && formData.freePercent === String(p.free) && formData.bufferPercent === String(p.buffer),
                  );
                  return (
                    <button
                      type="button"
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                        !matchesAnyProfile
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        // Si on clique sur Personnalisé et qu'on est déjà dessus, ne rien faire
                        // Si on clique dessus depuis un profil, on reset à des valeurs vides pour éditer
                        if (matchesAnyProfile) {
                          setFormData((prev) => ({ ...prev, paidPercent: "", freePercent: "", bufferPercent: "" }));
                        }
                      }}
                    >
                      Personnalisé
                    </button>
                  );
                })()}
              </div>

              {/* Inputs % */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className={`text-xs ${formErrors.paidPercent ? "text-red-500" : "text-slate-500"}`}>Payant</Label>
                  <div className="relative">
                    <Input
                      type="number" min="0" max="100"
                      value={formData.paidPercent}
                      onChange={(e) => setFormData((prev) => ({ ...prev, paidPercent: e.target.value }))}
                      className={`h-9 pe-8 text-sm ${formErrors.paidPercent ? "border-red-500" : ""}`}
                    />
                    <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className={`text-xs ${formErrors.freePercent ? "text-red-500" : "text-slate-500"}`}>Gratuit</Label>
                  <div className="relative">
                    <Input
                      type="number" min="0" max="100"
                      value={formData.freePercent}
                      onChange={(e) => setFormData((prev) => ({ ...prev, freePercent: e.target.value }))}
                      className={`h-9 pe-8 text-sm ${formErrors.freePercent ? "border-red-500" : ""}`}
                    />
                    <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className={`text-xs ${formErrors.bufferPercent ? "text-red-500" : "text-slate-500"}`}>Buffer</Label>
                  <div className="relative">
                    <Input
                      type="number" min="0" max="100"
                      value={formData.bufferPercent}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bufferPercent: e.target.value }))}
                      className={`h-9 pe-8 text-sm ${formErrors.bufferPercent ? "border-red-500" : ""}`}
                    />
                    <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>
              </div>

              {/* Barre visuelle + décompte */}
              {(() => {
                const paid = Math.max(0, Math.min(100, Number(formData.paidPercent) || 0));
                const free = Math.max(0, Math.min(100, Number(formData.freePercent) || 0));
                const buffer = Math.max(0, Math.min(100, Number(formData.bufferPercent) || 0));
                const total = paid + free + buffer;
                const cap = Number(formData.capacity) || 0;
                const paidPlaces = Math.round(cap * paid / 100);
                const freePlaces = Math.round(cap * free / 100);
                const bufferPlaces = Math.max(0, cap - paidPlaces - freePlaces);

                return (
                  <div className="space-y-1.5">
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                      <div className="bg-primary transition-all" style={{ width: `${paid}%` }} />
                      <div className="bg-green-500 transition-all" style={{ width: `${free}%` }} />
                      <div className="bg-orange-400 transition-all" style={{ width: `${buffer}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />{paidPlaces} payantes</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{freePlaces} gratuites</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />{bufferPlaces} buffer</span>
                      </div>
                      {total !== 100 && (
                        <span className="text-[10px] text-red-500 font-semibold">Total : {total}% (doit être 100%)</span>
                      )}
                    </div>
                  </div>
                );
              })()}
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
                      className={`h-11 pe-12 ${formErrors.promoValue ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
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
                  <Copy className="h-4 w-4 me-2" />
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
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher par ID, service, promo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9"
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

          {/* Results info + selection bar */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {filteredSlots.length} créneau{filteredSlots.length > 1 ? "x" : ""} trouvé{filteredSlots.length > 1 ? "s" : ""}
            </div>
            {selectedIds.size > 0 && canWrite(role) && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">
                  {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="h-3.5 w-3.5 me-1" />
                  Désélectionner
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 me-1" />
                  Supprimer ({selectedIds.size})
                </Button>
              </div>
            )}
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
                      className={`rounded-xl border p-4 space-y-3 ${isPast ? "bg-slate-50 opacity-60" : ""} ${selectedIds.has(slot.id) ? "bg-primary/5 border-primary/30" : "bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {canWrite(role) && (
                            <Checkbox
                              checked={selectedIds.has(slot.id)}
                              onCheckedChange={() => toggleSelect(slot.id)}
                              className="mt-1"
                              aria-label={`Sélectionner créneau ${formatDateTimeShort(slot.starts_at)}`}
                            />
                          )}
                          <div>
                            <div className="font-semibold">{formatDateTimeShort(slot.starts_at)}</div>
                            <div className="text-sm text-slate-500">{slot.service_label || "Auto"}</div>
                          </div>
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
                          <Eye className="h-4 w-4 me-1" />
                          Détails
                        </Button>
                        {canWrite(role) && !isPast && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(slot)}>
                              <Pencil className="h-4 w-4 me-1" />
                              Modifier
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => duplicateSlot(slot)}>
                              <Copy className="h-4 w-4 me-1" />
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
                            <Trash2 className="h-4 w-4 me-1" />
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
                      {canWrite(role) && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={paginatedSlots.length > 0 && paginatedSlots.every((s) => selectedIds.has(s.id))}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Tout sélectionner"
                          />
                        </TableHead>
                      )}
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
                      <TableHead className="text-end">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSlots.map((slot) => {
                      const isPast = isSlotInPast(slot);
                      return (
                        <TableRow key={slot.id} className={`${isPast ? "opacity-50 bg-slate-50" : ""} ${selectedIds.has(slot.id) ? "bg-primary/5" : ""}`}>
                          {canWrite(role) && (
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(slot.id)}
                                onCheckedChange={() => toggleSelect(slot.id)}
                                aria-label={`Sélectionner créneau ${formatDateTime(slot.starts_at)}`}
                              />
                            </TableCell>
                          )}
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
              {filteredSlots.length > 10 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-500">
                      Page {currentPage} sur {totalPages}
                    </div>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n} value={n}>{n} / page</option>
                      ))}
                    </select>
                  </div>
                  {totalPages > 1 && (
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
                  )}
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
