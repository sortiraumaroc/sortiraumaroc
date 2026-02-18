import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { AdminApiError, listAdminLogs, type AdminLogEntry } from "@/lib/adminApi";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

type LogRow = {
  id: string;
  createdAt: string;
  createdAtIso: string;
  action: string;
  actorLabel: string;
  actorEmail: string;
  details: unknown;
};

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

function mapLogToRow(log: AdminLogEntry): LogRow {
  const createdIso = String(log.created_at ?? "");

  const actorLabel = log.actor_name
    ? log.actor_name
    : log.actor_email
      ? log.actor_email
      : "Admin";

  return {
    id: String(log.id ?? ""),
    createdAt: formatLocalYmdHm(createdIso),
    createdAtIso: createdIso,
    action: String(log.action ?? ""),
    actorLabel,
    actorEmail: log.actor_email ?? "",
    details: log.details,
  };
}

type AdminAuditHistoryCardProps = {
  entityType: string;
  entityId: string;
  title?: string;
};

export function AdminAuditHistoryCard({
  entityType,
  entityId,
  title = "Historique de modification",
}: AdminAuditHistoryCardProps) {
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const refresh = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminLogs(undefined, {
        entity_type: entityType,
        entity_id: entityId,
        limit: 100,
      });

      const mapped = (res.items ?? []).map(mapLogToRow).filter((r) => r.id);
      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns = useMemo<ColumnDef<LogRow>[]>(
    () => [
      { accessorKey: "createdAt", header: "Date" },
      { accessorKey: "action", header: "Action" },
      { accessorKey: "actorLabel", header: "Acteur" },
    ],
    [],
  );

  if (!entityId) return null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold">{title}</CardTitle>
          <span className="text-xs text-slate-500">{items.length}</span>
        </div>
        <RefreshIconButton
          className="h-8 w-8"
          loading={loading}
          label="Rafraîchir"
          onClick={() => void refresh()}
        />
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <AdminDataTable
          data={items}
          columns={columns}
          searchPlaceholder="Rechercher (action, acteur…)"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-500">Date</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1">
                      {selected.createdAt}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-500">Action</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1 break-all">
                      {selected.action}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">Acteur</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1">
                    {selected.actorLabel}
                  </div>
                  {selected.actorEmail ? (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {selected.actorEmail}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500">
                    Payload / metadata
                  </div>
                  <Textarea
                    className="mt-2 font-mono text-xs"
                    value={safePrettyJson(selected.details)}
                    readOnly
                    rows={10}
                  />
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
