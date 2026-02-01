import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, Check, CheckCircle, ChevronLeft, ChevronRight, Clock, Copy, Download, Edit3, Eye, Filter, LayoutList, ListPlus, Loader2, MessageSquareText, Search, Settings2, ShieldAlert, Users, XCircle } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { toast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

import {
  createProReservationMessageTemplate,
  getProSession,
  listProOffers,
  listProReservationMessageTemplates,
  listProReservations,
  seedFakeReservations,
  updateProReservation,
  updateProReservationMessageTemplate,
} from "@/lib/pro/api";
import { getDemoProEmail, isDemoModeEnabled } from "@/lib/demoMode";
import { downloadReservationsCsv, downloadReservationsPdf, formatLocalYmd, isSameLocalDay } from "@/lib/pro/reservationsExport";
import type { Establishment, ProRole, ProSlot, Reservation } from "@/lib/pro/types";

import { formatDateJjMmAa, formatHeureHhHMM, formatLeJjMmAaAHeure } from "@shared/datetime";

import {
  ReservationDecisionDialog,
  type ProReservationPatch,
  type ReservationDecisionMode,
  type ReservationMessageTemplate,
} from "@/components/pro/reservations/ReservationDecisionDialog";
import { ClientRiskGuardDialog } from "@/components/pro/reservations/ClientRiskGuardDialog";
import { ReservationMessageDialog } from "@/components/pro/reservations/ReservationMessageDialog";
import { ReservationTemplatesManagerDialog } from "@/components/pro/reservations/ReservationTemplatesManagerDialog";
import { NoShowCommentDialog } from "@/components/pro/reservations/NoShowCommentDialog";
import { ProReservationDetailsDialog, type WaitlistInsight } from "@/components/pro/reservations/ProReservationDetailsDialog";
import { ReservationCalendar } from "@/components/pro/reservations/ReservationCalendar";
import { ReservationStatsDashboard } from "@/components/pro/reservations/ReservationStatsDashboard";
import {
  clampRiskScore,
  getClientRiskScore,
  getComputedReservationKind,
  getGuestInfo,
  getNoShowCount,
  getPaymentBadge,
  getRiskBadge,
  getRiskLevel,
  getStatusBadges,
  getSuggestedSlots,
  hasProposedChange,
  isGuaranteedReservation,
  isPastGracePeriod,
  isReservationInPast,
} from "@/components/pro/reservations/reservationHelpers";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type DecisionState = { mode: ReservationDecisionMode; reservation: Reservation } | null;

type MessageDialogState =
  | {
      kind: "request_guarantee";
      reservation: Reservation;
    }
  | {
      kind: "refuse_modification";
      reservation: Reservation;
    }
  | {
      kind: "propose_other_slot";
      reservation: Reservation;
    }
  | {
      kind: "cancel_reservation";
      reservation: Reservation;
    }
  | null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function canManageReservations(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "reception";
}

function todayYmd(): string {
  return formatLocalYmd(new Date());
}

async function copyToClipboard(text: string) {
  const value = String(text ?? "").trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast({ title: "Copié", description: value });
  } catch {
    toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
  }
}

function getLastProMessage(r: Reservation): { body: string; at: string | null; template_code: string | null } | null {
  const meta = r.meta;
  if (!isRecord(meta)) return null;

  const last = meta.last_pro_message;
  if (!isRecord(last)) return null;

  const body = typeof last.body === "string" ? last.body : "";
  if (!body.trim()) return null;

  return {
    body,
    at: typeof last.at === "string" ? last.at : null,
    template_code: typeof last.template_code === "string" ? last.template_code : null,
  };
}

function canDecideReservation(r: Reservation): boolean {
  const kind = getComputedReservationKind(r);
  return kind === "pending_pro" || kind === "waitlist";
}

function isFinalStatus(r: Reservation): boolean {
  return (
    r.status === "cancelled" ||
    r.status === "cancelled_user" ||
    r.status === "cancelled_pro" ||
    r.status === "noshow" ||
    r.status === "refused"
  );
}

function mergeBuiltInTemplates(templates: ReservationMessageTemplate[]): ReservationMessageTemplate[] {
  const builtins: ReservationMessageTemplate[] = [
    {
      id: "builtin:full",
      owner_type: "global",
      owner_id: null,
      code: "full",
      label: "Nous sommes complets à cette heure.",
      body: "Nous sommes complets à cette heure.",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
    {
      id: "builtin:alt_slot",
      owner_type: "global",
      owner_id: null,
      code: "alt_slot",
      label: "Créneau indisponible, voici une autre proposition.",
      body: "Créneau indisponible, voici une autre proposition :",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
    {
      id: "builtin:guarantee_required",
      owner_type: "global",
      owner_id: null,
      code: "guarantee_required",
      label: "Merci de confirmer par paiement de garantie.",
      body: "Merci de confirmer par paiement de garantie afin de valider ce créneau.",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
    {
      id: "builtin:privatized",
      owner_type: "global",
      owner_id: null,
      code: "privatized",
      label: "Privatisation exceptionnelle du lieu.",
      body: "Privatisation exceptionnelle du lieu sur ce créneau.",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
    {
      id: "builtin:waitlist",
      owner_type: "global",
      owner_id: null,
      code: "waitlist",
      label: "Merci, votre demande passe en liste d’attente.",
      body: "Merci, votre demande passe en liste d’attente. Nous vous recontactons dès qu’une place se libère.",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
    {
      id: "builtin:cancel_apology",
      owner_type: "global",
      owner_id: null,
      code: "cancel_apology",
      label: "Annulation (message d’excuse)",
      body: "Nous sommes désolés, nous devons annuler votre réservation. Merci pour votre compréhension.",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
    {
      id: "builtin:cancel_refund_apology",
      owner_type: "global",
      owner_id: null,
      code: "cancel_refund_apology",
      label: "Annulation + remboursement (excuse)",
      body: "Nous sommes désolés, nous devons annuler votre réservation. Votre paiement sera remboursé. Merci pour votre compréhension.",
      is_active: true,
      created_at: null,
      updated_at: null,
    },
  ];

  const existing = new Set((templates ?? []).map((t) => t.code));
  const merged = [...(templates ?? [])];

  for (const t of builtins) {
    if (!existing.has(t.code)) merged.push(t);
  }

  return merged;
}

export function ProReservationsTab({ establishment, role }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusReservationId = searchParams.get("rid");

  const [items, setItems] = useState<Reservation[]>([]);
  const [slots, setSlots] = useState<ProSlot[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<ReservationMessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [selectedDay, setSelectedDay] = useState<string>(() => todayYmd());
  const [showAll, setShowAll] = useState(true);
  const [workflowFilter, setWorkflowFilter] = useState<"all" | "modif" | "proposition">("all");
  const [timeFilter, setTimeFilter] = useState<"current" | "expired" | "all">("current");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  type SortColumn = "date" | "reference" | "client" | "party_size" | "status" | "payment" | "risk";
  type SortDirection = "asc" | "desc";
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Platform mode for conditional features
  const { isCommercialMode } = usePlatformSettings();
  const showPaymentFeatures = isCommercialMode();

  // View mode (list, calendar, or stats)
  type ViewMode = "list" | "calendar" | "stats";
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const [decision, setDecision] = useState<DecisionState>(null);
  const [riskGuardRes, setRiskGuardRes] = useState<Reservation | null>(null);
  const [riskGuardLoading, setRiskGuardLoading] = useState(false);
  const [messageDialog, setMessageDialog] = useState<MessageDialogState>(null);
  const [noShowReservation, setNoShowReservation] = useState<Reservation | null>(null);

  const [templatesManagerOpen, setTemplatesManagerOpen] = useState(false);

  const [detailsReservationId, setDetailsReservationId] = useState<string | null>(null);

  const mergedTemplates = useMemo(() => mergeBuiltInTemplates(templates), [templates]);

  useEffect(() => {
    if (!focusReservationId) return;
    if (typeof document === "undefined") return;

    const escapeId = (value: string) => {
      try {
        const css = (globalThis as any).CSS as { escape?: (v: string) => string } | undefined;
        if (css?.escape) return css.escape(value);
      } catch {
        // ignore
      }
      return value.replace(/"/g, "\\\"");
    };

    const t = window.setTimeout(() => {
      const selector = `[data-reservation-id="${escapeId(focusReservationId)}"]`;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-white", "rounded-md");

      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-white", "rounded-md");
      }, 2500);

      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete("rid");
        return p;
      });
    }, 100);

    return () => window.clearTimeout(t);
  }, [focusReservationId, setSearchParams]);

  const loadReservations = async (): Promise<Reservation[]> => {
    setLoading(true);
    setError(null);

    try {
      const res = await listProReservations(establishment.id);
      const next = (res.reservations ?? []) as Reservation[];
      setItems(next);
      setLoading(false);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setItems([]);
      setLoading(false);
      return [];
    }
  };

  const loadOffers = async () => {
    try {
      const res = await listProOffers(establishment.id);
      setSlots((res.slots ?? []) as ProSlot[]);
    } catch (e) {
      setError((prev) => prev ?? (e instanceof Error ? e.message : "Erreur"));
      setSlots([]);
    }
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await listProReservationMessageTemplates(establishment.id);
      setTemplates((res.templates ?? []) as ReservationMessageTemplate[]);
    } catch (e) {
      setError((prev) => prev ?? (e instanceof Error ? e.message : "Erreur"));
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const ensureDemoExamples = async (existing: Reservation[]) => {
    if (!isDemoModeEnabled()) return;

    const seededKey = `sam:pro:demo-seeded:${establishment.id}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(seededKey)) return;

    const demoEmail = getDemoProEmail();
    if (!demoEmail) return;

    const { data: sessionData } = await getProSession();
    const email = (sessionData.session?.user?.email ?? "").toLowerCase();
    if (email !== demoEmail) return;

    if (existing.length) {
      window.localStorage.setItem(seededKey, "1");
      return;
    }

    await seedFakeReservations({ establishmentId: establishment.id, countPerStatus: 2 });
    window.localStorage.setItem(seededKey, "1");
    await loadReservations();
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const existing = await loadReservations();
      await Promise.all([loadOffers(), loadTemplates()]);
      if (cancelled) return;
      await ensureDemoExamples(existing);
    })();

    return () => {
      cancelled = true;
    };
  }, [establishment.id]);

  const stats = useMemo(() => {
    const confirmed = items.filter((r) => getComputedReservationKind(r).startsWith("confirmed")).length;
    const pending = items.filter((r) => getComputedReservationKind(r) === "pending_pro").length;
    const waitlist = items.filter((r) => getComputedReservationKind(r) === "waitlist").length;
    const modifications = items.filter((r) => getComputedReservationKind(r) === "modification_pending").length;
    const cancelled = items.filter((r) => getComputedReservationKind(r) === "cancelled").length;

    return { confirmed, pending, waitlist, modifications, cancelled };
  }, [items]);

  const dayItems = useMemo(() => {
    const day = selectedDay.trim();
    if (!day) return [];
    return items.filter((r) => isSameLocalDay(r.starts_at, day));
  }, [items, selectedDay]);

  const visibleReservations = useMemo(() => {
    const base = showAll ? items : dayItems;

    let out = base;
    if (workflowFilter === "modif") out = out.filter((r) => getComputedReservationKind(r) === "modification_pending");
    if (workflowFilter === "proposition") out = out.filter((r) => hasProposedChange(r));

    const nowMs = Date.now();
    if (timeFilter === "current") out = out.filter((r) => !isReservationInPast(r, nowMs));
    if (timeFilter === "expired") out = out.filter((r) => isReservationInPast(r, nowMs));

    // Full-text search filter (name, phone, email, reference)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      out = out.filter((r) => {
        const guest = getGuestInfo(r);
        const searchableFields = [
          guest.displayName,
          guest.phone,
          guest.email,
          r.booking_reference,
        ].filter(Boolean).map((s) => (s ?? "").toLowerCase());

        return searchableFields.some((field) => field.includes(query));
      });
    }

    // Sort
    const sortMultiplier = sortDirection === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      switch (sortColumn) {
        case "date": {
          const timeA = new Date(a.starts_at).getTime();
          const timeB = new Date(b.starts_at).getTime();
          return (timeA - timeB) * sortMultiplier;
        }
        case "reference": {
          const refA = (a.booking_reference ?? "").toLowerCase();
          const refB = (b.booking_reference ?? "").toLowerCase();
          return refA.localeCompare(refB) * sortMultiplier;
        }
        case "client": {
          const guestA = getGuestInfo(a).displayName.toLowerCase();
          const guestB = getGuestInfo(b).displayName.toLowerCase();
          return guestA.localeCompare(guestB) * sortMultiplier;
        }
        case "party_size": {
          const sizeA = a.party_size ?? 0;
          const sizeB = b.party_size ?? 0;
          return (sizeA - sizeB) * sortMultiplier;
        }
        case "status": {
          const statusOrder: Record<string, number> = {
            requested: 0,
            pending_pro_validation: 1,
            waitlist: 2,
            confirmed: 3,
            cancelled: 4,
            cancelled_user: 5,
            cancelled_pro: 6,
            refused: 7,
            noshow: 8,
          };
          const orderA = statusOrder[a.status] ?? 99;
          const orderB = statusOrder[b.status] ?? 99;
          return (orderA - orderB) * sortMultiplier;
        }
        case "payment": {
          const paymentOrder: Record<string, number> = {
            paid: 0,
            partial: 1,
            pending: 2,
            refunded: 3,
            failed: 4,
          };
          const orderA = paymentOrder[a.payment_status ?? "pending"] ?? 99;
          const orderB = paymentOrder[b.payment_status ?? "pending"] ?? 99;
          return (orderA - orderB) * sortMultiplier;
        }
        case "risk": {
          const scoreA = getClientRiskScore(a);
          const scoreB = getClientRiskScore(b);
          return (scoreA - scoreB) * sortMultiplier;
        }
        default:
          return 0;
      }
    });

    return out;
  }, [dayItems, items, showAll, timeFilter, workflowFilter, searchQuery, sortColumn, sortDirection]);

  // Pagination
  const totalItems = visibleReservations.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedReservations = useMemo(() => {
    return visibleReservations.slice(startIndex, endIndex);
  }, [visibleReservations, startIndex, endIndex]);

  // Toggle sort function
  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary" />
    );
  };

  // Bulk selection helpers
  const selectableReservations = paginatedReservations.filter((r) => canDecideReservation(r) && !isFinalStatus(r));
  const allSelectableSelected = selectableReservations.length > 0 && selectableReservations.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableReservations.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [visibleReservations]);

  // Bulk actions
  const selectedReservations = items.filter((r) => selectedIds.has(r.id));

  const bulkConfirm = async () => {
    if (!canManageReservations(role)) return;
    setBulkActionLoading(true);
    setError(null);
    try {
      for (const r of selectedReservations) {
        if (canDecideReservation(r)) {
          await updateProReservation({
            establishmentId: establishment.id,
            reservationId: r.id,
            patch: { status: "confirmed" },
          });
        }
      }
      await loadReservations();
      setSelectedIds(new Set());
      toast({ title: "Confirmées", description: `${selectedReservations.length} réservation(s) confirmée(s).` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const bulkWaitlist = async () => {
    if (!canManageReservations(role)) return;
    setBulkActionLoading(true);
    setError(null);
    try {
      for (const r of selectedReservations) {
        if (canDecideReservation(r)) {
          await updateProReservation({
            establishmentId: establishment.id,
            reservationId: r.id,
            patch: { status: "waitlist" },
          });
        }
      }
      await loadReservations();
      setSelectedIds(new Set());
      toast({ title: "En liste d'attente", description: `${selectedReservations.length} réservation(s) mise(s) en liste d'attente.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const bulkCancel = async () => {
    if (!canManageReservations(role)) return;
    setBulkActionLoading(true);
    setError(null);
    try {
      for (const r of selectedReservations) {
        if (!isFinalStatus(r)) {
          await updateProReservation({
            establishmentId: establishment.id,
            reservationId: r.id,
            patch: { status: "cancelled_pro" },
          });
        }
      }
      await loadReservations();
      setSelectedIds(new Set());
      toast({ title: "Annulées", description: `${selectedReservations.length} réservation(s) annulée(s).` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [showAll, workflowFilter, timeFilter, searchQuery, selectedDay]);

  const emptyText = (() => {
    if (timeFilter === "expired") return "Aucune réservation expirée.";
    if (timeFilter === "current") return showAll ? "Aucune réservation actuelle." : "Aucune réservation actuelle pour cette journée.";
    return showAll ? "Aucune réservation." : "Aucune réservation pour cette journée.";
  })();

  const exportDayCsv = () => {
    const day = selectedDay.trim();
    if (!day) return;
    if (!dayItems.length) {
      setError("Aucune réservation pour cette journée");
      return;
    }
    setError(null);
    downloadReservationsCsv({ reservations: dayItems, dayYmd: day, establishmentName: establishment.name });
  };

  const exportDayPdf = () => {
    const day = selectedDay.trim();
    if (!day) return;
    if (!dayItems.length) {
      setError("Aucune réservation pour cette journée");
      return;
    }
    setError(null);
    downloadReservationsPdf({ reservations: dayItems, dayYmd: day, establishmentName: establishment.name });
  };

  const updateReservation = async (id: string, patch: ProReservationPatch) => {
    if (!canManageReservations(role)) return;

    setSavingId(id);
    setError(null);
    try {
      await updateProReservation({ establishmentId: establishment.id, reservationId: id, patch });
      await loadReservations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  };

  const acceptReservation = async (r: Reservation) => {
    const score = getClientRiskScore(r);
    const guaranteed = isGuaranteedReservation(r);

    if (!guaranteed && score < 65) {
      setRiskGuardRes(r);
      return;
    }

    const patch: ProReservationPatch = {
      status: "confirmed",
    };

    if (r.status === "waitlist") {
      patch.is_from_waitlist = true;
      patch.refusal_reason_code = null;
      patch.refusal_reason_custom = null;
    }

    await updateReservation(r.id, patch);
  };

  const requestGuarantee = async (r: Reservation, args?: { silent?: boolean }) => {
    const silent = args?.silent === true;

    const defaultMessage =
      "En raison d’un historique de réservations non honorées, une garantie est nécessaire pour confirmer le créneau. Merci pour votre compréhension.";

    const patch: ProReservationPatch = {
      template_code: "guarantee_required",
      pro_message: defaultMessage,
      meta_patch: {
        guarantee_required: true,
      },
    };

    // If still pending, keep it pending (don’t auto-confirm)
    if (r.status === "requested" || r.status === "pending_pro_validation") {
      patch.status = "pending_pro_validation";
    }

    await updateReservation(r.id, patch);

    if (!silent) toast({ title: "Demande envoyée", description: "Une demande de garantie a été envoyée au client." });
  };

  const cancelReservation = async (r: Reservation) => {
    await updateReservation(r.id, { status: "cancelled_pro" });
  };

  const markPresent = async (r: Reservation) => {
    const nowIso = new Date().toISOString();
    await updateReservation(r.id, { checked_in_at: nowIso, meta_patch: { present_at: nowIso } });
  };

  const markNoShow = async (r: Reservation, args?: { comment?: string | null }) => {
    const score = getClientRiskScore(r);
    const noShows = getNoShowCount(r);
    const paid = r.payment_status === "paid";

    const comment = (args?.comment ?? null) && String(args?.comment ?? "").trim() ? String(args?.comment ?? "").trim() : null;
    const nowIso = new Date().toISOString();

    const patch: ProReservationPatch = {
      status: "noshow",
      meta_patch: {
        no_show_count: noShows + 1,
        noshow_marked_at: nowIso,
        ...(comment ? { noshow_comment: comment } : {}),
      },
    };

    if (!paid) {
      patch.meta_patch = {
        ...(patch.meta_patch ?? {}),
        client_risk_score: clampRiskScore(score - 15),
        guarantee_required: true,
      };
    }

    await updateReservation(r.id, patch);
  };

  const validateModification = async (r: Reservation) => {
    const meta = r.meta;
    if (!isRecord(meta) || !isRecord(meta.requested_change)) {
      toast({ title: "Aucune modification", description: "Le client n’a pas fourni de modification exploitable." });
      return;
    }

    const reqChange = meta.requested_change as Record<string, unknown>;
    const startsAt = typeof reqChange.starts_at === "string" ? reqChange.starts_at : null;
    const partySize = typeof reqChange.party_size === "number" ? reqChange.party_size : null;

    const patch: ProReservationPatch = {
      meta_delete_keys: ["requested_change", "modification_requested"],
    };

    if (startsAt) patch.starts_at = startsAt;
    if (partySize != null && Number.isFinite(partySize)) patch.party_size = Math.max(1, Math.round(partySize));

    await updateReservation(r.id, patch);
  };

  const openDecision = (mode: ReservationDecisionMode, r: Reservation) => {
    setDecision({ mode, reservation: r });
  };

  const openGuaranteeDialog = (r: Reservation) => {
    setMessageDialog({ kind: "request_guarantee", reservation: r });
  };

  const openProposeOtherSlotDialog = (r: Reservation) => {
    setMessageDialog({ kind: "propose_other_slot", reservation: r });
  };

  const openRefuseModificationDialog = (r: Reservation) => {
    setMessageDialog({ kind: "refuse_modification", reservation: r });
  };

  const openCancelDialog = (r: Reservation) => {
    setMessageDialog({ kind: "cancel_reservation", reservation: r });
  };

  const currentSuggestedSlots = useMemo(() => {
    if (!decision?.reservation) return [];
    return getSuggestedSlots({ reservation: decision.reservation, slots, max: 4 });
  }, [decision?.reservation?.id, slots]);

  const actionDisabled = (r: Reservation) => savingId === r.id || !canManageReservations(role);

  const slotsById = useMemo(() => {
    const map: Record<string, ProSlot> = {};
    for (const s of slots) map[s.id] = s;
    return map;
  }, [slots]);

  const waitlistBySlotId = useMemo(() => {
    const map: Record<string, Reservation[]> = {};

    for (const r of items) {
      if (r.status !== "waitlist") continue;
      if (!r.slot_id) continue;
      if (!map[r.slot_id]) map[r.slot_id] = [];
      map[r.slot_id].push(r);
    }

    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
        return ta - tb;
      });
    }

    return map;
  }, [items]);

  const getWaitlistInsight = (r: Reservation): WaitlistInsight | null => {
    if (!r.slot_id) return null;
    const group = waitlistBySlotId[r.slot_id] ?? [];
    if (!group.length) return null;

    const idx = group.findIndex((x) => x.id === r.id);
    return {
      count: group.length,
      position: idx >= 0 ? idx + 1 : null,
    };
  };

  const detailsReservation = useMemo(() => {
    if (!detailsReservationId) return null;
    return items.find((x) => x.id === detailsReservationId) ?? null;
  }, [detailsReservationId, items]);

  const detailsSlot = useMemo(() => {
    if (!detailsReservation?.slot_id) return null;
    return slotsById[detailsReservation.slot_id] ?? null;
  }, [detailsReservation?.slot_id, slotsById]);

  const openDetails = (r: Reservation) => {
    setDetailsReservationId(r.id);
  };

  return (
    <div className="space-y-6">
      <ProReservationDetailsDialog
        open={!!detailsReservationId}
        onOpenChange={(open) => {
          if (!open) setDetailsReservationId(null);
        }}
        reservation={detailsReservation}
        slot={detailsSlot}
        waitlist={detailsReservation ? getWaitlistInsight(detailsReservation) : null}
        establishmentId={establishment.id}
      />

      <ReservationDecisionDialog
        open={!!decision}
        onOpenChange={(open) => setDecision(open ? decision : null)}
        mode={decision?.mode ?? "refuse"}
        reservation={decision?.reservation ?? null}
        templates={mergedTemplates}
        suggestedSlots={currentSuggestedSlots}
        loading={templatesLoading}
        onConfirm={async (patch) => {
          if (!decision?.reservation) return;
          await updateReservation(decision.reservation.id, patch);
        }}
      />

      <ClientRiskGuardDialog
        open={!!riskGuardRes}
        onOpenChange={(open) => setRiskGuardRes(open ? riskGuardRes : null)}
        score={riskGuardRes ? getClientRiskScore(riskGuardRes) : 0}
        loading={riskGuardLoading}
        onRequestGuarantee={async () => {
          if (!riskGuardRes) return;
          setRiskGuardLoading(true);
          try {
            await requestGuarantee(riskGuardRes, { silent: true });
            setRiskGuardRes(null);
          } finally {
            setRiskGuardLoading(false);
          }
        }}
      />

      <ReservationMessageDialog
        open={!!messageDialog}
        onOpenChange={(open) => setMessageDialog(open ? messageDialog : null)}
        title={
          messageDialog?.kind === "request_guarantee"
            ? "Demander une garantie"
            : messageDialog?.kind === "propose_other_slot"
              ? "Proposer une autre heure"
              : messageDialog?.kind === "cancel_reservation"
                ? "Annuler la réservation"
                : "Refuser la modification"
        }
        description={
          messageDialog?.kind === "request_guarantee"
            ? "Envoyer un message au client pour demander un paiement de garantie."
            : messageDialog?.kind === "propose_other_slot"
              ? "Envoyer une proposition d’horaire alternatif au client."
              : messageDialog?.kind === "cancel_reservation"
                ? messageDialog?.reservation?.payment_status === "paid"
                  ? "La réservation sera annulée et marquée comme remboursée. Ajoutez un message d’excuse au client."
                  : "La réservation sera annulée. Ajoutez un message d’excuse au client."
                : "Envoyer un message au client et annuler la demande de modification."
        }
        templates={mergedTemplates}
        defaultTemplateCode={
          messageDialog?.kind === "request_guarantee"
            ? "guarantee_required"
            : messageDialog?.kind === "propose_other_slot"
              ? "alt_slot"
              : messageDialog?.kind === "cancel_reservation"
                ? messageDialog?.reservation?.payment_status === "paid"
                  ? "cancel_refund_apology"
                  : "cancel_apology"
                : "alt_slot"
        }
        loading={templatesLoading}
        onConfirm={async (patch) => {
          if (!messageDialog?.reservation) return;
          const r = messageDialog.reservation;

          if (messageDialog.kind === "request_guarantee") {
            await updateReservation(r.id, {
              ...patch,
              meta_patch: {
                guarantee_required: true,
              },
            });
            return;
          }

          if (messageDialog.kind === "refuse_modification") {
            await updateReservation(r.id, {
              ...patch,
              meta_delete_keys: ["requested_change", "modification_requested"],
            });
            return;
          }

          if (messageDialog.kind === "propose_other_slot") {
            await updateReservation(r.id, {
              ...patch,
              meta_patch: {
                proposed_change: { sent_at: new Date().toISOString() },
              },
            });
          }

          if (messageDialog.kind === "cancel_reservation") {
            await updateReservation(r.id, {
              ...patch,
              status: "cancelled_pro",
              ...(r.payment_status === "paid" ? { payment_status: "refunded" } : {}),
            });
          }
        }}
      />

      <NoShowCommentDialog
        open={!!noShowReservation}
        onOpenChange={(open) => setNoShowReservation(open ? noShowReservation : null)}
        title="Déclarer un no-show"
        description={
          noShowReservation && isPastGracePeriod(noShowReservation)
            ? "La réservation est dépassée de plus de 3 heures. Vous pouvez ajouter un commentaire (optionnel)."
            : "Déclarer le client en no-show. Vous pouvez ajouter un commentaire (optionnel)."
        }
        onConfirm={async ({ comment }) => {
          if (!noShowReservation) return;
          await markNoShow(noShowReservation, { comment });
        }}
      />

      <ReservationTemplatesManagerDialog
        open={templatesManagerOpen}
        onOpenChange={setTemplatesManagerOpen}
        templates={mergedTemplates}
        onCreate={async (data) => {
          await createProReservationMessageTemplate({
            establishmentId: establishment.id,
            code: data.code,
            label: data.label,
            body: data.body,
            is_active: data.is_active,
          });
          await loadTemplates();
        }}
        onUpdate={async ({ templateId, patch }) => {
          await updateProReservationMessageTemplate({ establishmentId: establishment.id, templateId, patch });
          await loadTemplates();
        }}
      />

      {/* Stats Cards - Modern Design */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-emerald-700">Confirmées</span>
          </div>
          <div className="text-3xl font-bold text-emerald-900 tabular-nums">{stats.confirmed}</div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-amber-700 whitespace-nowrap">En attente</span>
          </div>
          <div className="text-3xl font-bold text-amber-900 tabular-nums">{stats.pending}</div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-blue-700">Liste d'attente</span>
          </div>
          <div className="text-3xl font-bold text-blue-900 tabular-nums">{stats.waitlist}</div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-purple-100/50 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Edit3 className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-purple-700">Modifications</span>
          </div>
          <div className="text-3xl font-bold text-purple-900 tabular-nums">{stats.modifications}</div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-red-50 to-red-100/50 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-sm font-medium text-red-700">Annulées</span>
          </div>
          <div className="text-3xl font-bold text-red-900 tabular-nums">{stats.cancelled}</div>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                Réservations
                {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Gérez vos réservations : validation, messages, no-shows, liste d'attente
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* View mode toggle */}
              <div className="flex rounded-md border border-slate-200 overflow-hidden">
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  className="gap-1 rounded-none border-0 px-2"
                  onClick={() => setViewMode("list")}
                >
                  <LayoutList className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">Liste</span>
                </Button>
                <Button
                  variant={viewMode === "calendar" ? "default" : "ghost"}
                  size="sm"
                  className="gap-1 rounded-none border-0 px-2"
                  onClick={() => setViewMode("calendar")}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">Calendrier</span>
                </Button>
                <Button
                  variant={viewMode === "stats" ? "default" : "ghost"}
                  size="sm"
                  className="gap-1 rounded-none border-0 px-2"
                  onClick={() => setViewMode("stats")}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">Stats</span>
                </Button>
              </div>

              <Button variant="outline" size="sm" className="gap-1 px-2" onClick={() => setTemplatesManagerOpen(true)}>
                <Settings2 className="w-4 h-4" />
                <span className="hidden lg:inline text-xs">Messages</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-1 px-2" onClick={exportDayCsv} disabled={!selectedDay.trim()}>
                <Download className="w-4 h-4" />
                <span className="text-xs">CSV</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-1 px-2" onClick={exportDayPdf} disabled={!selectedDay.trim()}>
                <Download className="w-4 h-4" />
                <span className="text-xs">PDF</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Row - Compact Horizontal Layout */}
          <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-slate-50/80 border border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-600">Filtres</span>
            </div>

            <div className="flex flex-wrap items-end gap-3 flex-1">
              {/* Search Field */}
              <div className="min-w-[200px] flex-1 max-w-[320px]">
                <Label className="text-xs text-slate-500 mb-1 block">Recherche</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Nom, téléphone, email, référence..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 text-sm pl-8"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Effacer la recherche"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs text-slate-500 mb-1 block">Date</Label>
                <Input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="min-w-[130px]">
                <Label className="text-xs text-slate-500 mb-1 block">Workflow</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={workflowFilter}
                  onChange={(e) => setWorkflowFilter((e.target.value as "all" | "modif" | "proposition") ?? "all")}
                >
                  <option value="all">Tout</option>
                  <option value="modif">Modif en attente</option>
                  <option value="proposition">Proposition envoyée</option>
                </select>
              </div>

              <div className="min-w-[110px]">
                <Label className="text-xs text-slate-500 mb-1 block">Période</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={timeFilter}
                  onChange={(e) => setTimeFilter((e.target.value as "current" | "expired" | "all") ?? "current")}
                >
                  <option value="current">Actuelles</option>
                  <option value="expired">Expirées</option>
                  <option value="all">Toutes</option>
                </select>
              </div>

              <div className="flex items-center gap-2 h-9">
                <Checkbox
                  id="show-all-reservations"
                  checked={showAll}
                  onCheckedChange={(v) => setShowAll(v === true)}
                />
                <Label htmlFor="show-all-reservations" className="text-sm text-slate-600 cursor-pointer whitespace-nowrap">
                  Toutes les réservations
                </Label>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          {/* Bulk Actions Bar */}
          {someSelected && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelectableSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Sélectionner tout"
                />
                <span className="text-sm font-medium text-slate-700">
                  {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-4 w-px bg-slate-300" />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={bulkActionLoading || !canManageReservations(role)}
                  onClick={() => void bulkConfirm()}
                >
                  {bulkActionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Confirmer ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={bulkActionLoading || !canManageReservations(role)}
                  onClick={() => void bulkWaitlist()}
                >
                  <ListPlus className="w-3 h-3" />
                  Liste d'attente
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                  disabled={bulkActionLoading || !canManageReservations(role)}
                  onClick={() => void bulkCancel()}
                >
                  <XCircle className="w-3 h-3" />
                  Annuler
                </Button>
              </div>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Désélectionner
              </Button>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement…
            </div>
          ) : viewMode === "calendar" ? (
            <ReservationCalendar
              reservations={items}
              onDayClick={(date, dayReservations) => {
                // Set selectedDay and filter to that day
                const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                setSelectedDay(ymd);
                setShowAll(false);
                setViewMode("list");
              }}
            />
          ) : viewMode === "stats" ? (
            <ReservationStatsDashboard reservations={items} />
          ) : (
            <>
              <div className="md:hidden">
                {visibleReservations.length ? (
                  <Accordion type="single" collapsible className="w-full">
                    {paginatedReservations.map((r) => {
                      const when = new Date(r.starts_at);
                      const guest = getGuestInfo(r);
                      const badges = getStatusBadges(r);
                      const score = getClientRiskScore(r);
                      const riskBadge = getRiskBadge(score);
                      const lastMsg = getLastProMessage(r);
                      const kind = getComputedReservationKind(r);
                      const disabled = actionDisabled(r);
                      const graceLocked = isPastGracePeriod(r);
                      const manageDisabled = disabled || graceLocked;

                      const slot = r.slot_id ? slotsById[r.slot_id] ?? null : null;
                      const remaining = slot ? (slot as unknown as { remaining_capacity?: number | null }).remaining_capacity : null;
                      const waitlist = getWaitlistInsight(r);

                      const showPendingActions = canDecideReservation(r);
                      const showConfirmedActions = kind === "confirmed_guaranteed" || kind === "confirmed_not_guaranteed";
                      const showModificationActions = kind === "modification_pending";

                      const needsGuarantee = getRiskLevel(score) === "sensitive" && !isGuaranteedReservation(r);

                      return (
                        <AccordionItem key={r.id} value={r.id} data-reservation-id={r.id} className="border rounded-xl mb-3 overflow-hidden">
                          <AccordionTrigger className="px-4">
                            <div className="flex flex-1 items-start justify-between gap-3">
                              <div className="min-w-0 text-left">
                                <div className="font-semibold">
                                  {Number.isFinite(when.getTime()) ? formatLeJjMmAaAHeure(when) : r.starts_at}
                                </div>
                                <div className="text-xs text-slate-600 truncate">{guest.displayName}</div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {badges.slice(0, 2).map((b) => (
                                  <Badge key={b.label} className={`${b.cls} whitespace-nowrap`} title={b.title}>
                                    {b.label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-end">
                                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => openDetails(r)}>
                                  <Eye className="h-4 w-4" />
                                  Détails
                                </Button>
                              </div>

                              {waitlist?.count ? (
                                <div className="rounded-lg border bg-slate-50 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">WL {waitlist.count}</Badge>
                                    {waitlist.position ? (
                                      <div className="text-xs text-slate-600">Position {waitlist.position}/{waitlist.count}</div>
                                    ) : null}
                                    {typeof remaining === "number" ? (
                                      <div className="text-xs text-slate-600">Restant: {remaining}</div>
                                    ) : null}
                                  </div>
                                  <div className="mt-2 text-xs text-slate-600">Indication WL basée sur les demandes en statut “waitlist”.</div>
                                </div>
                              ) : null}

                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <div className="text-xs text-slate-500">Référence</div>
                                  <div className="flex items-center gap-2">
                                    <div className="font-mono text-xs whitespace-nowrap">{r.booking_reference ?? "—"}</div>
                                    {r.booking_reference ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => void copyToClipboard(r.booking_reference ?? "")}
                                        aria-label="Copier la référence"
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-slate-500">Quantité</div>
                                  <div className="font-semibold tabular-nums">{r.party_size ?? "—"}</div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {badges.map((b) => (
                                  <Badge key={b.label} className={`${b.cls} whitespace-nowrap`} title={b.title}>
                                    {b.label}
                                  </Badge>
                                ))}
                                {showPaymentFeatures && (() => {
                                  const payment = getPaymentBadge(r.payment_status ?? "pending");
                                  return <Badge className={`${payment.cls} whitespace-nowrap`}>{payment.label}</Badge>;
                                })()}
                                <Badge className={`${riskBadge.cls} whitespace-nowrap`}>{riskBadge.label}</Badge>
                                {needsGuarantee ? (
                                  <Badge className="bg-red-50 text-red-700 border-red-200 whitespace-nowrap">Garantie obligatoire</Badge>
                                ) : null}
                                {r.checked_in_at ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">Présent</Badge>
                                ) : null}
                                {r.is_from_waitlist ? (
                                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">Depuis liste d'attente</Badge>
                                ) : null}
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                <div className="text-xs text-slate-500">Client</div>
                                <div className="text-sm text-slate-800 font-semibold">{guest.displayName}</div>
                                {guest.phone ? <div className="text-xs text-slate-600">📞 {guest.phone}</div> : null}
                                {guest.comment ? (
                                  <div className="text-xs text-slate-600">💬 {guest.comment}</div>
                                ) : null}
                              </div>

                              {lastMsg ? (
                                <div className="rounded-lg border bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs text-slate-500">Dernier message</div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 gap-2"
                                      onClick={() => void copyToClipboard(lastMsg.body)}
                                    >
                                      <Copy className="h-4 w-4" />
                                      Copier
                                    </Button>
                                  </div>
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-4">{lastMsg.body}</div>
                                </div>
                              ) : null}

                              {showPendingActions ? (
                                <div className="grid grid-cols-1 gap-2">
                                  <Button
                                    className="gap-2 w-full justify-center bg-primary text-white hover:bg-primary/90 font-bold"
                                    disabled={manageDisabled || isFinalStatus(r)}
                                    onClick={() => void acceptReservation(r)}
                                  >
                                    <Check className="w-4 h-4" />
                                    Accepter réservation
                                  </Button>

                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={manageDisabled || isFinalStatus(r)}
                                      onClick={() => openDecision("waitlist", r)}
                                    >
                                      <ListPlus className="w-4 h-4" />
                                      Liste d’attente
                                    </Button>

                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={manageDisabled || isFinalStatus(r)}
                                      onClick={() => openDecision("refuse", r)}
                                    >
                                      <XCircle className="w-4 h-4" />
                                      Refuser réservation
                                    </Button>
                                  </div>
                                </div>
                              ) : null}

                              {showConfirmedActions ? (
                                <div className="grid grid-cols-1 gap-2">
                                  {kind === "confirmed_not_guaranteed" ? (
                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={manageDisabled || isFinalStatus(r)}
                                      onClick={() => openGuaranteeDialog(r)}
                                    >
                                      <ShieldAlert className="w-4 h-4" />
                                      Demander une garantie
                                    </Button>
                                  ) : null}

                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={manageDisabled || r.status !== "confirmed" || !!r.checked_in_at}
                                      onClick={() => void markPresent(r)}
                                    >
                                      <Check className="w-4 h-4" />
                                      Check-in
                                    </Button>

                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={disabled || r.status !== "confirmed" || !!r.checked_in_at}
                                      onClick={() => setNoShowReservation(r)}
                                    >
                                      <Clock className="w-4 h-4" />
                                      No-show
                                    </Button>
                                  </div>

                                  <Button
                                    variant="outline"
                                    className="gap-2 w-full justify-center"
                                    disabled={manageDisabled || isFinalStatus(r)}
                                    onClick={() => openCancelDialog(r)}
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Annuler
                                  </Button>
                                </div>
                              ) : null}

                              {showModificationActions ? (
                                <div className="grid grid-cols-1 gap-2">
                                  <Button
                                    className="gap-2 w-full justify-center bg-primary text-white hover:bg-primary/90 font-bold"
                                    disabled={manageDisabled}
                                    onClick={() => void validateModification(r)}
                                  >
                                    <Check className="w-4 h-4" />
                                    Appliquer modification
                                  </Button>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={manageDisabled}
                                      onClick={() => openProposeOtherSlotDialog(r)}
                                    >
                                      <MessageSquareText className="w-4 h-4" />
                                      Proposer autre heure
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="gap-2 w-full justify-center"
                                      disabled={manageDisabled}
                                      onClick={() => openRefuseModificationDialog(r)}
                                    >
                                      <XCircle className="w-4 h-4" />
                                      Refuser modification
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                ) : (
                  <div className="text-sm text-slate-600">{emptyText}</div>
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-[1370px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={allSelectableSelected && selectableReservations.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Sélectionner tout"
                          disabled={selectableReservations.length === 0}
                        />
                      </TableHead>
                      <TableHead
                        className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                        onClick={() => toggleSort("date")}
                      >
                        <div className="flex items-center gap-1.5">
                          Date / Heure
                          <SortIcon column="date" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                        onClick={() => toggleSort("reference")}
                      >
                        <div className="flex items-center gap-1.5">
                          Référence
                          <SortIcon column="reference" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                        onClick={() => toggleSort("client")}
                      >
                        <div className="flex items-center gap-1.5">
                          Client
                          <SortIcon column="client" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                        onClick={() => toggleSort("party_size")}
                      >
                        <div className="flex items-center gap-1.5">
                          Quantité
                          <SortIcon column="party_size" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                        onClick={() => toggleSort("status")}
                      >
                        <div className="flex items-center gap-1.5">
                          Statut réservation
                          <SortIcon column="status" />
                        </div>
                      </TableHead>
                      {showPaymentFeatures && (
                        <TableHead
                          className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                          onClick={() => toggleSort("payment")}
                        >
                          <div className="flex items-center gap-1.5">
                            Paiement
                            <SortIcon column="payment" />
                          </div>
                        </TableHead>
                      )}
                      <TableHead
                        className="whitespace-nowrap cursor-pointer hover:bg-slate-50 select-none"
                        onClick={() => toggleSort("risk")}
                      >
                        <div className="flex items-center gap-1.5">
                          Risque client
                          <SortIcon column="risk" />
                        </div>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">Dernier message</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedReservations.map((r) => {
                      const when = new Date(r.starts_at);
                      const guest = getGuestInfo(r);
                      const badges = getStatusBadges(r);
                      const score = getClientRiskScore(r);
                      const riskBadge = getRiskBadge(score);
                      const lastMsg = getLastProMessage(r);
                      const kind = getComputedReservationKind(r);
                      const disabled = actionDisabled(r);
                      const graceLocked = isPastGracePeriod(r);
                      const manageDisabled = disabled || graceLocked;

                      const showPendingActions = canDecideReservation(r);
                      const showConfirmedActions = kind === "confirmed_guaranteed" || kind === "confirmed_not_guaranteed";
                      const showModificationActions = kind === "modification_pending";

                      const needsGuarantee = getRiskLevel(score) === "sensitive" && !isGuaranteedReservation(r);

                      return (
                        <TableRow key={r.id} data-reservation-id={r.id} className={selectedIds.has(r.id) ? "bg-primary/5" : ""}>
                          <TableCell className="align-top">
                            {canDecideReservation(r) && !isFinalStatus(r) ? (
                              <Checkbox
                                checked={selectedIds.has(r.id)}
                                onCheckedChange={() => toggleSelect(r.id)}
                                aria-label={`Sélectionner ${r.booking_reference ?? r.id}`}
                              />
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top">
                            <div className="font-semibold">{formatDateJjMmAa(when)}</div>
                            <div className="text-xs text-slate-600 tabular-nums">{formatHeureHhHMM(when)}</div>
                          </TableCell>

                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2 justify-start">
                              <div className="font-mono text-xs">{r.booking_reference ?? "—"}</div>
                              {r.booking_reference ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => void copyToClipboard(r.booking_reference ?? "")}
                                  aria-label="Copier la référence"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="min-w-[220px]">
                            <div className="font-semibold text-sm">{guest.displayName}</div>
                            {guest.phone ? <div className="text-xs text-slate-600">{guest.phone}</div> : null}
                            {guest.comment ? <div className="text-xs text-slate-500 line-clamp-1" title={guest.comment}>{guest.comment}</div> : null}
                          </TableCell>

                          <TableCell className="tabular-nums whitespace-nowrap">{r.party_size ?? "—"}</TableCell>

                          <TableCell className="min-w-[240px] align-top">
                            <div className="flex flex-wrap gap-1">
                              {badges.map((b) => (
                                <Badge key={b.label} className={`${b.cls} whitespace-nowrap`} title={b.title}>
                                  {b.label}
                                </Badge>
                              ))}
                              {r.checked_in_at ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">Présent</Badge>
                              ) : null}
                              {r.is_from_waitlist ? (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">Depuis liste d'attente</Badge>
                              ) : null}
                              {needsGuarantee ? (
                                <Badge className="bg-red-50 text-red-700 border-red-200 whitespace-nowrap">Garantie obligatoire</Badge>
                              ) : null}
                            </div>
                          </TableCell>

                          {showPaymentFeatures && (
                            <TableCell className="whitespace-nowrap align-top">
                              {(() => {
                                const payment = getPaymentBadge(r.payment_status ?? "pending");
                                return <Badge className={`${payment.cls} whitespace-nowrap`}>{payment.label}</Badge>;
                              })()}
                            </TableCell>
                          )}

                          <TableCell className="whitespace-nowrap align-top">
                            <div className="flex items-center gap-2">
                              <Badge className={`${riskBadge.cls} whitespace-nowrap`}>{riskBadge.label}</Badge>
                              <div className="text-xs text-slate-500">
                                {getRiskLevel(score) === "reliable" ? "Fiable" : getRiskLevel(score) === "medium" ? "Moyen" : "Sensible"}
                              </div>
                            </div>
                            {getNoShowCount(r) ? (
                              <div className="text-xs text-slate-500">No-show: {getNoShowCount(r)}</div>
                            ) : null}
                          </TableCell>

                          <TableCell className="min-w-[260px]">
                            {lastMsg ? (
                              <div className="text-xs text-slate-700">
                                <div className="line-clamp-2 whitespace-pre-wrap">{lastMsg.body}</div>
                                <div className="pt-1 flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => void copyToClipboard(lastMsg.body)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <div className="text-[11px] text-slate-500">
                                    {lastMsg.template_code ? `Template: ${lastMsg.template_code}` : null}
                                    {lastMsg.at
                                      ? (lastMsg.template_code ? " • " : "") + formatLeJjMmAaAHeure(lastMsg.at)
                                      : null}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400">—</div>
                            )}
                          </TableCell>

                          <TableCell className="text-right whitespace-nowrap align-top">
                            <div className="grid grid-cols-2 gap-1.5 min-w-[200px]">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-xs px-2 py-1 h-7"
                                onClick={() => openDetails(r)}
                              >
                                Voir
                              </Button>
                              {showPendingActions ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled || isFinalStatus(r)}
                                    onClick={() => void acceptReservation(r)}
                                  >
                                    <Check className="w-3 h-3" />
                                    Accepter
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled || isFinalStatus(r)}
                                    onClick={() => openDecision("waitlist", r)}
                                  >
                                    <ListPlus className="w-3 h-3" />
                                    Attente
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled || isFinalStatus(r)}
                                    onClick={() => openDecision("refuse", r)}
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Refuser
                                  </Button>
                                </>
                              ) : null}

                              {showConfirmedActions ? (
                                <>
                                  {kind === "confirmed_not_guaranteed" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs px-2 py-1 h-7 gap-1"
                                      disabled={manageDisabled || isFinalStatus(r)}
                                      onClick={() => openGuaranteeDialog(r)}
                                    >
                                      <ShieldAlert className="w-3 h-3" />
                                      Garantie
                                    </Button>
                                  ) : null}

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled || r.status !== "confirmed" || !!r.checked_in_at}
                                    onClick={() => void markPresent(r)}
                                  >
                                    <Check className="w-3 h-3" />
                                    Check-in
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled || isFinalStatus(r)}
                                    onClick={() => openCancelDialog(r)}
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Annuler
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={disabled || r.status !== "confirmed" || !!r.checked_in_at}
                                    onClick={() => setNoShowReservation(r)}
                                  >
                                    <Clock className="w-3 h-3" />
                                    No-show
                                  </Button>
                                </>
                              ) : null}

                              {showModificationActions ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled}
                                    onClick={() => void validateModification(r)}
                                  >
                                    <Check className="w-3 h-3" />
                                    Valider
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled}
                                    onClick={() => openProposeOtherSlotDialog(r)}
                                  >
                                    <MessageSquareText className="w-3 h-3" />
                                    Proposer
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1 h-7 gap-1"
                                    disabled={manageDisabled}
                                    onClick={() => openRefuseModificationDialog(r)}
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Refuser
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {visibleReservations.length === 0 ? (
                  <div className="text-sm text-slate-600 pt-3">{emptyText}</div>
                ) : null}
              </div>

              {/* Pagination Controls */}
              {totalItems > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>Afficher</span>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span>par page</span>
                    <span className="text-slate-400">•</span>
                    <span>
                      {startIndex + 1}–{endIndex} sur {totalItems}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === currentPage ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>


      {templatesLoading ? (
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Chargement des messages rapides…
        </div>
      ) : null}
    </div>
  );
}
