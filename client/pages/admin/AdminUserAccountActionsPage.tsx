import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";

import { AdminApiError, listConsumerAccountActions, type ConsumerAccountAction } from "@/lib/adminApi";

type AccountActionRow = {
  id: string;
  occurredAt: string;
  actionType: string;
  userId: string;
  userEmail: string;
  userName: string;
  reasonCode: string;
  reasonText: string;
  ip: string;
};

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function formatLocalYmdHm(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isoToLocalYmdHm(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso ?? "");
  return formatLocalYmdHm(dt);
}

const columns: ColumnDef<AccountActionRow>[] = [
  {
    accessorKey: "occurredAt",
    header: "Date",
  },
  {
    accessorKey: "actionType",
    header: "Action",
    cell: ({ row }) => {
      const t = row.original.actionType;
      const badge =
        t === "account.deleted"
          ? "bg-red-50 text-red-700 border-red-200"
          : t === "account.deactivated"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : t === "account.export_requested"
              ? "bg-sky-50 text-sky-700 border-sky-200"
              : "bg-slate-50 text-slate-700 border-slate-200";

      const label =
        t === "account.deactivated"
          ? "Désactivation"
          : t === "account.reactivated"
            ? "Réactivation"
            : t === "account.deleted"
              ? "Suppression"
              : t === "account.export_requested"
                ? "Export"
                : t;

      return <Badge className={badge}>{label}</Badge>;
    },
  },
  {
    accessorKey: "userEmail",
    header: "Utilisateur",
    cell: ({ row }) => {
      const userId = row.original.userId;
      return (
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{row.original.userEmail}</div>
          <div className="text-xs text-slate-500 truncate">{userId}</div>
        </div>
      );
    },
  },
  {
    accessorKey: "reasonCode",
    header: "Raison",
    cell: ({ row }) => {
      const code = row.original.reasonCode;
      const text = row.original.reasonText;
      return (
        <div className="min-w-0">
          <div className="font-mono text-xs text-slate-700 truncate">{code || "—"}</div>
          <div className="text-xs text-slate-500 truncate">{text || ""}</div>
        </div>
      );
    },
  },
  {
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => <div className="font-mono text-xs text-slate-700">{row.original.ip || "—"}</div>,
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/admin/users/${encodeURIComponent(row.original.userId)}`}>Voir</Link>
        </Button>
      </div>
    ),
  },
];

const FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "account.deactivated", label: "Désactivations" },
  { value: "account.reactivated", label: "Réactivations" },
  { value: "account.deleted", label: "Suppressions" },
  { value: "account.export_requested", label: "Exports" },
] as const;

export function AdminUserAccountActionsPage() {
  const [items, setItems] = useState<AccountActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const refresh = async (nextFilter?: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await listConsumerAccountActions(undefined, {
        limit: 1000,
        type: nextFilter && nextFilter !== "all" ? nextFilter : undefined,
      });

      const mapped: AccountActionRow[] = (res.items ?? []).map((r: ConsumerAccountAction) => ({
        id: String(r.id ?? ""),
        occurredAt: isoToLocalYmdHm(String(r.occurred_at ?? "")),
        actionType: String(r.action_type ?? ""),
        userId: String(r.user_id ?? ""),
        userEmail: String(r.user_email ?? ""),
        userName: String(r.user_name ?? ""),
        reasonCode: r.reason_code ? String(r.reason_code) : "",
        reasonText: r.reason_text ? String(r.reason_text) : "",
        ip: r.ip ? String(r.ip) : "",
      }));

      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(filter);
  }, []);

  useEffect(() => {
    void refresh(filter);
  }, [filter]);

  const exportRows = useMemo(() => items, [items]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Désactivation & suppression"
        description="Suivi des actions utilisateurs (désactivation, réactivation, suppression, export)."
        actions={
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Button variant="outline" asChild>
              <Link to="/admin/users" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Link>
            </Button>

            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filtre" />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <RefreshIconButton
              className="h-9 w-9"
              loading={loading}
              label="Rafraîchir"
              onClick={() => void refresh(filter)}
            />
          </div>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <AdminDataTable
        data={exportRows}
        columns={columns}
        searchPlaceholder="Rechercher (email, id, action, raison, ip)…"
      />
    </div>
  );
}
