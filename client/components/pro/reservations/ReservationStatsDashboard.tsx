import { useMemo } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import type { Reservation } from "@/lib/pro/types";
import { getComputedReservationKind } from "./reservationHelpers";

type Props = {
  reservations: Reservation[];
};

type DayStats = {
  date: string;
  total: number;
  confirmed: number;
  cancelled: number;
  noshow: number;
};

function getDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

// Simple sparkline component
function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;

  const max = Math.max(...data, 1);
  const width = 200;
  const padding = 4;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * usableWidth;
    const y = height - padding - (v / max) * usableHeight;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={padding + usableWidth}
          cy={height - padding - (data[data.length - 1] / max) * usableHeight}
          r={4}
          fill={color}
        />
      )}
    </svg>
  );
}

// Bar chart component
function BarChart({ data, labels, colors }: { data: number[][]; labels: string[]; colors: string[] }) {
  if (!data.length || !data[0].length) return null;

  const maxValue = Math.max(...data.flat(), 1);
  const barWidth = 100 / data[0].length;

  return (
    <div className="flex items-end gap-1 h-[120px]">
      {data[0].map((_, dayIdx) => {
        const dayTotal = data.reduce((sum, series) => sum + series[dayIdx], 0);
        const dayLabel = labels[dayIdx];

        return (
          <div key={dayIdx} className="flex-1 flex flex-col items-center gap-1">
            <div className="flex flex-col-reverse w-full" style={{ height: "100px" }}>
              {data.map((series, seriesIdx) => {
                const value = series[dayIdx];
                const height = (value / maxValue) * 100;
                return (
                  <div
                    key={seriesIdx}
                    className="w-full transition-all"
                    style={{
                      height: `${height}%`,
                      backgroundColor: colors[seriesIdx],
                      minHeight: value > 0 ? "4px" : "0",
                    }}
                    title={`${value}`}
                  />
                );
              })}
            </div>
            <div className="text-[10px] text-slate-500 whitespace-nowrap">{dayLabel}</div>
          </div>
        );
      })}
    </div>
  );
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    if (current > 0) {
      return (
        <div className="flex items-center gap-1 text-emerald-600">
          <TrendingUp className="w-3 h-3" />
          <span className="text-xs">Nouveau</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-slate-400">
        <Minus className="w-3 h-3" />
        <span className="text-xs">—</span>
      </div>
    );
  }

  const change = ((current - previous) / previous) * 100;
  const isPositive = change > 0;
  const isNegative = change < 0;

  return (
    <div className={`flex items-center gap-1 ${isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-slate-500"}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      <span className="text-xs">
        {isPositive ? "+" : ""}{change.toFixed(0)}%
      </span>
    </div>
  );
}

export function ReservationStatsDashboard({ reservations }: Props) {
  // Calculate stats for last 30 days
  const { dailyStats, totals, previousPeriodTotals, noShowRate, conversionRate } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const days30Ago = getDaysAgo(30);
    const days60Ago = getDaysAgo(60);

    // Initialize daily stats
    const statsByDay = new Map<string, DayStats>();
    for (let i = 0; i < 30; i++) {
      const d = getDaysAgo(i);
      const key = formatDateKey(d);
      statsByDay.set(key, { date: key, total: 0, confirmed: 0, cancelled: 0, noshow: 0 });
    }

    // Current period totals
    let totalReservations = 0;
    let confirmedReservations = 0;
    let cancelledReservations = 0;
    let noShowReservations = 0;

    // Previous period totals (for comparison)
    let prevTotalReservations = 0;
    let prevConfirmedReservations = 0;

    for (const r of reservations) {
      const startDate = new Date(r.starts_at);
      const kind = getComputedReservationKind(r);

      // Current period (last 30 days)
      if (startDate >= days30Ago && startDate <= today) {
        const key = formatDateKey(startDate);
        const stats = statsByDay.get(key);

        if (stats) {
          stats.total++;
          if (kind.startsWith("confirmed")) {
            stats.confirmed++;
            confirmedReservations++;
          }
          if (kind === "cancelled") {
            stats.cancelled++;
            cancelledReservations++;
          }
          if (r.status === "noshow") {
            stats.noshow++;
            noShowReservations++;
          }
          totalReservations++;
        }
      }

      // Previous period (30-60 days ago)
      if (startDate >= days60Ago && startDate < days30Ago) {
        prevTotalReservations++;
        if (kind.startsWith("confirmed")) {
          prevConfirmedReservations++;
        }
      }
    }

    // Convert map to sorted array (oldest first)
    const dailyStats = Array.from(statsByDay.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate rates
    const noShowRate = totalReservations > 0 ? (noShowReservations / totalReservations) * 100 : 0;
    const conversionRate = totalReservations > 0 ? (confirmedReservations / totalReservations) * 100 : 0;

    return {
      dailyStats,
      totals: {
        total: totalReservations,
        confirmed: confirmedReservations,
        cancelled: cancelledReservations,
        noshow: noShowReservations,
      },
      previousPeriodTotals: {
        total: prevTotalReservations,
        confirmed: prevConfirmedReservations,
      },
      noShowRate,
      conversionRate,
    };
  }, [reservations]);

  // Prepare chart data
  const chartLabels = dailyStats.filter((_, i) => i % 5 === 0 || i === dailyStats.length - 1).map((s) => formatShortDate(s.date));
  const confirmedData = dailyStats.map((s) => s.confirmed);
  const cancelledData = dailyStats.map((s) => s.cancelled);
  const noshowData = dailyStats.map((s) => s.noshow);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total (30j)</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{totals.total}</p>
              </div>
              <TrendIndicator current={totals.total} previous={previousPeriodTotals.total} />
            </div>
            <div className="mt-2">
              <Sparkline data={dailyStats.map((s) => s.total)} color="#6366f1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Confirmées</p>
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{totals.confirmed}</p>
              </div>
              <TrendIndicator current={totals.confirmed} previous={previousPeriodTotals.confirmed} />
            </div>
            <div className="mt-2">
              <Sparkline data={confirmedData} color="#10b981" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Taux conversion</p>
                <p className="text-2xl font-bold text-blue-600 tabular-nums">{conversionRate.toFixed(1)}%</p>
              </div>
              <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                {totals.confirmed}/{totals.total}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-2">Réservations confirmées / total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Taux no-show</p>
                <p className={`text-2xl font-bold tabular-nums ${noShowRate > 10 ? "text-red-600" : noShowRate > 5 ? "text-amber-600" : "text-slate-900"}`}>
                  {noShowRate.toFixed(1)}%
                </p>
              </div>
              <Badge className={noShowRate > 10 ? "bg-red-50 text-red-700 border-red-200" : noShowRate > 5 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                {totals.noshow} no-shows
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {noShowRate > 10 ? "Attention: taux élevé" : noShowRate > 5 ? "Taux modéré" : "Taux acceptable"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Tendances sur 30 jours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500" />
              <span className="text-slate-600">Confirmées</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-slate-300" />
              <span className="text-slate-600">Annulées</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-400" />
              <span className="text-slate-600">No-shows</span>
            </div>
          </div>
          <BarChart
            data={[confirmedData, cancelledData, noshowData]}
            labels={dailyStats.map((s, i) => i % 5 === 0 ? formatShortDate(s.date) : "")}
            colors={["#10b981", "#cbd5e1", "#f87171"]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
