import { ProAuthGate } from "@/components/pro/ProAuthGate";
import { ProShell } from "@/components/pro/ProShell";

export default function Pro() {
  return (
    <div className="min-h-screen bg-white">
      <ProAuthGate>
        {({ user, signOut }) => <ProShell user={user} onSignOut={signOut} />}
      </ProAuthGate>

    </div>
  );
}
