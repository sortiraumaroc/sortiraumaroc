import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { ColumnDef } from "@tanstack/react-table";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError, listAdminLogs, type AdminLogEntry } from "@/lib/adminApi";

import { formatLeJjMmAaAHeure } from "@shared/datetime";

import { prettyJson } from "../utils";

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

function formatLocalYmdHm(iso: string): string {
  const v = String(iso || "");
  return v ? formatLeJjMmAaAHeure(v) : "—";
}

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

export function AuditSettingsCard() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminLogs(undefined, {
        source: "admin",
        action: "settings.",
        limit: 50,
      });

      const mapped = (res.items ?? []).map(mapLogToRow).filter((r) => r.id);
      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo<ColumnDef<LogRow>[]>(() => {
    return [
      { accessorKey: "createdAt", header: "Date" },
      { accessorKey: "action", header: "Action" },
      { accessorKey: "entityType", header: "Objet" },
      { accessorKey: "entityId", header: "ID" },
      { accessorKey: "actorLabel", header: "Acteur" },
    ];
  }, []);

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Audit</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Historique des changements de paramètres (admin).</div>
                <div className="text-slate-500">admin_audit_log • /api/admin/logs</div>
              </div>
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/logs">Tout voir</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <AdminDataTable
          data={items}
          columns={columns}
          searchPlaceholder="Rechercher (action, objet, acteur…)"
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
              <DialogTitle>Détails</DialogTitle>
            </DialogHeader>

            {selected ? (
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium">{selected.action}</div>
                  <div className="text-xs text-slate-500">{selected.createdAt}</div>
                </div>

                <Textarea className="min-h-[260px] font-mono text-xs" readOnly value={prettyJson(selected.details)} />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
