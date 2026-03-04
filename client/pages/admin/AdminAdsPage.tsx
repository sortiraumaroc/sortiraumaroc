import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";
import { AdminAdsPanel } from "@/components/admin/ads/AdminAdsPanel";

export function AdminAdsPage() {
  return (
    <div className="space-y-4">
      <AdminVisibilityNav />
      <AdminPageHeader
        title="Publicités"
        description="Modération des campagnes, configuration des enchères et suivi des revenus publicitaires."
      />
      <AdminAdsPanel />
    </div>
  );
}
