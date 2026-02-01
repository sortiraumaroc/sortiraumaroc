import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, RefreshCcw, ShieldAlert, CheckCircle2, Wrench } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  listAdminFinanceDiscrepancies,
  runAdminFinanceReconciliation,
  updateAdminFinanceDiscrepancy,
  type FinanceDiscrepancyAdmin,
} from "@/lib/adminApi";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Row = {
  id: string;
  createdAt: string;
  createdAtIso: string;
  entityType: string;
  entityId: string;
  kind: string;
  expectedCents: number | null;
  actualCents: number | null;
  currency: string;
  severity: string;
  status: string;
  notes: string;
  metadata: unknown;
};

function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

function moneyFromCents(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents)) return "—";
  const unit = String(currency ?? "").trim() || "MAD";
  const val = (amountCents / 100).toFixed(2);
  return `${val} ${unit}`;
}

function statusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  const cls =
    s === "resolved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "acknowledged"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  const labels: Record<string, string> = {
    pending: "En attente",
    acknowledged: "Reconnu",
    resolved: "Résolu",
  };
  return <Badge className={cls}>{labels[s] ?? status}</Badge>;
}

function severityBadge(severity: string) {
  const s = String(severity ?? "").toLowerCase();
  const cls =
    s === "low"
      ? "bg-slate-50 text-slate-700 border-slate-200"
      : s === "medium"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  const labels: Record<string, string> = {
    low: "Faible",
    medium: "Moyenne",
    high: "Élevée",
  };
  return (
    <Badge className={cls}>
      <span className="inline-flex items-center gap-1">
        <ShieldAlert className="h-3.5 w-3.5" />
        {labels[s] ?? severity}
      </span>
    </Badge>
  );
}

function safePrettyJson(value: unknown): string {
  try {
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function mapToRow(item: FinanceDiscrepancyAdmin): Row {
  const createdAtIso = String(item.created_at ?? "");
  return {
    id: String(item.id ?? ""),
    createdAt: formatLocalYmdHm(createdAtIso),
    createdAtIso,
    entityType: String(item.entity_type ?? "—"),
    entityId: String(item.entity_id ?? "—"),
    kind: String(item.kind ?? "—"),
    expectedCents: typeof item.expected_amount_cents === "number" ? item.expected_amount_cents : null,
    actualCents: typeof item.actual_amount_cents === "number" ? item.actual_amount_cents : null,
    currency: String(item.currency ?? "MAD"),
    severity: String(item.severity ?? "high"),
    status: String(item.status ?? "open"),
    notes: item.notes == null ? "" : String(item.notes),
    metadata: item.metadata ?? null,
  };
}

export function AdminFinanceDiscrepanciesPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [entityIdFilter, setEntityIdFilter] = useState<string>("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const selected = selectedId ? items.find((x) => x.id === selectedId) ?? null : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminFinanceDiscrepancies(undefined, {
        status: statusFilter,
        severity: severityFilter,
        limit: 300,
      });
      let rows = (res.items ?? []).map(mapToRow);

      const entityFilter = entityIdFilter.trim();
      if (entityFilter) {
        rows = rows.filter((r) => r.entityId.toLowerCase().includes(entityFilter.toLowerCase()));
      }

      setItems(rows);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [entityIdFilter, severityFilter, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    return [
      { accessorKey: "createdAt", header: "Date" },
      {
        id: "severity",
        header: "Sévérité",
        cell: ({ row }) => severityBadge(row.original.severity),
      },
      { accessorKey: "kind", header: "Type" },
      { accessorKey: "entityType", header: "Entité" },
      {
        id: "entityId",
        header: "ID",
        cell: ({ row }) => <code className="text-xs">{row.original.entityId}</code>,
      },
      {
        id: "expected",
        header: "Attendu",
        cell: ({ row }) => <span className="text-sm">{moneyFromCents(row.original.expectedCents, row.original.currency)}</span>,
      },
      {
        id: "actual",
        header: "Réel",
        cell: ({ row }) => <span className="text-sm">{moneyFromCents(row.original.actualCents, row.original.currency)}</span>,
      },
      {
        id: "status",
        header: "Statut",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(row.original.id);
                setNotesDraft(row.original.notes);
                setDetailsOpen(true);
              }}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Voir
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  const runReconciliation = async () => {
    setSaving(true);
    try {
      const res = await runAdminFinanceReconciliation(undefined, { limit: 200 });
      toast({
        title: "Réconciliation lancée",
        description: `holds=${res.holdsEnsured}, settles=${res.settlesAttempted}, erreurs=${res.errorsCount}`,
      });
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) toast({ title: "Erreur", description: e.message, variant: "destructive" });
      else toast({ title: "Erreur", description: "Erreur inattendue", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = async (nextStatus: "acknowledged" | "resolved") => {
    if (!selected) return;

    setSaving(true);
    try {
      await updateAdminFinanceDiscrepancy(undefined, { id: selected.id, status: nextStatus, notes: notesDraft });
      toast({ title: "Mis à jour", description: `Statut: ${nextStatus}` });
      await refresh();
      setDetailsOpen(false);
    } catch (e) {
      if (e instanceof AdminApiError) toast({ title: "Erreur", description: e.message, variant: "destructive" });
      else toast({ title: "Erreur", description: "Erreur inattendue", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Finance — Écarts"
        description="Détection et traitement des incohérences (missing escrow, mismatch, statuts anormaux)."
      />

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Écarts récents</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading || saving}>
                <RefreshCcw className="h-4 w-4" />
                Rafraîchir
              </Button>
              <Button className="gap-2" onClick={runReconciliation} disabled={saving}>
                <Wrench className="h-4 w-4" />
                Réconciliation (auto)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Statut</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open</SelectItem>
                  <SelectItem value="acknowledged">acknowledged</SelectItem>
                  <SelectItem value="resolved">resolved</SelectItem>
                  <SelectItem value="all">all</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Sévérité</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>ID entité (contient)</Label>
              <Input
                value={entityIdFilter}
                onChange={(e) => setEntityIdFilter(e.target.value)}
                placeholder="ex: reservation UUID"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-xs text-slate-500">
            {loading ? "Chargement…" : `${items.length} ligne(s)`}
          </div>
          <AdminDataTable data={items} columns={columns} searchPlaceholder="Rechercher…" />
        </CardContent>
      </Card>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedId(null);
            setNotesDraft("");
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Détail écart</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Entité</div>
                  <div className="mt-1 text-sm font-semibold">
                    {selected.entityType} / <code className="text-xs">{selected.entityId}</code>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {severityBadge(selected.severity)}
                    {statusBadge(selected.status)}
                  </div>
                </div>

                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Montants</div>
                  <div className="mt-1 text-sm">
                    Attendu: <span className="font-semibold">{moneyFromCents(selected.expectedCents, selected.currency)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    Réel: <span className="font-semibold">{moneyFromCents(selected.actualCents, selected.currency)}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Créé: {selected.createdAt}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes (admin)</Label>
                <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Commentaire interne…" />
              </div>

              <div className="space-y-2">
                <Label>Métadonnées</Label>
                <Textarea value={safePrettyJson(selected.metadata)} readOnly className="font-mono text-xs" />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDetailsOpen(false)} disabled={saving}>
                  Fermer
                </Button>

                {String(selected.status).toLowerCase() === "open" ? (
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => void updateSelected("acknowledged")}
                    disabled={saving}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Acknowledge
                  </Button>
                ) : null}

                {String(selected.status).toLowerCase() !== "resolved" ? (
                  <Button className="gap-2" onClick={() => void updateSelected("resolved")} disabled={saving}>
                    <CheckCircle2 className="h-4 w-4" />
                    Résoudre
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Aucun élément sélectionné.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
