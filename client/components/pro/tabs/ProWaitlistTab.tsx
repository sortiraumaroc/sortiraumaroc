import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Download,
  Hourglass,
  ListPlus,
  Loader2,
  MailQuestion,
  Search,
  Send,
  Trash2,
  TrendingUp,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function statusBadge(entry: ProWaitlistEntry): { label: string; className: string } {
  const status = String(entry.status ?? "").trim();

  if (status === "offer_sent" && !isOfferExpiredByIso(entry.offer_expires_at)) {
    return { label: "Offre envoyée", className: "bg-amber-50 text-amber-800 border-amber-200" };
  }

  if (status === "offer_sent" && isOfferExpiredByIso(entry.offer_expires_at)) {
    return { label: "Offre expirée", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }

  if (status === "waiting" || status === "queued") {
    return { label: "En attente", className: "bg-blue-50 text-blue-800 border-blue-200" };
  }

  if (status === "accepted" || status === "converted_to_booking") {
    return { label: "Acceptée", className: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  }

  if (status === "removed" || status === "cancelled" || status === "declined" || status === "expired" || status.startsWith("offer_")) {
    return { label: "Terminée", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }

  return { label: status || "Statut", className: "bg-slate-100 text-slate-700 border-slate-200" };
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

  const [activeTab, setActiveTab] = useState<"queue" | "reservations">("queue");
  const [status, setStatus] = useState<"active" | "waiting" | "offer_sent" | "all">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"position" | "date_asc" | "date_desc">("position");

  const [items, setItems] = useState<ProWaitlistEntry[]>([]);
  const [allItems, setAllItems] = useState<ProWaitlistEntry[]>([]); // For stats
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const canManage = canManageReservations(role);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [queueRes, allQueueRes, reservationsRes] = await Promise.all([
        listProWaitlist({ establishmentId: establishment.id, status }),
        listProWaitlist({ establishmentId: establishment.id, status: "all" }),
        listProReservations(establishment.id),
      ]);
      setItems((queueRes.items ?? []) as ProWaitlistEntry[]);
      setAllItems((allQueueRes.items ?? []) as ProWaitlistEntry[]);
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
  }, [establishment.id, status]);

  // Calculate stats
  const stats = useMemo(() => calculateStats(items, allItems), [items, allItems]);

  // Filter and sort entries
  const filteredAndSorted = useMemo(() => {
    let rows = items.slice();

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
  }, [items, searchQuery, sortOrder]);

  const waitlistStatusReservations = useMemo(() => {
    const list = reservations ?? [];
    return list
      .filter((r) => String(r.status ?? "").trim() === "waitlist")
      .slice()
      .sort((a, b) => (String(a.created_at ?? "") < String(b.created_at ?? "") ? 1 : -1));
  }, [reservations]);

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

          {/* Tabs for Queue vs Reservations */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "queue" | "reservations")}>
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="queue" className="gap-2">
                <Hourglass className="h-4 w-4" />
                File d'attente
                {stats.totalWaiting > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {stats.totalWaiting}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reservations" className="gap-2">
                <Users className="h-4 w-4" />
                En statut WL
                {waitlistStatusReservations.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {waitlistStatusReservations.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-4 space-y-4">
              {/* Filters */}
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

                <div className="flex gap-2">
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Actives</SelectItem>
                      <SelectItem value="waiting">En attente</SelectItem>
                      <SelectItem value="offer_sent">Offres envoyées</SelectItem>
                      <SelectItem value="all">Toutes</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
                    <SelectTrigger className="w-[160px]">
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Tri" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="position">Par position</SelectItem>
                      <SelectItem value="date_asc">Plus anciens</SelectItem>
                      <SelectItem value="date_desc">Plus récents</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

              {/* Table */}
              {!loading && filteredAndSorted.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Position</TableHead>
                        <TableHead>Date/heure</TableHead>
                        <TableHead className="w-[100px]">Personnes</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead>Statut</TableHead>
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
                            <TableCell>{startsAt ? formatLeJjMmAaAHeure(startsAt) : "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Users className="h-4 w-4 text-slate-400" />
                                <span>{people != null ? people : "—"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ref || "—"}</TableCell>
                            <TableCell>
                              <Badge className={badge.className}>{badge.label}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{offerActive ? formatOfferExpiryLabel(entry.offer_expires_at) : "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                {reservation?.id ? (
                                  <Button type="button" variant="ghost" size="sm" onClick={() => goToReservation(reservation.id)}>
                                    Voir
                                  </Button>
                                ) : null}

                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1.5"
                                  disabled={!canSendOffer || savingId === entry.id}
                                  onClick={() => handleSendOffer(entry)}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  Proposer
                                </Button>

                                {canClose ? (
                                  <CloseEntryButton disabled={!canClose || savingId === entry.id} onConfirm={(reason) => handleClose(entry, reason)} />
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
            </TabsContent>

            <TabsContent value="reservations" className="mt-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-blue-900">Réservations en statut « Liste d'attente »</div>
                    <div className="text-sm text-blue-700 mt-1">
                      Ces demandes ont le statut "waitlist" mais ne sont pas encore dans la file active. Elles peuvent être converties en
                      réservations confirmées depuis l'onglet Réservations.
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="text-sm text-slate-600 flex items-center gap-2 py-8 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Chargement...
                </div>
              ) : null}

              {!loading && !waitlistStatusReservations.length ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-emerald-100 p-4 mb-4">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Tout est en ordre</h3>
                  <p className="text-sm text-slate-600 max-w-md">
                    Aucune réservation n'est en statut liste d'attente. Toutes les demandes sont soit confirmées, soit dans la file active.
                  </p>
                </div>
              ) : null}

              {!loading && waitlistStatusReservations.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date/heure</TableHead>
                        <TableHead className="w-[100px]">Personnes</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead>Détail</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waitlistStatusReservations.map((r) => {
                        const ref = (r.booking_reference ?? r.id ?? "").trim();
                        const people = typeof r.party_size === "number" ? Math.max(1, Math.round(r.party_size)) : null;
                        const detail = r.slot_id ? "Liée à un créneau" : "Sans créneau";
                        return (
                          <TableRow key={r.id} className="text-sm">
                            <TableCell>{r.starts_at ? formatLeJjMmAaAHeure(r.starts_at) : "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Users className="h-4 w-4 text-slate-400" />
                                <span>{people != null ? people : "—"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ref || "—"}</TableCell>
                            <TableCell className="text-xs text-slate-600">{detail}</TableCell>
                            <TableCell className="text-right">
                              <Button type="button" variant="outline" size="sm" onClick={() => goToReservation(r.id)}>
                                Voir la réservation
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>

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
