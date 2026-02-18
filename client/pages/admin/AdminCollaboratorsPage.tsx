import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit3, Loader2, MoreHorizontal, RefreshCw, Trash2, UserCheck, UserX } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { CollaboratorFormDialog } from "@/components/admin/collaborators/CollaboratorFormDialog";

import type { AdminCollaborator, AdminCollaboratorFormData, AdminRole } from "@/lib/admin/permissions";
import { toast } from "@/hooks/use-toast";
import { loadAdminApiKey, loadAdminSessionToken, decodeAdminSessionToken } from "@/lib/adminApi";

async function fetchAdmin(path: string, options?: RequestInit) {
  const adminKey = loadAdminApiKey();
  const sessionToken = loadAdminSessionToken();

  const res = await fetch(path, {
    ...options,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
      ...(adminKey ? { "x-admin-key": adminKey } : {}),
      ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  return data;
}

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName ?? "").trim().charAt(0).toUpperCase();
  const l = (lastName ?? "").trim().charAt(0).toUpperCase();
  return f + l || "??";
}

function getDisplayName(collab: AdminCollaborator): string {
  if (collab.displayName?.trim()) return collab.displayName.trim();
  return `${collab.firstName} ${collab.lastName}`.trim();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminCollaboratorsPage() {
  const [collaborators, setCollaborators] = useState<AdminCollaborator[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingCollaborator, setEditingCollaborator] = useState<AdminCollaborator | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<AdminCollaborator | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detect if the current logged-in admin is a superadmin
  const currentUserIsSuperadmin = useMemo(() => {
    const session = decodeAdminSessionToken();
    // If using API key (no session token), they are superadmin
    if (!session && loadAdminApiKey()) return true;
    return session?.role === "superadmin";
  }, []);

  const roleMap = useMemo(() => {
    const map = new Map<string, AdminRole>();
    for (const r of roles) map.set(r.id, r);
    return map;
  }, [roles]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [collabRes, rolesRes] = await Promise.all([
        fetchAdmin("/api/admin/collaborators"),
        fetchAdmin("/api/admin/roles"),
      ]);

      if (!collabRes.ok) throw new Error(collabRes.error || "Erreur lors du chargement des collaborateurs");
      if (!rolesRes.ok) throw new Error(rolesRes.error || "Erreur lors du chargement des rôles");

      setCollaborators(collabRes.items ?? []);
      setRoles(rolesRes.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, [fetchAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = () => {
    setEditingCollaborator(null);
    setFormOpen(true);
  };

  const handleEdit = (collab: AdminCollaborator) => {
    setEditingCollaborator(collab);
    setFormOpen(true);
  };

  const handleSave = async (data: AdminCollaboratorFormData) => {
    if (editingCollaborator) {
      // Mise à jour
      const res = await fetchAdmin(`/api/admin/collaborators/${editingCollaborator.id}/update`, {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error(res.error || "Erreur lors de la mise à jour");

      setCollaborators((prev) =>
        prev.map((c) => (c.id === editingCollaborator.id ? res.item : c))
      );
      toast({ title: "Collaborateur mis à jour", description: `${data.firstName} ${data.lastName}` });
    } else {
      // Création
      const res = await fetchAdmin("/api/admin/collaborators", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error(res.error || "Erreur lors de la création");

      setCollaborators((prev) => [res.item, ...prev]);
      toast({ title: "Collaborateur créé", description: `${data.firstName} ${data.lastName}` });
    }
  };

  const handleToggleStatus = async (collab: AdminCollaborator) => {
    const endpoint = collab.status === "active"
      ? `/api/admin/collaborators/${collab.id}/suspend`
      : `/api/admin/collaborators/${collab.id}/reactivate`;

    try {
      const res = await fetchAdmin(endpoint, { method: "POST" });
      if (!res.ok) throw new Error(res.error || "Erreur");

      setCollaborators((prev) =>
        prev.map((c) => (c.id === collab.id ? res.item : c))
      );

      toast({
        title: res.item.status === "active" ? "Compte réactivé" : "Compte suspendu",
        description: getDisplayName(collab),
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de modifier le statut.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (collab: AdminCollaborator) => {
    setCollaboratorToDelete(collab);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!collaboratorToDelete) return;
    setDeleting(true);
    try {
      const res = await fetchAdmin(`/api/admin/collaborators/${collaboratorToDelete.id}/delete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(res.error || "Erreur");

      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorToDelete.id));
      toast({ title: "Collaborateur supprimé", description: getDisplayName(collaboratorToDelete) });
      setDeleteDialogOpen(false);
      setCollaboratorToDelete(null);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de supprimer le collaborateur.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async (collab: AdminCollaborator) => {
    // Generate a temporary password and send it
    const tempPassword = `Sam-${Date.now().toString(36)}`;

    try {
      const res = await fetchAdmin(`/api/admin/collaborators/${collab.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: tempPassword }),
      });
      if (!res.ok) throw new Error(res.error || "Erreur");

      toast({
        title: "Mot de passe réinitialisé",
        description: `Nouveau mot de passe temporaire : ${tempPassword}`,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de réinitialiser le mot de passe.",
        variant: "destructive",
      });
    }
  };

  const columns: ColumnDef<AdminCollaborator>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Collaborateur",
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt={getDisplayName(c)} /> : null}
                <AvatarFallback className="bg-primary text-white font-bold text-sm">
                  {getInitials(c.firstName, c.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{getDisplayName(c)}</div>
                <div className="text-xs text-slate-500 truncate">{c.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "function",
        header: "Fonction",
        cell: ({ row }) => <div className="text-sm text-slate-700">{row.original.function || "—"}</div>,
      },
      {
        accessorKey: "roleId",
        header: "Rôle",
        cell: ({ row }) => {
          const role = roleMap.get(row.original.roleId);
          const isSuperadmin = row.original.roleId === "superadmin";
          return (
            <Badge
              className={
                isSuperadmin
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }
            >
              {role?.name ?? row.original.roleId}
            </Badge>
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: "Entrée",
        cell: ({ row }) => <div className="text-sm text-slate-600 tabular-nums">{formatDate(row.original.joinedAt)}</div>,
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
        accessorKey: "lastLoginAt",
        header: "Dernière connexion",
        cell: ({ row }) => (
          <div className="text-sm text-slate-600 tabular-nums">{formatDateTime(row.original.lastLoginAt)}</div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const c = row.original;
          const targetIsSuperadmin = c.roleId === "superadmin";
          // Only block actions on superadmin accounts if the current user is NOT superadmin
          const cannotManageTarget = targetIsSuperadmin && !currentUserIsSuperadmin;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleEdit(c)}
                    className="gap-2"
                    disabled={cannotManageTarget}
                  >
                    <Edit3 className="h-4 w-4" />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleResetPassword(c)}
                    className="gap-2"
                    disabled={cannotManageTarget}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reset mot de passe
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void handleToggleStatus(c)}
                    className="gap-2"
                    disabled={cannotManageTarget}
                  >
                    {c.status === "active" ? (
                      <>
                        <UserX className="h-4 w-4" />
                        Suspendre
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4" />
                        Réactiver
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDeleteClick(c)}
                    className="gap-2 text-red-600 focus:text-red-600"
                    disabled={cannotManageTarget}
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [roleMap]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Collaborateurs"
        description="Gérez les comptes internes de l'équipe Sortir Au Maroc : profils, fonctions, rôles et permissions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualiser
            </Button>
            <Button onClick={handleCreate} className="bg-primary text-white hover:bg-primary/90">
              Créer un collaborateur
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <AdminDataTable
        data={collaborators}
        columns={columns}
        searchPlaceholder="Rechercher un collaborateur…"
        isLoading={loading}
      />

      <CollaboratorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        collaborator={editingCollaborator}
        roles={roles}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le collaborateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le compte de{" "}
              <strong>{collaboratorToDelete ? getDisplayName(collaboratorToDelete) : ""}</strong> sera définitivement
              supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
