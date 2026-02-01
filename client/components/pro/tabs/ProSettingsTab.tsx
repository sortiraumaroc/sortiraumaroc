import type { Establishment, ProRole } from "@/lib/pro/types";

import { ProBookingSettingsTab } from "@/components/pro/tabs/ProBookingSettingsTab";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

export function ProSettingsTab({ establishment, role }: Props) {
  return <ProBookingSettingsTab establishment={establishment} role={role} />;
}
