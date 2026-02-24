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
  Repeat,
  Save,
  Loader2,
  Moon,
  Plus,
  Store,
  Ticket,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
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
import {
  approvePack as adminApprovePack,
  rejectPack as adminRejectPack,
  requestPackModification as adminRequestPackModification,
} from "@/lib/packsV2AdminApi";
import { AdminQrScanDetailsDialog } from "@/components/admin/establishment/AdminQrScanDetailsDialog";
import { PacksListView, type PackListPack } from "@/components/packs/PacksListView";
import { AdminReservationDetailsDialog } from "@/components/admin/establishment/AdminReservationDetailsDialog";
import { AdminInventoryManager } from "@/components/admin/establishment/AdminInventoryManager";
import { AdminGalleryManager } from "@/components/admin/establishment/AdminGalleryManager";
import { AdminContactInfoCard } from "@/components/admin/establishment/AdminContactInfoCard";
import { AdminTagsServicesCard } from "@/components/admin/establishment/AdminTagsServicesCard";
import { AdminEstablishmentEditDialog } from "@/components/admin/establishment/AdminEstablishmentEditDialog";
import { AdminAuditHistoryCard } from "@/components/admin/AdminAuditHistoryCard";
import { AdminEstablishmentBankDetailsCard } from "@/components/admin/establishment/AdminEstablishmentBankDetailsCard";
import { AdminEstablishmentContractsCard } from "@/components/admin/establishment/AdminEstablishmentContractsCard";
import { AdminEstablishmentFinanceRulesCard } from "@/components/admin/establishment/AdminEstablishmentFinanceRulesCard";
import { AdminEstablishmentBookingPolicyCard } from "@/components/admin/establishment/AdminEstablishmentBookingPolicyCard";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  adminBulkDeleteSlots,
  adminDeleteSlot,
  adminUpsertSlots,
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

// Map DB universe slugs → human-readable labels
const UNIVERSE_LABELS: Record<string, string> = {
  restaurant: "Boire & Manger",
  restaurants: "Boire & Manger",
  sport: "Sport & Bien-être",
  wellness: "Sport & Bien-être",
  loisir: "Loisirs",
  loisirs: "Loisirs",
  hebergement: "Hébergement",
  hotels: "Hébergement",
  hotel: "Hébergement",
  culture: "Culture",
  shopping: "Shopping",
  rentacar: "Location de véhicules",
};

function universeLabel(slug: string): string {
  return UNIVERSE_LABELS[slug.toLowerCase().trim()] ?? slug;
}

type EstablishmentDetails = {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  status: string;
  universe: string;
  category: string;
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
  id: string;
  startsAt: string;
  startsAtIso: string;
  endsAtIso: string | null;
  date: string;
  time: string;
  capacity: string;
  capacityNum: number;
  basePriceCents: number | null;
  basePrice: string;
  serviceLabel: string;
  promo: string;
  promoType: string | null;
  promoValue: number | null;
  promoLabel: string | null;
  status: string;
};

type SlotGroup = {
  groupKey: string;
  ids: string[];
  dateRange: string;
  dateStartIso: string;
  time: string;
  serviceLabel: string;
  capacity: string;
  capacityNum: number;
  basePriceCents: number | null;
  basePrice: string;
  promo: string;
  promoType: string | null;
  promoValue: number | null;
  promoLabel: string | null;
  status: string;
  count: number;
  slots: SlotRow[];
};

function groupSlots(slots: SlotRow[]): SlotGroup[] {
  const map = new Map<string, SlotRow[]>();
  for (const slot of slots) {
    const key = `${slot.time}|${slot.serviceLabel}|${slot.capacityNum}|${slot.basePriceCents}|${slot.promoType}|${slot.promoValue}|${slot.promoLabel}`;
    const group = map.get(key) ?? [];
    group.push(slot);
    map.set(key, group);
  }

  return Array.from(map.entries())
    .map(([key, groupSlots]) => {
      groupSlots.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
      const first = groupSlots[0];
      const last = groupSlots[groupSlots.length - 1];

      const statuses = new Set(groupSlots.map((s) => s.status));
      const status = statuses.size === 1 ? first.status : "mixte";

      const dateRange =
        groupSlots.length === 1 || first.date === last.date
          ? first.date
          : `${first.date} → ${last.date}`;

      return {
        groupKey: key,
        ids: groupSlots.map((s) => s.id),
        dateRange,
        dateStartIso: first.startsAtIso,
        time: first.time,
        serviceLabel: first.serviceLabel,
        capacity: first.capacity,
        capacityNum: first.capacityNum,
        basePriceCents: first.basePriceCents,
        basePrice: first.basePrice,
        promo: first.promo,
        promoType: first.promoType,
        promoValue: first.promoValue,
        promoLabel: first.promoLabel,
        status,
        count: groupSlots.length,
        slots: groupSlots,
      };
    })
    .sort((a, b) => a.dateStartIso.localeCompare(b.dateStartIso));
}

type PackRow = {
  id: string;
  title: string;
  price: string;
  moderationStatus: string;
  rawStatus: string;
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

/** Formate un ISO en "Mer 5 mars" */
function formatSlotDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** Formate un ISO en "19h15" */
function formatSlotTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
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
  const [offersPacksRaw, setOffersPacksRaw] = useState<PackListPack[]>([]);
  const [packPurchases, setPackPurchases] = useState<PurchaseRow[]>([]);
  const [packRedemptions, setPackRedemptions] = useState<RedemptionRow[]>([]);

  const [packPurchaseConsumptionFilter, setPackPurchaseConsumptionFilter] = useState<"not_consumed" | "fully_consumed" | "all">("not_consumed");
  const [qrLogs, setQrLogs] = useState<QrRow[]>([]);

  // Ftour slots dialog
  const [ftourDialogOpen, setFtourDialogOpen] = useState(false);
  const [ftourDateStart, setFtourDateStart] = useState("");
  const [ftourDateEnd, setFtourDateEnd] = useState("");
  const [ftourTimeStart, setFtourTimeStart] = useState("19:15");
  const [ftourDurationMin, setFtourDurationMin] = useState(180);
  const [ftourCapacity, setFtourCapacity] = useState(30);
  const [ftourBasePrice, setFtourBasePrice] = useState("");
  const [ftourServiceLabel, setFtourServiceLabel] = useState("Ftour");
  const [ftourPromoLabel, setFtourPromoLabel] = useState("");
  const [ftourPromoType, setFtourPromoType] = useState<"percent" | "amount">("percent");
  const [ftourPromoValue, setFtourPromoValue] = useState("");
  const [ftourPaidPercent, setFtourPaidPercent] = useState(88);
  const [ftourFreePercent, setFtourFreePercent] = useState(6);
  const [ftourBufferPercent, setFtourBufferPercent] = useState(6);
  const [ftourRepeatEnabled, setFtourRepeatEnabled] = useState(false);
  const [ftourRepeatDays, setFtourRepeatDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [ftourCreating, setFtourCreating] = useState(false);

  // Slot edit/delete dialogs
  const [editSlotDialogOpen, setEditSlotDialogOpen] = useState(false);
  const [editSlotData, setEditSlotData] = useState<SlotRow | null>(null);
  const [editSlotSaving, setEditSlotSaving] = useState(false);
  const [editFormStartDate, setEditFormStartDate] = useState("");
  const [editFormStartTime, setEditFormStartTime] = useState("");
  const [editFormCapacity, setEditFormCapacity] = useState("");
  const [editFormBasePrice, setEditFormBasePrice] = useState("");
  const [editFormServiceLabel, setEditFormServiceLabel] = useState("");
  const [editFormPromoLabel, setEditFormPromoLabel] = useState("");
  const [editFormPromoType, setEditFormPromoType] = useState<"percent" | "amount">("percent");
  const [editFormPromoValue, setEditFormPromoValue] = useState("");
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);
  const [deleteSlotDeleting, setDeleteSlotDeleting] = useState(false);

  // Group edit/delete dialogs
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);
  const [editGroupData, setEditGroupData] = useState<SlotGroup | null>(null);
  const [editGroupSaving, setEditGroupSaving] = useState(false);
  const [editGroupTime, setEditGroupTime] = useState("");
  const [editGroupCapacity, setEditGroupCapacity] = useState("");
  const [editGroupBasePrice, setEditGroupBasePrice] = useState("");
  const [editGroupServiceLabel, setEditGroupServiceLabel] = useState("");
  const [editGroupPromoLabel, setEditGroupPromoLabel] = useState("");
  const [editGroupPromoType, setEditGroupPromoType] = useState<"percent" | "amount">("percent");
  const [editGroupPromoValue, setEditGroupPromoValue] = useState("");
  const [editGroupDateStart, setEditGroupDateStart] = useState("");
  const [editGroupDateEnd, setEditGroupDateEnd] = useState("");
  const [deleteGroupData, setDeleteGroupData] = useState<SlotGroup | null>(null);
  const [deleteGroupDeleting, setDeleteGroupDeleting] = useState(false);

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

  // Pack moderation actions
  const [packActionLoading, setPackActionLoading] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectPackId, setRejectPackId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [modifDialogOpen, setModifDialogOpen] = useState(false);
  const [modifPackId, setModifPackId] = useState<string | null>(null);
  const [modifNote, setModifNote] = useState("");

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
        slug: typeof raw?.slug === "string" && raw.slug.trim() ? raw.slug.trim() : null,
        name: String(raw?.name ?? raw?.title ?? raw?.id ?? ""),
        city: String(raw?.city ?? ""),
        status: String(raw?.status ?? ""),
        universe: String(raw?.universe ?? ""),
        category: String(raw?.category ?? ""),
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
        id: String(s?.id ?? ""),
        startsAt: formatLocal(s?.starts_at),
        startsAtIso: s?.starts_at ?? "",
        endsAtIso: s?.ends_at ?? null,
        date: formatSlotDate(s?.starts_at),
        time: formatSlotTime(s?.starts_at),
        capacity: String(s?.capacity ?? "—"),
        capacityNum: typeof s?.capacity === "number" ? s.capacity : 0,
        basePriceCents: typeof s?.base_price === "number" ? s.base_price : null,
        basePrice: formatMoneyCents(typeof s?.base_price === "number" ? s.base_price : null, s?.currency ?? null),
        serviceLabel: String(s?.service_label ?? "—"),
        promo: s?.promo_label ? `${s.promo_label}` : s?.promo_value ? `${s.promo_type === "percent" ? `${s.promo_value}%` : `${s.promo_value} MAD`}` : "—",
        promoType: s?.promo_type ?? null,
        promoValue: typeof s?.promo_value === "number" ? s.promo_value : null,
        promoLabel: s?.promo_label ?? null,
        status: String(s?.status ?? "—"),
      }));
      setOffersSlots(slots);

      const moderationLabels: Record<string, string> = {
        draft: "Brouillon",
        pending_moderation: "En attente",
        approved: "Approuvé",
        active: "Actif",
        modification_requested: "Modification demandée",
        rejected: "Rejeté",
        suspended: "Suspendu",
        sold_out: "Épuisé",
        ended: "Terminé",
      };
      const packs: PackRow[] = (offersRes.packs ?? []).map((p: any) => ({
        id: String(p?.id ?? ""),
        title: String(p?.title ?? p?.name ?? p?.id ?? "—"),
        price: formatMoneyCents(typeof p?.price === "number" ? p.price : null, p?.currency ?? null),
        moderationStatus: moderationLabels[String(p?.moderation_status ?? "")] ?? String(p?.moderation_status ?? "—"),
        rawStatus: String(p?.moderation_status ?? ""),
        active: typeof p?.active === "boolean" ? (p.active ? "Oui" : "Non") : "—",
      }));
      setOffersPacks(packs);

      // Store raw packs for unified PacksListView
      const rawPacks: PackListPack[] = (offersRes.packs ?? []).map((p: any) => ({
        id: String(p?.id ?? ""),
        title: String(p?.title ?? p?.name ?? p?.id ?? "—"),
        price: typeof p?.price === "number" ? p.price : 0,
        original_price: typeof p?.original_price === "number" ? p.original_price : null,
        stock: typeof p?.stock === "number" ? p.stock : null,
        sold_count: typeof p?.sold_count === "number" ? p.sold_count : null,
        moderation_status: String(p?.moderation_status ?? "draft"),
        active: typeof p?.active === "boolean" ? p.active : undefined,
        cover_url: typeof p?.cover_url === "string" ? p.cover_url : null,
        short_description: typeof p?.short_description === "string" ? p.short_description : null,
      }));
      setOffersPacksRaw(rawPacks);

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
    return buildEstablishmentUrl({
      id: est.id,
      slug: est.slug ?? null,
      name: est.name ?? null,
      universe: est.universe,
    });
  }, [est?.id, est?.slug, est?.name, est?.universe]);

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

  const slotGroups = useMemo(() => groupSlots(offersSlots), [offersSlots]);

  const slotGroupColumns = useMemo<ColumnDef<SlotGroup>[]>(() => {
    return [
      {
        accessorKey: "dateRange",
        header: "Période",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span>{row.original.dateRange}</span>
            {row.original.count > 1 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                {row.original.count}
              </Badge>
            )}
          </div>
        ),
      },
      { accessorKey: "time", header: "Heure" },
      { accessorKey: "serviceLabel", header: "Service" },
      { accessorKey: "capacity", header: "Places" },
      { accessorKey: "basePrice", header: "Prix" },
      { accessorKey: "promo", header: "Promo" },
      { accessorKey: "status", header: "Statut" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Modifier"
              onClick={(e) => { e.stopPropagation(); openGroupEdit(row.original); }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Supprimer"
              onClick={(e) => { e.stopPropagation(); setDeleteGroupData(row.original); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  // [FIX] Handlers pour actions de modération des packs
  const handlePackApprove = useCallback(async (packId: string) => {
    setPackActionLoading(packId);
    try {
      await adminApprovePack(packId);
      toast({ title: "Pack approuvé", description: "Le pack a été approuvé avec succès." });
      void refresh();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message ?? "Impossible d'approuver le pack", variant: "destructive" });
    } finally {
      setPackActionLoading(null);
    }
  }, [toast, refresh]);

  const handlePackReject = useCallback(async () => {
    if (!rejectPackId || !rejectReason.trim()) return;
    setPackActionLoading(rejectPackId);
    try {
      await adminRejectPack(rejectPackId, rejectReason.trim());
      toast({ title: "Pack refusé", description: "Le pack a été refusé." });
      setRejectDialogOpen(false);
      setRejectPackId(null);
      setRejectReason("");
      void refresh();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message ?? "Impossible de refuser le pack", variant: "destructive" });
    } finally {
      setPackActionLoading(null);
    }
  }, [rejectPackId, rejectReason, toast, refresh]);

  const handlePackRequestModification = useCallback(async () => {
    if (!modifPackId || !modifNote.trim()) return;
    setPackActionLoading(modifPackId);
    try {
      await adminRequestPackModification(modifPackId, modifNote.trim());
      toast({ title: "Modification demandée", description: "Une demande de modification a été envoyée au Pro." });
      setModifDialogOpen(false);
      setModifPackId(null);
      setModifNote("");
      void refresh();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message ?? "Impossible de demander la modification", variant: "destructive" });
    } finally {
      setPackActionLoading(null);
    }
  }, [modifPackId, modifNote, toast, refresh]);

  const packsColumns = useMemo<ColumnDef<PackRow>[]>(() => {
    const statusBadgeClass: Record<string, string> = {
      pending_moderation: "bg-amber-100 text-amber-800 border-amber-300",
      approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
      active: "bg-emerald-100 text-emerald-800 border-emerald-300",
      rejected: "bg-red-100 text-red-800 border-red-300",
      modification_requested: "bg-sky-100 text-sky-800 border-sky-300",
      suspended: "bg-slate-200 text-slate-700 border-slate-400",
      draft: "bg-slate-100 text-slate-600 border-slate-300",
      sold_out: "bg-violet-100 text-violet-700 border-violet-300",
      ended: "bg-slate-100 text-slate-500 border-slate-300",
    };

    return [
      { accessorKey: "title", header: "Pack", meta: { style: { width: "25%" } } },
      { accessorKey: "price", header: "Prix", meta: { style: { width: "10%" } } },
      {
        accessorKey: "moderationStatus",
        header: "Modération",
        meta: { style: { width: "12%" } },
        cell: ({ row }) => {
          const raw = row.original.rawStatus;
          const label = row.original.moderationStatus;
          return (
            <Badge className={statusBadgeClass[raw] ?? "bg-slate-100 text-slate-600"}>
              {label}
            </Badge>
          );
        },
      },
      { accessorKey: "active", header: "Actif", meta: { style: { width: "8%" } } },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const pack = row.original;
          const isLoading = packActionLoading === pack.id;
          const isPending = pack.rawStatus === "pending_moderation";
          const canReject = isPending || pack.rawStatus === "approved" || pack.rawStatus === "active";
          const canRequestModif = isPending;

          return (
            <div className="flex items-center gap-1">
              {isPending && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  disabled={isLoading}
                  onClick={(e) => { e.stopPropagation(); void handlePackApprove(pack.id); }}
                  title="Approuver"
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  <span className="ml-1 hidden xl:inline">Approuver</span>
                </Button>
              )}
              {canRequestModif && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-sky-700 border-sky-300 hover:bg-sky-50"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    setModifPackId(pack.id);
                    setModifNote("");
                    setModifDialogOpen(true);
                  }}
                  title="Demander modification"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="ml-1 hidden xl:inline">Modifier</span>
                </Button>
              )}
              {canReject && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-red-700 border-red-300 hover:bg-red-50"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRejectPackId(pack.id);
                    setRejectReason("");
                    setRejectDialogOpen(true);
                  }}
                  title="Refuser"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span className="ml-1 hidden xl:inline">Refuser</span>
                </Button>
              )}
              {!isPending && !canReject && (
                <span className="text-xs text-slate-400">—</span>
              )}
            </div>
          );
        },
      },
    ];
  }, [packActionLoading, handlePackApprove]);

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

  // Create Ftour slots in batch
  const handleCreateFtourSlots = async () => {
    if (!establishmentId || !ftourDateStart || !ftourTimeStart) return;
    if (ftourRepeatEnabled && !ftourDateEnd) return;

    // Validate capacity distribution
    if (ftourPaidPercent + ftourFreePercent + ftourBufferPercent !== 100) {
      toast({ title: "Erreur", description: "La répartition des places doit totaliser 100%.", variant: "destructive" });
      return;
    }

    setFtourCreating(true);
    try {
      const startDate = new Date(ftourDateStart);
      if (isNaN(startDate.getTime())) {
        toast({ title: "Erreur", description: "Date de début invalide", variant: "destructive" });
        return;
      }

      // Si la répétition est activée, utiliser ftourDateEnd comme date de fin
      // Sinon, créer un seul créneau pour la date de début
      const endDate = ftourRepeatEnabled && ftourDateEnd ? new Date(ftourDateEnd) : new Date(startDate);
      if (isNaN(endDate.getTime()) || endDate < startDate) {
        toast({ title: "Erreur", description: "Dates invalides", variant: "destructive" });
        return;
      }

      const [hours, minutes] = ftourTimeStart.split(":").map(Number);
      const basePrice = ftourBasePrice.trim() ? Math.round(Number(ftourBasePrice) * 100) : null;
      const promoValueNum = ftourPromoValue.trim() ? Math.round(Number(ftourPromoValue)) : null;
      const promoValue = promoValueNum && promoValueNum > 0 ? promoValueNum : null;

      const slots: Array<{
        starts_at: string;
        ends_at: string;
        capacity: number;
        base_price?: number | null;
        service_label: string;
        promo_type?: string | null;
        promo_value?: number | null;
        promo_label?: string | null;
      }> = [];

      const current = new Date(startDate);
      while (current <= endDate) {
        // Skip days not in the repeat selection (when enabled)
        if (ftourRepeatEnabled && ftourRepeatDays.length > 0 && !ftourRepeatDays.includes(current.getDay())) {
          current.setDate(current.getDate() + 1);
          continue;
        }

        const slotStart = new Date(current);
        slotStart.setHours(hours, minutes, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + ftourDurationMin);

        slots.push({
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          capacity: ftourCapacity,
          base_price: basePrice,
          service_label: ftourServiceLabel || "Ftour",
          promo_type: promoValue ? ftourPromoType : null,
          promo_value: promoValue,
          promo_label: promoValue ? (ftourPromoLabel.trim() || null) : null,
        });

        current.setDate(current.getDate() + 1);
      }

      const res = await adminUpsertSlots(undefined, establishmentId, slots);
      toast({
        title: "Créneaux créés",
        description: `${res.upserted} créneau(x) créé(s) avec succès`,
      });

      // Refresh offers list
      const offersRes = await listAdminEstablishmentOffers(undefined, establishmentId);
      const refreshedSlots: SlotRow[] = (offersRes.slots ?? []).map((s: any) => ({
        id: String(s?.id ?? ""),
        startsAt: formatLocal(s?.starts_at),
        startsAtIso: s?.starts_at ?? "",
        endsAtIso: s?.ends_at ?? null,
        date: formatSlotDate(s?.starts_at),
        time: formatSlotTime(s?.starts_at),
        capacity: String(s?.capacity ?? "—"),
        capacityNum: typeof s?.capacity === "number" ? s.capacity : 0,
        basePriceCents: typeof s?.base_price === "number" ? s.base_price : null,
        basePrice: formatMoneyCents(typeof s?.base_price === "number" ? s.base_price : null, s?.currency ?? null),
        serviceLabel: String(s?.service_label ?? "—"),
        promo: s?.promo_label ? `${s.promo_label}` : s?.promo_value ? `${s.promo_type === "percent" ? `${s.promo_value}%` : `${s.promo_value} MAD`}` : "—",
        promoType: s?.promo_type ?? null,
        promoValue: typeof s?.promo_value === "number" ? s.promo_value : null,
        promoLabel: s?.promo_label ?? null,
        status: String(s?.status ?? "—"),
      }));
      setOffersSlots(refreshedSlots);
      setFtourDialogOpen(false);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setFtourCreating(false);
    }
  };

  // Helper to refresh the slots list
  const refreshSlotsOnly = async () => {
    try {
      const offersRes = await listAdminEstablishmentOffers(undefined, establishmentId);
      const refreshed: SlotRow[] = (offersRes.slots ?? []).map((s: any) => ({
        id: String(s?.id ?? ""),
        startsAt: formatLocal(s?.starts_at),
        startsAtIso: s?.starts_at ?? "",
        endsAtIso: s?.ends_at ?? null,
        date: formatSlotDate(s?.starts_at),
        time: formatSlotTime(s?.starts_at),
        capacity: String(s?.capacity ?? "—"),
        capacityNum: typeof s?.capacity === "number" ? s.capacity : 0,
        basePriceCents: typeof s?.base_price === "number" ? s.base_price : null,
        basePrice: formatMoneyCents(typeof s?.base_price === "number" ? s.base_price : null, s?.currency ?? null),
        serviceLabel: String(s?.service_label ?? "—"),
        promo: s?.promo_label ? `${s.promo_label}` : s?.promo_value ? `${s.promo_type === "percent" ? `${s.promo_value}%` : `${s.promo_value} MAD`}` : "—",
        promoType: s?.promo_type ?? null,
        promoValue: typeof s?.promo_value === "number" ? s.promo_value : null,
        promoLabel: s?.promo_label ?? null,
        status: String(s?.status ?? "—"),
      }));
      setOffersSlots(refreshed);
    } catch { /* silent */ }
  };

  // Open edit dialog for a slot
  const openSlotEdit = (slot: SlotRow) => {
    setEditSlotData(slot);
    setEditFormStartDate(slot.startsAtIso ? slot.startsAtIso.slice(0, 10) : "");
    setEditFormStartTime(slot.startsAtIso ? slot.startsAtIso.slice(11, 16) : "");
    setEditFormCapacity(String(slot.capacityNum));
    setEditFormBasePrice(slot.basePriceCents != null ? String(slot.basePriceCents / 100) : "");
    setEditFormServiceLabel(slot.serviceLabel === "—" ? "" : slot.serviceLabel);
    setEditFormPromoLabel(slot.promoLabel ?? "");
    setEditFormPromoType(slot.promoType === "amount" ? "amount" : "percent");
    setEditFormPromoValue(slot.promoValue != null ? String(slot.promoValue) : "");
    setEditSlotDialogOpen(true);
  };

  // Save edited slot
  const handleSaveEditSlot = async () => {
    if (!editSlotData) return;
    setEditSlotSaving(true);
    try {
      const startsAt = `${editFormStartDate}T${editFormStartTime}:00`;
      const startsDt = new Date(startsAt);
      if (!Number.isFinite(startsDt.getTime())) {
        toast({ title: "Erreur", description: "Date/heure invalide", variant: "destructive" });
        return;
      }

      // Preserve original duration
      const origStart = new Date(editSlotData.startsAtIso);
      const origEnd = editSlotData.endsAtIso ? new Date(editSlotData.endsAtIso) : null;
      const durationMs = origEnd ? origEnd.getTime() - origStart.getTime() : 3 * 60 * 60 * 1000;
      const endsDt = new Date(startsDt.getTime() + durationMs);

      const capacity = Math.max(1, Number(editFormCapacity) || 1);
      const basePrice = editFormBasePrice.trim() ? Math.round(Number(editFormBasePrice) * 100) : null;
      const promoValueNum = editFormPromoValue.trim() ? Math.round(Number(editFormPromoValue)) : null;
      const promoValue = promoValueNum && promoValueNum > 0 ? promoValueNum : null;

      await adminUpsertSlots(undefined, establishmentId, [{
        starts_at: startsDt.toISOString(),
        ends_at: endsDt.toISOString(),
        capacity,
        base_price: basePrice,
        service_label: editFormServiceLabel || null,
        promo_type: promoValue ? editFormPromoType : null,
        promo_value: promoValue,
        promo_label: promoValue ? (editFormPromoLabel.trim() || null) : null,
      }]);

      toast({ title: "Créneau modifié", description: "Le créneau a été mis à jour." });
      setEditSlotDialogOpen(false);
      setEditSlotData(null);
      await refreshSlotsOnly();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setEditSlotSaving(false);
    }
  };

  // Delete slot
  const handleDeleteSlot = async () => {
    if (!deleteSlotId) return;
    setDeleteSlotDeleting(true);
    try {
      await adminDeleteSlot(undefined, establishmentId, deleteSlotId);
      toast({ title: "Supprimé", description: "Le créneau a été supprimé." });
      setDeleteSlotId(null);
      await refreshSlotsOnly();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleteSlotDeleting(false);
    }
  };

  // ── Group edit/delete handlers ──
  const openGroupEdit = (group: SlotGroup) => {
    setEditGroupData(group);
    // Extract local HH:mm from first slot (group.time is display-formatted like "19h15")
    const firstSlotIso = group.slots[0]?.startsAtIso;
    let timeForInput = "19:15";
    if (firstSlotIso) {
      const d = new Date(firstSlotIso);
      if (Number.isFinite(d.getTime())) {
        timeForInput = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    setEditGroupTime(timeForInput);
    // Extract local YYYY-MM-DD for date inputs from first/last slot
    const sortedSlots = [...group.slots].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
    const firstDate = new Date(sortedSlots[0]?.startsAtIso ?? "");
    const lastDate = new Date(sortedSlots[sortedSlots.length - 1]?.startsAtIso ?? "");
    const toLocalDate = (d: Date) => {
      if (!Number.isFinite(d.getTime())) return "";
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    setEditGroupDateStart(toLocalDate(firstDate));
    setEditGroupDateEnd(toLocalDate(lastDate));
    setEditGroupCapacity(String(group.capacityNum));
    setEditGroupBasePrice(group.basePriceCents != null ? String(group.basePriceCents / 100) : "");
    setEditGroupServiceLabel(group.serviceLabel === "—" ? "" : group.serviceLabel);
    setEditGroupPromoLabel(group.promoLabel ?? "");
    setEditGroupPromoType(group.promoType === "amount" ? "amount" : "percent");
    setEditGroupPromoValue(group.promoValue != null ? String(group.promoValue) : "");
    setEditGroupDialogOpen(true);
  };

  const handleSaveGroupEdit = async () => {
    if (!editGroupData) return;
    setEditGroupSaving(true);
    try {
      const capacity = Math.max(1, Number(editGroupCapacity) || 1);
      const basePrice = editGroupBasePrice.trim() ? Math.round(Number(editGroupBasePrice) * 100) : null;
      const promoValueNum = editGroupPromoValue.trim() ? Math.round(Number(editGroupPromoValue)) : null;
      const promoValue = promoValueNum && promoValueNum > 0 ? promoValueNum : null;
      const [hours, minutes] = editGroupTime.split(":").map(Number);

      // Check if dates changed
      const sortedSlots = [...editGroupData.slots].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
      const origFirstDate = new Date(sortedSlots[0]?.startsAtIso ?? "");
      const origLastDate = new Date(sortedSlots[sortedSlots.length - 1]?.startsAtIso ?? "");
      const toLocalDate = (d: Date) => {
        if (!Number.isFinite(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const origStart = toLocalDate(origFirstDate);
      const origEnd = toLocalDate(origLastDate);
      const datesChanged = editGroupDateStart !== origStart || editGroupDateEnd !== origEnd;

      // Compute duration from first existing slot
      const firstOrigStart = new Date(sortedSlots[0]?.startsAtIso ?? "");
      const firstOrigEnd = sortedSlots[0]?.endsAtIso ? new Date(sortedSlots[0].endsAtIso) : null;
      const durationMs = firstOrigEnd ? firstOrigEnd.getTime() - firstOrigStart.getTime() : 3 * 60 * 60 * 1000;

      const sharedProps = {
        capacity,
        base_price: basePrice,
        service_label: editGroupServiceLabel || null,
        promo_type: promoValue ? editGroupPromoType : null,
        promo_value: promoValue,
        promo_label: promoValue ? (editGroupPromoLabel.trim() || null) : null,
      };

      if (datesChanged) {
        // Dates changed: delete old slots and create new ones for each day in range
        await adminBulkDeleteSlots(undefined, establishmentId, editGroupData.ids);
        const startD = new Date(editGroupDateStart + "T00:00:00");
        const endD = new Date(editGroupDateEnd + "T00:00:00");
        const newSlots: Array<Record<string, unknown>> = [];
        const cur = new Date(startD);
        while (cur <= endD) {
          const newStart = new Date(cur);
          newStart.setHours(hours, minutes, 0, 0);
          const newEnd = new Date(newStart.getTime() + durationMs);
          newSlots.push({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), ...sharedProps });
          cur.setDate(cur.getDate() + 1);
        }
        if (newSlots.length > 0) {
          await adminUpsertSlots(undefined, establishmentId, newSlots);
        }
        toast({ title: "Créneaux modifiés", description: `${newSlots.length} créneau(x) recréé(s).` });
      } else {
        // Dates unchanged: update existing slots keeping original dates
        const slots = editGroupData.slots.map((slot) => {
          const slotOrigStart = new Date(slot.startsAtIso);
          const newStart = new Date(slotOrigStart);
          newStart.setHours(hours, minutes, 0, 0);
          const newEnd = new Date(newStart.getTime() + durationMs);
          return { starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), ...sharedProps };
        });
        await adminUpsertSlots(undefined, establishmentId, slots);
        toast({ title: "Créneaux modifiés", description: `${slots.length} créneau(x) mis à jour.` });
      }

      setEditGroupDialogOpen(false);
      setEditGroupData(null);
      await refreshSlotsOnly();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setEditGroupSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupData) return;
    setDeleteGroupDeleting(true);
    try {
      await adminBulkDeleteSlots(undefined, establishmentId, deleteGroupData.ids);
      toast({ title: "Supprimé", description: `${deleteGroupData.count} créneau(x) supprimé(s).` });
      setDeleteGroupData(null);
      await refreshSlotsOnly();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleteGroupDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={est?.name || "Établissement"}
        description={est ? `ID: ${est.id}` : ""}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/establishments" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Link>
            </Button>

            {est ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
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
                Copier l'ID
              </Button>
            ) : null}

            {publicUrl ? (
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <Link to={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Ouvrir la page publique
                </Link>
              </Button>
            ) : null}

            {est?.website ? (
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={est.website} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Site web
                </a>
              </Button>
            ) : null}

            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || saving} className="gap-1.5">
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
                <div className="font-medium text-slate-900">{est.universe ? universeLabel(est.universe) : "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Catégorie</div>
                <div className="font-medium text-slate-900">{est.category || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Sous-catégorie</div>
                <div className="font-medium text-slate-900">{est.subcategory || "—"}</div>
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

      <div className="space-y-4">
        <div className="space-y-2 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Offres (slots)
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setFtourDialogOpen(true)}
              >
                <Moon className="h-3 w-3" />
                Créer créneaux Ftour
              </Button>
              <div className="text-xs text-slate-500">{offersSlots.length}</div>
            </div>
          </div>
          <AdminDataTable data={slotGroups} columns={slotGroupColumns} searchPlaceholder="Rechercher…" />
        </div>

        <div className="space-y-2 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Offres (packs)
            </div>
            <div className="text-xs text-slate-500">{offersPacksRaw.length}</div>
          </div>
          <PacksListView
            packs={offersPacksRaw}
            role="admin"
            onApprove={handlePackApprove}
            onReject={(packId) => {
              setRejectPackId(packId);
              setRejectReason("");
              setRejectDialogOpen(true);
            }}
            onRequestModification={(packId) => {
              setModifPackId(packId);
              setModifNote("");
              setModifDialogOpen(true);
            }}
            actionLoading={packActionLoading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2 min-w-0 overflow-hidden">
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

        <div className="space-y-2 min-w-0 overflow-hidden">
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

      {/* Historique de modification */}
      <AdminAuditHistoryCard entityType="establishment" entityId={establishmentId} />

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

      {/* Delete Slot Confirmation */}
      <AlertDialog open={!!deleteSlotId} onOpenChange={(open) => !open && setDeleteSlotId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce créneau ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le créneau sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSlotDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSlot}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteSlotDeleting}
            >
              {deleteSlotDeleting ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Group Confirmation */}
      <AlertDialog open={!!deleteGroupData} onOpenChange={(open) => !open && setDeleteGroupData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {deleteGroupData?.count ?? 0} créneau(x) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Tous les créneaux de cette série ({deleteGroupData?.dateRange}) seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteGroupDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteGroupDeleting}
            >
              {deleteGroupDeleting ? "Suppression…" : "Supprimer tout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Group Dialog */}
      <Dialog open={editGroupDialogOpen} onOpenChange={(open) => { if (!open) { setEditGroupDialogOpen(false); setEditGroupData(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Modifier les créneaux
            </DialogTitle>
            <DialogDescription>
              {editGroupData && (
                <>
                  {editGroupData.count} créneau(x) — {editGroupData.dateRange}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date début</Label>
                <Input
                  type="date"
                  value={editGroupDateStart}
                  onChange={(e) => setEditGroupDateStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date fin</Label>
                <Input
                  type="date"
                  value={editGroupDateEnd}
                  onChange={(e) => setEditGroupDateEnd(e.target.value)}
                  min={editGroupDateStart}
                />
              </div>
            </div>

            {/* Heure */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Heure début</Label>
              <Input
                type="time"
                value={editGroupTime}
                onChange={(e) => setEditGroupTime(e.target.value)}
              />
            </div>

            {/* Service */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Service</Label>
              <Select value={editGroupServiceLabel} onValueChange={setEditGroupServiceLabel}>
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

            {/* Capacité & Prix */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Capacité par créneau</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={editGroupCapacity}
                  onChange={(e) => setEditGroupCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Prix (MAD)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Gratuit"
                  value={editGroupBasePrice}
                  onChange={(e) => setEditGroupBasePrice(e.target.value)}
                />
              </div>
            </div>

            {/* Promotion */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs font-medium">Promotion (optionnel)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Label affiché</Label>
                  <Input
                    placeholder="-15%"
                    value={editGroupPromoLabel}
                    onChange={(e) => setEditGroupPromoLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Type</Label>
                  <Select value={editGroupPromoType} onValueChange={(v) => setEditGroupPromoType(v as "percent" | "amount")}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Pourcentage</SelectItem>
                      <SelectItem value="amount">Montant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Valeur</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={editGroupPromoValue}
                    onChange={(e) => setEditGroupPromoValue(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditGroupDialogOpen(false); setEditGroupData(null); }}>
              Annuler
            </Button>
            <Button onClick={() => void handleSaveGroupEdit()} disabled={editGroupSaving}>
              {editGroupSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Sauvegarde…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Sauvegarder
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Slot Dialog */}
      <Dialog open={editSlotDialogOpen} onOpenChange={(open) => { if (!open) { setEditSlotDialogOpen(false); setEditSlotData(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Modifier le créneau
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations du créneau.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date</Label>
                <Input
                  type="date"
                  value={editFormStartDate}
                  onChange={(e) => setEditFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Heure</Label>
                <Input
                  type="time"
                  value={editFormStartTime}
                  onChange={(e) => setEditFormStartTime(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Capacité</Label>
                <Input
                  type="number"
                  min={1}
                  value={editFormCapacity}
                  onChange={(e) => setEditFormCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Prix (MAD)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Gratuit"
                  value={editFormBasePrice}
                  onChange={(e) => setEditFormBasePrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Service</Label>
              <Select value={editFormServiceLabel || "Ftour"} onValueChange={setEditFormServiceLabel}>
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

            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs font-medium">Promotion (optionnel)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Label</Label>
                  <Input
                    type="text"
                    placeholder="-15%"
                    value={editFormPromoLabel}
                    onChange={(e) => setEditFormPromoLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Type</Label>
                  <Select value={editFormPromoType} onValueChange={(v) => setEditFormPromoType(v as "percent" | "amount")}>
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
                    value={editFormPromoValue}
                    onChange={(e) => setEditFormPromoValue(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditSlotDialogOpen(false); setEditSlotData(null); }}>
              Annuler
            </Button>
            <Button onClick={() => void handleSaveEditSlot()} disabled={editSlotSaving}>
              {editSlotSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ftour Slots Creation Dialog */}
      <Dialog open={ftourDialogOpen} onOpenChange={setFtourDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5" />
              Créer créneaux
            </DialogTitle>
            <DialogDescription>
              Génère un créneau par jour sur la période sélectionnée.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Date de début ── */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Date de début</Label>
              <Input
                type="date"
                value={ftourDateStart}
                onChange={(e) => setFtourDateStart(e.target.value)}
              />
            </div>

            {/* ── Heure & Service ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Heure début</Label>
                <Input
                  type="time"
                  value={ftourTimeStart}
                  onChange={(e) => setFtourTimeStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Service</Label>
                <Select value={ftourServiceLabel} onValueChange={setFtourServiceLabel}>
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
                    variant={ftourDurationMin === opt.value ? "default" : "outline"}
                    className="text-xs h-7 px-2.5"
                    onClick={() => setFtourDurationMin(opt.value)}
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
                  value={ftourCapacity}
                  onChange={(e) => setFtourCapacity(Number(e.target.value) || 30)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Prix (MAD)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Gratuit"
                  value={ftourBasePrice}
                  onChange={(e) => setFtourBasePrice(e.target.value)}
                />
              </div>
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
                      ftourPaidPercent === profile.paid &&
                      ftourFreePercent === profile.free &&
                      ftourBufferPercent === profile.buffer
                        ? "default"
                        : "outline"
                    }
                    className="text-xs h-7 px-2"
                    onClick={() => {
                      setFtourPaidPercent(profile.paid);
                      setFtourFreePercent(profile.free);
                      setFtourBufferPercent(profile.buffer);
                    }}
                  >
                    {profile.label}
                  </Button>
                ))}
                {/* Personnalisé — actif quand les % ne correspondent à aucun profil */}
                {(() => {
                  const profiles = [
                    { paid: 88, free: 6, buffer: 6 },
                    { paid: 50, free: 30, buffer: 20 },
                    { paid: 30, free: 60, buffer: 10 },
                  ];
                  const matchesAny = profiles.some(
                    (p) => ftourPaidPercent === p.paid && ftourFreePercent === p.free && ftourBufferPercent === p.buffer,
                  );
                  return (
                    <Button
                      type="button"
                      size="sm"
                      variant={!matchesAny ? "default" : "outline"}
                      className="text-xs h-7 px-2"
                      onClick={() => {
                        if (matchesAny) {
                          setFtourPaidPercent(0);
                          setFtourFreePercent(0);
                          setFtourBufferPercent(0);
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
                    value={ftourPaidPercent}
                    onChange={(e) => setFtourPaidPercent(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Gratuit %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={ftourFreePercent}
                    onChange={(e) => setFtourFreePercent(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Buffer %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={ftourBufferPercent}
                    onChange={(e) => setFtourBufferPercent(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              {ftourPaidPercent + ftourFreePercent + ftourBufferPercent !== 100 && (
                <p className="text-xs text-red-500 mt-1">
                  Total : {ftourPaidPercent + ftourFreePercent + ftourBufferPercent}% — doit être 100%
                </p>
              )}
              {/* Visual bar */}
              <div className="flex h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-blue-500" style={{ width: `${ftourPaidPercent}%` }} />
                <div className="bg-green-500" style={{ width: `${ftourFreePercent}%` }} />
                <div className="bg-slate-300" style={{ width: `${ftourBufferPercent}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Payant {ftourPaidPercent}%</span>
                <span>Gratuit {ftourFreePercent}%</span>
                <span>Buffer {ftourBufferPercent}%</span>
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
                    value={ftourPromoLabel}
                    onChange={(e) => setFtourPromoLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px] text-slate-500">Type</Label>
                  <Select value={ftourPromoType} onValueChange={(v) => setFtourPromoType(v as "percent" | "amount")}>
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
                    value={ftourPromoValue}
                    onChange={(e) => setFtourPromoValue(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* ── Répéter sur plusieurs jours ── */}
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={ftourRepeatEnabled}
                  onCheckedChange={(checked) => setFtourRepeatEnabled(!!checked)}
                />
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Repeat className="h-3.5 w-3.5" />
                  Répéter sur plusieurs jours
                </div>
              </label>

              {ftourRepeatEnabled && (
                <div className="space-y-3 pt-1">
                  {/* Répéter jusqu'au */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Répéter jusqu'au</Label>
                    <Input
                      type="date"
                      value={ftourDateEnd}
                      min={ftourDateStart || undefined}
                      onChange={(e) => setFtourDateEnd(e.target.value)}
                    />
                  </div>

                  {/* Jours de la semaine */}
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
                        const isActive = ftourRepeatDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              setFtourRepeatDays((prev) =>
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
            {ftourDateStart && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                {(() => {
                  const start = new Date(ftourDateStart);
                  if (isNaN(start.getTime())) return "Date invalide";

                  let days = 1;
                  if (ftourRepeatEnabled && ftourDateEnd) {
                    const end = new Date(ftourDateEnd);
                    if (isNaN(end.getTime()) || end < start) return "Dates invalides";

                    days = 0;
                    if (ftourRepeatDays.length > 0) {
                      const cursor = new Date(start);
                      while (cursor <= end) {
                        if (ftourRepeatDays.includes(cursor.getDay())) days++;
                        cursor.setDate(cursor.getDate() + 1);
                      }
                    } else {
                      days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    }
                  }

                  const priceStr = ftourBasePrice.trim() ? ` — ${ftourBasePrice} MAD` : " — Gratuit";
                  return `${days} créneau(x) ${ftourServiceLabel} seront créés (${ftourTimeStart} — ${ftourCapacity} places/jour${priceStr})`;
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFtourDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => void handleCreateFtourSlots()}
              disabled={ftourCreating || !ftourDateStart || (ftourRepeatEnabled && !ftourDateEnd)}
            >
              {ftourCreating ? (
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

      {/* Dialog : Refuser un pack */}
      <Dialog open={rejectDialogOpen} onOpenChange={(open) => {
        setRejectDialogOpen(open);
        if (!open) { setRejectPackId(null); setRejectReason(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refuser le pack</DialogTitle>
            <DialogDescription>Indiquez la raison du refus. Le Pro sera notifié.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject_reason">Raison du refus</Label>
            <Input
              id="reject_reason"
              placeholder="Ex: photos non conformes, prix incohérent…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || packActionLoading === rejectPackId}
              onClick={() => void handlePackReject()}
            >
              {packActionLoading === rejectPackId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Refuser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Demander modification */}
      <Dialog open={modifDialogOpen} onOpenChange={(open) => {
        setModifDialogOpen(open);
        if (!open) { setModifPackId(null); setModifNote(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Demander une modification</DialogTitle>
            <DialogDescription>Décrivez les modifications nécessaires. Le Pro sera notifié.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="modif_note">Note de modification</Label>
            <Input
              id="modif_note"
              placeholder="Ex: veuillez ajouter une description plus détaillée…"
              value={modifNote}
              onChange={(e) => setModifNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifDialogOpen(false)}>Annuler</Button>
            <Button
              disabled={!modifNote.trim() || packActionLoading === modifPackId}
              onClick={() => void handlePackRequestModification()}
            >
              {packActionLoading === modifPackId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
