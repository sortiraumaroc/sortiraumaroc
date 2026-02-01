import type { RequestHandler, Router } from "express";
import { getAdminSupabase } from "../supabaseAdmin";

// Helper: format date to YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Helper: get date range from period
function getDateRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "90d":
      start.setDate(start.getDate() - 89);
      break;
    case "365d":
      start.setDate(start.getDate() - 364);
      break;
    default:
      start.setDate(start.getDate() - 6);
  }

  return { start, end };
}

// Helper: get previous period for comparison
function getPreviousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: prevStart, end: prevEnd };
}

// Helper: calculate percentage change
function calculateDelta(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? "+100%" : "0%";
  }
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

// Types
type DashboardStats = {
  // Core metrics
  activeUsers: { value: number; delta: string };
  activePros: { value: number; delta: string };
  establishments: { value: number; delta: string };
  newEstablishments: { value: number; delta: string };

  // Reservations
  reservations: { value: number; delta: string };
  cancelledReservations: { value: number; delta: string };
  cancellationRate: { value: string; delta: string };
  noShowRate: { value: string; delta: string };

  // Financial
  gmv: { value: number; delta: string }; // Gross Merchandise Value
  revenue: { value: number; delta: string }; // Commission revenue
  depositsCollected: { value: number; delta: string };
  avgBasket: { value: number; delta: string };

  // Packs
  packsSold: { value: number; delta: string };
  packsRevenue: { value: number; delta: string };
  mediaPacksSold: { value: number; delta: string };

  // Payout
  pendingPayouts: { value: number; delta: string };

  // Traffic (placeholder for analytics integration)
  visitors: { value: number; delta: string };
  pageViews: { value: number; delta: string };
  conversionRate: { value: string; delta: string };

  // Chart data
  reservationsChart: Array<{ date: string; label: string; value: number }>;
  revenueChart: Array<{ date: string; label: string; value: number }>;

  // Top performers
  topCities: Array<{ name: string; reservations: number; revenue: number }>;
  topCategories: Array<{ name: string; reservations: number; revenue: number }>;

  // Alerts
  alerts: Array<{ type: "warning" | "info" | "error"; message: string; count?: number }>;
};

export function registerAdminDashboardRoutes(router: Router): void {
  // Main dashboard stats endpoint
  router.get("/api/admin/dashboard/stats", (async (req, res) => {
    try {
      const period = (req.query.period as string) || "7d";
      const { start, end } = getDateRange(period);
      const { start: prevStart, end: prevEnd } = getPreviousPeriod(start, end);

      const supabase = getAdminSupabase();
      const startStr = formatDate(start);
      const endStr = formatDate(end);
      const prevStartStr = formatDate(prevStart);
      const prevEndStr = formatDate(prevEnd);

      // Parallel queries for current period
      const [
        // Users
        activeUsersRes,
        prevActiveUsersRes,

        // Pros
        activeProsRes,
        prevActiveProsRes,

        // Establishments
        establishmentsRes,
        newEstablishmentsRes,
        prevNewEstablishmentsRes,

        // Reservations
        reservationsRes,
        prevReservationsRes,
        cancelledRes,
        prevCancelledRes,

        // Financial - from bookings table
        financialRes,
        prevFinancialRes,

        // Packs sold
        packsRes,
        prevPacksRes,

        // Pending payouts
        payoutsRes,

        // Alerts data
        noShowRes,
        moderationRes,
        failedPaymentsRes,

        // Chart data - reservations by day
        chartRes,

        // Top cities
        topCitiesRes,

        // Top categories
        topCategoriesRes,
      ] = await Promise.all([
        // Active users (users who made a booking in the period)
        supabase
          .from("bookings")
          .select("user_id", { count: "exact", head: true })
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("bookings")
          .select("user_id", { count: "exact", head: true })
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Active pros (with at least one booking)
        supabase
          .from("pro_profiles")
          .select("*", { count: "exact", head: true })
          .eq("client_type", "A"),
        supabase
          .from("pro_profiles")
          .select("*", { count: "exact", head: true })
          .eq("client_type", "A")
          .lte("created_at", prevEndStr),

        // Total establishments
        supabase.from("establishments").select("*", { count: "exact", head: true }).eq("status", "active"),

        // New establishments in period
        supabase
          .from("establishments")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("establishments")
          .select("*", { count: "exact", head: true })
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Reservations
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Cancelled reservations
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("status", "cancelled")
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("status", "cancelled")
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Financial aggregates
        supabase
          .from("bookings")
          .select("total_amount, deposit_amount, commission_amount")
          .gte("created_at", startStr)
          .lte("created_at", endStr)
          .not("status", "eq", "cancelled"),
        supabase
          .from("bookings")
          .select("total_amount, deposit_amount, commission_amount")
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr)
          .not("status", "eq", "cancelled"),

        // Packs sold
        supabase
          .from("pack_purchases")
          .select("amount", { count: "exact" })
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("pack_purchases")
          .select("amount", { count: "exact" })
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Pending payouts
        supabase.from("payout_requests").select("amount").eq("status", "pending"),

        // No-shows (for alerts)
        supabase
          .from("bookings")
          .select("establishment_id", { count: "exact", head: true })
          .eq("status", "no_show")
          .gte("created_at", startStr),

        // Moderation pending
        supabase.from("establishments").select("*", { count: "exact", head: true }).eq("edit_status", "pending_modification"),

        // Failed payments
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("payment_status", "failed")
          .gte("created_at", startStr),

        // Reservations chart data (daily)
        supabase.rpc("get_daily_reservations", { start_date: startStr, end_date: endStr }).select("*"),

        // Top cities by reservations
        supabase.rpc("get_top_cities_by_reservations", { start_date: startStr, end_date: endStr, limit_count: 5 }),

        // Top categories
        supabase.rpc("get_top_categories_by_reservations", { start_date: startStr, end_date: endStr, limit_count: 5 }),
      ]);

      // Calculate financial totals
      const financialData = (financialRes.data || []) as Array<{
        total_amount: number;
        deposit_amount: number;
        commission_amount: number;
      }>;
      const prevFinancialData = (prevFinancialRes.data || []) as Array<{
        total_amount: number;
        deposit_amount: number;
        commission_amount: number;
      }>;

      const gmv = financialData.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const prevGmv = prevFinancialData.reduce((sum, b) => sum + (b.total_amount || 0), 0);

      const deposits = financialData.reduce((sum, b) => sum + (b.deposit_amount || 0), 0);
      const prevDeposits = prevFinancialData.reduce((sum, b) => sum + (b.deposit_amount || 0), 0);

      const commissions = financialData.reduce((sum, b) => sum + (b.commission_amount || 0), 0);
      const prevCommissions = prevFinancialData.reduce((sum, b) => sum + (b.commission_amount || 0), 0);

      const reservationCount = reservationsRes.count || 0;
      const prevReservationCount = prevReservationsRes.count || 0;

      const avgBasket = reservationCount > 0 ? gmv / reservationCount : 0;
      const prevAvgBasket = prevReservationCount > 0 ? prevGmv / prevReservationCount : 0;

      // Calculate packs
      const packsData = (packsRes.data || []) as Array<{ amount: number }>;
      const prevPacksData = (prevPacksRes.data || []) as Array<{ amount: number }>;
      const packsRevenue = packsData.reduce((sum, p) => sum + (p.amount || 0), 0);
      const prevPacksRevenue = prevPacksData.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Calculate payouts
      const payoutsData = (payoutsRes.data || []) as Array<{ amount: number }>;
      const pendingPayouts = payoutsData.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Cancellation and no-show rates
      const cancelledCount = cancelledRes.count || 0;
      const prevCancelledCount = prevCancelledRes.count || 0;
      const cancellationRate = reservationCount > 0 ? (cancelledCount / reservationCount) * 100 : 0;
      const prevCancellationRate = prevReservationCount > 0 ? (prevCancelledCount / prevReservationCount) * 100 : 0;

      const noShowCount = noShowRes.count || 0;
      const noShowRate = reservationCount > 0 ? (noShowCount / reservationCount) * 100 : 0;

      // Build alerts
      const alerts: DashboardStats["alerts"] = [];

      if (noShowCount > 0) {
        alerts.push({
          type: "warning",
          message: `${noShowCount} no-show(s) détecté(s) sur la période.`,
          count: noShowCount,
        });
      }

      const moderationCount = moderationRes.count || 0;
      if (moderationCount > 0) {
        alerts.push({
          type: "info",
          message: `${moderationCount} demande(s) de modération en attente.`,
          count: moderationCount,
        });
      }

      const failedPaymentsCount = failedPaymentsRes.count || 0;
      if (failedPaymentsCount > 0) {
        alerts.push({
          type: "error",
          message: `${failedPaymentsCount} paiement(s) en échec à investiguer.`,
          count: failedPaymentsCount,
        });
      }

      // Build chart data
      const chartData = ((chartRes.data as Array<{ date: string; count: number }>) || []).map((row) => {
        const d = new Date(row.date);
        const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
        return {
          date: row.date,
          label: dayNames[d.getDay()],
          value: row.count || 0,
        };
      });

      // Placeholder for visitor data (would need analytics integration)
      // For now, estimate based on reservations with a conversion rate
      const estimatedConversionRate = 0.025; // 2.5% typical e-commerce
      const estimatedVisitors = Math.round(reservationCount / estimatedConversionRate);
      const prevEstimatedVisitors = Math.round(prevReservationCount / estimatedConversionRate);
      const estimatedPageViews = estimatedVisitors * 4.5; // avg pages per session
      const prevEstimatedPageViews = prevEstimatedVisitors * 4.5;

      const stats: DashboardStats = {
        activeUsers: {
          value: activeUsersRes.count || 0,
          delta: calculateDelta(activeUsersRes.count || 0, prevActiveUsersRes.count || 0),
        },
        activePros: {
          value: activeProsRes.count || 0,
          delta: calculateDelta(activeProsRes.count || 0, prevActiveProsRes.count || 0),
        },
        establishments: {
          value: establishmentsRes.count || 0,
          delta: calculateDelta(establishmentsRes.count || 0, establishmentsRes.count || 0),
        },
        newEstablishments: {
          value: newEstablishmentsRes.count || 0,
          delta: calculateDelta(newEstablishmentsRes.count || 0, prevNewEstablishmentsRes.count || 0),
        },

        reservations: {
          value: reservationCount,
          delta: calculateDelta(reservationCount, prevReservationCount),
        },
        cancelledReservations: {
          value: cancelledCount,
          delta: calculateDelta(cancelledCount, prevCancelledCount),
        },
        cancellationRate: {
          value: `${cancellationRate.toFixed(1)}%`,
          delta: calculateDelta(cancellationRate, prevCancellationRate),
        },
        noShowRate: {
          value: `${noShowRate.toFixed(1)}%`,
          delta: "N/A",
        },

        gmv: {
          value: gmv,
          delta: calculateDelta(gmv, prevGmv),
        },
        revenue: {
          value: commissions,
          delta: calculateDelta(commissions, prevCommissions),
        },
        depositsCollected: {
          value: deposits,
          delta: calculateDelta(deposits, prevDeposits),
        },
        avgBasket: {
          value: Math.round(avgBasket),
          delta: calculateDelta(avgBasket, prevAvgBasket),
        },

        packsSold: {
          value: packsRes.count || 0,
          delta: calculateDelta(packsRes.count || 0, prevPacksRes.count || 0),
        },
        packsRevenue: {
          value: packsRevenue,
          delta: calculateDelta(packsRevenue, prevPacksRevenue),
        },
        mediaPacksSold: {
          value: Math.round((packsRes.count || 0) * 0.32), // Estimate
          delta: calculateDelta((packsRes.count || 0) * 0.32, (prevPacksRes.count || 0) * 0.32),
        },

        pendingPayouts: {
          value: pendingPayouts,
          delta: "N/A",
        },

        visitors: {
          value: estimatedVisitors,
          delta: calculateDelta(estimatedVisitors, prevEstimatedVisitors),
        },
        pageViews: {
          value: Math.round(estimatedPageViews),
          delta: calculateDelta(estimatedPageViews, prevEstimatedPageViews),
        },
        conversionRate: {
          value: `${(estimatedConversionRate * 100).toFixed(1)}%`,
          delta: "0%",
        },

        reservationsChart: chartData,
        revenueChart: [], // TODO: implement revenue chart

        topCities: ((topCitiesRes.data as Array<{ city: string; reservations: number; revenue: number }>) || []).map(
          (c) => ({
            name: c.city || "Inconnu",
            reservations: c.reservations || 0,
            revenue: c.revenue || 0,
          })
        ),

        topCategories: (
          (topCategoriesRes.data as Array<{ universe: string; reservations: number; revenue: number }>) || []
        ).map((c) => ({
          name: c.universe || "Autre",
          reservations: c.reservations || 0,
          revenue: c.revenue || 0,
        })),

        alerts,
      };

      return res.json(stats);
    } catch (error) {
      console.error("[Dashboard] Stats error:", error);
      return res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
    }
  }) as RequestHandler);

  // Endpoint for real-time visitor count (placeholder for WebSocket/analytics)
  router.get("/api/admin/dashboard/realtime", (async (_req, res) => {
    try {
      // This would typically connect to a real-time analytics service
      // For now, return simulated data
      return res.json({
        currentVisitors: Math.floor(Math.random() * 50) + 10,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Dashboard] Realtime error:", error);
      return res.status(500).json({ error: "Erreur" });
    }
  }) as RequestHandler);
}
