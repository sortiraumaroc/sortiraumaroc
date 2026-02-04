import * as React from "react";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";

export default function SuperadminAccounts() {
  const { state, signOut } = useSuperadminSession();
  const subtitle = state.status === "signedIn" ? `Connecté : ${state.email ?? ""}` : "";

  return (
    <SuperadminShell title="Gestion des comptes" subtitle={subtitle} onSignOut={() => void signOut()}>
      <div className="w-full">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-sm font-semibold">Comptes PRO & ÉDITEURS</div>
          <div className="mt-1 text-sm text-white/60">
            Création, suspension, réinitialisation mot de passe, historique d’activité.
          </div>
        </div>
      </div>
    </SuperadminShell>
  );
}
