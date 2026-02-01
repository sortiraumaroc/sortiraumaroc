import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminAdsPanel } from "@/components/admin/ads/AdminAdsPanel";

export function AdminAdsPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Publicités"
        description="Modération des campagnes, configuration des enchères et suivi des revenus publicitaires."
      />
      <AdminAdsPanel />
    </div>
  );
}
