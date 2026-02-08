import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  Eye,
  HandCoins,
  Info,
  MessageCircle,
  Minus,
  Percent,
  RefreshCw,
  ShoppingBag,
  Star,
  UserPlus,
  UserX,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  addDays,
  differenceInCalendarDays,
  startOfDay,
  subDays,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import type { User } from "@supabase/supabase-js";

import { ProKpiCard } from "@/components/pro/ProKpiCard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  buildDemoNotificationsForToday,
  buildSystemNotificationsForToday,
  filterNotificationsForDay,
  filterNotificationsForEstablishment,
  formatRelativeTimeFr,
  getNotificationTargetTab,
  sortNotificationsByCreatedAtDesc,
} from "@/lib/pro/notifications";
import { getProDashboardAlerts, getProDashboardMetrics } from "@/lib/pro/api";
import { isDemoModeEnabled } from "@/lib/demoMode";
import type { Establishment, ProInvoice, ProNotification, ProRole, Reservation } from "@/lib/pro/types";
import { cn } from "@/lib/utils";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

type Props = {
  establishment: Establishment;
  role: ProRole;
  user: User;
  onNavigateToTab?: (tab: string) => void;
};

type PeriodPreset = "last7" | "last30" | "last90" | "custom";

type WindowMetrics = {
  reservations: number;
  visits: number;
  revenueReservations: number;
  revenuePacks: number;
  revenueTotal: number;
  deposits: number;
  commission: number;
  // New metrics for test mode
  noShowCount: number;
  reviewCount: number;
  avgRating: number | null;
  conversionRate: number | null; // visits -> reservations %
  newClientsCount: number;
  returningClientsCount: number;
};

type VisitRow = { visited_at: string };

type PackPurchaseRow = unknown;

type Trend = {
  attaching: boolean;
  label: string;
  direction: "up" | "down" | "flat";
};

type AlertTone = "info" | "success" | "warning" | "danger";


function alertToneClasses(tone: AlertTone) {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "danger":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function categoryToAlertTone(category: string): AlertTone {
  if (category === "booking") return "success";
  if (category === "billing") return "danger";
  if (category === "moderation") return "warning";
  return "info";
}

function categoryToAlertIcon(category: string): ComponentType<{ className?: string }> {
  if (category === "booking") return CalendarCheck;
  if (category === "messages") return MessageCircle;
  if (category === "billing") return BadgeCheck;
  if (category === "visibility") return Star;
  if (category === "moderation") return AlertTriangle;
  return Info;
}

function categoryToTargetTab(category: string): string | null {
  if (category === "booking") return "reservations";
  if (category === "messages") return "messages";
  if (category === "visibility") return "visibility";
  if (category === "billing") return "billing";
  if (category === "moderation") return "establishment";
  return null;
}

function notificationToAlertPresentation(n: ProNotification) {
  const icon = categoryToAlertIcon(n.category);
  const tone = categoryToAlertTone(n.category);
  const targetTab = getNotificationTargetTab(n) ?? categoryToTargetTab(n.category) ?? "notifications";
  const meta = formatRelativeTimeFr(n.created_at);
  return { icon, tone, targetTab, meta };
}

function formatMoney(amount: number | null | undefined, currency: string) {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("fr-MA", { style: "currency", currency }).format(n / 100);
}

function formatDayFr(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function safeStartOfDay(date: Date) {
  const d = startOfDay(date);
  return Number.isNaN(d.getTime()) ? startOfDay(new Date()) : d;
}

function normalizeRange(range: DateRange | undefined, fallback: DateRange): DateRange {
  const from = range?.from ? safeStartOfDay(range.from) : safeStartOfDay(fallback.from!);
  const to = range?.to ? safeStartOfDay(range.to) : safeStartOfDay(range?.from ?? fallback.to!);

  if (to.getTime() < from.getTime()) {
    return { from: to, to: from };
  }

  return { from, to };
}

function presetRange(preset: Exclude<PeriodPreset, "custom">, now: Date): DateRange {
  const end = safeStartOfDay(now);
  const days = preset === "last7" ? 7 : preset === "last30" ? 30 : 90;
  return { from: safeStartOfDay(subDays(end, days - 1)), to: end };
}

function rangeDays(range: DateRange) {
  const from = safeStartOfDay(range.from!);
  const to = safeStartOfDay(range.to!);
  return Math.max(1, differenceInCalendarDays(to, from) + 1);
}

function toExclusive(range: DateRange) {
  return addDays(safeStartOfDay(range.to!), 1);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getFirstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = asNumber(obj[k]);
    if (n !== null) return n;
  }
  return null;
}

function getFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const s = asString(obj[k]);
    if (s !== null) return s;
  }
  return null;
}

function isPaidLikeStatus(status: string): boolean {
  const s = status.toLowerCase();
  if (s.includes("refunded") || s.includes("failed") || s.includes("cancel") || s.includes("canceled") || s.includes("pending")) {
    return false;
  }
  if (s.includes("paid") || s.includes("succeed") || s.includes("success") || s.includes("confirm")) {
    return true;
  }
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function packPurchaseDate(row: PackPurchaseRow): Date | null {
  if (!isRecord(row)) return null;
  const iso = getFirstString(row, ["paid_at", "paidAt", "purchased_at", "created_at", "createdAt"]);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function packPurchaseAmountCents(row: PackPurchaseRow): number {
  if (!isRecord(row)) return 0;

  const status = getFirstString(row, ["payment_status", "paymentStatus", "status"]);
  if (status && !isPaidLikeStatus(status)) return 0;

  const amount = getFirstNumber(row, [
    "amount_total",
    "amountTotal",
    "total_amount",
    "totalAmount",
    "total",
    "price_total",
    "priceTotal",
  ]);
  if (amount !== null) return amount;

  const unit = getFirstNumber(row, ["unit_price", "unitPrice", "price", "unit_amount", "unitAmount"]);
  const qty = getFirstNumber(row, ["quantity", "qty"]);
  if (unit !== null && qty !== null) {
    return Math.round(unit * Math.max(1, qty));
  }

  return 0;
}

function computeMetrics(
  reservations: Reservation[] | null | undefined,
  visits: VisitRow[] | null | undefined,
  packPurchases: PackPurchaseRow[] | null | undefined,
  from: Date,
  toExcl: Date,
  apiNoShowCount?: number,
  apiReviewCount?: number,
  apiAvgRating?: number | null,
  apiNewClientsCount?: number,
  apiReturningClientsCount?: number,
): WindowMetrics {
  let reservationsCount = 0;
  let visitsCount = 0;
  let noShowCount = 0;

  let revenueReservations = 0;
  let revenuePacks = 0;
  let deposits = 0;
  let commission = 0;

  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeVisits = Array.isArray(visits) ? visits : [];
  const safePackPurchases = Array.isArray(packPurchases) ? packPurchases : [];

  for (const r of safeReservations) {
    const d = new Date(r.starts_at);
    if (Number.isNaN(d.getTime())) continue;
    if (d < from || d >= toExcl) continue;

    reservationsCount += 1;

    // Count no-shows
    if (r.status === "noshow") {
      noShowCount += 1;
    }

    if (r.status === "confirmed" && r.payment_status === "paid") {
      revenueReservations += r.amount_total ?? 0;
      deposits += r.amount_deposit ?? 0;
      commission += r.commission_amount ?? 0;
    }
  }

  for (const v of safeVisits) {
    const d = new Date(v.visited_at);
    if (Number.isNaN(d.getTime())) continue;
    if (d < from || d >= toExcl) continue;
    visitsCount += 1;
  }

  for (const p of safePackPurchases) {
    const d = packPurchaseDate(p);
    if (!d) continue;
    if (d < from || d >= toExcl) continue;
    revenuePacks += packPurchaseAmountCents(p);
  }

  const revenueTotal = revenueReservations + revenuePacks;

  // Calculate conversion rate (visits -> reservations)
  const conversionRate = visitsCount > 0
    ? Math.round((reservationsCount / visitsCount) * 100 * 10) / 10
    : null;

  return {
    reservations: reservationsCount,
    visits: visitsCount,
    revenueReservations,
    revenuePacks,
    revenueTotal,
    deposits,
    commission,
    // New metrics
    noShowCount: apiNoShowCount ?? noShowCount,
    reviewCount: apiReviewCount ?? 0,
    avgRating: apiAvgRating ?? null,
    conversionRate,
    newClientsCount: apiNewClientsCount ?? 0,
    returningClientsCount: apiReturningClientsCount ?? 0,
  };
}

function computeTrend(current: number, previous: number): Trend {
  if (previous <= 0) {
    if (current <= 0) {
      return { attaching: false, label: "0%", direction: "flat" };
    }
    return { attaching: true, label: "Nouveau", direction: "up" };
  }

  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const label = `${rounded > 0 ? "+" : ""}${rounded}%`;
  return { attaching: false, label, direction };
}

function TrendPillFromTrend({ trend, className }: { trend: Trend; className?: string }) {
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;

  const tone =
    trend.direction === "up"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : trend.direction === "down"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:gap-1 sm:px-2 sm:text-xs",
        tone,
        className,
      )}
      aria-label={`Évolution: ${trend.label}`}
    >
      <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
      <span className="whitespace-nowrap">{trend.label}</span>
    </div>
  );
}

function TrendPill({ current, previous, className, invertColors }: { current: number; previous: number; className?: string; invertColors?: boolean }) {
  const trend = computeTrend(current, previous);

  // For metrics where increase is bad (like no-shows), invert the colors
  if (invertColors) {
    const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;
    const tone =
      trend.direction === "up"
        ? "bg-red-50 text-red-700 border-red-200" // up is bad
        : trend.direction === "down"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200" // down is good
          : "bg-slate-50 text-slate-700 border-slate-200";

    return (
      <div
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:gap-1 sm:px-2 sm:text-xs",
          tone,
          className,
        )}
        aria-label={`Évolution: ${trend.label}`}
      >
        <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        <span className="whitespace-nowrap">{trend.label}</span>
      </div>
    );
  }

  return <TrendPillFromTrend trend={trend} className={className} />;
}

function computeCompositeTrend(current: WindowMetrics, previous: WindowMetrics): Trend {
  const ratios: number[] = [];

  const addRatio = (cur: number, prev: number) => {
    if (prev > 0) {
      ratios.push(cur / prev);
      return;
    }
    if (cur > 0) {
      ratios.push(2);
    }
  };

  addRatio(current.visits, previous.visits);
  addRatio(current.reservations, previous.reservations);
  addRatio(current.revenueReservations, previous.revenueReservations);
  addRatio(current.revenuePacks, previous.revenuePacks);

  if (!ratios.length) {
    return { attaching: false, label: "0%", direction: "flat" };
  }

  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const pct = (avg - 1) * 100;
  const rounded = Math.round(pct);
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const label = `${rounded > 0 ? "+" : ""}${rounded}%`;
  return { attaching: false, label, direction };
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const pageSize = 1000;
  const maxPages = 50;

  const out: T[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw error;

    const items = (data ?? []) as T[];
    out.push(...items);

    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

export function ProDashboardTab({ establishment, user, onNavigateToTab }: Props) {
  const { isTestMode } = usePlatformSettings();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [packPurchases, setPackPurchases] = useState<PackPurchaseRow[]>([]);
  const [invoicesDue, setInvoicesDue] = useState<ProInvoice[]>([]);
  const [dayNotifications, setDayNotifications] = useState<ProNotification[]>([]);

  // New metrics from API
  const [apiNoShowCount, setApiNoShowCount] = useState<number>(0);
  const [apiReviewCount, setApiReviewCount] = useState<number>(0);
  const [apiAvgRating, setApiAvgRating] = useState<number | null>(null);
  const [apiNewClientsCount, setApiNewClientsCount] = useState<number>(0);
  const [apiReturningClientsCount, setApiReturningClientsCount] = useState<number>(0);

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [preset, setPreset] = useState<PeriodPreset>("last7");

  const initialRange = useMemo(() => presetRange("last7", new Date()), []);
  const [customRange, setCustomRange] = useState<DateRange | undefined>(initialRange);

  const selectedRange = useMemo(() => {
    const now = new Date();
    if (preset === "custom") return normalizeRange(customRange, initialRange);
    return presetRange(preset, now);
  }, [customRange?.from?.getTime(), customRange?.to?.getTime(), initialRange, preset]);

  const comparisonRange = useMemo(() => {
    const days = rangeDays(selectedRange);
    const from = safeStartOfDay(subDays(selectedRange.from!, days));
    const to = safeStartOfDay(subDays(selectedRange.to!, days));
    return { from, to } satisfies DateRange;
  }, [selectedRange.from?.getTime(), selectedRange.to?.getTime()]);

  const queryWindow = useMemo(() => {
    const from = safeStartOfDay(comparisonRange.from!);
    const toExcl = toExclusive(selectedRange);
    return { from, toExcl };
  }, [comparisonRange.from?.getTime(), selectedRange.to?.getTime()]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadingAlerts(true);
      setAlertsError(null);

      try {
        const res = await getProDashboardAlerts(establishment.id);
        if (!active) return;

        const invoices = (res.invoicesDue ?? []) as ProInvoice[];
        const notifications = (res.notifications ?? []) as ProNotification[];

        setInvoicesDue(invoices);

        const today = filterNotificationsForDay(notifications);
        const scoped = establishment.id ? filterNotificationsForEstablishment(today, establishment.id) : today;
        setDayNotifications(sortNotificationsByCreatedAtDesc(scoped));
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setInvoicesDue([]);
        setDayNotifications([]);
        setAlertsError(
          msg.toLowerCase().includes("failed to fetch")
            ? "Impossible de charger les alertes (connexion Supabase bloquée ou réseau)."
            : "Impossible de charger les alertes."
        );
      } finally {
        if (!active) return;
        setLoadingAlerts(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [establishment.id, user.id]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadingMetrics(true);
      setMetricsError(null);

      const since = queryWindow.from.toISOString();
      const until = queryWindow.toExcl.toISOString();

      try {
          const res = await getProDashboardMetrics({ establishmentId: establishment.id, since, until });

        if (!active) return;

        const resvAll = (res.reservations ?? []) as Reservation[];
        const visitsAll = (res.visits ?? []) as VisitRow[];
        const packsAll = (res.packPurchases ?? []) as PackPurchaseRow[];

        setReservations(resvAll);
        setVisits(visitsAll);
        setPackPurchases(Array.isArray(packsAll) ? packsAll : []);

        // New metrics from API
        setApiNoShowCount(typeof res.noShowCount === "number" ? res.noShowCount : 0);
        setApiReviewCount(typeof res.reviewCount === "number" ? res.reviewCount : 0);
        setApiAvgRating(typeof res.avgRating === "number" ? res.avgRating : null);
        setApiNewClientsCount(typeof res.newClientsCount === "number" ? res.newClientsCount : 0);
        setApiReturningClientsCount(typeof res.returningClientsCount === "number" ? res.returningClientsCount : 0);
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setReservations([]);
        setVisits([]);
        setPackPurchases([]);
        setMetricsError(
          msg.toLowerCase().includes("failed to fetch")
            ? "Impossible de charger les métriques (connexion Supabase bloquée ou réseau)."
            : "Impossible de charger les métriques."
        );
      } finally {
        if (!active) return;
        setLoadingMetrics(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [establishment.id, queryWindow.from.getTime(), queryWindow.toExcl.getTime()]);

  const statusBadge = useMemo(() => {
    const s = establishment.status ?? "";
    const statusLabels: Record<string, string> = {
      active: "Actif",
      pending: "En modération",
      suspended: "Suspendu",
      rejected: "Refusé",
      draft: "Brouillon",
      inactive: "Inactif",
    };
    const label = statusLabels[s] ?? (s || "Inconnu");
    const cls =
      s === "active"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : s === "pending"
          ? "bg-amber-100 text-amber-700 border-amber-200"
          : s === "suspended"
            ? "bg-rose-100 text-rose-700 border-rose-200"
            : "bg-slate-100 text-slate-700 border-slate-200";
    return { label, cls };
  }, [establishment.status]);

  const selectedMetrics = useMemo(() => {
    const from = safeStartOfDay(selectedRange.from!);
    const toExcl = toExclusive(selectedRange);
    return computeMetrics(reservations, visits, packPurchases, from, toExcl, apiNoShowCount, apiReviewCount, apiAvgRating, apiNewClientsCount, apiReturningClientsCount);
  }, [packPurchases, reservations, selectedRange.from?.getTime(), selectedRange.to?.getTime(), visits, apiNoShowCount, apiReviewCount, apiAvgRating, apiNewClientsCount, apiReturningClientsCount]);

  const comparisonMetrics = useMemo(() => {
    const from = safeStartOfDay(comparisonRange.from!);
    const toExcl = addDays(safeStartOfDay(comparisonRange.to!), 1);
    return computeMetrics(reservations, visits, packPurchases, from, toExcl);
  }, [comparisonRange.from?.getTime(), comparisonRange.to?.getTime(), packPurchases, reservations, visits]);

  const periodLabel = useMemo(() => {
    if (preset === "last7") return "7 derniers jours";
    if (preset === "last30") return "30 derniers jours";
    if (preset === "last90") return "90 derniers jours";
    return `Du ${formatDayFr(selectedRange.from!)} au ${formatDayFr(selectedRange.to!)}`;
  }, [preset, selectedRange.from, selectedRange.to]);

  const statusTrend = useMemo(() => computeCompositeTrend(selectedMetrics, comparisonMetrics), [comparisonMetrics, selectedMetrics]);

  const systemAlerts = useMemo(
    () => buildSystemNotificationsForToday({ userId: user.id, establishment, invoicesDue }),
    [establishment, invoicesDue, user.id],
  );

  const demoAlerts = useMemo(() => buildDemoNotificationsForToday(user.id, establishment.id ?? null), [establishment.id, user.id]);

  const alerts = useMemo(() => {
    const base = dayNotifications.length ? dayNotifications : isDemoModeEnabled() ? demoAlerts : [];
    return sortNotificationsByCreatedAtDesc([...systemAlerts, ...base]);
  }, [dayNotifications, demoAlerts, systemAlerts]);

  const importantAlerts = useMemo(() => alerts.slice(0, 5), [alerts]);

  const handleAlertClick = (targetTab: string) => {
    onNavigateToTab?.(targetTab);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-slate-700">Période</div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last7">7 derniers jours</SelectItem>
              <SelectItem value="last30">30 derniers jours</SelectItem>
              <SelectItem value="last90">90 derniers jours</SelectItem>
              <SelectItem value="custom">Personnalisée</SelectItem>
            </SelectContent>
          </Select>

          {preset === "custom" ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto justify-start">
                  {customRange?.from ? (
                    customRange.to ? (
                      `Du ${formatDayFr(customRange.from)} au ${formatDayFr(customRange.to)}`
                    ) : (
                      `À partir du ${formatDayFr(customRange.from)}`
                    )
                  ) : (
                    "Choisir une période"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={customRange}
                  onSelect={(r) => setCustomRange(r ?? undefined)}
                  defaultMonth={customRange?.from}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          ) : null}

        </div>
      </div>

      {metricsError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-bold">{metricsError}</div>
          <div className="mt-1 text-xs text-red-700/80">
            Astuce : si le navigateur bloque les appels externes, on peut basculer ces métriques sur des endpoints /api (même domaine).
          </div>
        </div>
      ) : null}

      {alertsError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-bold">{alertsError}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
        {/* Row 1: Common KPIs */}
        <ProKpiCard
          title="Statut établissement"
          value={statusBadge.label}
          icon={BadgeCheck}
          tone={establishment.status === "active" ? "emerald" : establishment.status === "pending" ? "amber" : establishment.status === "suspended" ? "rose" : "slate"}
          valueClassName={cn(
            "!text-base sm:!text-lg md:!text-xl",
            establishment.status === "active"
              ? "text-emerald-800"
              : establishment.status === "pending"
                ? "text-amber-800"
                : establishment.status === "suspended"
                  ? "text-rose-700"
                  : "text-slate-800"
          )}
          meta={!loadingMetrics ? <TrendPillFromTrend trend={statusTrend} /> : null}
          metaPosition="inline"
          footnote={periodLabel}
        />

        <ProKpiCard
          title="Visites de fiche"
          value={loadingMetrics ? "—" : selectedMetrics.visits}
          icon={Eye}
          tone="rose"
          meta={!loadingMetrics ? <TrendPill current={selectedMetrics.visits} previous={comparisonMetrics.visits} /> : null}
          metaPosition="inline"
          footnote={periodLabel}
        />

        <ProKpiCard
          title="Réservations"
          value={loadingMetrics ? "—" : selectedMetrics.reservations}
          icon={CalendarCheck}
          tone="amber"
          meta={!loadingMetrics ? <TrendPill current={selectedMetrics.reservations} previous={comparisonMetrics.reservations} /> : null}
          metaPosition="inline"
          footnote={periodLabel}
        />

        {/* 4th KPI - different per mode */}
        {isTestMode() ? (
          <ProKpiCard
            title="Taux de conversion"
            value={loadingMetrics ? "—" : selectedMetrics.conversionRate !== null ? `${selectedMetrics.conversionRate}%` : "—"}
            icon={Percent}
            tone="sky"
            meta={!loadingMetrics && comparisonMetrics.conversionRate !== null ? (
              <TrendPill current={selectedMetrics.conversionRate ?? 0} previous={comparisonMetrics.conversionRate ?? 0} />
            ) : null}
            metaPosition="inline"
            footnote={periodLabel}
          />
        ) : (
          <ProKpiCard
            title="CA réservations"
            value={loadingMetrics ? "—" : formatMoney(selectedMetrics.revenueReservations, "MAD")}
            icon={Wallet}
            tone="sky"
            meta={!loadingMetrics ? (
              <TrendPill current={selectedMetrics.revenueReservations} previous={comparisonMetrics.revenueReservations} />
            ) : null}
            metaPosition="inline"
            footnote={periodLabel}
          />
        )}

        {/* Row 2: Mode-specific KPIs */}
        {isTestMode() && (
          <>
            <ProKpiCard
              title="Note moyenne"
              value={loadingMetrics ? "—" : selectedMetrics.avgRating !== null ? `${selectedMetrics.avgRating.toFixed(1)}/5` : "—"}
              icon={Star}
              tone="amber"
              meta={selectedMetrics.reviewCount > 0 ? (
                <span className="text-xs text-slate-500">{selectedMetrics.reviewCount} avis</span>
              ) : null}
              metaPosition="inline"
              footnote={periodLabel}
            />

            <ProKpiCard
              title="No-shows"
              value={loadingMetrics ? "—" : selectedMetrics.noShowCount}
              icon={UserX}
              tone={selectedMetrics.noShowCount > 0 ? "rose" : "slate"}
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.noShowCount} previous={comparisonMetrics.noShowCount} invertColors /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />

            <ProKpiCard
              title="Nouveaux clients"
              value={loadingMetrics ? "—" : selectedMetrics.newClientsCount}
              icon={UserPlus}
              tone="emerald"
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.newClientsCount} previous={comparisonMetrics.newClientsCount} /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />

            <ProKpiCard
              title="Clients fidèles"
              value={loadingMetrics ? "—" : selectedMetrics.returningClientsCount}
              icon={RefreshCw}
              tone="violet"
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.returningClientsCount} previous={comparisonMetrics.returningClientsCount} /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />
          </>
        )}

        {/* Commercial Mode KPIs - Row 2 (hidden in test mode) */}
        {!isTestMode() && (
          <>
            <ProKpiCard
              title="CA packs vendus"
              value={loadingMetrics ? "—" : formatMoney(selectedMetrics.revenuePacks, "MAD")}
              icon={ShoppingBag}
              tone="violet"
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.revenuePacks} previous={comparisonMetrics.revenuePacks} /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />

            <ProKpiCard
              title="Acomptes générés"
              value={loadingMetrics ? "—" : formatMoney(selectedMetrics.deposits, "MAD")}
              icon={HandCoins}
              tone="emerald"
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.deposits} previous={comparisonMetrics.deposits} /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />

            <ProKpiCard
              title="Nouveaux clients"
              value={loadingMetrics ? "—" : selectedMetrics.newClientsCount}
              icon={UserPlus}
              tone="sky"
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.newClientsCount} previous={comparisonMetrics.newClientsCount} /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />

            <ProKpiCard
              title="Clients fidèles"
              value={loadingMetrics ? "—" : selectedMetrics.returningClientsCount}
              icon={RefreshCw}
              tone="amber"
              meta={!loadingMetrics ? <TrendPill current={selectedMetrics.returningClientsCount} previous={comparisonMetrics.returningClientsCount} /> : null}
              metaPosition="inline"
              footnote={periodLabel}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertes importantes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingAlerts ? <div className="text-sm text-slate-600">Chargement…</div> : null}

          {!loadingAlerts && !importantAlerts.length ? <div className="text-sm text-slate-600">Aucune alerte aujourd’hui.</div> : null}

          <div className="space-y-2">
            {importantAlerts.map((n) => {
              const p = notificationToAlertPresentation(n);
              const Icon = p.icon;

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleAlertClick(p.targetTab)}
                  className={cn(
                    "w-full text-left flex items-start gap-3 rounded-md border p-3 transition",
                    onNavigateToTab ? "hover:bg-slate-50 cursor-pointer" : "cursor-default",
                  )}
                >
                  <div className={cn("mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border", alertToneClasses(p.tone))}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div className="text-sm font-semibold text-slate-800">{n.title}</div>
                      <div className="text-xs text-slate-500">{p.meta}</div>
                    </div>
                    <div className="mt-0.5 text-sm text-slate-600">{n.body}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 mt-3 border-t flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => handleAlertClick("notifications")} className="font-semibold">
              Voir toutes les notifications
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
