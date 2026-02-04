import * as React from "react";

import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function SuperadminForcePassword() {
  const navigate = useNavigate();
  const { state, signOut } = useSuperadminSession();
  const auth = useAuth("admin");

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    const next = password.trim();
    if (next.length < 10) {
      toast.message("Choisis un mot de passe plus long (10 caractères min).", { duration: 2200 });
      return;
    }
    if (next !== confirm.trim()) {
      toast.message("Les deux mots de passe ne correspondent pas.", { duration: 2200 });
      return;
    }

    setIsSaving(true);
    try {
      const currentPassword = prompt("Entre ton mot de passe actuel:");
      if (!currentPassword) {
        toast.message("Opération annulée.", { duration: 2200 });
        setIsSaving(false);
        return;
      }

      const success = await auth.changePassword(currentPassword, next);

      if (success) {
        toast.success("Mot de passe mis à jour");
        navigate("/superadmin/dashboard", { replace: true });
      }
    } finally {
      setIsSaving(false);
    }
  }, [confirm, password, auth, navigate]);

  const email = state.status === "signedIn" ? state.email : null;

  return (
    <SuperadminShell title="Sécurité" subtitle={email ? `Connecté : ${email}` : ""} onSignOut={() => void signOut()}>
      <div className="w-full">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="truncate whitespace-nowrap text-sm font-semibold leading-none">
            Mot de passe obligatoire
          </div>
          <div className="mt-1 text-xs text-white/60">
            Pour sécuriser la console SUPERADMIN, choisis un nouveau mot de passe avant d'accéder au tableau de bord.
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-xs font-medium text-white/70">Nouveau mot de passe</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="mt-1 h-10 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/40"
                placeholder="Nouveau mot de passe"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/70">Confirmer</label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type="password"
                className="mt-1 h-10 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/40"
                placeholder="Confirmer"
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || password.trim().length === 0 || confirm.trim().length === 0}
                className="h-10 flex-1 rounded-xl bg-sam-red text-white hover:bg-sam-red/90"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void signOut()}
                disabled={isSaving}
                className="h-10 flex-1 rounded-xl border-white/15 bg-transparent text-white hover:bg-white/10"
              >
                Se déconnecter
              </Button>
            </div>

            <div className="text-xs text-white/50">Astuce : utilise au moins 10 caractères, avec chiffres et symbole.</div>
          </div>
        </div>
      </div>
    </SuperadminShell>
  );
}
