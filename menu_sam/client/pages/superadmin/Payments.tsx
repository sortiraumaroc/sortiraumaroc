import * as React from "react";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";

export default function SuperadminPayments() {
  const { state, signOut } = useSuperadminSession();
  const subtitle = state.status === "signedIn" ? `Connecté : ${state.email ?? ""}` : "";

  return (
    <SuperadminShell title="Système de paiement" subtitle={subtitle} onSignOut={() => void signOut()}>
      <div className="w-full">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-sm font-semibold">Contrôle du paiement</div>
          <div className="mt-1 text-sm text-white/60">
            Activation/désactivation par établissement, suivi litiges, commissions, synchronisation.
          </div>
        </div>
      </div>
    </SuperadminShell>
  );
}
