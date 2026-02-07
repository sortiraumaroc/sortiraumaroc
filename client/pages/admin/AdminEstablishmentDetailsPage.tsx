import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  CalendarClock,
  Copy,
  CreditCard,
  ExternalLink,
  MessageSquare,
  Pencil,
  QrCode,
  RefreshCcw,
  Save,
  Store,
  Ticket,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { isPastByIso } from "@/lib/reservationStatus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstablishmentPendingProfileUpdatesPanel } from "@/components/admin/EstablishmentPendingProfileUpdatesPanel";

import { buildConsumedByPurchase, getPackPurchaseConsumption } from "@/lib/packConsumption";
import { AdminQrScanDetailsDialog } from "@/components/admin/establishment/AdminQrScanDetailsDialog";
import { AdminReservationDetailsDialog } from "@/components/admin/establishment/AdminReservationDetailsDialog";
import { AdminInventoryManager } from "@/components/admin/establishment/AdminInventoryManager";
import { AdminGalleryManager } from "@/components/admin/establishment/AdminGalleryManager";
import { AdminContactInfoCard } from "@/components/admin/establishment/AdminContactInfoCard";
import { AdminTagsServicesCard } from "@/components/admin/establishment/AdminTagsServicesCard";
import { AdminEstablishmentEditDialog } from "@/components/admin/establishment/AdminEstablishmentEditDialog";
import { AdminEstablishmentBankDetailsCard } from "@/components/admin/establishment/AdminEstablishmentBankDetailsCard";
import { AdminEstablishmentContractsCard } from "@/components/admin/establishment/AdminEstablishmentContractsCard";
import { AdminEstablishmentFinanceRulesCard } from "@/components/admin/establishment/AdminEstablishmentFinanceRulesCard";
import { AdminEstablishmentBookingPolicyCard } from "@/components/admin/establishment/AdminEstablishmentBookingPolicyCard";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  getEstablishment,
  listAdminEstablishmentConversations,
  listAdminEstablishmentConversationMessages,
  listAdminEstablishmentOffers,
  listAdminEstablishmentPackBilling,
  listAdminEstablishmentQrLogs,
  listAdminEstablishmentReservations,
  listProUsers,
  removeProFromEstablishment,
  updateAdminEstablishmentReservation,
  updateEstablishmentStatus,
  type ProConversationAdmin,
  type ProMessageAdmin,
  type ProUserAdmin,
  type QrScanLogAdmin,
  type ReservationAdmin,
} from "@/lib/adminApi";

type EstablishmentDetails = {
  id: string;
  name: string;
  city: string;
  status: string;
  universe: string;
  subcategory: string;
  createdAt: string;
  website: string;
  lat?: number;
  lng?: number;
};

type ReservationRow = {
  id: string;
  startsAt: string;
  startsAtIso: string;
  endsAtIso: string;
  bookingReference: string;
  status: string;
  paymentStatus: string;
  deposit: string;
  checkedInAt: string;
  checkedInAtIso: string | null;
  meta: unknown;
};

type ConversationRow = {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
  reservationId: string;
};

type MessageRow = {
  id: string;
  createdAt: string;
  fromRole: string;
  body: string;
};

type QrRow = {
  id: string;
  scannedAt: string;
  result: string;
  bookingReference: string;
  holderName: string;
};

type SlotRow = {
  startsAt: string;
  basePrice: string;
  status: string;
};

type PackRow = {
  title: string;
  price: string;
  active: string;
};

type PurchaseRow = {
  id: string;
  createdAt: string;
  packId: string;
  paymentStatus: string;
  status: string;
  quantity: number;
  consumed: number;
  remaining: number;
  fullyConsumed: boolean;
  amount: string;
};

type RedemptionRow = {
  redeemedAt: string;
  purchaseId: string;
  reservationId: string;
  count: string;
};

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | undefined {
  const v = (value ?? "").trim();
  if (!v) return undefined;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d.toISOString();
}

function formatMoneyCents(amountCents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents)) return "—";
  const unit = (currency ?? "").trim();
  const num = (amountCents / 100).toFixed(2);
  return unit ? `${num} ${unit}` : num;
}

function statusBadge(status: string): JSX.Element {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : s === "rejected" || s === "suspended"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-slate-50 text-slate-700 border-slate-200";
  return <Badge className={cls}>{status || "—"}</Badge>;
}

type ReservationStatus = "requested" | "confirmed" | "cancelled" | "noshow" | "unknown";

type PaymentStatus = "pending" | "paid" | "refunded" | "unknown";

function normalizeReservationStatus(value: string | null | undefined): ReservationStatus {
  const v = (value ?? "").toLowerCase();
  if (v === "requested" || v === "confirmed" || v === "cancelled" || v === "noshow") return v;
  return "unknown";
}

function normalizePaymentStatus(value: string | null | undefined): PaymentStatus {
  const v = (value ?? "").toLowerCase();
  if (v === "pending" || v === "paid" || v === "refunded") return v;
  return "unknown";
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

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

export function AdminEstablishmentDetailsPage() {
  const params = useParams();
  const establishmentId = String(params.id ?? "").trim();
  const { toast } = useToast();

  const [est, setEst] = useState<EstablishmentDetails | null>(null);
  const [statusDraft, setStatusDraft] = useState<string>("");

  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [reservationsById, setReservationsById] = useState<Record<string, ReservationAdmin>>({});
  const [offersSlots, setOffersSlots] = useState<SlotRow[]>([]);
  const [offersPacks, setOffersPacks] = useState<PackRow[]>([]);
  const [packPurchases, setPackPurchases] = useState<PurchaseRow[]>([]);
  const [packRedemptions, setPackRedemptions] = useState<RedemptionRow[]>([]);

  const [packPurchaseConsumptionFilter, setPackPurchaseConsumptionFilter] = useState<"not_consumed" | "fully_consumed" | "all">("not_consumed");
  const [qrLogs, setQrLogs] = useState<QrRow[]>([]);
  const [qrLogsById, setQrLogsById] = useState<Record<string, QrScanLogAdmin>>({});
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [linkedPros, setLinkedPros] = useState<Array<{ id: string; email: string }>>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservationStatusFilter, setReservationStatusFilter] = useState<string>("all");
  const [reservationPaymentFilter, setReservationPaymentFilter] = useState<string>("all");
  const [reservationWorkflowFilter, setReservationWorkflowFilter] = useState<string>("all");
  const [reservationTimeFilter, setReservationTimeFilter] = useState<"current" | "expired" | "all">("current");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [reservationStatus, setReservationStatus] = useState<ReservationStatus>("unknown");
  const [reservationPaymentStatus, setReservationPaymentStatus] = useState<PaymentStatus>("unknown");
  const [reservationStatusRaw, setReservationStatusRaw] = useState<string>("");
  const [reservationPaymentStatusRaw, setReservationPaymentStatusRaw] = useState<string>("");
  const [reservationCheckedInAt, setReservationCheckedInAt] = useState<string>("");
  const [reservationSaveError, setReservationSaveError] = useState<string | null>(null);

  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [reservationDetailsOpen, setReservationDetailsOpen] = useState(false);
  const [selectedReservationDetailsId, setSelectedReservationDetailsId] = useState<string | null>(null);

  const [qrDetailsOpen, setQrDetailsOpen] = useState(false);
  const [selectedQrDetailsId, setSelectedQrDetailsId] = useState<string | null>(null);

  // Edit establishment dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Remove Pro from establishment dialog
  const [removeProDialogOpen, setRemoveProDialogOpen] = useState(false);
  const [proToRemove, setProToRemove] = useState<{ id: string; email: string } | null>(null);
  const [removingPro, setRemovingPro] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!establishmentId || !selectedConversationId) return;

    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const res = await listAdminEstablishmentConversationMessages(undefined, {
        establishmentId,
        conversationId: selectedConversationId,
      });
      const mapped: MessageRow[] = (res.items ?? []).map((m: ProMessageAdmin) => ({
        id: m.id,
        createdAt: formatLocal(m.created_at),
        fromRole: String(m.from_role ?? "—"),
        body: String(m.body ?? ""),
      }));
      setMessages(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setMessagesError(e.message);
      else setMessagesError("Erreur inattendue");
    } finally {
      setMessagesLoading(false);
    }
  }, [establishmentId, selectedConversationId]);

  const refresh = useCallback(async () => {
    if (!establishmentId) return;

    setLoading(true);
    setError(null);

    try {
      const [estRes, resvRes, offersRes, billingRes, qrRes, convRes, proRes] = await Promise.all([
        getEstablishment(undefined, establishmentId),
        listAdminEstablishmentReservations(undefined, establishmentId),
        listAdminEstablishmentOffers(undefined, establishmentId),
        listAdminEstablishmentPackBilling(undefined, establishmentId),
        listAdminEstablishmentQrLogs(undefined, establishmentId),
        listAdminEstablishmentConversations(undefined, establishmentId),
        listProUsers(undefined),
      ]);

      const raw = estRes.item as any;
      const mapped: EstablishmentDetails = {
        id: String(raw?.id ?? establishmentId),
        name: String(raw?.name ?? raw?.title ?? raw?.id ?? ""),
        city: String(raw?.city ?? ""),
        status: String(raw?.status ?? ""),
        universe: String(raw?.universe ?? ""),
        subcategory: String(raw?.subcategory ?? ""),
        createdAt: String(raw?.created_at ?? ""),
        website: String(raw?.website ?? "").trim(),
        lat: typeof raw?.lat === "number" ? raw.lat : undefined,
        lng: typeof raw?.lng === "number" ? raw.lng : undefined,
      };
      setEst(mapped);
      setStatusDraft(mapped.status);

      const byId: Record<string, ReservationAdmin> = {};
      const mappedReservations: ReservationRow[] = (resvRes.items ?? []).map((r: ReservationAdmin) => {
        byId[r.id] = r;
        const startsAtIso = String(r.starts_at ?? "");
        const endsAtIso = String(r.ends_at ?? "");
        return {
          id: r.id,
          startsAt: formatLocal(startsAtIso),
          startsAtIso,
          endsAtIso,
          bookingReference: String(r.booking_reference ?? "—"),
          status: String(r.status ?? "—"),
          paymentStatus: String(r.payment_status ?? "—"),
          deposit: formatMoneyCents(r.amount_deposit, r.currency),
          checkedInAt: formatLocal(r.checked_in_at),
          checkedInAtIso: r.checked_in_at ?? null,
          meta: (r as { meta?: unknown }).meta,
        };
      });
      setReservations(mappedReservations);
      setReservationsById(byId);

      const slots: SlotRow[] = (offersRes.slots ?? []).map((s: any) => ({
        startsAt: formatLocal(s?.starts_at),
        basePrice: formatMoneyCents(typeof s?.base_price === "number" ? s.base_price : null, s?.currency ?? null),
        status: String(s?.status ?? "—"),
      }));
      setOffersSlots(slots);

      const packs: PackRow[] = (offersRes.packs ?? []).map((p: any) => ({
        title: String(p?.title ?? p?.name ?? p?.id ?? "—"),
        price: formatMoneyCents(typeof p?.price === "number" ? p.price : null, p?.currency ?? null),
        active: typeof p?.active === "boolean" ? (p.active ? "Oui" : "Non") : "—",
      }));
      setOffersPacks(packs);

      const rawRedemptions = (billingRes.redemptions ?? []) as any[];
      const consumedByPurchase = buildConsumedByPurchase(rawRedemptions);

      const rawPurchases = (billingRes.purchases ?? []) as any[];
      const purchases: PurchaseRow[] = rawPurchases.map((p: any) => {
        const id = String(p?.id ?? "");
        const quantity = typeof p?.quantity === "number" && Number.isFinite(p.quantity) ? Math.max(0, Math.floor(p.quantity)) : 0;
        const { consumed, remaining, fullyConsumed } = id
          ? getPackPurchaseConsumption({ id, quantity }, consumedByPurchase)
          : { consumed: 0, remaining: quantity, fullyConsumed: false };

        const amountCents = typeof p?.total_price === "number" ? p.total_price : typeof p?.amount === "number" ? p.amount : null;
        const currency = p?.currency ?? null;

        return {
          id,
          createdAt: formatLocal(p?.created_at),
          packId: String(p?.pack_id ?? "—"),
          paymentStatus: String(p?.payment_status ?? "—"),
          status: String(p?.status ?? "—"),
          quantity,
          consumed,
          remaining,
          fullyConsumed,
          amount: formatMoneyCents(amountCents, currency),
        };
      });
      setPackPurchases(purchases);

      const redemptions: RedemptionRow[] = rawRedemptions.map((r: any) => ({
        redeemedAt: formatLocal(r?.redeemed_at),
        purchaseId: String(r?.purchase_id ?? "—"),
        reservationId: String(r?.reservation_id ?? "—"),
        count: typeof r?.count === "number" ? String(r.count) : "—",
      }));
      setPackRedemptions(redemptions);

      const qrById: Record<string, QrScanLogAdmin> = {};
      const qr: QrRow[] = (qrRes.items ?? []).map((q: QrScanLogAdmin) => {
        qrById[q.id] = q;
        return {
          id: q.id,
          scannedAt: formatLocal(q.scanned_at),
          result: String(q.result ?? "—"),
          bookingReference: String(q.booking_reference ?? "—"),
          holderName: String(q.holder_name ?? "—"),
        };
      });
      setQrLogs(qr);
      setQrLogsById(qrById);

      const mappedConversations: ConversationRow[] = (convRes.items ?? []).map((c: ProConversationAdmin) => ({
        id: c.id,
        subject: String(c.subject ?? "—"),
        status: String(c.status ?? "—"),
        updatedAt: formatLocal(c.updated_at),
        reservationId: String(c.reservation_id ?? "—"),
      }));
      setConversations(mappedConversations);

      const linked: Array<{ id: string; email: string }> = (proRes.items ?? [])
        .filter((p: ProUserAdmin) => {
          const ids = Array.isArray((p as any).establishment_ids)
            ? ((p as any).establishment_ids as unknown[]).filter((x) => typeof x === "string")
            : [];
          return ids.includes(establishmentId);
        })
        .map((p: ProUserAdmin) => ({
          id: String(p.id ?? ""),
          email: typeof p.email === "string" && p.email.trim() ? p.email.trim() : "—",
        }))
        .filter((x) => x.id);

      setLinkedPros(linked);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  const handleRemovePro = useCallback(async () => {
    if (!establishmentId || !proToRemove) return;
    setRemovingPro(true);
    try {
      await removeProFromEstablishment(undefined, establishmentId, proToRemove.id);
      toast({
        title: "Pro supprimé",
        description: `${proToRemove.email} a été détaché de l'établissement.`,
      });
      setRemoveProDialogOpen(false);
      setProToRemove(null);
      void refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof AdminApiError ? e.message : "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setRemovingPro(false);
    }
  }, [establishmentId, proToRemove, toast, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!conversationDialogOpen || !selectedConversationId) return;
    void fetchMessages();
  }, [conversationDialogOpen, selectedConversationId, fetchMessages]);

  const filteredReservations = useMemo(() => {
    const status = (reservationStatusFilter ?? "all").toLowerCase();
    const payment = (reservationPaymentFilter ?? "all").toLowerCase();
    const workflow = (reservationWorkflowFilter ?? "all").toLowerCase();

    const nowMs = Date.now();

    const isRecord = (value: unknown): value is Record<string, unknown> => {
      return !!value && typeof value === "object" && !Array.isArray(value);
    };

    const hasRequestedChange = (meta: unknown): boolean => {
      if (!isRecord(meta)) return false;
      return meta.modification_requested === true || isRecord(meta.requested_change);
    };

    const hasProposedChange = (meta: unknown): boolean => {
      if (!isRecord(meta)) return false;
      return isRecord(meta.proposed_change);
    };

    return reservations.filter((r) => {
      if (status !== "all" && (r.status ?? "").toLowerCase() !== status) return false;
      if (payment !== "all" && (r.paymentStatus ?? "").toLowerCase() !== payment) return false;

      if (workflow === "modif" && !hasRequestedChange(r.meta)) return false;
      if (workflow === "proposition" && !hasProposedChange(r.meta)) return false;

      const endIso = (r.endsAtIso || r.startsAtIso || "").trim();
      const isPast = isPastByIso(endIso, nowMs);
      if (reservationTimeFilter === "current" && isPast) return false;
      if (reservationTimeFilter === "expired" && !isPast) return false;

      return true;
    });
  }, [reservationPaymentFilter, reservationStatusFilter, reservationTimeFilter, reservationWorkflowFilter, reservations]);


  const publicUrl = useMemo(() => {
    if (!est?.id) return null;

    const id = encodeURIComponent(est.id);
    const u = String(est.universe ?? "")
      .trim()
      .toLowerCase();

    if (u === "restaurant" || u === "restaurants") return `/restaurant/${id}`;
    if (u === "hebergement" || u === "hebergements" || u === "hotel" || u === "hotels") return `/hotel/${id}`;
    if (u === "loisir" || u === "loisirs") return `/loisir/${id}`;
    if (u === "sport" || u === "sports" || u === "wellness" || u === "bien-etre" || u === "bien etre") return `/wellness/${id}`;
    if (u === "culture") return `/culture/${id}`;
    if (u === "shopping") return `/shopping/${id}`;

    return `/restaurant/${id}`;
  }, [est?.id, est?.universe]);

  const reservationColumns = useMemo<ColumnDef<ReservationRow>[]>(() => {
    function isRecord(value: unknown): value is Record<string, unknown> {
      return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function workflowSearchText(meta: unknown): string {
      if (!isRecord(meta)) return "";
      const hasRequest = meta.modification_requested === true || isRecord(meta.requested_change);
      const hasProposal = isRecord(meta.proposed_change);
      return [hasRequest ? "modification" : "", hasProposal ? "proposition" : ""].filter(Boolean).join(" ");
    }

    function workflowBadges(meta: unknown): Array<{ label: string; cls: string }> {
      if (!isRecord(meta)) return [];

      const hasRequest = meta.modification_requested === true || isRecord(meta.requested_change);
      const hasProposal = isRecord(meta.proposed_change);

      const items: Array<{ label: string; cls: string }> = [];
      if (hasRequest) items.push({ label: "Modif", cls: "bg-purple-50 text-purple-700 border-purple-200" });
      if (hasProposal) items.push({ label: "Proposition", cls: "bg-blue-50 text-blue-700 border-blue-200" });
      return items;
    }

    const statusLabels: Record<string, string> = {
      requested: "En attente",
      pending_pro_validation: "Validation pro",
      confirmed: "Confirmée",
      refused: "Refusée",
      waitlist: "Liste d'attente",
      cancelled: "Annulée",
      cancelled_user: "Annulée (client)",
      cancelled_pro: "Annulée (pro)",
      noshow: "No-show",
    };
    const paymentLabels: Record<string, string> = {
      pending: "En attente",
      paid: "Payé",
      refunded: "Remboursé",
      partially_refunded: "Part. remboursé",
      failed: "Échoué",
    };

    return [
      { accessorKey: "startsAt", header: "Date" },
      { accessorKey: "bookingReference", header: "Référence" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const s = String(row.original.status ?? "").toLowerCase();
          return statusLabels[s] ?? row.original.status;
        },
      },
      {
        id: "workflow",
        header: "Workflow",
        accessorFn: (row) => workflowSearchText(row.meta),
        cell: ({ row }) => {
          const badges = workflowBadges(row.original.meta);
          if (!badges.length) return <span className="text-xs text-slate-400">—</span>;

          return (
            <div className="flex flex-wrap gap-1">
              {badges.map((b) => (
                <Badge key={b.label} className={b.cls}>
                  {b.label}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "paymentStatus",
        header: "Paiement",
        cell: ({ row }) => {
          const s = String(row.original.paymentStatus ?? "").toLowerCase();
          return paymentLabels[s] ?? row.original.paymentStatus;
        },
      },
      { accessorKey: "deposit", header: "Acompte" },
      { accessorKey: "checkedInAt", header: "Check-in" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReservationId(row.original.id);
                setReservationStatusRaw(row.original.status);
                setReservationPaymentStatusRaw(row.original.paymentStatus);
                setReservationStatus(normalizeReservationStatus(row.original.status));
                setReservationPaymentStatus(normalizePaymentStatus(row.original.paymentStatus));
                setReservationCheckedInAt(toDatetimeLocalValue(row.original.checkedInAtIso));
                setReservationDialogOpen(true);
              }}
            >
              Modifier
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  const conversationColumns = useMemo<ColumnDef<ConversationRow>[]>(() => {
    return [
      { accessorKey: "updatedAt", header: "MAJ" },
      { accessorKey: "subject", header: "Sujet" },
      { accessorKey: "status", header: "Statut" },
      { accessorKey: "reservationId", header: "Réservation" },
    ];
  }, []);

  const qrColumns = useMemo<ColumnDef<QrRow>[]>(() => {
    return [
      { accessorKey: "scannedAt", header: "Date" },
      { accessorKey: "result", header: "Résultat" },
      { accessorKey: "bookingReference", header: "Référence" },
      { accessorKey: "holderName", header: "Porteur" },
    ];
  }, []);

  const slotsColumns = useMemo<ColumnDef<SlotRow>[]>(() => {
    return [
      { accessorKey: "startsAt", header: "Début" },
      { accessorKey: "basePrice", header: "Prix" },
      { accessorKey: "status", header: "Statut" },
    ];
  }, []);

  const packsColumns = useMemo<ColumnDef<PackRow>[]>(() => {
    return [
      { accessorKey: "title", header: "Pack" },
      { accessorKey: "price", header: "Prix" },
      { accessorKey: "active", header: "Actif" },
    ];
  }, []);

  const purchasesColumns = useMemo<ColumnDef<PurchaseRow>[]>(() => {
    const paymentLabels: Record<string, string> = {
      pending: "En attente",
      paid: "Payé",
      refunded: "Remboursé",
      failed: "Échoué",
    };
    const packStatusLabels: Record<string, string> = {
      active: "Actif",
      inactive: "Inactif",
      expired: "Expiré",
      consumed: "Consommé",
      partially_consumed: "Part. consommé",
    };
    return [
      { accessorKey: "createdAt", header: "Date" },
      { accessorKey: "packId", header: "Pack" },
      {
        accessorKey: "paymentStatus",
        header: "Paiement",
        cell: ({ row }) => {
          const s = String(row.original.paymentStatus ?? "").toLowerCase();
          return paymentLabels[s] ?? row.original.paymentStatus;
        },
      },
      { accessorKey: "quantity", header: "Acheté" },
      { accessorKey: "consumed", header: "Consommé" },
      { accessorKey: "remaining", header: "Restant" },
      { accessorKey: "amount", header: "Montant" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const s = String(row.original.status ?? "").toLowerCase();
          return packStatusLabels[s] ?? row.original.status;
        },
      },
    ];
  }, []);

  const redemptionsColumns = useMemo<ColumnDef<RedemptionRow>[]>(() => {
    return [
      { accessorKey: "redeemedAt", header: "Date" },
      { accessorKey: "purchaseId", header: "Achat" },
      { accessorKey: "reservationId", header: "Réservation" },
      { accessorKey: "count", header: "Nb" },
    ];
  }, []);

  const filteredPackPurchases = useMemo(() => {
    if (packPurchaseConsumptionFilter === "all") return packPurchases;
    if (packPurchaseConsumptionFilter === "fully_consumed") {
      return packPurchases.filter((p) => p.paymentStatus === "paid" && p.fullyConsumed);
    }
    return packPurchases.filter((p) => {
      if (p.paymentStatus !== "paid") return true;
      return p.remaining > 0;
    });
  }, [packPurchases, packPurchaseConsumptionFilter]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={est?.name || "Établissement"}
        description={est ? `ID: ${est.id}` : ""}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/establishments" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Link>
            </Button>

            {est ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void (async () => {
                    try {
                      await copyToClipboard(est.id);
                      toast({ title: "Copié", description: est.id });
                    } catch {
                      toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
                    }
                  })();
                }}
              >
                <Copy className="h-4 w-4" />
                Copier l’ID
              </Button>
            ) : null}

            {publicUrl ? (
              <Button variant="outline" asChild className="gap-2">
                <Link to={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Ouvrir la page publique
                </Link>
              </Button>
            ) : null}

            {est?.website ? (
              <Button variant="outline" asChild className="gap-2">
                <a href={est.website} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Site web
                </a>
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => void refresh()} disabled={loading || saving} className="gap-2">
              <RefreshCcw className={loading ? "animate-spin" : ""} />
              Rafraîchir
            </Button>
          </div>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {est ? (
        <div className="space-y-3">
          <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
              <div className="min-w-0 truncate">Fiche établissement</div>
              <div className="flex items-center gap-2">
                {statusBadge(est.status)}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Pencil className="h-3 w-3" />
                  Modifier
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500">Ville</div>
                <div className="font-medium text-slate-900">{est.city || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Univers</div>
                <div className="font-medium text-slate-900">{est.universe || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Catégorie</div>
                <div className="font-medium text-slate-900">{est.subcategory?.split("/")[0]?.trim() || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Sous-catégorie</div>
                <div className="font-medium text-slate-900">{est.subcategory?.split("/")[1]?.trim() || "—"}</div>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <div className="text-xs font-semibold text-slate-500">Création</div>
              <div className="font-medium text-slate-900">{formatLocal(est.createdAt)}</div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="est_status">Statut</Label>
                <Select value={statusDraft} onValueChange={setStatusDraft}>
                  <SelectTrigger id="est_status">
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="suspended">suspended</SelectItem>
                    <SelectItem value="rejected">rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button
                  className="gap-2"
                  disabled={saving || loading || statusDraft === est.status}
                  onClick={async () => {
                    setSaving(true);
                    setError(null);
                    try {
                      await updateEstablishmentStatus(undefined, est.id, statusDraft as any);
                      await refresh();
                    } catch (e) {
                      if (e instanceof AdminApiError) setError(e.message);
                      else setError("Erreur inattendue");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save className="h-4 w-4" />
                  Sauver statut
                </Button>
              </div>
            </div>
          </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold">Pros rattachés</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {!linkedPros.length ? (
                <div className="text-sm text-slate-600">Aucun compte Pro n'est rattaché à cet établissement.</div>
              ) : (
                <div className="space-y-2">
                  {linkedPros.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{p.email}</div>
                        <div className="text-xs text-slate-500 font-mono break-all">{p.id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/admin/pros/${encodeURIComponent(p.id)}`}>Voir le Pro</Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setProToRemove(p);
                            setRemoveProDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <AdminEstablishmentBankDetailsCard establishmentId={est.id} />

          <AdminEstablishmentContractsCard establishmentId={est.id} />

          <AdminEstablishmentFinanceRulesCard establishmentId={est.id} />

          <AdminEstablishmentBookingPolicyCard establishmentId={est.id} />
        </div>
      ) : null}

      {est ? (
        <EstablishmentPendingProfileUpdatesPanel
          establishmentId={est.id}
          onAfterDecision={() => {
            void refresh();
          }}
        />
      ) : null}

      {/* Gallery Manager - Gestion des photos */}
      {est ? (
        <AdminGalleryManager
          establishmentId={est.id}
          establishmentName={est.name}
          establishmentLat={est.lat}
          establishmentLng={est.lng}
          establishmentCity={est.city}
        />
      ) : null}

      {/* Contact Info Card - Entre Galerie et Inventaire */}
      {est ? (
        <AdminContactInfoCard establishmentId={est.id} />
      ) : null}

      {/* Admin Inventory Manager */}
      {est ? (
        <AdminInventoryManager
          establishmentId={est.id}
          establishmentName={est.name}
          universe={est.universe}
        />
      ) : null}

      {/* Tags et Services - Entre Inventaire et Réservations */}
      {est ? (
        <AdminTagsServicesCard
          establishmentId={est.id}
          universe={est.universe}
        />
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              Réservations
            </div>
            <div className="text-xs text-slate-500">{filteredReservations.length}</div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={reservationStatusFilter} onValueChange={setReservationStatusFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="requested">En attente</SelectItem>
                <SelectItem value="confirmed">Confirmée</SelectItem>
                <SelectItem value="cancelled">Annulée</SelectItem>
                <SelectItem value="noshow">No-show</SelectItem>
                <SelectItem value="unknown">Inconnu</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reservationPaymentFilter} onValueChange={setReservationPaymentFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Paiement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous paiements</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="paid">Payé</SelectItem>
                <SelectItem value="refunded">Remboursé</SelectItem>
                <SelectItem value="unknown">Inconnu</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reservationWorkflowFilter} onValueChange={setReservationWorkflowFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Workflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tout workflow</SelectItem>
                <SelectItem value="modif">Modif</SelectItem>
                <SelectItem value="proposition">Proposition</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reservationTimeFilter} onValueChange={(v) => setReservationTimeFilter((v as "current" | "expired" | "all") ?? "current")}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Actuelles</SelectItem>
                <SelectItem value="expired">Expirées</SelectItem>
                <SelectItem value="all">Toutes</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setReservationStatusFilter("all");
                setReservationPaymentFilter("all");
                setReservationWorkflowFilter("all");
                setReservationTimeFilter("current");
              }}
            >
              Réinit.
            </Button>
          </div>

          <AdminDataTable
            data={filteredReservations}
            columns={reservationColumns}
            searchPlaceholder="Rechercher…"
            onRowClick={(row) => {
              setSelectedReservationDetailsId(row.id);
              setReservationDetailsOpen(true);
            }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              QR scans
            </div>
            <div className="text-xs text-slate-500">{qrLogs.length}</div>
          </div>
          <AdminDataTable
            data={qrLogs}
            columns={qrColumns}
            searchPlaceholder="Rechercher…"
            onRowClick={(row) => {
              setSelectedQrDetailsId(row.id);
              setQrDetailsOpen(true);
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Offres (slots)
            </div>
            <div className="text-xs text-slate-500">{offersSlots.length}</div>
          </div>
          <AdminDataTable data={offersSlots} columns={slotsColumns} searchPlaceholder="Rechercher…" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Offres (packs)
            </div>
            <div className="text-xs text-slate-500">{offersPacks.length}</div>
          </div>
          <AdminDataTable data={offersPacks} columns={packsColumns} searchPlaceholder="Rechercher…" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Packs achetés
            </div>
            <div className="flex items-center gap-2">
              <Select value={packPurchaseConsumptionFilter} onValueChange={(v) => setPackPurchaseConsumptionFilter((v as any) ?? "not_consumed")}>
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue placeholder="Consommation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_consumed">Non consommés</SelectItem>
                  <SelectItem value="fully_consumed">Consommés</SelectItem>
                  <SelectItem value="all">Tous</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500">{filteredPackPurchases.length}</div>
            </div>
          </div>
          <AdminDataTable data={filteredPackPurchases} columns={purchasesColumns} searchPlaceholder="Rechercher…" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Packs consommés
            </div>
            <div className="text-xs text-slate-500">{packRedemptions.length}</div>
          </div>
          <AdminDataTable data={packRedemptions} columns={redemptionsColumns} searchPlaceholder="Rechercher…" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Conversations
          </div>
          <div className="text-xs text-slate-500">{conversations.length}</div>
        </div>
        <AdminDataTable
          data={conversations}
          columns={conversationColumns}
          searchPlaceholder="Rechercher…"
          onRowClick={(row) => {
            setSelectedConversationId(row.id);
            setConversationDialogOpen(true);
          }}
        />
      </div>

      <AdminReservationDetailsDialog
        open={reservationDetailsOpen}
        onOpenChange={(open) => {
          setReservationDetailsOpen(open);
          if (!open) setSelectedReservationDetailsId(null);
        }}
        reservation={selectedReservationDetailsId ? reservationsById[selectedReservationDetailsId] ?? null : null}
        onUpdate={async (patch) => {
          if (!selectedReservationDetailsId) return;
          await updateAdminEstablishmentReservation(undefined, {
            establishmentId,
            reservationId: selectedReservationDetailsId,
            status: patch.status,
            starts_at: patch.starts_at,
            meta_delete_keys: patch.meta_delete_keys,
          });
          await refresh();
        }}
      />

      <AdminQrScanDetailsDialog
        open={qrDetailsOpen}
        onOpenChange={(open) => {
          setQrDetailsOpen(open);
          if (!open) setSelectedQrDetailsId(null);
        }}
        log={selectedQrDetailsId ? qrLogsById[selectedQrDetailsId] ?? null : null}
      />

      <Dialog
        open={reservationDialogOpen}
        onOpenChange={(open) => {
          setReservationDialogOpen(open);
          if (!open) {
            setSelectedReservationId(null);
            setReservationSaveError(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier réservation</DialogTitle>
            <DialogDescription>{selectedReservationId ? `ID: ${selectedReservationId}` : ""}</DialogDescription>
          </DialogHeader>

          {reservationSaveError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reservationSaveError}</div>
          ) : null}

          {reservationStatus === "unknown" || reservationPaymentStatus === "unknown" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Statut inconnu détecté</div>
              <div className="mt-1 text-xs text-amber-800">
                Valeurs reçues: statut = <code>{reservationStatusRaw || "(vide)"}</code>, paiement ={" "}
                <code>{reservationPaymentStatusRaw || "(vide)"}</code>
              </div>
              <div className="mt-2 text-xs text-amber-800">
                Sélectionnez explicitement des valeurs valides avant d’enregistrer (évite les faux “paid/confirmed”).
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="res_status">Statut</Label>
              <Select value={reservationStatus} onValueChange={(v) => setReservationStatus(v as ReservationStatus)}>
                <SelectTrigger id="res_status">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown" disabled>
                    Inconnu (à corriger)
                  </SelectItem>
                  <SelectItem value="requested">requested</SelectItem>
                  <SelectItem value="confirmed">confirmed</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                  <SelectItem value="noshow">noshow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="res_payment">Paiement</Label>
              <Select value={reservationPaymentStatus} onValueChange={(v) => setReservationPaymentStatus(v as PaymentStatus)}>
                <SelectTrigger id="res_payment">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown" disabled>
                    Inconnu (à corriger)
                  </SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="paid">paid</SelectItem>
                  <SelectItem value="refunded">refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="res_checkin">Check-in (optionnel)</Label>
            <Input
              id="res_checkin"
              type="datetime-local"
              value={reservationCheckedInAt}
              onChange={(e) => setReservationCheckedInAt(e.target.value)}
            />
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Laisser vide pour ne pas modifier.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReservationDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={async () => {
                if (!selectedReservationId) return;

                if (reservationStatus === "unknown" || reservationPaymentStatus === "unknown") {
                  setReservationSaveError("Statut ou paiement inconnu — sélectionnez une valeur valide avant d’enregistrer.");
                  return;
                }

                setSaving(true);
                setReservationSaveError(null);
                try {
                  await updateAdminEstablishmentReservation(undefined, {
                    establishmentId,
                    reservationId: selectedReservationId,
                    status: reservationStatus,
                    payment_status: reservationPaymentStatus,
                    checked_in_at: datetimeLocalToIso(reservationCheckedInAt),
                  });
                  await refresh();
                  setReservationDialogOpen(false);
                } catch (e) {
                  if (e instanceof AdminApiError) setReservationSaveError(e.message);
                  else setReservationSaveError("Erreur inattendue");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={conversationDialogOpen}
        onOpenChange={(open) => {
          setConversationDialogOpen(open);
          if (!open) {
            setSelectedConversationId(null);
            setMessages([]);
            setMessagesError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conversation</DialogTitle>
            <DialogDescription>{selectedConversationId ? `ID: ${selectedConversationId}` : ""}</DialogDescription>
          </DialogHeader>

          {messagesError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{messagesError}</div>
          ) : null}

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Messages</div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!selectedConversationId || messagesLoading}
                onClick={() => void fetchMessages()}
              >
                <RefreshCcw className={messagesLoading ? "animate-spin" : ""} />
                Rafraîchir
              </Button>
            </div>

            <div className="p-3 space-y-2 max-h-[420px] overflow-auto">
              {messages.length ? (
                messages.map((m) => (
                  <div key={m.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div>{m.fromRole}</div>
                      <div>{m.createdAt}</div>
                    </div>
                    <div className="text-sm text-slate-900 mt-2 whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-600">Aucun message.</div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConversationDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Establishment Dialog */}
      <AdminEstablishmentEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        establishment={est}
        onSaved={() => void refresh()}
      />

      {/* Remove Pro from Establishment Confirmation Dialog */}
      <Dialog open={removeProDialogOpen} onOpenChange={setRemoveProDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment détacher <strong>{proToRemove?.email}</strong> de cet établissement ?
              <br />
              <span className="text-slate-500 text-sm">
                Cette action ne supprimera pas le compte Pro, elle retirera uniquement son accès à cet établissement.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRemoveProDialogOpen(false);
                setProToRemove(null);
              }}
              disabled={removingPro}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRemovePro()}
              disabled={removingPro}
            >
              {removingPro ? "Suppression..." : "Confirmer la suppression"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
