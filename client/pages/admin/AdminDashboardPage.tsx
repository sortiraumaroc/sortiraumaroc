import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarCheck,
  CalendarRange,
  CalendarX,
  CreditCard,
  Eye,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Megaphone,
  Package,
  Percent,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { differenceInCalendarDays, format as formatDate, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Cell } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { cn } from "@/lib/utils";

type PeriodPreset = "7d" | "30d" | "90d" | "custom";

type DateRange = {
  start: Date;
  end: Date;
};

type DashboardStats = {
  activeUsers: { value: number; delta: string };
  activePros: { value: number; delta: string };
  establishments: { value: number; delta: string };
  newEstablishments: { value: number; delta: string };
  reservations: { value: number; delta: string };
  cancelledReservations: { value: number; delta: string };
  cancellationRate: { value: string; delta: string };
  noShowRate: { value: string; delta: string };
  gmv: { value: number; delta: string };
  revenue: { value: number; delta: string };
  depositsCollected: { value: number; delta: string };
  avgBasket: { value: number; delta: string };
  packsSold: { value: number; delta: string };
  packsRevenue: { value: number; delta: string };
  mediaPacksSold: { value: number; delta: string };
  pendingPayouts: { value: number; delta: string };
  visitors: { value: number; delta: string };
  pageViews: { value: number; delta: string };
  conversionRate: { value: string; delta: string };
  reservationsChart: Array<{ date: string; label: string; value: number }>;
  revenueChart: Array<{ date: string; label: string; value: number }>;
  topCities: Array<{ name: string; reservations: number; revenue: number }>;
  topCategories: Array<{ name: string; reservations: number; revenue: number }>;
  alerts: Array<{ type: "warning" | "info" | "error"; message: string; count?: number }>;
};

function startOfDayLocal(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function ymd(d: Date): string {
  return formatDate(d, "yyyy-MM-dd");
}

function parseYmd(value: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const dt = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return startOfDayLocal(dt);
}

function normalizeRange(range: DateRange): DateRange {
  const start = startOfDayLocal(range.start);
  const end = startOfDayLocal(range.end);
  if (start.getTime() <= end.getTime()) return { start, end };
  return { start: end, end: start };
}

function formatFrDate(d: Date, fmt: string): string {
  return formatDate(d, fmt, { locale: fr });
}

function formatNumberFR(value: number): string {
  return new Intl.NumberFormat("fr-MA").format(Math.round(value));
}

function formatCurrency(value: number): string {
  return `${formatNumberFR(value)} MAD`;
}

function getPresetRange(preset: Exclude<PeriodPreset, "custom">): DateRange {
  const today = startOfDayLocal(new Date());
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const start = subDays(today, days - 1);
  return normalizeRange({ start, end: today });
}

function periodLabelShort(days: number): string {
  return `${Math.max(1, Math.floor(days))} j`;
}

// KPI Card Component
function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  period,
  loading,
  format = "number",
  className,
}: {
  label: string;
  value: number | string;
  delta: string;
  icon: React.ComponentType<{ className?: string }>;
  period?: string;
  loading?: boolean;
  format?: "number" | "currency" | "percent" | "raw";
  className?: string;
}) {
  const isPositive = delta.startsWith("+") && delta !== "+0%" && delta !== "+0.0%";
  const isNegative = delta.startsWith("-");
  const isNeutral = !isPositive && !isNegative;

  const formattedValue = useMemo(() => {
    if (typeof value === "string") return value;
    switch (format) {
      case "currency":
        return formatCurrency(value);
      case "percent":
        return `${value}%`;
      default:
        return formatNumberFR(value);
    }
  }, [value, format]);

  return (
    <Card className={cn("border-slate-200 flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0 flex items-baseline gap-1 text-slate-600">
            <div className="text-xs sm:text-sm font-semibold leading-tight truncate">{label}</div>
            {period && <div className="text-[11px] sm:text-xs text-slate-400 whitespace-nowrap">({period})</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex flex-1 flex-col">
        {loading ? (
          <Skeleton className="h-7 w-24 mb-2" />
        ) : (
          <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-slate-900 tabular-nums whitespace-nowrap leading-none tracking-tight">
            {formattedValue}
          </div>
        )}
        {loading ? (
          <Skeleton className="h-5 w-16 mt-auto" />
        ) : (
          <Badge
            className={cn(
              "mt-auto w-fit",
              isPositive && "bg-emerald-50 text-emerald-700 border-emerald-200",
              isNegative && "bg-red-50 text-red-700 border-red-200",
              isNeutral && "bg-slate-50 text-slate-600 border-slate-200"
            )}
          >
            {isPositive && <ArrowUpRight className="h-3 w-3 mr-0.5" />}
            {isNegative && <ArrowDownRight className="h-3 w-3 mr-0.5" />}
            {delta}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

// Section Title Component
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-sm font-bold text-slate-700 uppercase tracking-wide", className)}>
      {children}
    </h2>
  );
}

export function AdminDashboardPage() {
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [customStartYmd, setCustomStartYmd] = useState<string>(() => ymd(getPresetRange("7d").start));
  const [customEndYmd, setCustomEndYmd] = useState<string>(() => ymd(getPresetRange("7d").end));
  const [customDraftStartYmd, setCustomDraftStartYmd] = useState(customStartYmd);
  const [customDraftEndYmd, setCustomDraftEndYmd] = useState(customEndYmd);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo<DateRange>(() => {
    if (preset !== "custom") return getPresetRange(preset);
    const start = parseYmd(customStartYmd) ?? getPresetRange("7d").start;
    const end = parseYmd(customEndYmd) ?? getPresetRange("7d").end;
    return normalizeRange({ start, end });
  }, [preset, customStartYmd, customEndYmd]);

  const daysCount = useMemo(() => {
    return Math.max(1, differenceInCalendarDays(range.end, range.start) + 1);
  }, [range.end, range.start]);

  const customRangeLabel = useMemo(() => {
    const start = parseYmd(customStartYmd);
    const end = parseYmd(customEndYmd);
    if (!start || !end) return "Choisir des dates";
    const startStr = formatFrDate(start, "dd/MM/yyyy");
    const endStr = formatFrDate(end, "dd/MM/yyyy");
    return `Du ${startStr} au ${endStr}`;
  }, [customEndYmd, customStartYmd]);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dashboard/stats?period=${preset}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erreur lors du chargement");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      // Set fallback mock data for development
      setStats(getMockStats());
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const chartTitle = useMemo(() => {
    if (preset === "custom") {
      const startStr = formatFrDate(range.start, "dd/MM/yyyy");
      const endStr = formatFrDate(range.end, "dd/MM/yyyy");
      return `Réservations · du ${startStr} au ${endStr}`;
    }
    return `Réservations · ${daysCount} derniers jours`;
  }, [daysCount, preset, range.end, range.start]);

  const period = periodLabelShort(daysCount);

  // Colors for charts
  const categoryColors = ["#a3001d", "#dc2626", "#f97316", "#eab308", "#22c55e"];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité Sortir Au Maroc."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={fetchStats}
              disabled={loading}
              title="Actualiser"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-500 leading-none">Période</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="w-full sm:w-[180px]">
                  <Select
                    value={preset}
                    onValueChange={(v) => {
                      const next = v as PeriodPreset;
                      setPreset(next);
                      if (next === "custom") {
                        setCustomDraftStartYmd(customStartYmd);
                        setCustomDraftEndYmd(customEndYmd);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="7d">7 jours</SelectItem>
                      <SelectItem value="30d">30 jours</SelectItem>
                      <SelectItem value="90d">90 jours</SelectItem>
                      <SelectItem value="custom">Personnalisée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {preset === "custom" && (
                  <Popover open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 w-full sm:w-auto gap-2 justify-start sm:justify-center">
                        <CalendarRange className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{customRangeLabel}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80">
                      <div className="text-sm font-bold text-slate-900">Période personnalisée</div>
                      <div className="mt-3 grid grid-cols-1 gap-3">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-500">Du</div>
                          <Input
                            type="date"
                            value={customDraftStartYmd}
                            onChange={(e) => setCustomDraftStartYmd(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-500">Au</div>
                          <Input
                            type="date"
                            value={customDraftEndYmd}
                            onChange={(e) => setCustomDraftEndYmd(e.target.value)}
                          />
                        </div>
                        <Button
                          className="w-full bg-primary text-white hover:bg-primary/90"
                          onClick={() => {
                            const s = parseYmd(customDraftStartYmd);
                            const e = parseYmd(customDraftEndYmd);
                            if (!s || !e) return;
                            const normalized = normalizeRange({ start: s, end: e });
                            setCustomStartYmd(ymd(normalized.start));
                            setCustomEndYmd(ymd(normalized.end));
                            setCustomPickerOpen(false);
                          }}
                        >
                          Appliquer
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
          <strong>Note :</strong> Les données affichées sont simulées. Connectez la base de données pour des données réelles.
        </div>
      )}

      {/* Row 1: Core Metrics */}
      <div>
        <SectionTitle className="mb-3">Vue d'ensemble</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard
            label="Utilisateurs actifs"
            value={stats?.activeUsers.value ?? 0}
            delta={stats?.activeUsers.delta ?? "0%"}
            icon={Users}
            loading={loading}
          />
          <KpiCard
            label="Pros actifs"
            value={stats?.activePros.value ?? 0}
            delta={stats?.activePros.delta ?? "0%"}
            icon={Activity}
            loading={loading}
          />
          <KpiCard
            label="Établissements"
            value={stats?.establishments.value ?? 0}
            delta={stats?.establishments.delta ?? "0%"}
            icon={Building2}
            loading={loading}
          />
          <KpiCard
            label="Nouveaux établissements"
            value={stats?.newEstablishments.value ?? 0}
            delta={stats?.newEstablishments.delta ?? "0%"}
            icon={Building2}
            period={period}
            loading={loading}
          />
        </div>
      </div>

      {/* Row 2: Reservations & Operations */}
      <div>
        <SectionTitle className="mb-3">Réservations & Opérations</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard
            label="Réservations"
            value={stats?.reservations.value ?? 0}
            delta={stats?.reservations.delta ?? "0%"}
            icon={CalendarCheck}
            period={period}
            loading={loading}
          />
          <KpiCard
            label="Annulations"
            value={stats?.cancelledReservations.value ?? 0}
            delta={stats?.cancellationRate.delta ?? "0%"}
            icon={CalendarX}
            period={period}
            loading={loading}
          />
          <KpiCard
            label="Taux d'annulation"
            value={stats?.cancellationRate.value ?? "0%"}
            delta={stats?.cancellationRate.delta ?? "0%"}
            icon={Percent}
            period={period}
            loading={loading}
            format="raw"
          />
          <KpiCard
            label="Taux de no-show"
            value={stats?.noShowRate.value ?? "0%"}
            delta={stats?.noShowRate.delta ?? "N/A"}
            icon={XCircle}
            period={period}
            loading={loading}
            format="raw"
          />
        </div>
      </div>

      {/* Row 3: Financial */}
      <div>
        <SectionTitle className="mb-3">Finances</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard
            label="GMV (Volume brut)"
            value={stats?.gmv.value ?? 0}
            delta={stats?.gmv.delta ?? "0%"}
            icon={TrendingUp}
            period={period}
            loading={loading}
            format="currency"
          />
          <KpiCard
            label="Revenus (commissions)"
            value={stats?.revenue.value ?? 0}
            delta={stats?.revenue.delta ?? "0%"}
            icon={Banknote}
            period={period}
            loading={loading}
            format="currency"
          />
          <KpiCard
            label="Acomptes collectés"
            value={stats?.depositsCollected.value ?? 0}
            delta={stats?.depositsCollected.delta ?? "0%"}
            icon={CreditCard}
            period={period}
            loading={loading}
            format="currency"
          />
          <KpiCard
            label="Panier moyen"
            value={stats?.avgBasket.value ?? 0}
            delta={stats?.avgBasket.delta ?? "0%"}
            icon={Wallet}
            period={period}
            loading={loading}
            format="currency"
          />
        </div>
      </div>

      {/* Row 4: Packs & Payouts */}
      <div>
        <SectionTitle className="mb-3">Packs & Versements</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard
            label="Packs vendus"
            value={stats?.packsSold.value ?? 0}
            delta={stats?.packsSold.delta ?? "0%"}
            icon={Package}
            period={period}
            loading={loading}
          />
          <KpiCard
            label="CA Packs"
            value={stats?.packsRevenue.value ?? 0}
            delta={stats?.packsRevenue.delta ?? "0%"}
            icon={Banknote}
            period={period}
            loading={loading}
            format="currency"
          />
          <KpiCard
            label="Packs Média vendus"
            value={stats?.mediaPacksSold.value ?? 0}
            delta={stats?.mediaPacksSold.delta ?? "0%"}
            icon={Megaphone}
            period={period}
            loading={loading}
          />
          <KpiCard
            label="Payout en attente"
            value={stats?.pendingPayouts.value ?? 0}
            delta={stats?.pendingPayouts.delta ?? "N/A"}
            icon={Wallet}
            loading={loading}
            format="currency"
          />
        </div>
      </div>

      {/* Row 5: Traffic */}
      <div>
        <SectionTitle className="mb-3">Trafic & Conversion</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard
            label="Visiteurs"
            value={stats?.visitors.value ?? 0}
            delta={stats?.visitors.delta ?? "0%"}
            icon={Globe}
            period={period}
            loading={loading}
          />
          <KpiCard
            label="Pages vues"
            value={stats?.pageViews.value ?? 0}
            delta={stats?.pageViews.delta ?? "0%"}
            icon={FileText}
            period={period}
            loading={loading}
          />
          <KpiCard
            label="Taux de conversion"
            value={stats?.conversionRate.value ?? "0%"}
            delta={stats?.conversionRate.delta ?? "0%"}
            icon={TrendingUp}
            period={period}
            loading={loading}
            format="raw"
          />
          <KpiCard
            label="Visiteurs / Réservation"
            value={stats?.visitors.value && stats?.reservations.value
              ? Math.round(stats.visitors.value / stats.reservations.value)
              : 0}
            delta="N/A"
            icon={Eye}
            period={period}
            loading={loading}
          />
        </div>
      </div>

      {/* Charts & Details Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Reservations Chart */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm sm:text-base font-bold">{chartTitle}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-[280px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={stats?.reservationsChart ?? []}
                  margin={{ left: 8, right: 8, top: 10, bottom: 0 }}
                >
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    formatter={(value) => [formatNumberFR(Number(value)), "Réservations"]}
                    labelFormatter={(_, payload) => {
                      const first = Array.isArray(payload) && payload[0] ? payload[0].payload : null;
                      return first?.date ?? "";
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#a3001d" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="border-slate-200 flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Alertes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-sm lg:h-[280px] overflow-auto space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : stats?.alerts && stats.alerts.length > 0 ? (
              stats.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-md border p-3 leading-snug",
                    alert.type === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
                    alert.type === "info" && "border-slate-200 bg-slate-50 text-slate-700",
                    alert.type === "error" && "border-red-200 bg-red-50 text-red-900"
                  )}
                >
                  {alert.message}
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-4">Aucune alerte</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Performers Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Cities */}
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Top villes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-[220px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : stats?.topCities && stats.topCities.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topCities} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={80} />
                  <Tooltip formatter={(value) => [formatNumberFR(Number(value)), "Réservations"]} />
                  <Bar dataKey="reservations" radius={[0, 4, 4, 0]}>
                    {stats.topCities.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={categoryColors[index % categoryColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">Aucune donnée</div>
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top catégories
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 h-[220px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : stats?.topCategories && stats.topCategories.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topCategories} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={80} />
                  <Tooltip formatter={(value) => [formatNumberFR(Number(value)), "Réservations"]} />
                  <Bar dataKey="reservations" radius={[0, 4, 4, 0]}>
                    {stats.topCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={categoryColors[index % categoryColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">Aucune donnée</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Mock data for development/fallback
function getMockStats(): DashboardStats {
  const mockChartData = [
    { date: "2026-01-24", label: "Sam", value: 1342 },
    { date: "2026-01-25", label: "Dim", value: 1456 },
    { date: "2026-01-26", label: "Lun", value: 1289 },
    { date: "2026-01-27", label: "Mar", value: 1378 },
    { date: "2026-01-28", label: "Mer", value: 1234 },
    { date: "2026-01-29", label: "Jeu", value: 1156 },
    { date: "2026-01-30", label: "Ven", value: 1089 },
  ];

  return {
    activeUsers: { value: 12480, delta: "+4.2%" },
    activePros: { value: 1124, delta: "+1.1%" },
    establishments: { value: 2987, delta: "+0.8%" },
    newEstablishments: { value: 47, delta: "+12.3%" },

    reservations: { value: 9394, delta: "+6.7%" },
    cancelledReservations: { value: 284, delta: "-2.1%" },
    cancellationRate: { value: "3.0%", delta: "-8.2%" },
    noShowRate: { value: "1.2%", delta: "-5.0%" },

    gmv: { value: 3945480, delta: "+4.9%" },
    revenue: { value: 394548, delta: "+5.2%" },
    depositsCollected: { value: 1437282, delta: "+3.0%" },
    avgBasket: { value: 420, delta: "+1.8%" },

    packsSold: { value: 1691, delta: "+2.4%" },
    packsRevenue: { value: 845500, delta: "+3.1%" },
    mediaPacksSold: { value: 541, delta: "+1.6%" },
    pendingPayouts: { value: 234500, delta: "N/A" },

    visitors: { value: 375760, delta: "+5.8%" },
    pageViews: { value: 1690920, delta: "+6.2%" },
    conversionRate: { value: "2.5%", delta: "+0.3%" },

    reservationsChart: mockChartData,
    revenueChart: [],

    topCities: [
      { name: "Casablanca", reservations: 2847, revenue: 1195740 },
      { name: "Marrakech", reservations: 2134, revenue: 896280 },
      { name: "Rabat", reservations: 1567, revenue: 658140 },
      { name: "Tanger", reservations: 1234, revenue: 518280 },
      { name: "Agadir", reservations: 987, revenue: 414540 },
    ],

    topCategories: [
      { name: "Restaurants", reservations: 3456, revenue: 1451520 },
      { name: "Sport", reservations: 2345, revenue: 984900 },
      { name: "Loisirs", reservations: 1876, revenue: 787920 },
      { name: "Hébergement", reservations: 1234, revenue: 518280 },
      { name: "Bien-être", reservations: 987, revenue: 414540 },
    ],

    alerts: [
      { type: "warning", message: "Pic de no-show détecté sur 3 établissements.", count: 3 },
      { type: "info", message: "12 demandes de modération en attente.", count: 12 },
      { type: "error", message: "5 paiements en échec (à investiguer).", count: 5 },
    ],
  };
}
