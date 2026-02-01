import { Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ProInventoryManager } from "@/components/pro/inventory/ProInventoryManager";
import type { Establishment, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
  onNavigateToTab: (tab: string) => void;
};

function canWrite(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "marketing";
}

export function ProOffersTab({ establishment, role, onNavigateToTab }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-lg font-extrabold text-slate-900">Offres</div>
          {!canWrite(role) ? <Badge className="bg-slate-50 text-slate-700 border-slate-200">Lecture seule</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button className="gap-2" variant="outline" onClick={() => onNavigateToTab("slots")}>
            <Settings className="w-4 h-4" />
            Créneaux & Packs
          </Button>
        </div>
      </div>

      <ProInventoryManager establishment={establishment} role={role} />
    </div>
  );
}
