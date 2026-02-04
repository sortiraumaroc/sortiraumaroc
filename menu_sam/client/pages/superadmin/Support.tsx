import * as React from "react";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";

export default function SuperadminSupport() {
  const { state, signOut } = useSuperadminSession();
  const subtitle = state.status === "signedIn" ? `Connecté : ${state.email ?? ""}` : "";

  return (
    <SuperadminShell title="Support" subtitle={subtitle} onSignOut={() => void signOut()}>
      <div className="w-full space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-sm font-semibold">Tickets & assistance</div>
          <div className="mt-1 text-sm text-white/60">
            Tickets, chat interne SUPERADMIN ↔ PRO, templates de réponses et escalade urgente.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-sm font-semibold">FAQ dynamique</div>
          <div className="mt-1 text-sm text-white/60">Gérée via faq_articles.</div>
        </div>
      </div>
    </SuperadminShell>
  );
}
