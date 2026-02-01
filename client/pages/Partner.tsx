import { ProAuthGate } from "@/components/pro/ProAuthGate";
import { PartnerShell } from "@/components/partner/PartnerShell";

export default function Partner() {
  return (
    <div className="min-h-screen bg-white">
      <ProAuthGate variant="partner">
        {({ user, signOut }) => (
          <PartnerShell user={user} onSignOut={signOut} />
        )}
      </ProAuthGate>
    </div>
  );
}
