import { useEffect, useState } from "react";

import { CalendarCheck, ShieldCheck, TrendingDown, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import type { Establishment, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type SecuredReservationsData = {
  totalReservations: number;
  securedReservations: number;
  totalDeposits: number;
  noShowCount: number;
  noShowRate: number;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export function ProImpactTab({ establishment }: Props) {
  const { isTestMode } = usePlatformSettings();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SecuredReservationsData | null>(null);

  useEffect(() => {
    // Fetch secured reservations data
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("pro_access_token");
        if (!token) {
          setData(null);
          return;
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const res = await fetch(
          `/api/pro/establishments/${establishment.id}/dashboard/metrics?since=${startOfMonth.toISOString()}&until=${endOfMonth.toISOString()}`,
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          setData(null);
          return;
        }

        const json = await res.json();
        const reservations = json.reservations ?? [];

        // Calculate metrics
        const totalReservations = reservations.length;
        const securedReservations = reservations.filter(
          (r: any) => r.amount_deposit && r.amount_deposit > 0
        ).length;
        const totalDeposits = reservations.reduce(
          (sum: number, r: any) => sum + (r.amount_deposit ?? 0),
          0
        );
        const noShowCount = reservations.filter(
          (r: any) => r.status === "noshow"
        ).length;
        const noShowRate =
          totalReservations > 0 ? (noShowCount / totalReservations) * 100 : 0;

        setData({
          totalReservations,
          securedReservations,
          totalDeposits,
          noShowCount,
          noShowRate,
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [establishment.id]);

  // In test mode, show a message that this feature is not available
  if (isTestMode()) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Réservations sécurisées</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <div className="text-slate-500">
              Cette fonctionnalité sera disponible en{" "}
              <span className="font-semibold">Mode Commercial</span>.
            </div>
            <div className="text-sm text-slate-400">
              En Mode Test, les paiements et dépôts de garantie sont désactivés.
              Les réservations sécurisées nécessitent ces fonctionnalités pour
              fonctionner.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Commercial mode - simplified view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Réservations sécurisées
        </h2>
      </div>

      <p className="text-sm text-slate-600">
        Vos réservations avec dépôt de garantie sont protégées contre les
        no-shows.
      </p>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Secured Reservations */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">
                  {loading ? "—" : data?.securedReservations ?? 0}
                </div>
                <div className="text-sm text-slate-500">
                  Réservations sécurisées
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Guaranteed */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100">
                <Wallet className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">
                  {loading ? "—" : formatMoney(data?.totalDeposits ?? 0)}
                </div>
                <div className="text-sm text-slate-500">Montant garanti</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Reservations */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <CalendarCheck className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">
                  {loading ? "—" : data?.totalReservations ?? 0}
                </div>
                <div className="text-sm text-slate-500">
                  Réservations ce mois
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* No-show Rate */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  (data?.noShowRate ?? 0) > 10 ? "bg-red-100" : "bg-slate-100"
                }`}
              >
                <TrendingDown
                  className={`h-5 w-5 ${
                    (data?.noShowRate ?? 0) > 10
                      ? "text-red-600"
                      : "text-slate-600"
                  }`}
                />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-900">
                  {loading ? "—" : `${(data?.noShowRate ?? 0).toFixed(1)}%`}
                </div>
                <div className="text-sm text-slate-500">Taux de no-show</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Box */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold text-emerald-900">
                Comment ça fonctionne ?
              </div>
              <p className="text-sm text-emerald-700">
                Les clients versent un dépôt de garantie lors de la réservation.
                En cas de no-show, vous conservez ce montant. Cela réduit
                significativement les absences et protège votre chiffre
                d'affaires.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
