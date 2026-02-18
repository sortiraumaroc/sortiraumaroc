/**
 * Admin Rental Page — Location de vehicules management
 *
 * Tabs: Assurances, Moderation, Statistiques
 */

import { lazy, Suspense } from "react";
import { Car, Shield, Eye, BarChart3 } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AdminInsurancePlansPanel = lazy(() =>
  import("@/components/admin/rental/AdminInsurancePlansPanel").then((m) => ({
    default: m.AdminInsurancePlansPanel,
  })),
);

const AdminRentalModerationPanel = lazy(() =>
  import("@/components/admin/rental/AdminRentalModerationPanel").then((m) => ({
    default: m.AdminRentalModerationPanel,
  })),
);

const AdminRentalStatsPanel = lazy(() =>
  import("@/components/admin/rental/AdminRentalStatsPanel").then((m) => ({
    default: m.AdminRentalStatsPanel,
  })),
);

function TabFallback() {
  return (
    <div className="py-8 text-center text-muted-foreground">Chargement...</div>
  );
}

export function AdminRentalPage() {
  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title={
          <span className="flex items-center gap-2">
            <Car className="w-6 h-6" />
            Location de vehicules
          </span>
        }
        description="Gerez les assurances, moderez les vehicules et consultez les statistiques du module location"
      />

      <Tabs defaultValue="assurances">
        <TabsList>
          <TabsTrigger value="assurances">
            <Shield className="w-4 h-4 mr-1" /> Assurances
          </TabsTrigger>
          <TabsTrigger value="moderation">
            <Eye className="w-4 h-4 mr-1" /> Moderation
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="w-4 h-4 mr-1" /> Statistiques
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assurances">
          <Suspense fallback={<TabFallback />}>
            <AdminInsurancePlansPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="moderation">
          <Suspense fallback={<TabFallback />}>
            <AdminRentalModerationPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="stats">
          <Suspense fallback={<TabFallback />}>
            <AdminRentalStatsPanel />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
