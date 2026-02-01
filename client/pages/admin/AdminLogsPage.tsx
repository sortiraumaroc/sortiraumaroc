import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError, listAdminLogs, type AdminLogEntry } from "@/lib/adminApi";
import { formatLeJjMmAaAHeure } from "@shared/datetime";
import { useSearchParams } from "react-router-dom";

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

  const actorLabel = log.source === "admin" ? "Admin" : String(log.actor_role ?? log.actor_user_id ?? "Système");

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
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<string>(() => searchParams.get("source") ?? "all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>(() => searchParams.get("entity_type") ?? "all");
  const [entityIdFilter, setEntityIdFilter] = useState<string>(() => searchParams.get("entity_id") ?? "");
  const [actionFilter, setActionFilter] = useState<string>(() => searchParams.get("action") ?? "");

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
          <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
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

          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
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
