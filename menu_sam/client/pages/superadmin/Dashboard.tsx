import * as React from "react";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";
import { getSuperadminSupabaseClient } from "@/lib/superadmin-supabase";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-medium text-white/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs text-white/50">{helper}</div> : null}
    </div>
  );
}

type GlobalStats = {
  connectedTotal: number;
  clientsTotal: number;
  clientsActive: number;
  clientsInactive: number;
  ordersTotal: number;
  revenueTotalDh: number;
};

function defaultStats(): GlobalStats {
  return {
    connectedTotal: 0,
    clientsTotal: 0,
    clientsActive: 0,
    clientsInactive: 0,
    ordersTotal: 0,
    revenueTotalDh: 0,
  };
}

export default function SuperadminDashboard() {
  const supabase = React.useMemo(() => getSuperadminSupabaseClient(), []);
  const { state, signOut } = useSuperadminSession();

  const [stats, setStats] = React.useState<GlobalStats>(() => defaultStats());
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Note: These tables may not exist yet in the DB. We fail gracefully.
      // When migrations are applied, this will start showing real numbers.

      let connectedTotal = 0;
      try {
        const connectedRes = await supabase.from("global_stats").select("connected_total").order("created_at", {
          ascending: false,
        }).limit(1).maybeSingle();
        connectedTotal = connectedRes.error ? 0 : Number((connectedRes.data as any)?.connected_total ?? 0);
      } catch {
        connectedTotal = 0;
      }

      let clientsTotal = 0;
      let clientsActive = 0;
      let clientsInactive = 0;
      try {
        const clientsRes = await supabase.from("consumer_users").select("id, status", { count: "exact" });

        if (!clientsRes.error) {
          clientsTotal = clientsRes.count ?? 0;
          const rows = (clientsRes.data ?? []) as any[];
          clientsActive = rows.filter((r) => r.status === "active").length;
          clientsInactive = rows.filter((r) => r.status === "suspended").length;
        }
      } catch {
        clientsTotal = 0;
        clientsActive = 0;
        clientsInactive = 0;
      }

      let ordersTotal = 0;
      try {
        const ordersRes = await supabase.from("qr_table_orders").select("id", { count: "exact" });
        ordersTotal = ordersRes.error ? 0 : ordersRes.count ?? 0;
      } catch {
        ordersTotal = 0;
      }

      let revenueTotalDh = 0;
      try {
        const purchasesRes = await supabase.from("consumer_purchases").select("total_amount, status");
        if (!purchasesRes.error) {
          revenueTotalDh += (purchasesRes.data as any[]).reduce((sum, row) => {
            if (row?.status !== "paid") return sum;
            return sum + (Number(row?.total_amount ?? 0) || 0);
          }, 0);
        }
      } catch {
        // ignore
      }

      try {
        const reservationsRes = await supabase.from("reservations").select("amount_total, payment_status");
        if (!reservationsRes.error) {
          revenueTotalDh += (reservationsRes.data as any[]).reduce((sum, row) => {
            if (row?.payment_status !== "paid") return sum;
            return sum + (Number(row?.amount_total ?? 0) || 0);
          }, 0);
        }
      } catch {
        // ignore
      }

      setStats({
        connectedTotal,
        clientsTotal,
        clientsActive,
        clientsInactive,
        ordersTotal,
        revenueTotalDh,
      });
    } catch {
      setStats(defaultStats());
      setLoadError("Impossible de charger les statistiques pour le moment.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const subtitle =
    state.status === "signedIn" && state.email
      ? `Connecté : ${state.email}`
      : "Console de supervision globale";

  return (
    <SuperadminShell title="Tableau de bord" subtitle={subtitle} onSignOut={() => void signOut()}>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Personnes connectées (PRO + clients)"
            value={loading ? "…" : stats.connectedTotal}
            helper="(temps réel via global_stats)"
          />
          <StatCard
            label="Clients"
            value={loading ? "…" : stats.clientsTotal}
            helper={
              loading
                ? undefined
                : `Actifs: ${stats.clientsActive} • Inactifs: ${stats.clientsInactive}`
            }
          />
          <StatCard label="Commandes (tous établissements)" value={loading ? "…" : stats.ordersTotal} />
          <StatCard
            label="CA total (Dhs)"
            value={loading ? "…" : Math.round(stats.revenueTotalDh)}
            helper="Somme des achats + réservations payées"
          />
          <StatCard label="Top 5 établissements" value={"Voir plus"} helper="Disponible dès que les stats sont agrégées." />
          <StatCard label="Alertes" value={"Surveillance"} helper="Paiement / QR / commandes en retard" />
        </div>

        <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-4")}> 
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Alertes & incidents</div>
              <div className="mt-1 text-xs text-white/60">
                Paiements refusés, QR non accessibles, commandes non traitées…
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm",
                "bg-white/10 text-white hover:bg-white/15",
              )}
            >
              Rafraîchir
            </button>
          </div>

          {loadError ? <div className="mt-3 text-sm text-white/70">{loadError}</div> : null}

          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-semibold text-white/80">Alerte (exemple)</div>
              <div className="mt-1 text-xs text-white/60">
                Les alertes automatiques seront alimentées par system_logs + payment_settings.
              </div>
            </div>
          </div>
        </div>
      </div>
    </SuperadminShell>
  );
}
