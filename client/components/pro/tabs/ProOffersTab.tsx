import { ProInventoryManager } from "@/components/pro/inventory/ProInventoryManager";
import type { Establishment, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
  onNavigateToTab: (tab: string) => void;
};

export function ProOffersTab({ establishment, role }: Props) {
  return <ProInventoryManager establishment={establishment} role={role} />;
}
