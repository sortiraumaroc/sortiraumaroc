import type { ColumnDef } from "@tanstack/react-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Edit,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  User,
  UsersRound,
  X,
  FileText,
  Hash,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  getAdminProProfile,
  listProUserMemberships,
  regenerateProUserPassword,
  updateAdminProProfile,
  type AdminProProfile,
  type ProMembershipAdmin,
  type RegeneratePasswordResponse,
} from "@/lib/adminApi";

type MembershipRow = {
  establishmentId: string;
  establishmentLabel: string;
  city: string;
  status: string;
  role: string;
  universe: string;
};

function formatLabel(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "—";
}

function statusBadge(status: string): JSX.Element {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : s === "rejected" || s === "disabled"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-slate-50 text-slate-700 border-slate-200";
  return <Badge className={cls}>{formatLabel(status)}</Badge>;
}

function InfoCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  subValue?: string | null;
}) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="text-base font-semibold text-slate-900">{value || "—"}</div>
        {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
      </CardContent>
    </Card>
  );
}

export function AdminProUserDetailsPage() {
  const params = useParams();
  const { toast } = useToast();
  const userId = String(params.id ?? "").trim();

  const [profile, setProfile] = useState<AdminProProfile | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regeneratingPassword, setRegeneratingPassword] = useState(false);

  // Credentials dialog state
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | "both" | null>(null);

  // Edit form state (only fields that exist in the database)
  const [formData, setFormData] = useState({
    company_name: "",
    email: "",
    contact_name: "",
    phone: "",
    address: "",
    city: "",
    ice: "",
    notes: "",
  });

  const refresh = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      const [profileRes, memRes] = await Promise.all([
        getAdminProProfile(undefined, userId),
        listProUserMemberships(undefined, userId),
      ]);

      setProfile(profileRes.profile ?? null);

      const mapped: MembershipRow[] = (memRes.items ?? []).map((m: ProMembershipAdmin) => {
        const est = m.establishment;
        const label = formatLabel(est?.name ?? est?.title ?? est?.id ?? m.establishment_id);
        return {
          establishmentId: m.establishment_id,
          establishmentLabel: label,
          city: formatLabel(est?.city),
          status: formatLabel(est?.status),
          role: formatLabel(m.role),
          universe: formatLabel(est?.universe ?? est?.subcategory),
        };
      });

      setMemberships(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEditDialog = () => {
    if (profile) {
      setFormData({
        company_name: profile.company_name ?? "",
        email: profile.email ?? "",
        contact_name: profile.contact_name ?? "",
        phone: profile.phone ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        ice: profile.ice ?? "",
        notes: profile.notes ?? "",
      });
    }
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    try {
      await updateAdminProProfile(undefined, userId, {
        company_name: formData.company_name || null,
        email: formData.email || null,
        contact_name: formData.contact_name || null,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
        ice: formData.ice || null,
        notes: formData.notes || null,
      });

      toast({ title: "Succès", description: "Profil Pro mis à jour" });
      setEditDialogOpen(false);
      void refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur lors de la sauvegarde";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRegeneratePassword = async () => {
    if (!userId) return;

    setRegeneratingPassword(true);
    try {
      const result = await regenerateProUserPassword(undefined, userId);
      // Show credentials dialog with the generated password
      setGeneratedCredentials(result.credentials);
      setCredentialsDialogOpen(true);
      setCopiedField(null);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur lors de la régénération";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setRegeneratingPassword(false);
    }
  };

  const copyToClipboard = async (text: string, field: "email" | "password" | "both") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier", variant: "destructive" });
    }
  };

  const copyBothCredentials = async () => {
    if (!generatedCredentials) return;
    const text = `Email: ${generatedCredentials.email}\nMot de passe: ${generatedCredentials.password}`;
    await copyToClipboard(text, "both");
  };

  const columns = useMemo<ColumnDef<MembershipRow>[]>(() => {
    return [
      {
        accessorKey: "establishmentLabel",
        header: "Établissement",
        cell: ({ row }) => (
          <Link
            className="font-semibold underline"
            to={`/admin/establishments/${encodeURIComponent(row.original.establishmentId)}`}
          >
            {row.original.establishmentLabel}
          </Link>
        ),
      },
      { accessorKey: "city", header: "Ville" },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      { accessorKey: "role", header: "Rôle" },
      { accessorKey: "universe", header: "Univers" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" asChild className="gap-2">
              <Link to={`/admin/establishments/${encodeURIComponent(row.original.establishmentId)}`}>
                Voir
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  const roleSummary = useMemo(() => {
    const roles: Record<string, number> = {};
    for (const m of memberships) {
      const r = m.role || "unknown";
      roles[r] = (roles[r] || 0) + 1;
    }
    const entries = Object.entries(roles).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return "—";
    return entries.map(([k, v]) => `${k} (${v})`).join(" • ");
  }, [memberships]);

  const fullAddress = useMemo(() => {
    const parts = [profile?.address, profile?.city].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }, [profile]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Compte Pro"
        description={userId ? `ID: ${userId}` : ""}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/pros" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Link>
            </Button>
            <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
          </div>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {/* Info cards - row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard icon={Mail} label="Email" value={profile?.email} />
        <InfoCard icon={User} label="Contact" value={profile?.contact_name} />
        <InfoCard icon={Phone} label="Téléphone" value={profile?.phone} />
        <InfoCard icon={UsersRound} label="Accès" value={`${memberships.length} établissement(s)`} subValue={`Rôles: ${roleSummary}`} />
      </div>

      {/* Info cards - row 2: Company details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <InfoCard icon={Building2} label="Raison sociale" value={profile?.company_name} />
        <InfoCard icon={MapPin} label="Adresse" value={fullAddress} />
        <InfoCard icon={Hash} label="ICE" value={profile?.ice} />
      </div>

      {/* Notes section */}
      {profile?.notes && (
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Notes internes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{profile.notes}</div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleRegeneratePassword}
          disabled={regeneratingPassword}
          className="gap-2 min-w-[220px] h-10"
        >
          {regeneratingPassword ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Régénérer mot de passe
        </Button>
        <Button onClick={openEditDialog} className="gap-2 min-w-[220px] h-10 border border-transparent">
          <Edit className="h-4 w-4" />
          Modifier le profil
        </Button>
      </div>

      {/* Establishments table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900">Établissements rattachés</div>
          <div className="text-xs text-slate-500">{memberships.length} accès</div>
        </div>
        <AdminDataTable data={memberships} columns={columns} searchPlaceholder="Rechercher (nom, ville, rôle)…" />
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le profil Pro</DialogTitle>
            <DialogDescription>Informations de l'entreprise pour la facturation</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Company & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Raison sociale / Nom entreprise</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="Ex: SARL Mon Entreprise"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@entreprise.com"
                />
              </div>
            </div>

            {/* Contact name & phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nom du contact</Label>
                <Input
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Nom complet"
                />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+212 6XX XXX XXX"
                />
              </div>
            </div>

            {/* Address & City */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Adresse</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Adresse complète"
                />
              </div>
              <div>
                <Label>Ville</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Casablanca"
                />
              </div>
            </div>

            {/* ICE */}
            <div>
              <Label>ICE</Label>
              <Input
                value={formData.ice}
                onChange={(e) => setFormData({ ...formData, ice: e.target.value })}
                placeholder="Identifiant Commun de l'Entreprise"
              />
            </div>

            {/* Notes */}
            <div>
              <Label>Notes internes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes visibles uniquement par l'équipe"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              <X className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Identifiants provisoires
            </DialogTitle>
            <DialogDescription>
              Le professionnel recevra ces identifiants par email et devra changer son mot de passe à la première connexion.
            </DialogDescription>
          </DialogHeader>

          {generatedCredentials && (
            <div className="space-y-4 py-4">
              {/* Email field */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Email (login)</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-md px-3 py-2 font-mono text-sm select-all">
                    {generatedCredentials.email}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(generatedCredentials.email, "email")}
                    className="shrink-0"
                  >
                    {copiedField === "email" ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Mot de passe provisoire</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-md px-3 py-2 font-mono text-sm select-all break-all">
                    {generatedCredentials.password}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(generatedCredentials.password, "password")}
                    className="shrink-0"
                  >
                    {copiedField === "password" ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Info box */}
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>Note :</strong> Un email a été envoyé au professionnel avec ces identifiants. Il devra modifier son mot de passe lors de sa première connexion.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={copyBothCredentials} className="gap-2">
              {copiedField === "both" ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copier tout
            </Button>
            <Button onClick={() => setCredentialsDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
