import type { ColumnDef } from "@tanstack/react-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, HelpCircle, Mail, MapPin, Phone, ShieldCheck, User, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import {
  AdminApiError,
  getConsumerUser,
  recomputeConsumerUserReliability,
  listConsumerUserEvents,
  listConsumerUserPurchases,
  updateConsumerUserEvent,
  updateConsumerUserPurchase,
  updateConsumerUserStatus,
  type ConsumerPurchase,
  type ConsumerUser,
  type ConsumerUserEvent,
} from "@/lib/adminApi";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

type DetailUser = {
  id: string;
  name: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  authMethod: "email" | "phone" | null;
  status: "active" | "suspended";
  city: string;
  country: string;
  reliabilityScore: number;
  reservations: number;
  noShows: number;
  createdAt: string;
  lastActivityAt: string;
};

type EventRow = {
  id: string;
  occurredAt: string;
  occurredAtIso: string;
  typeLabel: string;
  eventType: string;
  details: string;
  metadata: unknown;
};

type PurchaseRow = {
  id: string;
  purchasedAt: string;
  purchasedAtIso: string;
  status: string;
  currency: string;
  totalAmountMinor: number;
  totalLabel: string;
  itemsSummary: string;
  items: unknown;
  metadata: unknown;
};

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatLocalYmdHm(iso: string): string {
  return formatLeJjMmAaAHeure(iso);
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function toSafeString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function safePrettyJson(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return toSafeString(value);
  }
}

function parseJsonOrThrow(text: string): unknown {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function formatStatusLabel(status: string): "active" | "suspended" {
  return status === "suspended" ? "suspended" : "active";
}

function mapUser(u: ConsumerUser): DetailUser {
  const created = String(u.created_at ?? "");
  const last = String(u.last_activity_at ?? "");
  const authMethod = u.auth_method === "phone" ? "phone" : u.auth_method === "email" ? "email" : null;
  return {
    id: String(u.id ?? ""),
    name: String(u.name ?? ""),
    displayName: String(u.display_name ?? u.name ?? ""),
    firstName: String(u.first_name ?? ""),
    lastName: String(u.last_name ?? ""),
    phone: String(u.phone ?? ""),
    email: String(u.email ?? ""),
    authMethod,
    status: formatStatusLabel(String(u.status ?? "")),
    city: String(u.city ?? ""),
    country: String(u.country ?? ""),
    reliabilityScore: Number.isFinite(u.reliability_score) ? Number(u.reliability_score) : 0,
    reservations: Number.isFinite(u.reservations_count) ? Number(u.reservations_count) : 0,
    noShows: Number.isFinite(u.no_shows_count) ? Number(u.no_shows_count) : 0,
    createdAt: created,
    lastActivityAt: last,
  };
}

function eventTypeLabel(eventType: string): string {
  const t = (eventType ?? "").trim();
  const map: Record<string, string> = {
    "account.created": "Compte créé",
    "account.deactivated": "Compte désactivé",
    "account.reactivated": "Compte réactivé",
    "account.deleted": "Compte supprimé",
    "account.export_requested": "Export demandé",

    "profile.updated": "Profil mis à jour",

    // Reservation lifecycle (older keys)
    "reservation.requested": "Réservation demandée",
    "reservation.confirmed": "Réservation confirmée",
    "reservation.noshow": "No-show",

    // Reservation lifecycle (canonical notification keys)
    booking_created: "Réservation créée",
    booking_confirmed: "Réservation confirmée",
    booking_refused: "Réservation refusée",
    booking_waitlisted: "Réservation en liste d’attente",
    booking_cancelled: "Réservation annulée",
    noshow_marked: "No-show",

    payment_succeeded: "Paiement reçu",
    payment_failed: "Paiement échoué",
    refund_done: "Remboursement effectué",
    message_received: "Message reçu",

    "payment.deposit_paid": "Acompte payé",
    "support.ticket_opened": "Ticket support",

    login: "Connexion",
  };
  return map[t] ?? t;
}

function stringifyEventDetails(e: ConsumerUserEvent): string {
  const meta = e.metadata;
  if (!meta || typeof meta !== "object") return "—";

  const m = meta as Record<string, unknown>;
  const entries = Object.entries(m)
    .filter(([k, v]) => k && v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : toSafeString(v)}`);

  return entries.length ? entries.join(" • ") : "—";
}

function formatMoneyMinor(amountMinor: number, currency: string): string {
  const amount = Number.isFinite(amountMinor) ? amountMinor : 0;
  const ccy = (currency ?? "").trim() || "MAD";
  const major = amount / 100;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: ccy }).format(major);
  } catch {
    const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major);
    return `${formatted} ${ccy}`;
  }
}

function isPaidLikePurchaseStatus(status: string): boolean {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (/(refund|cancel|fail|pending)/.test(s)) return false;
  return true;
}

function summarizePurchaseItems(items: unknown): string {
  if (!items) return "—";
  if (Array.isArray(items)) {
    const parts: string[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      const name = typeof it.name === "string" ? it.name : typeof it.title === "string" ? it.title : typeof it.sku === "string" ? it.sku : "";
      if (!name) continue;
      const qty = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : typeof it.qty === "number" && Number.isFinite(it.qty) ? it.qty : 1;
      parts.push(qty > 1 ? `${qty}× ${name}` : name);
      if (parts.length >= 3) break;
    }
    return parts.length ? parts.join(" • ") : "—";
  }

  if (typeof items === "object") {
    const it = items as Record<string, unknown>;
    const label = typeof it.name === "string" ? it.name : typeof it.title === "string" ? it.title : "";
    return label || "—";
  }

  return "—";
}

function toNumberOrNull(v: string): number | null {
  const trimmed = (v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function AdminUserDetailsPage() {
  const params = useParams();
  const userId = String(params.id ?? "").trim();

  const [user, setUser] = useState<DetailUser | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const [eventFormType, setEventFormType] = useState("");
  const [eventFormOccurredAt, setEventFormOccurredAt] = useState("");
  const [eventFormMetadata, setEventFormMetadata] = useState("");
  const [eventSaveError, setEventSaveError] = useState<string | null>(null);

  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [purchaseFormStatus, setPurchaseFormStatus] = useState("");
  const [purchaseFormCurrency, setPurchaseFormCurrency] = useState("");
  const [purchaseFormPurchasedAt, setPurchaseFormPurchasedAt] = useState("");
  const [purchaseFormTotalMajor, setPurchaseFormTotalMajor] = useState("");
  const [purchaseFormItems, setPurchaseFormItems] = useState("");
  const [purchaseFormMetadata, setPurchaseFormMetadata] = useState("");
  const [purchaseSaveError, setPurchaseSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const [{ item }, ev, pur] = await Promise.all([
        getConsumerUser(undefined, userId),
        listConsumerUserEvents(undefined, userId, 200),
        listConsumerUserPurchases(undefined, userId),
      ]);

      const mappedUser = mapUser(item);
      setUser(mappedUser);

      const mappedEvents: EventRow[] = (ev.items ?? []).map((e) => {
        const occurredIso = String(e.occurred_at ?? "");
        return {
          id: String(e.id ?? ""),
          occurredAt: formatLocalYmdHm(occurredIso),
          occurredAtIso: occurredIso,
          typeLabel: eventTypeLabel(String(e.event_type ?? "")),
          eventType: String(e.event_type ?? ""),
          details: stringifyEventDetails(e),
          metadata: e.metadata,
        };
      });
      setEvents(mappedEvents);

      const mappedPurchases: PurchaseRow[] = (pur.items ?? []).map((p: ConsumerPurchase) => {
        const purchasedIso = String(p.purchased_at ?? "");
        const currency = String(p.currency ?? "");
        const totalMinor = Number.isFinite(p.total_amount) ? Number(p.total_amount) : 0;
        return {
          id: String(p.id ?? ""),
          purchasedAt: formatLocalYmdHm(purchasedIso),
          purchasedAtIso: purchasedIso,
          status: String(p.status ?? ""),
          currency,
          totalAmountMinor: totalMinor,
          totalLabel: formatMoneyMinor(totalMinor, currency),
          itemsSummary: summarizePurchaseItems(p.items),
          items: p.items,
          metadata: p.metadata,
        };
      });
      setPurchases(mappedPurchases);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRecomputeReliability = useCallback(async () => {
    if (!userId) return;

    setMutating(true);
    setError(null);

    try {
      await recomputeConsumerUserReliability(undefined, userId);
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setMutating(false);
    }
  }, [refresh, userId]);

  useEffect(() => {
    if (!eventDialogOpen || !selectedEvent) return;
    setEventFormType(selectedEvent.eventType);
    setEventFormOccurredAt(toDatetimeLocalValue(selectedEvent.occurredAtIso));
    setEventFormMetadata(safePrettyJson(selectedEvent.metadata));
    setEventSaveError(null);
  }, [eventDialogOpen, selectedEvent]);

  useEffect(() => {
    if (!purchaseDialogOpen || !selectedPurchase) return;
    setPurchaseFormStatus(selectedPurchase.status);
    setPurchaseFormCurrency(selectedPurchase.currency);
    setPurchaseFormPurchasedAt(toDatetimeLocalValue(selectedPurchase.purchasedAtIso));
    setPurchaseFormTotalMajor(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(selectedPurchase.totalAmountMinor / 100));
    setPurchaseFormItems(safePrettyJson(selectedPurchase.items));
    setPurchaseFormMetadata(safePrettyJson(selectedPurchase.metadata));
    setPurchaseSaveError(null);
  }, [purchaseDialogOpen, selectedPurchase]);

  const totalsByCurrency = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of purchases) {
      if (!isPaidLikePurchaseStatus(p.status)) continue;
      const ccy = (p.currency ?? "").trim() || "MAD";
      out.set(ccy, (out.get(ccy) ?? 0) + (Number.isFinite(p.totalAmountMinor) ? p.totalAmountMinor : 0));
    }
    return out;
  }, [purchases]);

  const totalSpentLabel = useMemo(() => {
    if (!totalsByCurrency.size) return "—";
    const parts: string[] = [];
    for (const [ccy, minor] of totalsByCurrency.entries()) {
      parts.push(formatMoneyMinor(minor, ccy));
    }
    return parts.join(" + ");
  }, [totalsByCurrency]);

  const statusBadge = useMemo(() => {
    const s = user?.status;
    if (!s) return null;

    const cls =
      s === "active"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-red-50 text-red-700 border-red-200";

    return <Badge className={cls}>{s === "active" ? "Actif" : "Suspendu"}</Badge>;
  }, [user?.status]);

  const statusAction = useMemo(() => {
    if (!user) return null;

    const next = user.status === "active" ? "suspended" : "active";
    const title = next === "suspended" ? "Suspendre le compte" : "Réactiver le compte";
    const description =
      next === "suspended"
        ? "L’utilisateur ne pourra plus se connecter ni acheter tant qu’il est suspendu."
        : "L’utilisateur retrouve l’accès à son compte.";
    const buttonLabel = next === "suspended" ? "Suspendre" : "Réactiver";

    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant={next === "suspended" ? "destructive" : "outline"} disabled={mutating || loading}>
            {buttonLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setMutating(true);
                setError(null);
                try {
                  await updateConsumerUserStatus(undefined, user.id, next);
                  await refresh();
                } catch (e) {
                  if (e instanceof AdminApiError) setError(e.message);
                  else setError("Erreur inattendue");
                } finally {
                  setMutating(false);
                }
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [loading, mutating, refresh, user]);

  const infoCards = useMemo(() => {
    if (!user) return null;

    const kpi = [
      { label: "Score", value: String(user.reliabilityScore), icon: ShieldCheck },
      { label: "Réservations", value: String(user.reservations), icon: CalendarClock },
      { label: "No-shows", value: String(user.noShows), icon: CalendarClock },
      { label: "Total dépensé", value: totalSpentLabel, icon: Wallet },
    ];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi.map((k) => (
          <Card key={k.label} className="border-slate-200">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                <k.icon className="h-4 w-4 text-primary" />
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-extrabold tabular-nums text-slate-900 truncate" title={k.value}>
                {k.value}
              </div>
              {k.label === "Total dépensé" ? (
                <div className="text-xs text-slate-500 mt-1">{purchases.length} achat(s)</div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }, [purchases.length, totalSpentLabel, user]);

  const eventColumns = useMemo<ColumnDef<EventRow>[]>(() => {
    return [
      { accessorKey: "occurredAt", header: "Date" },
      { accessorKey: "typeLabel", header: "Type" },
      { accessorKey: "details", header: "Détails" },
    ];
  }, []);

  const purchaseColumns = useMemo<ColumnDef<PurchaseRow>[]>(() => {
    return [
      { accessorKey: "purchasedAt", header: "Date" },
      { accessorKey: "status", header: "Statut" },
      { accessorKey: "totalLabel", header: "Montant" },
      { accessorKey: "itemsSummary", header: "Articles" },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={
          user ? (
            <div className="flex items-center gap-2">
              <span>{user.displayName || user.name || "Client"}</span>
              <HelpCircle className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-normal text-slate-500">ID: {user.id}</span>
            </div>
          ) : (
            "Fiche client"
          )
        }
        description=""
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/users" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Link>
            </Button>
            <RefreshIconButton
              className="h-9 w-9"
              loading={loading}
              disabled={mutating}
              label="Rafraîchir"
              onClick={() => void refresh()}
            />
            <Button variant="outline" onClick={() => void handleRecomputeReliability()} disabled={loading || mutating}>
              Recalculer fiabilité
            </Button>
            {statusAction}
          </div>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {user ? (
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">Informations</span>
              {statusBadge}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Prénom</div>
                  <div className="font-medium text-slate-900 truncate">{user.firstName || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Nom</div>
                  <div className="font-medium text-slate-900 truncate">{user.lastName || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    Email
                    {user.authMethod === "email" && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1 py-0">Connexion</Badge>
                    )}
                  </div>
                  <div className="font-medium text-slate-900 truncate">{user.email || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    Téléphone
                    {user.authMethod === "phone" && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1 py-0">Connexion</Badge>
                    )}
                  </div>
                  <div className="font-medium text-slate-900 truncate">{user.phone || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Ville</div>
                  <div className="font-medium text-slate-900 truncate">{user.city || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Pays</div>
                  <div className="font-medium text-slate-900 truncate">{user.country || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <CalendarClock className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Création</div>
                  <div className="font-medium text-slate-900 truncate">{formatLocalYmdHm(user.createdAt)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <CalendarClock className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Dernière activité</div>
                  <div className="font-medium text-slate-900 truncate">{formatLocalYmdHm(user.lastActivityAt)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {infoCards}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900">Achats</div>
          <div className="text-xs text-slate-500">{purchases.length} achat(s)</div>
        </div>
        <AdminDataTable
          data={purchases}
          columns={purchaseColumns}
          searchPlaceholder="Rechercher dans les achats…"
          onRowClick={(row) => {
            setSelectedPurchase(row);
            setPurchaseDialogOpen(true);
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900">Historique</div>
          <div className="text-xs text-slate-500">{events.length} événement(s)</div>
        </div>
        <AdminDataTable
          data={events}
          columns={eventColumns}
          searchPlaceholder="Rechercher dans l’historique…"
          onRowClick={(row) => {
            setSelectedEvent(row);
            setEventDialogOpen(true);
          }}
        />
      </div>

      <Dialog
        open={eventDialogOpen}
        onOpenChange={(open) => {
          setEventDialogOpen(open);
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Événement</DialogTitle>
            <DialogDescription>
              {selectedEvent ? `ID: ${selectedEvent.id}` : ""}
            </DialogDescription>
          </DialogHeader>

          {eventSaveError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{eventSaveError}</div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event_type">Type</Label>
              <Input id="event_type" value={eventFormType} onChange={(e) => setEventFormType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_occurred">Date</Label>
              <Input
                id="event_occurred"
                type="datetime-local"
                value={eventFormOccurredAt}
                onChange={(e) => setEventFormOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_metadata">Détails (JSON)</Label>
            <Textarea
              id="event_metadata"
              className="min-h-[200px] font-mono"
              value={eventFormMetadata}
              onChange={(e) => setEventFormMetadata(e.target.value)}
              placeholder={`{\n  "key": "value"\n}`}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEventDialogOpen(false);
                setSelectedEvent(null);
              }}
            >
              Fermer
            </Button>
            <Button
              onClick={async () => {
                if (!selectedEvent) return;
                setMutating(true);
                setEventSaveError(null);
                try {
                  const metadata = parseJsonOrThrow(eventFormMetadata);
                  const occurredAtIso = datetimeLocalToIso(eventFormOccurredAt);
                  await updateConsumerUserEvent(undefined, {
                    userId,
                    eventId: selectedEvent.id,
                    event_type: eventFormType.trim() || undefined,
                    occurred_at: occurredAtIso ?? undefined,
                    metadata,
                  });
                  await refresh();
                  setEventDialogOpen(false);
                  setSelectedEvent(null);
                } catch (e) {
                  if (e instanceof SyntaxError) setEventSaveError("JSON invalide");
                  else if (e instanceof AdminApiError) setEventSaveError(e.message);
                  else setEventSaveError("Erreur inattendue");
                } finally {
                  setMutating(false);
                }
              }}
              disabled={mutating}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purchaseDialogOpen}
        onOpenChange={(open) => {
          setPurchaseDialogOpen(open);
          if (!open) setSelectedPurchase(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Achat</DialogTitle>
            <DialogDescription>
              {selectedPurchase ? `ID: ${selectedPurchase.id}` : ""}
            </DialogDescription>
          </DialogHeader>

          {purchaseSaveError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{purchaseSaveError}</div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase_status">Statut</Label>
              <Input
                id="purchase_status"
                value={purchaseFormStatus}
                onChange={(e) => setPurchaseFormStatus(e.target.value)}
                placeholder="paid / refunded / pending…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase_currency">Devise</Label>
              <Input
                id="purchase_currency"
                value={purchaseFormCurrency}
                onChange={(e) => setPurchaseFormCurrency(e.target.value.toUpperCase())}
                placeholder="MAD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase_date">Date</Label>
              <Input
                id="purchase_date"
                type="datetime-local"
                value={purchaseFormPurchasedAt}
                onChange={(e) => setPurchaseFormPurchasedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase_total">Montant (ex: 149,00)</Label>
              <Input
                id="purchase_total"
                value={purchaseFormTotalMajor}
                onChange={(e) => setPurchaseFormTotalMajor(e.target.value)}
                inputMode="decimal"
              />
              <div className="text-xs text-slate-500">
                Affichage: {formatMoneyMinor(Math.max(0, Math.round((toNumberOrNull(purchaseFormTotalMajor) ?? 0) * 100)), purchaseFormCurrency || "MAD")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase_items">Articles (JSON)</Label>
              <Textarea
                id="purchase_items"
                className="min-h-[220px] font-mono"
                value={purchaseFormItems}
                onChange={(e) => setPurchaseFormItems(e.target.value)}
                placeholder={`[\n  {\n    "name": "Pack 10",\n    "quantity": 1\n  }\n]`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase_meta">Métadonnées (JSON)</Label>
              <Textarea
                id="purchase_meta"
                className="min-h-[220px] font-mono"
                value={purchaseFormMetadata}
                onChange={(e) => setPurchaseFormMetadata(e.target.value)}
                placeholder={`{\n  "provider": "stripe"\n}`}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPurchaseDialogOpen(false);
                setSelectedPurchase(null);
              }}
            >
              Fermer
            </Button>
            <Button
              onClick={async () => {
                if (!selectedPurchase) return;
                setMutating(true);
                setPurchaseSaveError(null);

                try {
                  const items = parseJsonOrThrow(purchaseFormItems);
                  const metadata = parseJsonOrThrow(purchaseFormMetadata);
                  const purchasedAtIso = datetimeLocalToIso(purchaseFormPurchasedAt);

                  const major = toNumberOrNull(purchaseFormTotalMajor);
                  const totalMinor = major === null ? null : Math.max(0, Math.round(major * 100));

                  await updateConsumerUserPurchase(undefined, {
                    userId,
                    purchaseId: selectedPurchase.id,
                    status: purchaseFormStatus.trim() || undefined,
                    currency: purchaseFormCurrency.trim() || undefined,
                    purchased_at: purchasedAtIso ?? undefined,
                    total_amount: totalMinor ?? undefined,
                    items,
                    metadata,
                  });

                  await refresh();
                  setPurchaseDialogOpen(false);
                  setSelectedPurchase(null);
                } catch (e) {
                  if (e instanceof SyntaxError) setPurchaseSaveError("JSON invalide");
                  else if (e instanceof AdminApiError) setPurchaseSaveError(e.message);
                  else setPurchaseSaveError("Erreur inattendue");
                } finally {
                  setMutating(false);
                }
              }}
              disabled={mutating}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
