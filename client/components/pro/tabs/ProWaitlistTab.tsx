import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Hourglass,
  ListPlus,
  Loader2,
  MailQuestion,
  Search,
  Send,
  Timer,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

import { toast } from "@/hooks/use-toast";

import type { Establishment, ProRole, Reservation } from "@/lib/pro/types";
import { closeProWaitlistEntry, listProReservations, listProWaitlist, sendProWaitlistOffer } from "@/lib/pro/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

import { cn } from "@/lib/utils";

import { formatLeJjMmAaAHeure, formatHeureHhHMM } from "@shared/datetime";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type ProWaitlistReservation = {
  id: string;
  booking_reference: string | null;
  establishment_id: string | null;
  starts_at: string | null;
  party_size: number | null;
  status: string | null;
  meta: unknown;
  created_at: string | null;
  phone: string | null;
};

type ProWaitlistEntry = {
  id: string;
  reservation_id: string;
  slot_id: string | null;
  user_id: string;
  status: string;
  position: number | null;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
  updated_at: string;
  reservation: ProWaitlistReservation | null;
};

function canManageReservations(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "reception";
}

function isOfferExpiredByIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return ts <= Date.now();
}

function formatOfferExpiryLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const hhmm = formatHeureHhHMM(iso);
  return hhmm ? hhmm : "—";
}

type StatusBadgeResult = {
  label: string;
  className: string;
  icon: React.ReactNode;
  priority: number; // For sorting: lower = more important
};

function statusBadge(entry: ProWaitlistEntry): StatusBadgeResult {
  const status = String(entry.status ?? "").trim();

  // En attente (jaune) - Le client attend qu'une place se libère
  if (status === "waiting" || status === "queued") {
    return {
      label: "En attente",
      className: "bg-yellow-100 text-yellow-800 border-yellow-300",
      icon: <Hourglass className="h-3.5 w-3.5" />,
      priority: 1,
    };
  }

  // Offre envoyée (orange) - Une offre a été envoyée, en attente de réponse
  if (status === "offer_sent" && !isOfferExpiredByIso(entry.offer_expires_at)) {
    return {
      label: "Offre envoyée",
      className: "bg-orange-100 text-orange-800 border-orange-300",
      icon: <Send className="h-3.5 w-3.5" />,
      priority: 2,
    };
  }

  // Offre expirée (gris) - L'offre n'a pas été acceptée à temps
  if (status === "offer_sent" && isOfferExpiredByIso(entry.offer_expires_at)) {
    return {
      label: "Offre expirée",
      className: "bg-slate-200 text-slate-700 border-slate-300",
      icon: <Timer className="h-3.5 w-3.5" />,
      priority: 4,
    };
  }

  // Acceptée/Convertie (vert) - Réservation confirmée
  if (status === "accepted" || status === "converted_to_booking") {
    return {
      label: "Confirmée",
      className: "bg-emerald-100 text-emerald-800 border-emerald-300",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      priority: 3,
    };
  }

  // Terminée/Annulée (rouge/gris) - Demande clôturée
  if (status === "removed" || status === "cancelled" || status === "declined" || status === "expired" || status.startsWith("offer_")) {
    return {
      label: "Annulée",
      className: "bg-red-100 text-red-700 border-red-300",
      icon: <XCircle className="h-3.5 w-3.5" />,
      priority: 5,
    };
  }

  return {
    label: status || "Statut",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: null,
    priority: 99,
  };
}

// ============================================================================
// Stats Dashboard Component
// ============================================================================

type WaitlistStats = {
  totalWaiting: number;
  offersSent: number;
  offersAccepted: number;
  offersExpired: number;
  avgWaitTime: number | null; // in hours
  conversionRate: number; // percentage
};

function calculateStats(entries: ProWaitlistEntry[], allEntries: ProWaitlistEntry[]): WaitlistStats {
  const waiting = entries.filter((e) => e.status === "waiting" || e.status === "queued");
  const offerSent = entries.filter((e) => e.status === "offer_sent" && !isOfferExpiredByIso(e.offer_expires_at));
  const accepted = allEntries.filter((e) => e.status === "accepted" || e.status === "converted_to_booking");
  const expired = allEntries.filter((e) => e.status === "offer_sent" && isOfferExpiredByIso(e.offer_expires_at));

  // Calculate average wait time (from created_at to offer_sent_at or now)
  let totalWaitMs = 0;
  let waitCount = 0;
  for (const e of entries) {
    const created = Date.parse(e.created_at);
    if (!Number.isFinite(created)) continue;
    const end = e.offer_sent_at ? Date.parse(e.offer_sent_at) : Date.now();
    if (!Number.isFinite(end)) continue;
    totalWaitMs += end - created;
    waitCount++;
  }
  const avgWaitTime = waitCount > 0 ? totalWaitMs / waitCount / (1000 * 60 * 60) : null;

  // Conversion rate: accepted / (accepted + expired + declined)
  const totalProcessed = accepted.length + expired.length + allEntries.filter((e) => e.status === "declined").length;
  const conversionRate = totalProcessed > 0 ? (accepted.length / totalProcessed) * 100 : 0;

  return {
    totalWaiting: waiting.length,
    offersSent: offerSent.length,
    offersAccepted: accepted.length,
    offersExpired: expired.length,
    avgWaitTime,
    conversionRate,
  };
}

function StatCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "bg-slate-50 border-slate-200",
    success: "bg-emerald-50 border-emerald-200",
    warning: "bg-amber-50 border-amber-200",
    danger: "bg-red-50 border-red-200",
  };

  const iconClasses = {
    default: "text-slate-600",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className={cn("rounded-lg border p-4", variantClasses[props.variant ?? "default"])}>
      <div className="flex items-center gap-3">
        <div className={cn("flex-shrink-0", iconClasses[props.variant ?? "default"])}>{props.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold text-slate-900">{props.value}</div>
          <div className="text-sm text-slate-600">{props.label}</div>
          {props.sublabel ? <div className="text-xs text-slate-500 mt-0.5">{props.sublabel}</div> : null}
        </div>
      </div>
    </div>
  );
}

function WaitlistStatsDashboard(props: { stats: WaitlistStats }) {
  const { stats } = props;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        icon={<Hourglass className="h-6 w-6" />}
        label="En attente"
        value={stats.totalWaiting}
        sublabel="Demandes actives"
        variant={stats.totalWaiting > 10 ? "warning" : "default"}
      />
      <StatCard
        icon={<Send className="h-6 w-6" />}
        label="Offres envoyées"
        value={stats.offersSent}
        sublabel="En cours"
        variant="warning"
      />
      <StatCard
        icon={<CheckCircle2 className="h-6 w-6" />}
        label="Taux de conversion"
        value={`${stats.conversionRate.toFixed(0)}%`}
        sublabel={`${stats.offersAccepted} acceptées`}
        variant="success"
      />
      <StatCard
        icon={<Clock className="h-6 w-6" />}
        label="Temps moyen"
        value={stats.avgWaitTime !== null ? `${stats.avgWaitTime.toFixed(1)}h` : "—"}
        sublabel="Attente moyenne"
      />
    </div>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyWaitlistState(props: { onGoToReservations: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-slate-100 p-4 mb-4">
        <MailQuestion className="h-10 w-10 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucune demande en attente</h3>
      <p className="text-sm text-slate-600 max-w-md mb-4">
        La file d'attente est vide. Les clients peuvent s'inscrire en liste d'attente quand tous vos créneaux sont complets.
      </p>
      <Button variant="outline" size="sm" onClick={props.onGoToReservations} className="gap-2">
        <Users className="h-4 w-4" />
        Voir les réservations
      </Button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProWaitlistTab({ establishment, role }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtre par statut: tous, en_attente, offre_envoyee, confirmee, terminee
  const [statusFilter, setStatusFilter] = useState<"all" | "waiting" | "offer_sent" | "confirmed" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"position" | "date_asc" | "date_desc" | "status">("position");

  const [items, setItems] = useState<ProWaitlistEntry[]>([]);
  const [allItems, setAllItems] = useState<ProWaitlistEntry[]>([]); // For stats
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const canManage = canManageReservations(role);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      // Toujours charger toutes les entrées pour pouvoir filtrer côté client
      const [allQueueRes, reservationsRes] = await Promise.all([
        listProWaitlist({ establishmentId: establishment.id, status: "all" }),
        listProReservations(establishment.id),
      ]);
      setAllItems((allQueueRes.items ?? []) as ProWaitlistEntry[]);
      setItems((allQueueRes.items ?? []) as ProWaitlistEntry[]);
      setReservations((reservationsRes.reservations ?? []) as Reservation[]);
    } catch (e) {
      setItems([]);
      setAllItems([]);
      setReservations([]);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment.id]);

  // Calculate stats
  const stats = useMemo(() => calculateStats(items, allItems), [items, allItems]);

  // Filter and sort entries
  const filteredAndSorted = useMemo(() => {
    let rows = allItems.slice();

    // Apply status filter
    if (statusFilter !== "all") {
      rows = rows.filter((entry) => {
        const status = String(entry.status ?? "").trim();
        const badge = statusBadge(entry);

        if (statusFilter === "waiting") {
          return status === "waiting" || status === "queued";
        }
        if (statusFilter === "offer_sent") {
          return status === "offer_sent" && !isOfferExpiredByIso(entry.offer_expires_at);
        }
        if (statusFilter === "confirmed") {
          return status === "accepted" || status === "converted_to_booking";
        }
        if (statusFilter === "closed") {
          return (
            (status === "offer_sent" && isOfferExpiredByIso(entry.offer_expires_at)) ||
            status === "removed" ||
            status === "cancelled" ||
            status === "declined" ||
            status === "expired"
          );
        }
        return true;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((entry) => {
        const ref = (entry.reservation?.booking_reference ?? entry.reservation?.id ?? "").toLowerCase();
        const phone = (entry.reservation?.phone ?? "").toLowerCase();
        return ref.includes(q) || phone.includes(q);
      });
    }

    // Apply sort
    rows.sort((a, b) => {
      if (sortOrder === "status") {
        const aPriority = statusBadge(a).priority;
        const bPriority = statusBadge(b).priority;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return String(a.created_at ?? "") < String(b.created_at ?? "") ? -1 : 1;
      }
      if (sortOrder === "position") {
        const ap = typeof a.position === "number" ? a.position : 999999;
        const bp = typeof b.position === "number" ? b.position : 999999;
        if (ap !== bp) return ap - bp;
        return String(a.created_at ?? "") < String(b.created_at ?? "") ? -1 : 1;
      }
      if (sortOrder === "date_asc") {
        return String(a.created_at ?? "") < String(b.created_at ?? "") ? -1 : 1;
      }
      if (sortOrder === "date_desc") {
        return String(a.created_at ?? "") > String(b.created_at ?? "") ? -1 : 1;
      }
      return 0;
    });

    return rows;
  }, [allItems, statusFilter, searchQuery, sortOrder]);

  // Compteurs par statut pour les badges de filtre
  const statusCounts = useMemo(() => {
    const counts = { waiting: 0, offer_sent: 0, confirmed: 0, closed: 0 };
    for (const entry of allItems) {
      const status = String(entry.status ?? "").trim();
      if (status === "waiting" || status === "queued") {
        counts.waiting++;
      } else if (status === "offer_sent" && !isOfferExpiredByIso(entry.offer_expires_at)) {
        counts.offer_sent++;
      } else if (status === "accepted" || status === "converted_to_booking") {
        counts.confirmed++;
      } else {
        counts.closed++;
      }
    }
    return counts;
  }, [allItems]);

  const goToReservationsTab = () => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", "reservations");
      p.delete("rid");
      return p;
    });
  };

  const goToReservation = (reservationId: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", "reservations");
      p.set("rid", reservationId);
      return p;
    });
  };

  const handleSendOffer = (entry: ProWaitlistEntry) => {
    if (!canManage || savingId) return;
    void (async () => {
      setSavingId(entry.id);
      try {
        await sendProWaitlistOffer({ waitlistEntryId: entry.id });
        toast({ title: "Offre envoyée", description: "Le client a été notifié qu'une place est disponible." });
      } catch (e) {
        toast({ title: "Impossible", description: e instanceof Error ? e.message : "Erreur" });
      } finally {
        setSavingId(null);
        await reload();
      }
    })();
  };

  const handleClose = (entry: ProWaitlistEntry, reason: string) => {
    if (!canManage || savingId) return;
    void (async () => {
      setSavingId(entry.id);
      try {
        await closeProWaitlistEntry({ waitlistEntryId: entry.id, reason });
        toast({ title: "Demande retirée", description: "La demande a été retirée de la liste d'attente." });
      } catch (e) {
        toast({ title: "Impossible", description: e instanceof Error ? e.message : "Erreur" });
      } finally {
        setSavingId(null);
        await reload();
      }
    })();
  };

  // Export CSV
  const handleExport = () => {
    if (!filteredAndSorted.length) {
      toast({ title: "Rien à exporter", description: "La liste d'attente est vide." });
      return;
    }

    const headers = ["Position", "Date demandée", "Personnes", "Référence", "Téléphone", "Statut", "Créé le"];
    const rows = filteredAndSorted.map((entry) => {
      const reservation = entry.reservation;
      const badge = statusBadge(entry);
      return [
        typeof entry.position === "number" ? entry.position : "",
        reservation?.starts_at ? formatLeJjMmAaAHeure(reservation.starts_at) : "",
        typeof reservation?.party_size === "number" ? reservation.party_size : "",
        reservation?.booking_reference ?? reservation?.id ?? entry.reservation_id ?? "",
        reservation?.phone ?? "",
        badge.label,
        entry.created_at ? formatLeJjMmAaAHeure(entry.created_at) : "",
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liste-attente-${establishment.name || "etablissement"}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Export réussi", description: `${filteredAndSorted.length} entrées exportées.` });
  };

  return (
    <div className="space-y-4">
      {/* Stats Dashboard */}
      {!loading && <WaitlistStatsDashboard stats={stats} />}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ListPlus className="h-5 w-5" />
              Liste d'attente
            </CardTitle>
            <div className="mt-1 text-sm text-slate-600">
              Gérez les demandes en attente et envoyez des offres quand une place se libère.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:items-end">
            <Button variant="outline" onClick={() => void reload()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              Rafraîchir
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={loading || !filteredAndSorted.length} className="gap-2">
              <Download className="h-4 w-4" />
              Exporter
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          ) : null}

          {/* Filtres par statut - Boutons colorés */}
          <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-200">
            <button
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                statusFilter === "all"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Tout
              <Badge variant="secondary" className="ml-1 text-xs bg-white/20">
                {allItems.length}
              </Badge>
            </button>

            <button
              onClick={() => setStatusFilter("waiting")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                statusFilter === "waiting"
                  ? "bg-yellow-500 text-white"
                  : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
              )}
            >
              <Hourglass className="h-3.5 w-3.5" />
              En attente
              {statusCounts.waiting > 0 && (
                <Badge variant="secondary" className={cn("ml-1 text-xs", statusFilter === "waiting" ? "bg-white/20" : "bg-yellow-200")}>
                  {statusCounts.waiting}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setStatusFilter("offer_sent")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                statusFilter === "offer_sent"
                  ? "bg-orange-500 text-white"
                  : "bg-orange-100 text-orange-800 hover:bg-orange-200"
              )}
            >
              <Send className="h-3.5 w-3.5" />
              Offre envoyée
              {statusCounts.offer_sent > 0 && (
                <Badge variant="secondary" className={cn("ml-1 text-xs", statusFilter === "offer_sent" ? "bg-white/20" : "bg-orange-200")}>
                  {statusCounts.offer_sent}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setStatusFilter("confirmed")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                statusFilter === "confirmed"
                  ? "bg-emerald-500 text-white"
                  : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmée
              {statusCounts.confirmed > 0 && (
                <Badge variant="secondary" className={cn("ml-1 text-xs", statusFilter === "confirmed" ? "bg-white/20" : "bg-emerald-200")}>
                  {statusCounts.confirmed}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setStatusFilter("closed")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                statusFilter === "closed"
                  ? "bg-slate-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <XCircle className="h-3.5 w-3.5" />
              Terminée
              {statusCounts.closed > 0 && (
                <Badge variant="secondary" className={cn("ml-1 text-xs", statusFilter === "closed" ? "bg-white/20" : "bg-slate-200")}>
                  {statusCounts.closed}
                </Badge>
              )}
            </button>
          </div>

          {/* Recherche et tri */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher par référence ou téléphone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Tri" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Par statut</SelectItem>
                <SelectItem value="position">Par position</SelectItem>
                <SelectItem value="date_asc">Plus anciens</SelectItem>
                <SelectItem value="date_desc">Plus récents</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement...
            </div>
          ) : null}

          {/* Empty state */}
          {!loading && !filteredAndSorted.length ? <EmptyWaitlistState onGoToReservations={goToReservationsTab} /> : null}

          {/* Table unifiée */}
          {!loading && filteredAndSorted.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Position</TableHead>
                    <TableHead className="w-[150px]">Statut</TableHead>
                    <TableHead>Date/heure</TableHead>
                    <TableHead className="w-[100px]">Personnes</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="w-[100px]">Expire</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((entry, index) => {
                    const reservation = entry.reservation;
                    const startsAt = reservation?.starts_at ?? null;
                    const ref = (reservation?.booking_reference ?? reservation?.id ?? entry.reservation_id ?? "").trim();
                    const people = typeof reservation?.party_size === "number" ? Math.max(1, Math.round(reservation.party_size)) : null;

                    const badge = statusBadge(entry);
                    const offerActive = String(entry.status ?? "").trim() === "offer_sent" && !isOfferExpiredByIso(entry.offer_expires_at);

                    const canSendOffer = canManage && (entry.status === "waiting" || entry.status === "queued" || offerActive);
                    const canClose = canManage && (entry.status === "waiting" || entry.status === "queued" || entry.status === "offer_sent");

                    return (
                      <TableRow key={entry.id} className={cn("text-sm", savingId === entry.id ? "opacity-60" : "")}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg text-primary tabular-nums">
                              #{typeof entry.position === "number" ? entry.position : index + 1}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("flex items-center gap-1.5 w-fit", badge.className)}>
                            {badge.icon}
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{startsAt ? formatLeJjMmAaAHeure(startsAt) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-slate-400" />
                            <span>{people != null ? people : "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{ref || "—"}</TableCell>
                        <TableCell className="text-xs">{offerActive ? formatOfferExpiryLabel(entry.offer_expires_at) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {reservation?.id ? (
                              <Button type="button" variant="ghost" size="sm" onClick={() => goToReservation(reservation.id)}>
                                Voir
                              </Button>
                            ) : null}

                            {canSendOffer && (
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1.5"
                                disabled={savingId === entry.id}
                                onClick={() => handleSendOffer(entry)}
                              >
                                <Send className="h-3.5 w-3.5" />
                                Proposer
                              </Button>
                            )}

                            {canClose ? (
                              <CloseEntryButton disabled={savingId === entry.id} onConfirm={(reason) => handleClose(entry, reason)} />
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {!canManage ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <XCircle className="h-4 w-4" />
              Votre rôle ne permet pas de gérer la liste d'attente (lecture seule).
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CloseEntryButton(props: { disabled: boolean; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-slate-600 hover:text-red-600" disabled={props.disabled}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer cette demande ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cela retire la demande de la liste d'attente. Le client ne sera plus notifié si une place se libère.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="waitlist-close-reason">Raison (optionnel)</Label>
          <Input
            id="waitlist-close-reason"
            placeholder="Ex : client injoignable, demande annulée..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setReason("");
            }}
          >
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              const r = reason.trim();
              setReason("");
              props.onConfirm(r);
            }}
          >
            Retirer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
