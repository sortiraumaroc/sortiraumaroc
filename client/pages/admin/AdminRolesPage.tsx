import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  loadAdminApiKey,
  loadAdminSessionToken,
  listAdminRoles,
  createAdminRole,
  updateAdminRole,
  deleteAdminRole,
  type AdminRoleDb,
} from "@/lib/adminApi";
import { ADMIN_ACTIONS, ADMIN_MODULES, type AdminAction, type AdminModule } from "@/lib/admin/permissions";

const ACTION_LABELS: Record<AdminAction, string> = {
  read: "Lecture",
  write: "Écriture",
  delete: "Suppression",
  approve: "Validation",
  export: "Export",
  bulk: "Actions en masse",
};

const MODULE_LABELS: Record<AdminModule, string> = {
  dashboard: "Tableau de bord",
  users: "Utilisateurs",
  pros: "Pros",
  establishments: "Établissements",
  reservations: "Réservations",
  payments: "Paiements",
  reviews: "Avis & signalements",
  deals: "Offres & packs",
  support: "Support",
  content: "Contenu",
  settings: "Paramètres",
  collaborators: "Collaborateurs",
  roles: "Rôles & permissions",
  logs: "Journaux",
  finance: "Règles financières",
};

function getFlag(role: AdminRoleDb, module: AdminModule, action: AdminAction): boolean {
  return role.permissions?.[module]?.[action] === true;
}

function getAdminKey(): string | undefined {
  return loadAdminApiKey() || loadAdminSessionToken() || undefined;
}

export function AdminRolesPage() {
  const { toast } = useToast();

  const [roles, setRoles] = useState<AdminRoleDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create role dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<AdminRoleDb | null>(null);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? roles[0] ?? null,
    [roles, selectedId],
  );

  const loadRoles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminRoles(getAdminKey());
      setRoles(res.roles ?? []);
      if (!selectedId && res.roles?.length > 0) {
        setSelectedId(res.roles[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement des rôles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, []);

  const handleCreateRole = async () => {
    if (!newRoleId.trim() || !newRoleName.trim()) {
      toast({ title: "Erreur", description: "L'ID et le nom sont requis", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await createAdminRole(getAdminKey(), {
        id: newRoleId.trim().toLowerCase().replace(/\s+/g, "_"),
        name: newRoleName.trim(),
        permissions: {},
      });
      setRoles((prev) => [...prev, res.role]);
      setSelectedId(res.role.id);
      setCreateDialogOpen(false);
      setNewRoleId("");
      setNewRoleName("");
      toast({ title: "Rôle créé" });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de la création",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePermission = async (module: AdminModule, action: AdminAction, checked: boolean) => {
    if (!selected || selected.id === "superadmin") return;

    const newPermissions = {
      ...selected.permissions,
      [module]: {
        ...(selected.permissions[module] ?? {}),
        [action]: checked,
      },
    };

    // Optimistic update
    setRoles((prev) =>
      prev.map((r) => (r.id === selected.id ? { ...r, permissions: newPermissions } : r)),
    );

    try {
      await updateAdminRole(getAdminKey(), selected.id, { permissions: newPermissions });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de la mise à jour",
        variant: "destructive",
      });
      // Revert on error
      void loadRoles();
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;

    setSaving(true);
    try {
      await deleteAdminRole(getAdminKey(), roleToDelete.id);
      setRoles((prev) => prev.filter((r) => r.id !== roleToDelete.id));
      if (selectedId === roleToDelete.id) {
        setSelectedId(roles.find((r) => r.id !== roleToDelete.id)?.id ?? null);
      }
      toast({ title: "Rôle supprimé" });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de la suppression",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
    }
  };

  const confirmDelete = (role: AdminRoleDb) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title="Rôles & permissions"
          description="Définissez des rôles et activez les permissions par module."
        />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </CardContent>
        </Card>
        <Button onClick={() => void loadRoles()}>Réessayer</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Rôles & permissions"
        description="Définissez des rôles et activez les permissions par module (lecture, écriture, suppression, validation, export, actions en masse)."
        actions={
          <Button
            className="bg-primary text-white hover:bg-primary/90 gap-2"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Créer un rôle
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Rôles ({roles.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">Aucun rôle défini</div>
            ) : (
              roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={
                    "w-full text-start rounded-md border px-3 py-2 transition " +
                    (r.id === selectedId
                      ? "border-primary bg-primary/5"
                      : "border-slate-200 hover:bg-slate-50")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-900">{r.name}</div>
                    {r.id === "superadmin" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">Complet</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">Personnalisé</Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    ID: <span className="font-mono">{r.id}</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">
              Permissions {selected ? `· ${selected.name}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="text-sm text-slate-500 py-4">Sélectionnez un rôle pour voir ses permissions</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-[860px] w-full text-sm">
                    <thead>
                      <tr className="text-start text-slate-600">
                        <th className="py-2 pe-4">Module</th>
                        {ADMIN_ACTIONS.map((a) => (
                          <th key={a} className="py-2 pe-4">
                            {ACTION_LABELS[a]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ADMIN_MODULES.map((m) => (
                        <tr key={m} className="border-t border-slate-200">
                          <td className="py-3 pe-4 font-semibold text-slate-900">{MODULE_LABELS[m]}</td>
                          {ADMIN_ACTIONS.map((a) => (
                            <td key={a} className="py-3 pe-4">
                              <Checkbox
                                checked={getFlag(selected, m, a)}
                                disabled={selected.id === "superadmin"}
                                onCheckedChange={(v) => {
                                  void handleTogglePermission(m, a, v === true);
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selected.id === "superadmin" ? (
                  <div className="mt-4 text-sm text-slate-600">
                    Le rôle Super-administrateur a tous les droits et ne peut pas être modifié.
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => confirmDelete(selected)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer ce rôle
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Role Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un nouveau rôle</DialogTitle>
            <DialogDescription>
              Définissez un identifiant unique et un nom pour ce rôle. Les permissions seront
              configurées ensuite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Identifiant (ID) *</Label>
              <Input
                value={newRoleId}
                onChange={(e) => setNewRoleId(e.target.value)}
                placeholder="ex: marketing, comptabilite, support_niveau2"
              />
              <div className="text-xs text-slate-500">
                Identifiant unique, en minuscules, sans espaces (utilisez _ si besoin).
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nom affiché *</Label>
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="ex: Marketing, Comptabilité, Support Niveau 2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleCreateRole} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le rôle « {roleToDelete?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les collaborateurs ayant ce rôle devront être
              réassignés à un autre rôle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
