import * as React from "react";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";

export default function SuperadminSettings() {
  const { state, signOut } = useSuperadminSession();
  const subtitle = state.status === "signedIn" ? `Connecté : ${state.email ?? ""}` : "";

  return (
    <SuperadminShell title="Paramétrage système" subtitle={subtitle} onSignOut={() => void signOut()}>
      <div className="w-full space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-sm font-semibold">Textes, emails, TVA, devises</div>
          <div className="mt-1 text-sm text-white/60">
            Centralisation des paramètres globaux de la plateforme.
          </div>
        </div>
      </div>
    </SuperadminShell>
  );
}
