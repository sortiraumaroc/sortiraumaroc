/**
 * AdminAmbassadorsDashboard — Admin dashboard for managing ambassador programs,
 * conversions and fraud detection.
 *
 * 4 tabs:
 *  1. Vue globale (KPI cards)
 *  2. Programmes (table with filters)
 *  3. Conversions (table with status/suspect filters)
 *  4. Fraude (suspicious conversions)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  TrendingUp,
  Gift,
  AlertTriangle,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AdminAmbassadorStats,
  type AdminAmbassadorProgram,
  type AdminAmbassadorConversion,
  getAdminAmbassadorStats,
  listAdminAmbassadorPrograms,
  listAdminAmbassadorConversions,
  listAdminSuspiciousConversions,
  flagAdminConversion,
  forceConfirmAdminConversion,
} from "@/lib/ambassadorAdminApi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    expired: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        map[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {status}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500",
      )}
    >
      {active ? "Actif" : "Inactif"}
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color = "blue",
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
    red: "bg-red-100 text-red-600",
    purple: "bg-purple-100 text-purple-600",
  };
  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            colorMap[color] ?? colorMap.blue,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <XCircle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Users className="mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — Vue globale
// ---------------------------------------------------------------------------

function OverviewTab({
  stats,
  loading,
  error,
  onRefresh,
}: {
  stats: AdminAmbassadorStats | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={onRefresh} />;
  if (!stats) return <EmptyState message="Aucune donnee disponible" />;

  const conversionRate =
    stats.total_conversions > 0
      ? `${Math.round((stats.confirmed_conversions / stats.total_conversions) * 100)}%`
      : "0%";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Programmes actifs" value={stats.active_programs} icon={Gift} color="green" />
        <KpiCard label="Conversions totales" value={stats.total_conversions} icon={TrendingUp} color="blue" />
        <KpiCard label="Recompenses distribuees" value={stats.total_rewards} icon={Gift} color="purple" />
        <KpiCard
          label="Conversions suspectes"
          value={stats.suspicious_conversions}
          icon={AlertTriangle}
          color={stats.suspicious_conversions > 0 ? "red" : "green"}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Candidatures en attente" value={stats.pending_applications} icon={Users} color="amber" />
        <KpiCard label="Conversions confirmees" value={stats.confirmed_conversions} icon={CheckCircle2} color="green" />
        <KpiCard label="Recompenses consommees" value={stats.claimed_rewards} icon={Gift} color="blue" />
        <KpiCard label="Taux de conversion" value={conversionRate} icon={TrendingUp} color="purple" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Programmes
// ---------------------------------------------------------------------------

function ProgramsTab() {
  const [programs, setPrograms] = useState<AdminAmbassadorProgram[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isActive =
        filter === "active" ? true : filter === "inactive" ? false : undefined;
      const data = await listAdminAmbassadorPrograms({
        is_active: isActive,
        page,
        limit: PAGE_SIZE,
      });
      setPrograms(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message ?? "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {(["all", "active", "inactive"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
          >
            {f === "all" ? "Tous" : f === "active" ? "Actifs" : "Inactifs"}
          </Button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchPrograms} />}

      {loading ? (
        <Spinner />
      ) : programs.length === 0 ? (
        <EmptyState message="Aucun programme trouve" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Etablissement</th>
                <th className="px-4 py-3 text-left font-medium">Recompense</th>
                <th className="px-4 py-3 text-left font-medium">Seuil</th>
                <th className="px-4 py-3 text-left font-medium">Mode</th>
                <th className="px-4 py-3 text-right font-medium">Ambassadeurs</th>
                <th className="px-4 py-3 text-right font-medium">Conversions</th>
                <th className="px-4 py-3 text-center font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-b transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.establishment_name}</td>
                  <td className="px-4 py-3">{p.reward_description}</td>
                  <td className="px-4 py-3">{p.conversions_required}</td>
                  <td className="px-4 py-3 capitalize">{p.confirmation_mode}</td>
                  <td className="px-4 py-3 text-right">{p.ambassador_count}</td>
                  <td className="px-4 py-3 text-right">{p.conversions_count}</td>
                  <td className="px-4 py-3 text-center">
                    <ActiveBadge active={p.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} / {totalPages} ({total} programmes)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Precedent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Conversions
// ---------------------------------------------------------------------------

function ConversionsTab() {
  const [conversions, setConversions] = useState<AdminAmbassadorConversion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [suspectOnly, setSuspectOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchConversions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminAmbassadorConversions({
        status: statusFilter || undefined,
        is_suspicious: suspectOnly ? true : undefined,
        page,
        limit: PAGE_SIZE,
      });
      setConversions(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message ?? "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, suspectOnly, page]);

  useEffect(() => {
    fetchConversions();
  }, [fetchConversions]);

  const handleFlag = async (id: string) => {
    setActionLoading(id);
    try {
      await flagAdminConversion(id, {
        is_suspicious: true,
        suspicious_reason: "Flagged par admin",
      });
      await fetchConversions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceConfirm = async (id: string) => {
    setActionLoading(id);
    try {
      await forceConfirmAdminConversion(id);
      await fetchConversions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border bg-white px-3 py-1.5 text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="confirmed">Confirmee</option>
          <option value="rejected">Rejetee</option>
          <option value="expired">Expiree</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={suspectOnly}
            onChange={(e) => {
              setSuspectOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded border"
          />
          Suspects seulement
        </label>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchConversions} />}

      {loading ? (
        <Spinner />
      ) : conversions.length === 0 ? (
        <EmptyState message="Aucune conversion trouvee" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Ambassadeur</th>
                <th className="px-4 py-3 text-left font-medium">Visiteur</th>
                <th className="px-4 py-3 text-left font-medium">Etablissement</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-center font-medium">Statut</th>
                <th className="px-4 py-3 text-center font-medium">Suspect</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id} className="border-b transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.ambassador_name}</td>
                  <td className="px-4 py-3">{c.visitor_name}</td>
                  <td className="px-4 py-3">{c.establishment_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.is_suspicious && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        Suspect
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!c.is_suspicious && c.status !== "confirmed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionLoading === c.id}
                          onClick={() => handleFlag(c.id)}
                          title="Flagger comme suspect"
                        >
                          {actionLoading === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-amber-600" />
                          )}
                        </Button>
                      )}
                      {c.status !== "confirmed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionLoading === c.id}
                          onClick={() => handleForceConfirm(c.id)}
                          title="Forcer confirmation"
                        >
                          {actionLoading === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} / {totalPages} ({total} conversions)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Precedent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — Fraude
// ---------------------------------------------------------------------------

function FraudTab() {
  const [conversions, setConversions] = useState<AdminAmbassadorConversion[]>([]);
  const [totalSuspicious, setTotalSuspicious] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [allConversionsCount, setAllConversionsCount] = useState(0);

  const fetchSuspicious = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [suspicious, allConversions] = await Promise.all([
        listAdminSuspiciousConversions(),
        listAdminAmbassadorConversions({ limit: 1 }),
      ]);
      setConversions(suspicious.items);
      setTotalSuspicious(suspicious.total);
      setAllConversionsCount(allConversions.total);
    } catch (err: any) {
      setError(err.message ?? "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuspicious();
  }, [fetchSuspicious]);

  const handleForceConfirm = async (id: string) => {
    setActionLoading(id);
    try {
      await forceConfirmAdminConversion(id);
      await fetchSuspicious();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const suspectPercent =
    allConversionsCount > 0
      ? `${Math.round((totalSuspicious / allConversionsCount) * 100)}%`
      : "0%";

  return (
    <div className="space-y-4">
      {/* Summary KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Total suspects"
          value={totalSuspicious}
          icon={AlertTriangle}
          color="red"
        />
        <KpiCard
          label="% du total des conversions"
          value={suspectPercent}
          icon={Shield}
          color={totalSuspicious > 0 ? "red" : "green"}
        />
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchSuspicious} />}

      {loading ? (
        <Spinner />
      ) : conversions.length === 0 ? (
        <EmptyState message="Aucune conversion suspecte detectee" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Ambassadeur</th>
                <th className="px-4 py-3 text-left font-medium">Visiteur</th>
                <th className="px-4 py-3 text-left font-medium">Etablissement</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Raison</th>
                <th className="px-4 py-3 text-center font-medium">Statut</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id} className="border-b transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.ambassador_name}</td>
                  <td className="px-4 py-3">{c.visitor_name}</td>
                  <td className="px-4 py-3">{c.establishment_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-sm text-red-600">
                    {c.suspicious_reason ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {c.status !== "confirmed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionLoading === c.id}
                          onClick={() => handleForceConfirm(c.id)}
                          title="Forcer confirmation"
                        >
                          {actionLoading === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function AdminAmbassadorsDashboard() {
  const [stats, setStats] = useState<AdminAmbassadorStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await getAdminAmbassadorStats();
      setStats(data);
    } catch (err: any) {
      setStatsError(err.message ?? "Erreur inconnue");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="overview">Vue globale</TabsTrigger>
          <TabsTrigger value="programs">Programmes</TabsTrigger>
          <TabsTrigger value="conversions">Conversions</TabsTrigger>
          <TabsTrigger value="fraud">Fraude</TabsTrigger>
        </TabsList>
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Actualiser
        </Button>
      </div>

      <TabsContent value="overview">
        <OverviewTab
          stats={stats}
          loading={statsLoading}
          error={statsError}
          onRefresh={fetchStats}
        />
      </TabsContent>

      <TabsContent value="programs">
        <ProgramsTab />
      </TabsContent>

      <TabsContent value="conversions">
        <ConversionsTab />
      </TabsContent>

      <TabsContent value="fraud">
        <FraudTab />
      </TabsContent>
    </Tabs>
  );
}
