import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, RefreshCcw, Send, XCircle } from "lucide-react";

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
  listAdminFinancePayouts,
  updateAdminFinancePayout,
  isAdminSuperadmin,
  type FinancePayoutAdmin,
} from "@/lib/adminApi";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Row = {
  id: string;
  requestedAt: string;
  requestedAtIso: string;
  processedAt: string;
  processedAtIso: string | null;
  establishmentId: string;
  establishmentName: string;
  establishmentCity: string;
  batchPeriod: string;
  reservationsCount: number;
  commissionTotalCents: number;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerReference: string;
  failureReason: string;
  idempotencyKey: string;
  metadata: unknown;
};

function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

function parseCents(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
}

function parseIntSafe(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
}

function parseBatchPeriod(idempotencyKey: string): string {
  const key = String(idempotencyKey ?? "");

  // Weekly (legacy): payout_batch:<estId>:<CUR>:YYYY-MM-DD
  const week = key.match(/payout_batch:[^:]+:[^:]+:(\d{4}-\d{2}-\d{2})/);
  if (week?.[1]) return `Semaine ${week[1]}`;

  // Monthly: payout_batch_month:<estId>:<CUR>:YYYY-MM
  const month = key.match(/payout_batch_month:[^:]+:[^:]+:(\d{4}-\d{2})/);
  if (month?.[1]) return `Mois ${month[1]}`;

  return "—";
}

function moneyFromCents(amountCents: number, currency: string): string {
  const unit = String(currency ?? "").trim() || "MAD";
  const val = (amountCents / 100).toFixed(2);
  return `${val} ${unit}`;
}

function statusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  const cls =
    s === "sent"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "processing"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : s === "failed"
          ? "bg-red-50 text-red-700 border-red-200"
          : s === "cancelled"
            ? "bg-slate-50 text-slate-700 border-slate-200"
            : "bg-sky-50 text-sky-800 border-sky-200";
  const labels: Record<string, string> = {
    pending: "En attente",
    processing: "En cours",
    sent: "Envoyé",
    failed: "Échoué",
    cancelled: "Annulé",
  };
  return <Badge className={cls}>{labels[s] ?? status}</Badge>;
}

function safePrettyJson(value: unknown): string {
  try {
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function escapeCsvCell(value: string): string {
  if (!value.includes("\n") && !value.includes(",") && !value.includes('"')) return value;
  return `"${value.replace(/\"/g, '""')}"`;
}

function downloadCsv(filename: string, lines: string[]) {
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function mapToRow(item: FinancePayoutAdmin): Row {
  const requestedAtIso = String((item as any).requested_at ?? (item as any).created_at ?? "");
  const processedAtIso = (item as any).processed_at == null ? null : String((item as any).processed_at);
  const est = (item as any).establishment as any;
  const metadata = (item as any).metadata ?? null;
  const metadataObj = metadata && typeof metadata === "object" ? (metadata as any) : null;

  const idempotencyKey = (item as any).idempotency_key == null ? "" : String((item as any).idempotency_key);

  return {
    id: String((item as any).id ?? ""),
    requestedAt: formatLocalYmdHm(requestedAtIso),
    requestedAtIso,
    processedAt: processedAtIso ? formatLocalYmdHm(processedAtIso) : "—",
    processedAtIso,
    establishmentId: String((item as any).establishment_id ?? ""),
    establishmentName: est?.name ? String(est.name) : "—",
    establishmentCity: est?.city ? String(est.city) : "",
    batchPeriod: parseBatchPeriod(idempotencyKey),
    reservationsCount: parseIntSafe(metadataObj?.reservations_count),
    commissionTotalCents: parseCents(metadataObj?.commission_cents_total),
    amountCents: parseCents((item as any).amount_cents),
    currency: String((item as any).currency ?? "MAD"),
    status: String((item as any).status ?? "pending"),
    provider: (item as any).provider == null ? "—" : String((item as any).provider),
    providerReference: (item as any).provider_reference == null ? "" : String((item as any).provider_reference),
    failureReason: (item as any).failure_reason == null ? "" : String((item as any).failure_reason),
    idempotencyKey,
    metadata,
  };
}

export function AdminFinancePayoutsPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [establishmentIdFilter, setEstablishmentIdFilter] = useState<string>("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<string>("pending");
  const [providerDraft, setProviderDraft] = useState<string>("");
  const [providerRefDraft, setProviderRefDraft] = useState<string>("");
  const [failureReasonDraft, setFailureReasonDraft] = useState<string>("");
  const [metadataDraft, setMetadataDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const selected = selectedId ? items.find((x) => x.id === selectedId) ?? null : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminFinancePayouts(undefined, {
        status: statusFilter,
        establishment_id: establishmentIdFilter.trim() || undefined,
        currency: currencyFilter.trim() || undefined,
        limit: 300,
      });

      setItems((res.items ?? []).map(mapToRow));
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [currencyFilter, establishmentIdFilter, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    return [
      { accessorKey: "requestedAt", header: "Demandé le" },
      {
        id: "establishment",
        header: "Établissement",
        cell: ({ row }) => (
          <div className="min-w-[240px]">
            <div className="font-medium text-slate-900">{row.original.establishmentName}</div>
            <div className="text-xs text-slate-600">
              {row.original.establishmentCity ? `${row.original.establishmentCity} · ` : ""}
              <code className="text-[11px]">{row.original.establishmentId || "—"}</code>
            </div>
          </div>
        ),
      },
      {
        id: "batch",
        header: "Période",
        cell: ({ row }) => <span className="text-sm">{row.original.batchPeriod}</span>,
      },
      {
        id: "count",
        header: "Nb résa",
        cell: ({ row }) => <span className="text-sm">{row.original.reservationsCount || "—"}</span>,
      },
      {
        id: "amount",
        header: "Montant",
        cell: ({ row }) => <span className="text-sm">{moneyFromCents(row.original.amountCents, row.original.currency)}</span>,
      },
      {
        id: "status",
        header: "Statut",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      { accessorKey: "provider", header: "Provider" },
      {
        id: "processedAt",
        header: "Traité le",
        cell: ({ row }) => <span className="text-sm text-slate-700">{row.original.processedAt}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(row.original.id);
                setStatusDraft(row.original.status);
                setProviderDraft(row.original.provider === "—" ? "" : row.original.provider);
                setProviderRefDraft(row.original.providerReference);
                setFailureReasonDraft(row.original.failureReason);
                setMetadataDraft(safePrettyJson(row.original.metadata));
                setDetailsOpen(true);
              }}
            >
              <Eye className="h-4 w-4" />
              Gérer
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  const exportCsv = (rows: Row[]) => {
    const header = [
      "id",
      "requested_at",
      "processed_at",
      "status",
      "establishment_id",
      "establishment_name",
      "establishment_city",
      "amount_cents",
      "currency",
      "provider",
      "provider_reference",
      "failure_reason",
      "idempotency_key",
    ].join(",");

    const lines = rows.map((r) => {
      const parts = [
        r.id,
        r.requestedAtIso,
        r.processedAtIso ?? "",
        r.status,
        r.establishmentId,
        r.establishmentName,
        r.establishmentCity,
        String(r.amountCents),
        r.currency,
        r.provider,
        r.providerReference,
        r.failureReason,
        r.idempotencyKey,
      ].map((x) => escapeCsvCell(String(x ?? "")));

      return parts.join(",");
    });

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`payouts_${stamp}.csv`, [header, ...lines]);
  };

  const updateSelected = async (patch: { status?: string }) => {
    if (!selected) return;

    setSaving(true);
    try {
      let metadata: Record<string, unknown> | null | undefined = undefined;
      const metadataStr = metadataDraft.trim();
      if (metadataStr) {
        try {
          const parsed = JSON.parse(metadataStr) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
          else metadata = null;
        } catch {
          metadata = null;
        }
      } else {
        metadata = null;
      }

      await updateAdminFinancePayout(undefined, {
        id: selected.id,
        status: patch.status ?? statusDraft,
        provider: providerDraft || null,
        provider_reference: providerRefDraft || null,
        failure_reason: failureReasonDraft || null,
        metadata,
      });

      toast({ title: "Payout mis à jour", description: `Statut: ${(patch.status ?? statusDraft) || "—"}` });
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
        title="Finance — Payouts"
        description="Suivi des règlements à envoyer aux établissements (créés automatiquement lors des settlements)."
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-base">Filtres</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Statut</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="processing">En cours</SelectItem>
                <SelectItem value="sent">Envoyé</SelectItem>
                <SelectItem value="failed">Échoué</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
                <SelectItem value="all">Tous</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Establishment ID</Label>
            <Input value={establishmentIdFilter} onChange={(e) => setEstablishmentIdFilter(e.target.value)} placeholder="uuid…" />
          </div>

          <div className="space-y-2">
            <Label>Devise</Label>
            <Input value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} placeholder="MAD" />
          </div>
        </CardContent>
      </Card>

      <AdminDataTable data={items} columns={columns} searchPlaceholder="Rechercher (nom / id / provider / statut)" onExportCsv={isAdminSuperadmin() ? exportCsv : undefined} />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payout</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-600">Établissement</div>
                  <div className="font-medium text-slate-900">{selected.establishmentName}</div>
                  <div className="text-xs text-slate-600">{selected.establishmentCity || ""}</div>
                  <div className="mt-2 text-xs">
                    <span className="text-slate-600">ID: </span>
                    <code className="text-[11px]">{selected.establishmentId}</code>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-600">Montant</div>
                  <div className="text-lg font-semibold text-slate-900">{moneyFromCents(selected.amountCents, selected.currency)}</div>
                  <div className="mt-1 text-xs text-slate-600">Période: {selected.batchPeriod}</div>
                  <div className="mt-1 text-xs text-slate-600">Nb résa: {selected.reservationsCount || "—"}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Commission totale: {moneyFromCents(selected.commissionTotalCents, selected.currency)}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Demandé: {selected.requestedAt} · Traité: {selected.processedAt}
                  </div>
                  <div className="mt-2">{statusBadge(selected.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Select value={statusDraft} onValueChange={setStatusDraft}>
                    <SelectTrigger>
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="processing">En cours</SelectItem>
                      <SelectItem value="sent">Envoyé</SelectItem>
                      <SelectItem value="failed">Échoué</SelectItem>
                      <SelectItem value="cancelled">Annulé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Input value={providerDraft} onChange={(e) => setProviderDraft(e.target.value)} placeholder="manual" />
                </div>

                <div className="space-y-2">
                  <Label>Référence provider</Label>
                  <Input value={providerRefDraft} onChange={(e) => setProviderRefDraft(e.target.value)} placeholder="virement #…" />
                </div>

                <div className="space-y-2">
                  <Label>Failure reason</Label>
                  <Input value={failureReasonDraft} onChange={(e) => setFailureReasonDraft(e.target.value)} placeholder="raison…" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Metadata (JSON)</Label>
                <Textarea value={metadataDraft} onChange={(e) => setMetadataDraft(e.target.value)} className="min-h-[160px] font-mono text-xs" />
                <div className="text-xs text-slate-600">
                  Conseil: ajoutez des champs comme <code>bank_transfer_ref</code>, <code>processed_by</code>, <code>notes</code>.
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  <div>
                    <span className="text-slate-600">Payout ID: </span>
                    <code className="text-[11px]">{selected.id}</code>
                  </div>
                  {selected.idempotencyKey ? (
                    <div>
                      <span className="text-slate-600">Idempotency: </span>
                      <code className="text-[11px]">{selected.idempotencyKey}</code>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={saving}
                    onClick={() => {
                      setStatusDraft("sent");
                      void updateSelected({ status: "sent" });
                    }}
                  >
                    <Send className="h-4 w-4" />
                    Marquer envoyé
                  </Button>

                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={saving}
                    onClick={() => {
                      setStatusDraft("failed");
                      void updateSelected({ status: "failed" });
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Marquer échec
                  </Button>

                  <Button disabled={saving} onClick={() => void updateSelected({})}>
                    Enregistrer
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Aucun payout sélectionné.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
