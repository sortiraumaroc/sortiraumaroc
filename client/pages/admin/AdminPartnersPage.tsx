import type { ColumnDef } from "@tanstack/react-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  Edit,
  Loader2,
  Pause,
  Plus,
  UserCircle,
  Video,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminMediaFactoryNav } from "./media-factory/AdminMediaFactoryNav";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  createAdminPartner,
  getAdminPartner,
  listAdminPartners,
  updateAdminPartner,
  updateAdminPartnerBilling,
  type AdminPartnerProfile,
  type AdminPartnerBilling,
  type PartnerRole,
} from "@/lib/adminApi";

type PartnerStatus = "pending" | "active" | "paused" | "disabled";

type PartnerRow = {
  user_id: string;
  display_name: string;
  email: string;
  primary_role: PartnerRole;
  phone: string;
  city: string;
  status: PartnerStatus;
  billing_status: string;
  created_at: string;
};

const STATUS_CONFIG: Record<
  PartnerStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: {
    label: "En attente",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  active: {
    label: "Actif",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  paused: {
    label: "Pause",
    icon: <Pause className="h-3 w-3" />,
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  disabled: {
    label: "Désactivé",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const ROLE_LABELS: Record<PartnerRole, string> = {
  camera: "Caméraman",
  editor: "Monteur",
  voice: "Voix off",
  blogger: "Blogueur",
  photographer: "Photographe",
};

const ROLE_ICONS: Record<PartnerRole, React.ReactNode> = {
  camera: <Video className="h-4 w-4" />,
  editor: <Edit className="h-4 w-4" />,
  voice: <UserCircle className="h-4 w-4" />,
  blogger: <UserCircle className="h-4 w-4" />,
  photographer: <Camera className="h-4 w-4" />,
};

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR");
}

function billingStatusBadge(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "validated")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
        Validé
      </Badge>
    );
  if (s === "submitted")
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
        Soumis
      </Badge>
    );
  if (s === "rejected")
    return (
      <Badge className="bg-rose-100 text-rose-800 border-rose-200">
        Refusé
      </Badge>
    );
  return <Badge variant="outline">En attente</Badge>;
}

function mapRow(p: AdminPartnerProfile): PartnerRow {
  return {
    user_id: p.user_id,
    display_name: p.display_name ?? "—",
    email: p.email ?? "—",
    primary_role: p.primary_role,
    phone: p.phone ?? "—",
    city: p.city ?? "—",
    status: ((p as any).status ??
      (p.active ? "active" : "pending")) as PartnerStatus,
    billing_status: p.partner_billing_profiles?.status ?? "pending",
    created_at: formatLocal(p.created_at),
  };
}

export function AdminPartnersPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PartnerRow[]>([]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPartner, setNewPartner] = useState({
    email: "",
    password: "",
    display_name: "",
    primary_role: "" as PartnerRole | "",
    phone: "",
    city: "",
    notes: "",
  });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [selectedPartner, setSelectedPartner] =
    useState<AdminPartnerProfile | null>(null);
  const [selectedBilling, setSelectedBilling] =
    useState<AdminPartnerBilling | null>(null);
  const [editForm, setEditForm] = useState({
    display_name: "",
    primary_role: "" as PartnerRole | "",
    phone: "",
    city: "",
    notes: "",
    status: "pending" as PartnerStatus,
    billing_status: "",
  });
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminPartners(undefined);
      setItems((res.items ?? []).map(mapRow));
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({
        title: "Prestataires",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEdit = async (userId: string) => {
    setEditDialogOpen(true);
    setEditLoading(true);
    try {
      const res = await getAdminPartner(undefined, userId);
      setSelectedPartner(res.profile);
      setSelectedBilling(res.billing);
      setEditForm({
        display_name: res.profile.display_name ?? "",
        primary_role: res.profile.primary_role,
        phone: res.profile.phone ?? "",
        city: res.profile.city ?? "",
        notes: res.profile.notes ?? "",
        status: ((res.profile as any).status ??
          (res.profile.active ? "active" : "pending")) as PartnerStatus,
        billing_status: res.billing?.status ?? "pending",
      });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Prestataire", description: msg, variant: "destructive" });
      setEditDialogOpen(false);
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreate = async () => {
    if (
      !newPartner.email ||
      !newPartner.password ||
      !newPartner.display_name ||
      !newPartner.primary_role
    ) {
      toast({
        title: "Erreur",
        description: "Tous les champs obligatoires doivent être remplis",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      await createAdminPartner(undefined, {
        email: newPartner.email,
        password: newPartner.password,
        display_name: newPartner.display_name,
        primary_role: newPartner.primary_role as PartnerRole,
        phone: newPartner.phone || undefined,
        city: newPartner.city || undefined,
        notes: newPartner.notes || undefined,
      });
      toast({
        title: "Prestataire créé",
        description: `${newPartner.display_name} a été ajouté.`,
      });
      setCreateDialogOpen(false);
      setNewPartner({
        email: "",
        password: "",
        display_name: "",
        primary_role: "",
        phone: "",
        city: "",
        notes: "",
      });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPartner) return;

    setSaving(true);
    try {
      await updateAdminPartner(undefined, selectedPartner.user_id, {
        display_name: editForm.display_name,
        primary_role: editForm.primary_role as PartnerRole,
        phone: editForm.phone || null,
        city: editForm.city || null,
        notes: editForm.notes || null,
        status: editForm.status,
      });

      if (
        editForm.billing_status &&
        editForm.billing_status !== (selectedBilling?.status ?? "pending")
      ) {
        await updateAdminPartnerBilling(undefined, selectedPartner.user_id, {
          status: editForm.billing_status,
        });
      }

      toast({
        title: "Prestataire mis à jour",
        description: `${editForm.display_name} a été modifié.`,
      });
      setEditDialogOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<PartnerRow>[] = useMemo(
    () => [
      {
        accessorKey: "display_name",
        header: "Nom",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              {ROLE_ICONS[row.original.primary_role]}
            </div>
            <div>
              <div className="font-medium text-slate-900">
                {row.original.display_name}
              </div>
              <div className="text-xs text-slate-500">{row.original.email}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "primary_role",
        header: "Rôle",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-normal">
            {ROLE_LABELS[row.original.primary_role] ??
              row.original.primary_role}
          </Badge>
        ),
      },
      {
        accessorKey: "city",
        header: "Ville",
        cell: ({ row }) => <span className="text-sm">{row.original.city}</span>,
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const cfg =
            STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.pending;
          return (
            <Badge className={`${cfg.className} gap-1`}>
              {cfg.icon} {cfg.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "billing_status",
        header: "Facturation",
        cell: ({ row }) => billingStatusBadge(row.original.billing_status),
      },
      {
        accessorKey: "created_at",
        header: "Créé le",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">
            {row.original.created_at}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void openEdit(row.original.user_id)}
          >
            Modifier
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Media Factory"
        description="Prestataires (caméramans, monteurs, blogueurs...)"
      />

      <AdminMediaFactoryNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Prestataires ({items.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <RefreshIconButton
              className="h-9 w-9"
              onClick={() => void refresh()}
              loading={loading}
              label="Rafraîchir"
            />
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Nouveau prestataire
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <AdminDataTable
            columns={columns}
            data={items}
            loading={loading}
            emptyMessage="Aucun prestataire enregistré."
          />
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau prestataire</DialogTitle>
            <DialogDescription>
              Créer un compte pour un prestataire media
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newPartner.email}
                  onChange={(e) =>
                    setNewPartner((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="email@exemple.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  value={newPartner.password}
                  onChange={(e) =>
                    setNewPartner((p) => ({ ...p, password: e.target.value }))
                  }
                  placeholder="Min. 6 caractères"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input
                  value={newPartner.display_name}
                  onChange={(e) =>
                    setNewPartner((p) => ({
                      ...p,
                      display_name: e.target.value,
                    }))
                  }
                  placeholder="Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle principal *</Label>
                <Select
                  value={newPartner.primary_role}
                  onValueChange={(v) =>
                    setNewPartner((p) => ({
                      ...p,
                      primary_role: v as PartnerRole,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="camera">Caméraman</SelectItem>
                    <SelectItem value="editor">Monteur</SelectItem>
                    <SelectItem value="voice">Voix off</SelectItem>
                    <SelectItem value="blogger">Blogueur</SelectItem>
                    <SelectItem value="photographer">Photographe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={newPartner.phone}
                  onChange={(e) =>
                    setNewPartner((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="+212 6..."
                />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  value={newPartner.city}
                  onChange={(e) =>
                    setNewPartner((p) => ({ ...p, city: e.target.value }))
                  }
                  placeholder="Casablanca"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes internes</Label>
              <Textarea
                value={newPartner.notes}
                onChange={(e) =>
                  setNewPartner((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="Informations supplémentaires..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Créer le prestataire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le prestataire</DialogTitle>
            <DialogDescription>
              {selectedPartner?.email ?? ""}
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom complet</Label>
                  <Input
                    value={editForm.display_name}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        display_name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rôle principal</Label>
                  <Select
                    value={editForm.primary_role}
                    onValueChange={(v) =>
                      setEditForm((p) => ({
                        ...p,
                        primary_role: v as PartnerRole,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="camera">Caméraman</SelectItem>
                      <SelectItem value="editor">Monteur</SelectItem>
                      <SelectItem value="voice">Voix off</SelectItem>
                      <SelectItem value="blogger">Blogueur</SelectItem>
                      <SelectItem value="photographer">Photographe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input
                    value={editForm.city}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, city: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Statut compte</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) =>
                      setEditForm((p) => ({ ...p, status: v as PartnerStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">
                        <span className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-amber-600" /> En
                          attente
                        </span>
                      </SelectItem>
                      <SelectItem value="active">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />{" "}
                          Actif
                        </span>
                      </SelectItem>
                      <SelectItem value="paused">
                        <span className="flex items-center gap-2">
                          <Pause className="h-3 w-3 text-blue-600" /> Pause
                        </span>
                      </SelectItem>
                      <SelectItem value="disabled">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-3 w-3 text-slate-600" />{" "}
                          Désactivé
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Statut facturation</Label>
                  <Select
                    value={editForm.billing_status}
                    onValueChange={(v) =>
                      setEditForm((p) => ({ ...p, billing_status: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Néant</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="submitted">Soumis</SelectItem>
                      <SelectItem value="validated">Validé</SelectItem>
                      <SelectItem value="rejected">Refusé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes internes</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  rows={2}
                />
              </div>

              {selectedBilling?.rib ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-600 mb-1">
                    RIB enregistré
                  </div>
                  <div className="font-mono text-sm">{selectedBilling.rib}</div>
                  {selectedBilling.bank_name ? (
                    <div className="text-xs text-slate-500 mt-1">
                      {selectedBilling.bank_name}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || editLoading}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
