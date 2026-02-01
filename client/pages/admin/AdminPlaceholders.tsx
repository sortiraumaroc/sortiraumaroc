import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminApiError, listAdminLogs, listAdminNotifications, isAdminSuperadmin, type AdminLogEntry, type AdminNotification } from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export { AdminReservationsPage } from "./AdminReservationsPage";

type PaymentStatus = "paid" | "pending" | "refunded";

type PaymentRow = {
  id: string;
  paymentId: string;
  bookingId: string;
  user: string;
  establishment: string;
  amount: string;
  status: PaymentStatus;
  method: "card" | "cash" | "transfer";
  createdAtIso: string;
  escrow: boolean;
};

function paymentStatusBadge(status: PaymentStatus) {
  const cls =
    status === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  const label = status === "paid" ? "payé" : status === "pending" ? "en attente" : "remboursé";
  return <Badge className={cls}>{label}</Badge>;
}

function methodLabel(method: PaymentRow["method"]) {
  if (method === "card") return "Carte";
  if (method === "cash") return "Cash";
  return "Virement";
}

function formatShortId(prefix: string, n: number) {
  return `${prefix}${String(n).padStart(4, "0")}`;
}

function makeMockPayments(): PaymentRow[] {
  const now = Date.now();
  const rows: PaymentRow[] = [];

  const establishments = ["Le Patio", "Riad Atlas", "Surf House", "Kasbah Lounge", "Café Medina"];
  const users = ["amine@mail.com", "salma@mail.com", "youssef@mail.com", "fatima@mail.com", "mohamed@mail.com"];
  const methods: PaymentRow["method"][] = ["card", "card", "cash", "transfer"];
  const statuses: PaymentStatus[] = ["paid", "paid", "pending", "refunded", "paid", "pending"];

  for (let i = 0; i < 10; i += 1) {
    const status = statuses[i % statuses.length] as PaymentStatus;
    const method = methods[i % methods.length] as PaymentRow["method"];
    const establishment = establishments[i % establishments.length] as string;
    const user = users[(i + 1) % users.length] as string;

    const amountNumber = 120 + (i % 5) * 35 + (status === "refunded" ? 0 : (i % 3) * 10);
    const createdAtIso = new Date(now - i * 1000 * 60 * 60 * 18).toISOString();

    rows.push({
      id: `p_${i + 1}`,
      paymentId: formatShortId("PAY-", 2100 + i),
      bookingId: formatShortId("BK-", 8800 + i),
      user,
      establishment,
      amount: `${amountNumber.toFixed(2)} MAD`,
      status,
      method,
      createdAtIso,
      escrow: i % 3 === 0,
    });
  }

  return rows;
}

export function AdminPaymentsPage() {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [establishmentFilter, setEstablishmentFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [paymentEvents, setPaymentEvents] = useState<AdminNotification[]>([]);
  const [paymentEventsLoading, setPaymentEventsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPaymentEventsLoading(true);
      try {
        const res = await listAdminNotifications(undefined, { limit: 120 });
        if (cancelled) return;

        const rows = (res.items ?? []).filter((n) => {
          const t = String(n.type ?? "").toLowerCase();
          return t.includes("payment") || t.includes("refund");
        });

        setPaymentEvents(rows.slice(0, 10));
      } catch {
        if (cancelled) return;
        setPaymentEvents([]);
      } finally {
        if (!cancelled) setPaymentEventsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => makeMockPayments(), []);

  const establishmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of all) set.add(p.establishment);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const fromT = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toT = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return all.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (establishmentFilter !== "all" && p.establishment !== establishmentFilter) return false;

      const t = new Date(p.createdAtIso).getTime();
      if (fromT != null && Number.isFinite(fromT) && t < fromT) return false;
      if (toT != null && Number.isFinite(toT) && t > toT) return false;

      if (!q) return true;
      const hay = `${p.paymentId} ${p.bookingId} ${p.user} ${p.establishment}`.toLowerCase();
      return hay.includes(q);
    });
  }, [all, establishmentFilter, fromDate, search, statusFilter, toDate]);

  const columns = useMemo<ColumnDef<PaymentRow>[]>(() => {
    return [
      { accessorKey: "paymentId", header: "Payment ID" },
      { accessorKey: "bookingId", header: "Booking ID" },
      { accessorKey: "user", header: "User" },
      { accessorKey: "establishment", header: "Pro/Établissement" },
      { accessorKey: "amount", header: "Montant" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => paymentStatusBadge(row.original.status),
      },
      {
        accessorKey: "method",
        header: "Méthode",
        cell: ({ row }) => <span className="text-sm text-slate-700">{methodLabel(row.original.method)}</span>,
      },
      {
        accessorKey: "createdAtIso",
        header: "Date",
        cell: ({ row }) => <span className="tabular-nums">{formatLeJjMmAaAHeure(row.original.createdAtIso)}</span>,
      },
    ];
  }, []);

  const exportCsv = () => {
    toast({
      title: "Export (mock)",
      description: "Export CSV simulé. Branchez cette action sur un endpoint /api/admin/payments/export ensuite.",
    });
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Paiements"
        description="Transactions, statuts, méthodes de paiement, remboursements (démo)."
        actions={
          isAdminSuperadmin() ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportCsv}>
                Exporter
              </Button>
            </div>
          ) : undefined
        }
      />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Derniers événements (réels)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {paymentEventsLoading ? <div className="text-sm text-slate-600">Chargement…</div> : null}

          {!paymentEventsLoading && !paymentEvents.length ? (
            <div className="text-sm text-slate-600">Aucun événement paiement pour le moment.</div>
          ) : null}

          {!paymentEventsLoading && paymentEvents.length ? (
            <div className="space-y-2">
              {paymentEvents.map((n) => (
                <div key={n.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{n.title || "Notification"}</div>
                      <div className="mt-1 text-sm text-slate-700">{n.body}</div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">{formatLeJjMmAaAHeure(n.created_at)}{n.type ? ` · ${n.type}` : ""}</div>
                    </div>
                    <Badge className={n.read_at ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-primary text-white"}>
                      {n.read_at ? "lu" : "non lu"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 text-xs text-slate-500">
            Cette liste reflète les notifications admin (si les webhooks paiements sont actifs). La table ci-dessous reste une démo UI.
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Recherche</div>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PAY-, BK-, email, établissement…" />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Statut</div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PaymentStatus | "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="refunded">Remboursé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Établissement</div>
              <Select value={establishmentFilter} onValueChange={setEstablishmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Établissement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {establishmentOptions.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Du</div>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Au</div>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{filtered.length} résultat(s)</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter("all");
                setEstablishmentFilter("all");
                setSearch("");
                setFromDate("");
                setToDate("");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <AdminDataTable
        data={filtered}
        columns={columns}
        searchPlaceholder="Rechercher dans la table…"
        onRowClick={(row) => {
          setSelected(row);
          setDialogOpen(true);
        }}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail paiement</DialogTitle>
            <DialogDescription>Vue démo : historique et actions UI (non branchées).</DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Payment ID</div>
                  <div className="mt-1 font-mono text-sm text-slate-900">{selected.paymentId}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Booking ID</div>
                  <div className="mt-1 font-mono text-sm text-slate-900">{selected.bookingId}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Montant</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{selected.amount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Statut</div>
                  <div className="mt-2">{paymentStatusBadge(selected.status)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Escrow/garantie</div>
                  <div className="mt-2">
                    <Badge className={selected.escrow ? "bg-primary text-white" : "bg-slate-100 text-slate-700"}>
                      {selected.escrow ? "Oui" : "Non"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Historique (mock)</div>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <div>• {formatLeJjMmAaAHeure(selected.createdAtIso)} · Créé</div>
                  <div>• {selected.status === "paid" ? "Paiement confirmé" : selected.status === "pending" ? "Paiement en attente" : "Remboursement effectué"}</div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Marqué traité (mock)", description: "Action UI simulée." })}
                >
                  Marquer traité
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Rembourser (mock)", description: "Action UI simulée. À brancher sur un endpoint de remboursement." })}
                >
                  Rembourser (mock)
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ReviewStatus = "open" | "resolved" | "hidden";

type ReviewType = "avis" | "signalement";

type ReviewRow = {
  id: string;
  type: ReviewType;
  establishment: string;
  author: string;
  reason: string;
  status: ReviewStatus;
  createdAtIso: string;
  excerpt: string;
};

function reviewStatusBadge(status: ReviewStatus) {
  const cls =
    status === "open"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === "resolved"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  const label = status === "open" ? "à traiter" : status === "resolved" ? "résolu" : "masqué";
  return <Badge className={cls}>{label}</Badge>;
}

function reviewTypeBadge(type: ReviewType) {
  const cls = type === "avis" ? "bg-primary text-white" : "bg-red-600 text-white";
  return <Badge className={cls}>{type}</Badge>;
}

function makeMockReviews(): ReviewRow[] {
  const now = Date.now();

  const establishments = ["Le Patio", "Riad Atlas", "Surf House", "Kasbah Lounge", "Café Medina"];
  const authors = ["amine@mail.com", "salma@mail.com", "youssef@mail.com", "fatima@mail.com"];
  const reasons = ["Contenu inapproprié", "Spam", "Fausse info", "Conflit réservation", "Langage offensant"];
  const excerpts = [
    "Très bon accueil, mais attente un peu longue.",
    "Réservation annulée sans explication.",
    "Avis suspect / contenu copié.",
    "Je signale un comportement abusif.",
    "Service excellent, je recommande.",
  ];

  const rows: ReviewRow[] = [];
  for (let i = 0; i < 10; i += 1) {
    const type: ReviewType = i % 3 === 0 ? "signalement" : "avis";
    const status: ReviewStatus = i % 4 === 0 ? "resolved" : i % 5 === 0 ? "hidden" : "open";

    rows.push({
      id: `r_${i + 1}`,
      type,
      establishment: establishments[i % establishments.length] as string,
      author: authors[i % authors.length] as string,
      reason: reasons[i % reasons.length] as string,
      status,
      createdAtIso: new Date(now - i * 1000 * 60 * 60 * 10).toISOString(),
      excerpt: excerpts[i % excerpts.length] as string,
    });
  }

  return rows;
}

export function AdminReviewsPage() {
  const { toast } = useToast();

  const [typeFilter, setTypeFilter] = useState<ReviewType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [search, setSearch] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const all = useMemo(() => makeMockReviews(), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const fromT = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toT = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return all.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      const t = new Date(r.createdAtIso).getTime();
      if (fromT != null && Number.isFinite(fromT) && t < fromT) return false;
      if (toT != null && Number.isFinite(toT) && t > toT) return false;

      if (!q) return true;
      const hay = `${r.establishment} ${r.author} ${r.reason} ${r.excerpt}`.toLowerCase();
      return hay.includes(q);
    });
  }, [all, fromDate, search, statusFilter, toDate, typeFilter]);

  const columns = useMemo<ColumnDef<ReviewRow>[]>(() => {
    return [
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => reviewTypeBadge(row.original.type),
      },
      { accessorKey: "establishment", header: "Établissement" },
      { accessorKey: "author", header: "Auteur" },
      { accessorKey: "reason", header: "Motif" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => reviewStatusBadge(row.original.status),
      },
      {
        accessorKey: "createdAtIso",
        header: "Date",
        cell: ({ row }) => <span className="tabular-nums">{formatLeJjMmAaAHeure(row.original.createdAtIso)}</span>,
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Avis & signalements" description="Modération (démo) : revue, résolution, masquage." />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Recherche</div>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="établissement, email, motif…" />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Type</div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ReviewType | "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="avis">Avis</SelectItem>
                  <SelectItem value="signalement">Signalement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Statut</div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReviewStatus | "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="open">À traiter</SelectItem>
                  <SelectItem value="resolved">Résolu</SelectItem>
                  <SelectItem value="hidden">Masqué</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Du</div>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Au</div>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{filtered.length} résultat(s)</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {!filtered.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Aucun élément ne correspond aux filtres.
        </div>
      ) : (
        <AdminDataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="Rechercher dans la table…"
          onRowClick={(row) => {
            setSelected(row);
            setDialogOpen(true);
          }}
        />
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail</DialogTitle>
            <DialogDescription>Démo : actions UI (non branchées).</DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Type</div>
                  <div className="mt-2">{reviewTypeBadge(selected.type)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Statut</div>
                  <div className="mt-2">{reviewStatusBadge(selected.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Établissement</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{selected.establishment}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Auteur</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{selected.author}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Motif</div>
                <div className="mt-1 text-sm text-slate-900">{selected.reason}</div>
                <div className="mt-2 text-xs text-slate-500">{formatLeJjMmAaAHeure(selected.createdAtIso)}</div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Contenu (extrait)</div>
                <div className="mt-2 text-sm text-slate-800">{selected.excerpt}</div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Approuvé (mock)", description: "Action UI simulée." })}
                >
                  Approuver
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Masqué (mock)", description: "Action UI simulée." })}
                >
                  Masquer
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Résolu (mock)", description: "Action UI simulée." })}
                >
                  Marquer résolu
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { AdminDealsPage } from "./AdminDealsPage";

export { AdminSupportPage } from "./AdminSupportPage";

export { AdminContentPage } from "./AdminContentPage";

export { AdminSettingsPage } from "./AdminSettingsPage";

function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

function safePrettyJson(value: unknown): string {
  try {
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

type LogRow = {
  id: string;
  createdAt: string;
  createdAtIso: string;
  source: "admin" | "system";
  action: string;
  entityType: string;
  entityId: string;
  actorLabel: string;
  details: unknown;
};

function mapLogToRow(log: AdminLogEntry): LogRow {
  const createdIso = String(log.created_at ?? "");
  const entityType = log.entity_type == null ? "—" : String(log.entity_type);
  const entityId = log.entity_id == null ? "—" : String(log.entity_id);

  const actorLabel =
    log.source === "admin" ? "Admin" : String(log.actor_role ?? log.actor_user_id ?? "Système");

  return {
    id: String(log.id ?? ""),
    createdAt: formatLocalYmdHm(createdIso),
    createdAtIso: createdIso,
    source: log.source,
    action: String(log.action ?? ""),
    entityType,
    entityId,
    actorLabel,
    details: log.details,
  };
}

export function AdminLogsPage() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [entityIdFilter, setEntityIdFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminLogs(undefined, {
        source: sourceFilter,
        entity_type: entityTypeFilter === "all" ? undefined : entityTypeFilter,
        entity_id: entityIdFilter.trim() ? entityIdFilter.trim() : undefined,
        action: actionFilter.trim() ? actionFilter.trim() : undefined,
        limit: 250,
      });

      const mapped = (res.items ?? []).map(mapLogToRow).filter((r) => r.id);
      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityIdFilter, entityTypeFilter, sourceFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const entityTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      const v = (i.entityType ?? "").trim();
      if (v && v !== "—") set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const columns = useMemo<ColumnDef<LogRow>[]>(() => {
    return [
      { accessorKey: "createdAt", header: "Date" },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => {
          const v = row.original.source;
          const cls = v === "admin" ? "bg-slate-900 text-white" : "bg-primary text-white";
          return <Badge className={cls}>{v === "admin" ? "Admin" : "Pro"}</Badge>;
        },
      },
      { accessorKey: "action", header: "Action" },
      { accessorKey: "entityType", header: "Objet" },
      { accessorKey: "entityId", header: "ID" },
      { accessorKey: "actorLabel", header: "Acteur" },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Journaux"
        description="Journal d’audit : qui a fait quoi, quand, sur quel objet."
        actions={
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </Button>
        }
      />

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Source</div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tout</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="system">Pro (système)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Objet</div>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Objet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {entityTypeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">ID objet</div>
              <Input value={entityIdFilter} onChange={(e) => setEntityIdFilter(e.target.value)} placeholder="reservation id…" />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Action (contient)</div>
              <Input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="reservation.update…" />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}
        </CardContent>
      </Card>

      <AdminDataTable
        data={items}
        columns={columns}
        searchPlaceholder="Rechercher (action, ID, acteur…)"
        onRowClick={(row) => {
          setSelected(row);
          setDialogOpen(true);
        }}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails du log</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Date</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1">{selected.createdAt}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Action</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 break-all">{selected.action}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Objet</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 break-all">{selected.entityType}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">ID</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 break-all">{selected.entityId}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Payload / metadata</div>
                <Textarea className="mt-2 font-mono text-xs" value={safePrettyJson(selected.details)} readOnly rows={12} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
