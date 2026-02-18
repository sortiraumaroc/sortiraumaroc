/**
 * AdminRentalStatsPanel — Stats dashboard for the rental module.
 *
 * Displays KPI cards and top lists from getAdminRentalStats().
 */

import { useCallback, useEffect, useState } from "react";
import {
  Car,
  BarChart3,
  CalendarCheck,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  RefreshCw,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

import {
  getAdminRentalStats,
  type RentalAdminStats,
} from "@/lib/rentalAdminApi";

// =============================================================================
// Helpers
// =============================================================================

function formatMAD(value: number): string {
  return new Intl.NumberFormat("fr-MA", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " MAD";
}

// =============================================================================
// KPI Card
// =============================================================================

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Car;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Icon className={`w-4 h-4 ${color ?? ""}`} />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${color ?? "text-slate-900"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Panel
// =============================================================================

export function AdminRentalStatsPanel() {
  const [stats, setStats] = useState<RentalAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminRentalStats();
      setStats(res.stats);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger les statistiques",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Chargement des statistiques...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-8 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-2 text-sm text-red-500">
          Erreur lors du chargement des statistiques
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Reessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Vehicules totaux"
          value={stats.total_vehicles}
          icon={Car}
        />
        <KpiCard
          label="Vehicules actifs"
          value={stats.active_vehicles}
          icon={Car}
          color="text-green-600"
        />
        <KpiCard
          label="Etablissements location"
          value={stats.rental_establishments}
          icon={Building2}
          color="text-blue-600"
        />
        <KpiCard
          label="Reservations totales"
          value={stats.total_reservations}
          icon={CalendarCheck}
        />
        <KpiCard
          label="Reservations confirmees"
          value={stats.confirmed_reservations}
          icon={CheckCircle}
          color="text-green-600"
        />
        <KpiCard
          label="En attente KYC"
          value={stats.pending_kyc_reservations}
          icon={Clock}
          color="text-amber-600"
        />
        <KpiCard
          label="Terminees"
          value={stats.completed_reservations}
          icon={TrendingUp}
          color="text-blue-600"
        />
        <KpiCard
          label="Revenu total"
          value={formatMAD(stats.total_revenue)}
          icon={DollarSign}
          color="text-emerald-600"
        />
        <KpiCard
          label="Commission totale"
          value={formatMAD(stats.total_commission)}
          icon={DollarSign}
          color="text-purple-600"
        />
      </div>
    </div>
  );
}
