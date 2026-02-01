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

import { getAdminMyProfile, updateAdminMyProfile, type AdminMyProfile } from "@/lib/adminApi";
import { fileToAvatarDataUrl } from "@/lib/profilePhoto";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileUpdated?: () => void;
};

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName ?? "").trim().charAt(0).toUpperCase();
  const l = (lastName ?? "").trim().charAt(0).toUpperCase();
  return f + l || "??";
}

export function MyProfileDialog({ open, onOpenChange, onProfileUpdated }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<AdminMyProfile | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);

      getAdminMyProfile(undefined)
        .then((res) => {
          setProfile(res.profile);
          setEmail(res.profile.email ?? "");
          setDisplayName(res.profile.displayName ?? "");
          setAvatarUrl(res.profile.avatarUrl ?? "");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Erreur lors du chargement du profil");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open]);

  const handleAvatarChange = async (file: File | null) => {
    if (!file) return;
    const res = await fileToAvatarDataUrl(file, { maxDim: 256 });
    if (res.ok === false) {
      setError(res.message);
      return;
    }
    setAvatarUrl(res.dataUrl);
  };

  const handleSubmit = async () => {
    if (!profile || profile.isLegacySession) return;

    // Validate password change
    if (newPassword || confirmPassword) {
      if (!currentPassword) {
        setError("Le mot de passe actuel est requis pour changer de mot de passe");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Les nouveaux mots de passe ne correspondent pas");
        return;
      }
      if (newPassword.length < 6) {
        setError("Le nouveau mot de passe doit contenir au moins 6 caractères");
        return;
      }
    }

    setError(null);
    setSaving(true);

    try {
      await updateAdminMyProfile(undefined, {
        email: email.trim() !== profile?.email ? email.trim() : undefined,
        displayName: displayName.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      });
      onProfileUpdated?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const isLegacy = profile?.isLegacySession ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mon profil</DialogTitle>
          <DialogDescription>
            Modifiez votre pseudo et votre photo de profil.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : error && !profile ? (
          <div className="py-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          </div>
        ) : isLegacy ? (
          <div className="py-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Vous êtes connecté avec un compte administrateur système. La modification du profil n'est pas disponible pour ce type de compte.
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="Photo de profil" /> : null}
                <AvatarFallback className="bg-primary text-white font-extrabold text-lg">
                  {getInitials(profile?.firstName ?? "", profile?.lastName ?? "")}
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
                  {avatarUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setAvatarUrl("")}
                    >
                      <Trash2 className="w-4 h-4" />
                      Retirer
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Email modifiable */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
              />
              <div className="text-xs text-slate-500">
                Vous devrez vous reconnecter après avoir modifié votre email.
              </div>
            </div>

            {/* Info non-modifiable */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Nom complet</span>
                <span className="font-medium text-slate-900">{profile?.firstName} {profile?.lastName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Fonction</span>
                <span className="font-medium text-slate-900">{profile?.function || "Non définie"}</span>
              </div>
            </div>

            {/* Pseudo */}
            <div className="space-y-2">
              <Label>Pseudo (affiché dans l'interface)</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={`${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || "Votre pseudo"}
              />
              <div className="text-xs text-slate-500">
                Si vide, votre prénom + nom sera utilisé.
              </div>
            </div>

            {/* Changement de mot de passe */}
            <div className="border-t border-slate-200 pt-4 mt-4 space-y-3">
              <div className="text-sm font-semibold text-slate-900">Changer le mot de passe</div>
              <div className="space-y-2">
                <Label>Mot de passe actuel</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label>Nouveau mot de passe</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label>Confirmer le nouveau mot de passe</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="text-xs text-slate-500">
                Laissez vide si vous ne souhaitez pas changer votre mot de passe.
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {isLegacy || (error && !profile) ? "Fermer" : "Annuler"}
          </Button>
          {!isLegacy && !loading && profile ? (
            <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-white hover:bg-primary/90 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
