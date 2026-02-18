// =============================================================================
// PRO RENTAL TAB - Gestion de la location de vehicules
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, ListOrdered, Settings2, BarChart3, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { ProRentalVehicleManager } from "@/components/pro/rental/ProRentalVehicleManager";
import { ProRentalOptionsManager } from "@/components/pro/rental/ProRentalOptionsManager";
import { ProRentalReservations } from "@/components/pro/rental/ProRentalReservations";
import { getProRentalStats, type RentalProStats } from "@/lib/rentalProApi";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  establishment: { id: string; name: string; city?: string };
};

// =============================================================================
// STATUS LABEL MAP
// =============================================================================

const STATUS_LABELS: Record<string, string> = {
  pending_kyc: "En attente KYC",
  confirmed: "Confirmees",
  in_progress: "En cours",
  completed: "Terminees",
  cancelled: "Annulees",
  cancelled_user: "Annulees (client)",
  cancelled_pro: "Annulees (pro)",
  disputed: "Litiges",
  expired: "Expirees",
};

// =============================================================================
// STATS DASHBOARD
// =============================================================================

function StatsDashboard({ establishmentId }: { establishmentId: string }) {
  const [stats, setStats] = useState<RentalProStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { stats: data } = await getProRentalStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement des statistiques");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Chargement des statistiques...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total vehicules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_vehicles}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.active_vehicles} actif{stats.active_vehicles > 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total reservations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_reservations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chiffre d'affaires
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.total_revenue.toLocaleString("fr-MA")} MAD
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Commission SAM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.total_commission.toLocaleString("fr-MA")} MAD
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reservations by status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Reservations par statut
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(stats.reservations_by_status).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune reservation pour le moment.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(stats.reservations_by_status).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="text-sm text-muted-foreground">
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProRentalTab({ establishment }: Props) {
  const [activeTab, setActiveTab] = useState("vehicles");

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="vehicles" className="gap-1.5 text-xs sm:text-sm">
            <Car className="h-4 w-4" />
            <span className="hidden sm:inline">Vehicules</span>
            <span className="sm:hidden">Vehic.</span>
          </TabsTrigger>
          <TabsTrigger value="reservations" className="gap-1.5 text-xs sm:text-sm">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Reservations</span>
            <span className="sm:hidden">Reserv.</span>
          </TabsTrigger>
          <TabsTrigger value="options" className="gap-1.5 text-xs sm:text-sm">
            <Settings2 className="h-4 w-4" />
            <span>Options</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Statistiques</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-4">
          <ProRentalVehicleManager establishmentId={establishment.id} />
        </TabsContent>

        <TabsContent value="reservations" className="mt-4">
          <ProRentalReservations establishmentId={establishment.id} />
        </TabsContent>

        <TabsContent value="options" className="mt-4">
          <ProRentalOptionsManager establishmentId={establishment.id} />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <StatsDashboard establishmentId={establishment.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
