import type { ColumnDef } from "@tanstack/react-table";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminApiError, listConsumerUsers, isAdminSuperadmin } from "@/lib/adminApi";
import { downloadAdminUsersCsv, downloadAdminUsersPdf, type AdminUserExportRow } from "@/lib/adminUsersExport";

type UserRow = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  city: string;
  country: string;
  reliabilityScore: number;
  reservations: number;
  noShows: number;
  createdAt: string;
  lastActivityAt: string;
};

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToLocalYmd(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso ?? "");
  return formatLocalYmd(dt);
}

const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => <div className="font-mono text-xs">{row.original.id}</div>,
  },
  {
    accessorKey: "name",
    header: "Nom",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "city",
    header: "Ville",
  },
  {
    accessorKey: "country",
    header: "Pays",
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => {
      const s = row.original.status;
      return (
        <Badge
          className={
            s === "active"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200"
          }
        >
          {s === "active" ? "Actif" : "Suspendu"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "reliabilityScore",
    header: "Score",
    cell: ({ row }) => <div className="font-semibold">{row.original.reliabilityScore}</div>,
  },
  {
    accessorKey: "reservations",
    header: "Réservations",
  },
  {
    accessorKey: "noShows",
    header: "No-shows",
  },
  {
    accessorKey: "createdAt",
    header: "Création",
  },
  {
    accessorKey: "lastActivityAt",
    header: "Dernière activité",
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/admin/users/${encodeURIComponent(row.original.id)}`}>Voir</Link>
        </Button>
      </div>
    ),
  },
];

export function AdminUsersPage() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listConsumerUsers(undefined);
      const mapped: UserRow[] = (res.items ?? []).map((u) => ({
        id: String(u.id ?? ""),
        name: String(u.name ?? ""),
        email: String(u.email ?? ""),
        status: u.status === "suspended" ? "suspended" : "active",
        city: String(u.city ?? ""),
        country: String(u.country ?? ""),
        reliabilityScore: Number.isFinite(u.reliability_score) ? Number(u.reliability_score) : 0,
        reservations: Number.isFinite(u.reservations_count) ? Number(u.reservations_count) : 0,
        noShows: Number.isFinite(u.no_shows_count) ? Number(u.no_shows_count) : 0,
        createdAt: isoToLocalYmd(String(u.created_at ?? "")),
        lastActivityAt: isoToLocalYmd(String(u.last_activity_at ?? "")),
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
    void refresh();
  }, []);

  const exportRows = useMemo((): AdminUserExportRow[] => {
    return items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      statusLabel: u.status === "active" ? "Actif" : "Suspendu",
      city: u.city,
      country: u.country,
      reliabilityScore: u.reliabilityScore,
      reservations: u.reservations,
      noShows: u.noShows,
      createdAt: u.createdAt,
      lastActivityAt: u.lastActivityAt,
    }));
  }, [items]);

  const byId = useMemo(() => {
    const out = new Map<string, AdminUserExportRow>();
    for (const r of exportRows) out.set(r.id, r);
    return out;
  }, [exportRows]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Utilisateurs"
        description="Gestion B2C: profils, statuts, fiabilité, exports."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/users/account-actions">Désactivation & suppression</Link>
            </Button>
            <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
          </div>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <AdminDataTable
        data={items}
        columns={columns}
        searchPlaceholder="Rechercher un utilisateur (nom, email, id, ville, pays)…"
        onExportCsv={isAdminSuperadmin() ? (rows) => {
          const mapped = rows.map((r) => byId.get(r.id)).filter(Boolean) as AdminUserExportRow[];
          downloadAdminUsersCsv({ users: mapped, title: "Utilisateurs (filtré)" });
        } : undefined}
        onExportPdf={isAdminSuperadmin() ? (rows) => {
          const mapped = rows.map((r) => byId.get(r.id)).filter(Boolean) as AdminUserExportRow[];
          downloadAdminUsersPdf({ users: mapped, title: "Utilisateurs (filtré)" });
        } : undefined}
      />
    </div>
  );
}
