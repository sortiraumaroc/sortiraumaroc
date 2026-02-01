import { useEffect, useMemo, useState } from "react";
import { Calendar, Edit2, Key, Loader2, MoreHorizontal, Plus, Power, PowerOff, Shield, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  createProTeamMember,
  listProTeamMembers,
  updateProTeamMemberRole,
  deleteProTeamMember,
  updateProTeamMemberEmail,
  toggleProTeamMemberActive,
  resetProTeamMemberPassword,
} from "@/lib/pro/api";
import type { Establishment, ProMembership, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
  user: User;
};

function roleBadge(role: string) {
  if (role === "owner") return "bg-primary/10 text-primary border-primary/20";
  if (role === "manager") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (role === "reception") return "bg-sky-100 text-sky-700 border-sky-200";
  if (role === "accounting") return "bg-amber-100 text-amber-700 border-amber-200";
  if (role === "marketing") return "bg-purple-100 text-purple-700 border-purple-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function canManageTeam(role: ProRole) {
  return role === "owner";
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function getInitials(email: string | null | undefined): string {
  if (!email) return "?";
  const parts = email.split("@")[0];
  if (!parts) return "?";
  return parts.slice(0, 2).toUpperCase();
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function ProTeamTab({ establishment, role, user }: Props) {
  const [items, setItems] = useState<ProMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newMember, setNewMember] = useState({
    email: "",
    password: "",
    role: "manager" as ProMembership["role"],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<ProMembership | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit email dialog state
  const [editEmailDialogOpen, setEditEmailDialogOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<ProMembership | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Toggle active dialog state
  const [toggleActiveDialogOpen, setToggleActiveDialogOpen] = useState(false);
  const [memberToToggle, setMemberToToggle] = useState<ProMembership | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  // Reset password dialog state
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [memberToResetPassword, setMemberToResetPassword] = useState<ProMembership | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Success message
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listProTeamMembers(establishment.id);
      setItems((data ?? []) as ProMembership[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [establishment.id]);

  // Auto-hide success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const myMembership = useMemo(() => items.find((m) => m.user_id === user.id) ?? null, [items, user.id]);

  const updateRole = async (id: string, newRole: string) => {
    if (!canManageTeam(role)) return;
    setSavingId(id);
    setError(null);

    try {
      await updateProTeamMemberRole({ establishmentId: establishment.id, membershipId: id, role: newRole as ProMembership["role"] });
      setSuccessMessage("Rôle mis à jour");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }

    await load();
    setSavingId(null);
  };

  const handleDelete = async () => {
    if (!memberToDelete || !canManageTeam(role)) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteProTeamMember({
        establishmentId: establishment.id,
        membershipId: memberToDelete.id,
      });
      setDeleteDialogOpen(false);
      setMemberToDelete(null);
      setSuccessMessage("Membre supprimé");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!memberToEdit || !canManageTeam(role)) return;
    if (!newEmail.includes("@")) {
      setError("Email invalide");
      return;
    }

    setSavingEmail(true);
    setError(null);

    try {
      await updateProTeamMemberEmail({
        establishmentId: establishment.id,
        membershipId: memberToEdit.id,
        email: normalizeEmail(newEmail),
      });
      setEditEmailDialogOpen(false);
      setMemberToEdit(null);
      setNewEmail("");
      setSuccessMessage("Email mis à jour");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la mise à jour de l'email");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleToggleActive = async () => {
    if (!memberToToggle || !canManageTeam(role)) return;

    setTogglingActive(true);
    setError(null);

    try {
      const newActiveState = memberToToggle.is_banned === true;
      await toggleProTeamMemberActive({
        establishmentId: establishment.id,
        membershipId: memberToToggle.id,
        active: newActiveState,
      });
      setToggleActiveDialogOpen(false);
      setMemberToToggle(null);
      setSuccessMessage(newActiveState ? "Compte réactivé" : "Compte désactivé");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setTogglingActive(false);
    }
  };

  const handleResetPassword = async () => {
    if (!memberToResetPassword || !canManageTeam(role)) return;

    setResettingPassword(true);
    setError(null);

    try {
      await resetProTeamMemberPassword({
        establishmentId: establishment.id,
        membershipId: memberToResetPassword.id,
      });
      setResetPasswordDialogOpen(false);
      setMemberToResetPassword(null);
      setSuccessMessage("Nouveau mot de passe envoyé par email");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la réinitialisation");
    } finally {
      setResettingPassword(false);
    }
  };

  const canCreate = useMemo(() => {
    return normalizeEmail(newMember.email).includes("@") && newMember.password.length >= 6 && !creating;
  }, [newMember.email, newMember.password, creating]);

  const createMember = async () => {
    if (!canManageTeam(role)) return;
    if (!canCreate) return;

    setCreating(true);
    setCreateError(null);

    try {
      await createProTeamMember({
        establishmentId: establishment.id,
        email: normalizeEmail(newMember.email),
        password: newMember.password,
        role: newMember.role,
      });

      setNewMember({ email: "", password: "", role: "manager" });
      setSuccessMessage("Membre créé avec succès");
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  };

  const openEditEmail = (m: ProMembership) => {
    setMemberToEdit(m);
    setNewEmail(m.email || "");
    setEditEmailDialogOpen(true);
  };

  const openToggleActive = (m: ProMembership) => {
    setMemberToToggle(m);
    setToggleActiveDialogOpen(true);
  };

  const openResetPassword = (m: ProMembership) => {
    setMemberToResetPassword(m);
    setResetPasswordDialogOpen(true);
  };

  const renderMemberActions = (m: ProMembership, isOwner: boolean) => {
    if (!canManageTeam(role) || isOwner) {
      return isOwner ? (
        <span className="text-xs text-slate-500 italic">Propriétaire</span>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Non autorisé
        </Button>
      );
    }

    return (
      <div className="flex justify-end gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={m.role}
          disabled={savingId === m.id}
          onChange={(e) => updateRole(m.id, e.target.value)}
        >
          <option value="manager">Manager</option>
          <option value="reception">Réception</option>
          <option value="accounting">Comptable</option>
          <option value="marketing">Marketing</option>
        </select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditEmail(m)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Modifier l'email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openResetPassword(m)}>
              <Key className="w-4 h-4 mr-2" />
              Réinitialiser le mot de passe
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openToggleActive(m)}>
              {m.is_banned ? (
                <>
                  <Power className="w-4 h-4 mr-2 text-green-600" />
                  <span className="text-green-600">Réactiver le compte</span>
                </>
              ) : (
                <>
                  <PowerOff className="w-4 h-4 mr-2 text-amber-600" />
                  <span className="text-amber-600">Désactiver le compte</span>
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => {
                setMemberToDelete(m);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Success message */}
        {successMessage ? (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            {successMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-600">Votre rôle</CardTitle>
            </CardHeader>
            <CardContent>
              {myMembership ? (
                <Badge className={roleBadge(myMembership.role)}>{myMembership.role}</Badge>
              ) : (
                <div className="text-sm text-slate-600">Non défini</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-600">Permissions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 text-primary" />
              Gestion fine par rôle: fiche, réservations, factures, campagnes.
            </CardContent>
          </Card>
        </div>

        {canManageTeam(role) ? (
          <Card>
            <CardHeader>
              <SectionHeader
                title="Créer un compte équipe"
                description="Créez un accès pour un membre (éditeur, réception, comptable…). Mot de passe: 6+ caractères."
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={newMember.email} onChange={(e) => setNewMember((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Mot de passe</Label>
                  <Input
                    type="password"
                    value={newMember.password}
                    onChange={(e) => setNewMember((p) => ({ ...p, password: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rôle</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newMember.role}
                    onChange={(e) => setNewMember((p) => ({ ...p, role: e.target.value as ProMembership["role"] }))}
                  >
                    <option value="manager">Manager</option>
                    <option value="reception">Réception</option>
                    <option value="accounting">Comptable</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>
              </div>

              {createError ? <div className="text-sm text-red-600">{createError}</div> : null}

              <Button
                className="bg-primary text-white hover:bg-primary/90 font-bold gap-2"
                disabled={!canCreate}
                onClick={createMember}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? "Création…" : "Créer"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-sm text-slate-600">Seul le Owner peut créer de nouveaux comptes.</div>
        )}

        <Card>
          <CardHeader>
            <SectionHeader
              title="Équipe"
              description="Owner: tout. Manager: opérations. Réception: check-in. Comptable: factures. Marketing: campagnes."
            />
          </CardHeader>
          <CardContent>
            {error ? <div className="text-sm text-red-600 mb-4">{error}</div> : null}

            {loading ? (
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : items.length ? (
              <>
                {/* Mobile view */}
                <div className="space-y-3 md:hidden">
                  {items.map((m) => {
                    const isMe = m.user_id === user.id;
                    const isOwner = m.role === "owner";
                    const isBanned = m.is_banned === true;

                    return (
                      <div key={m.id} className={`rounded-lg border p-4 ${isBanned ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${isBanned ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                              {getInitials(m.email)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-medium truncate ${isBanned ? "text-red-700" : "text-slate-900"}`}>
                                  {m.email || "Email inconnu"}
                                </span>
                                {isMe ? (
                                  <Badge className="bg-primary text-white text-[10px] px-1.5 py-0">
                                    Vous
                                  </Badge>
                                ) : null}
                                {isBanned ? (
                                  <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">
                                    Désactivé
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                <Calendar className="w-3 h-3" />
                                Ajouté le {formatDate(m.created_at)}
                              </div>
                            </div>
                          </div>
                          <Badge className={roleBadge(m.role) + " shrink-0"}>{m.role}</Badge>
                        </div>

                        <div className="mt-3">
                          {renderMemberActions(m, isOwner)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop view */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Membre</TableHead>
                        <TableHead>Rôle</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Ajouté le</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((m) => {
                        const isMe = m.user_id === user.id;
                        const isOwner = m.role === "owner";
                        const isBanned = m.is_banned === true;

                        return (
                          <TableRow key={m.id} className={isBanned ? "bg-red-50/50" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {/* Avatar */}
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${isBanned ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                                  {getInitials(m.email)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium ${isBanned ? "text-red-700" : "text-slate-900"}`}>
                                      {m.email || "Email inconnu"}
                                    </span>
                                    {isMe ? (
                                      <Badge className="bg-primary text-white text-[10px] px-1.5 py-0">
                                        Vous
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={roleBadge(m.role)}>{m.role}</Badge>
                            </TableCell>
                            <TableCell>
                              {isBanned ? (
                                <Badge className="bg-red-100 text-red-700 border-red-200">
                                  Désactivé
                                </Badge>
                              ) : (
                                <Badge className="bg-green-100 text-green-700 border-green-200">
                                  Actif
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {formatDate(m.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              {renderMemberActions(m, isOwner)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-600">Aucun membre d'équipe enregistré.</div>
            )}
          </CardContent>
        </Card>

        {/* Delete confirmation dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce membre ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer{" "}
                <span className="font-semibold">{memberToDelete?.email || "ce membre"}</span> de l'équipe ?
                Cette action est irréversible et l'utilisateur perdra immédiatement son accès à cet établissement.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit email dialog */}
        <Dialog open={editEmailDialogOpen} onOpenChange={setEditEmailDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier l'email</DialogTitle>
              <DialogDescription>
                Modifiez l'adresse email de {memberToEdit?.email || "ce membre"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nouvel email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nouveau@email.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditEmailDialogOpen(false)} disabled={savingEmail}>
                Annuler
              </Button>
              <Button onClick={handleUpdateEmail} disabled={savingEmail || !newEmail.includes("@")}>
                {savingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Toggle active dialog */}
        <AlertDialog open={toggleActiveDialogOpen} onOpenChange={setToggleActiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {memberToToggle?.is_banned ? "Réactiver ce compte ?" : "Désactiver ce compte ?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {memberToToggle?.is_banned ? (
                  <>
                    Le compte de <span className="font-semibold">{memberToToggle?.email}</span> sera réactivé
                    et pourra à nouveau se connecter à l'espace pro.
                  </>
                ) : (
                  <>
                    Le compte de <span className="font-semibold">{memberToToggle?.email}</span> sera désactivé.
                    L'utilisateur ne pourra plus se connecter mais ses données seront conservées.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={togglingActive}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleToggleActive}
                disabled={togglingActive}
                className={memberToToggle?.is_banned ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"}
              >
                {togglingActive ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {memberToToggle?.is_banned ? "Réactiver" : "Désactiver"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset password dialog */}
        <AlertDialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Réinitialiser le mot de passe ?</AlertDialogTitle>
              <AlertDialogDescription>
                Un nouveau mot de passe temporaire sera généré et envoyé à{" "}
                <span className="font-semibold">{memberToResetPassword?.email}</span>.
                L'utilisateur devra le changer à sa prochaine connexion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resettingPassword}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetPassword}
                disabled={resettingPassword}
              >
                {resettingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Réinitialiser
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
