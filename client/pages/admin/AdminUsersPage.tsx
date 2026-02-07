import type { ColumnDef } from "@tanstack/react-table";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminApiError, listConsumerUsers, deleteConsumerUsers, isAdminSuperadmin } from "@/lib/adminApi";
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

function formatLocalDmy(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function isoToLocalDmy(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso ?? "");
  return formatLocalDmy(dt);
}

export function AdminUsersPage() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((u) => u.id)));
    }
  };

  const columns = useMemo((): ColumnDef<UserRow>[] => [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={items.length > 0 && selectedIds.size === items.length}
          onCheckedChange={toggleSelectAll}
          aria-label="Tout sélectionner"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelect(row.original.id)}
          aria-label={`Sélectionner ${row.original.email}`}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
    },
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
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/admin/users/${encodeURIComponent(row.original.id)}`}>Voir</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget({
                ids: [row.original.id],
                label: row.original.email || row.original.name || row.original.id,
              });
            }}
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [items, selectedIds]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());

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
        createdAt: isoToLocalDmy(String(u.created_at ?? "")),
        lastActivityAt: isoToLocalDmy(String(u.last_activity_at ?? "")),
      }));
      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    setDeleting(true);
    setDeleteResult(null);

    try {
      const res = await deleteConsumerUsers(undefined, ids);
      setDeleteResult(
        `${res.deleted_count} utilisateur(s) supprimé(s)${res.error_count > 0 ? `, ${res.error_count} erreur(s)` : ""}.`
      );
      setSelectedIds(new Set());
      void refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setDeleteResult(`Erreur : ${e.message}`);
      else setDeleteResult("Erreur inattendue lors de la suppression.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
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

      {deleteResult ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-center justify-between">
          <span>{deleteResult}</span>
          <button className="text-blue-600 hover:text-blue-800 text-xs underline" onClick={() => setDeleteResult(null)}>
            Fermer
          </button>
        </div>
      ) : null}

      {/* Bulk action bar */}
      {selectedIds.size > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-slate-700">
            <strong>{selectedIds.size}</strong> utilisateur(s) sélectionné(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Désélectionner
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-2"
              onClick={() => {
                setDeleteTarget({
                  ids: Array.from(selectedIds),
                  label: `${selectedIds.size} utilisateur(s)`,
                });
              }}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer ({selectedIds.size})
            </Button>
          </div>
        </div>
      ) : null}

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

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.ids.length === 1 ? (
                <>
                  Voulez-vous vraiment supprimer l'utilisateur <strong>{deleteTarget.label}</strong> ?
                  Cette action est irréversible. Le compte sera anonymisé et les données d'authentification supprimées.
                </>
              ) : (
                <>
                  Voulez-vous vraiment supprimer <strong>{deleteTarget?.label}</strong> ?
                  Cette action est irréversible. Les comptes seront anonymisés et les données d'authentification supprimées.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) void handleDelete(deleteTarget.ids);
              }}
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
