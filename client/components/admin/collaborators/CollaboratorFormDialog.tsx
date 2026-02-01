import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Trash2, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

import type { AdminCollaborator, AdminCollaboratorFormData, AdminRole } from "@/lib/admin/permissions";
import { fileToAvatarDataUrl } from "@/lib/profilePhoto";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator?: AdminCollaborator | null;
  roles: AdminRole[];
  onSave: (data: AdminCollaboratorFormData) => Promise<void>;
};

const FUNCTIONS = [
  "Directeur général",
  "Directeur commercial",
  "Responsable opérations",
  "Responsable support",
  "Responsable marketing",
  "Développeur",
  "Designer",
  "Community manager",
  "Comptable",
  "Assistant(e)",
  "Stagiaire",
  "Autre",
];

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName ?? "").trim().charAt(0).toUpperCase();
  const l = (lastName ?? "").trim().charAt(0).toUpperCase();
  return f + l || "??";
}

export function CollaboratorFormDialog({ open, onOpenChange, collaborator, roles, onSave }: Props) {
  const isEdit = !!collaborator;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<AdminCollaboratorFormData>({
    email: "",
    firstName: "",
    lastName: "",
    displayName: "",
    function: "",
    joinedAt: "",
    avatarUrl: "",
    roleId: roles[0]?.id ?? "ops",
    password: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (collaborator) {
        setForm({
          email: collaborator.email,
          firstName: collaborator.firstName,
          lastName: collaborator.lastName,
          displayName: collaborator.displayName ?? "",
          function: collaborator.function ?? "",
          joinedAt: collaborator.joinedAt ? collaborator.joinedAt.slice(0, 10) : "",
          avatarUrl: collaborator.avatarUrl ?? "",
          roleId: collaborator.roleId,
          password: "",
        });
      } else {
        setForm({
          email: "",
          firstName: "",
          lastName: "",
          displayName: "",
          function: "",
          joinedAt: new Date().toISOString().slice(0, 10),
          avatarUrl: "",
          roleId: roles[0]?.id ?? "ops",
          password: "",
        });
      }
      setError(null);
    }
  }, [open, collaborator, roles]);

  const handleAvatarChange = async (file: File | null) => {
    if (!file) return;
    const res = await fileToAvatarDataUrl(file, { maxDim: 256 });
    if (res.ok === false) {
      setError(res.message);
      return;
    }
    setForm((p) => ({ ...p, avatarUrl: res.dataUrl }));
  };

  const handleSubmit = async () => {
    setError(null);

    if (!form.email.trim()) {
      setError("L'email est requis.");
      return;
    }
    if (!form.firstName.trim()) {
      setError("Le prénom est requis.");
      return;
    }
    if (!form.lastName.trim()) {
      setError("Le nom est requis.");
      return;
    }
    if (!isEdit && !form.password?.trim()) {
      setError("Le mot de passe est requis pour un nouveau collaborateur.");
      return;
    }
    if (!isEdit && (form.password?.length ?? 0) < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le collaborateur" : "Nouveau collaborateur"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifiez les informations du collaborateur."
              : "Remplissez les informations pour créer un nouveau compte collaborateur."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {form.avatarUrl ? <AvatarImage src={form.avatarUrl} alt="Photo de profil" /> : null}
              <AvatarFallback className="bg-primary text-white font-extrabold text-lg">
                {getInitials(form.firstName, form.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">Photo de profil</div>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void handleAvatarChange(f);
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4" />
                  Importer
                </Button>
                {form.avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setForm((p) => ({ ...p, avatarUrl: "" }))}
                  >
                    <Trash2 className="w-4 h-4" />
                    Retirer
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Nom & Prénom */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prénom *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="Jean"
              />
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Dupont"
              />
            </div>
          </div>

          {/* Pseudo */}
          <div className="space-y-2">
            <Label>Pseudo (affiché)</Label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
              placeholder="JeanD"
            />
            <div className="text-xs text-slate-500">Optionnel. Si vide, le prénom + nom sera utilisé.</div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="jean.dupont@sortiraumaroc.ma"
              disabled={isEdit}
            />
            {isEdit ? <div className="text-xs text-slate-500">L'email ne peut pas être modifié.</div> : null}
          </div>

          {/* Mot de passe */}
          {!isEdit ? (
            <div className="space-y-2">
              <Label>Mot de passe *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Minimum 6 caractères"
              />
            </div>
          ) : null}

          {/* Fonction */}
          <div className="space-y-2">
            <Label>Fonction</Label>
            <Select value={form.function || ""} onValueChange={(v) => setForm((p) => ({ ...p, function: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une fonction" />
              </SelectTrigger>
              <SelectContent>
                {FUNCTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date d'entrée */}
          <div className="space-y-2">
            <Label>Date d'entrée dans la société</Label>
            <Input
              type="date"
              value={form.joinedAt}
              onChange={(e) => setForm((p) => ({ ...p, joinedAt: e.target.value }))}
            />
          </div>

          {/* Rôle */}
          <div className="space-y-2">
            <Label>Rôle & permissions *</Label>
            <Select value={form.roleId} onValueChange={(v) => setForm((p) => ({ ...p, roleId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un rôle" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-slate-500">
              Les permissions sont définies dans la page "Rôles & permissions".
            </div>
          </div>

          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-white hover:bg-primary/90 gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
