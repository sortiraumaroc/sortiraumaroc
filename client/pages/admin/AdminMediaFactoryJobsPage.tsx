import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { toast } from "@/hooks/use-toast";
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";

import {
  listAdminMediaFactoryJobs,
  type AdminMediaFactoryJobListItem,
} from "@/lib/adminApi";
import { MediaJobStatusBadge } from "@/components/mediaFactory/MediaStatusBadges";
import { formatDateTimeShort } from "@/components/mediaFactory/mediaFactoryStatus";

const STATUSES = [
  "paid_created",
  "brief_pending",
  "brief_submitted",
  "brief_approved",
  "scheduling",
  "shoot_confirmed",
  "checkin_pending",
  "deliverables_expected",
  "deliverables_submitted",
  "deliverables_approved",
  "editing",
  "ready_delivery",
  "scheduled_publish",
  "delivered",
  "closed",
] as const;

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 8) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function AdminMediaFactoryJobsPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AdminMediaFactoryJobListItem[]>([]);

  const [status, setStatus] = useState<string>("");
  const [establishmentId, setEstablishmentId] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listAdminMediaFactoryJobs(undefined, {
        status: status || undefined,
        establishment_id: establishmentId.trim() || undefined,
      });
      setItems(res.items ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur lors du chargement";
      toast({
        title: "MEDIA FACTORY",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo<ColumnDef<AdminMediaFactoryJobListItem, any>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Job",
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            {shortId(String(row.original.id))}
          </div>
        ),
      },
      {
        accessorKey: "title",
        header: "Titre",
        cell: ({ row }) => (
          <div className="font-semibold text-slate-900">
            {row.original.title ?? "(sans titre)"}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => <MediaJobStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "establishment_id",
        header: "Établissement",
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            {shortId(String(row.original.establishment_id))}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Créé",
        cell: ({ row }) => (
          <div className="text-xs text-slate-700">
            {formatDateTimeShort(row.original.created_at)}
          </div>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Maj",
        cell: ({ row }) => (
          <div className="text-xs text-slate-700">
            {formatDateTimeShort(row.original.updated_at)}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <AdminPageHeader
        title="Media Factory"
        description="Pilotage production (RC / Compta / Superadmin)."
      />

      <AdminVisibilityNav />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status || "all"}
          onValueChange={(v) => setStatus(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-9 w-[220px]"
          value={establishmentId}
          onChange={(e) => setEstablishmentId(e.target.value)}
          placeholder="establishment_id (optionnel)"
        />
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw
            className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          Rafraîchir
        </Button>
        <Button size="sm" variant="outline" className="gap-2" asChild>
          <Link to="/admin/production-media/qa">
            <ClipboardCheck className="h-4 w-4" />
            QA Checklist
          </Link>
        </Button>
      </div>

      <AdminDataTable
        data={items}
        columns={columns}
        isLoading={loading}
        searchPlaceholder="Rechercher par titre / id / statut…"
        onRowClick={(row) => {
          if (!row?.id) return;
          navigate(`/admin/production-media/${encodeURIComponent(row.id)}`);
        }}
      />

      <div className="mt-3 text-[11px] text-slate-500">
        Astuce: un job apparaît ici dès qu'un pack Visibilité/Media a été payé
        et qu'un job a été créé côté back-office.
      </div>
    </div>
  );
}
