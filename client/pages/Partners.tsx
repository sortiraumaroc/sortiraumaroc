import { ProAuthGate } from "@/components/pro/ProAuthGate";
import { PartnerLayout } from "@/components/partner/PartnerLayout";

export default function Partners() {
  return (
    <ProAuthGate variant="partner">
      {({ user, signOut }) => <PartnerLayout user={user} onSignOut={signOut} />}
    </ProAuthGate>
  );
}
