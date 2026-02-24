import { ConciergerieAuthGate } from "@/components/conciergerie/ConciergerieAuthGate";
import ConciergerieShell from "@/components/conciergerie/ConciergerieShell";

export default function Conciergerie() {
  return (
    <div className="min-h-screen bg-white">
      <ConciergerieAuthGate>
        {({ user, concierge, signOut }) => (
          <ConciergerieShell
            user={user}
            concierge={concierge}
            onSignOut={signOut}
          />
        )}
      </ConciergerieAuthGate>
    </div>
  );
}
