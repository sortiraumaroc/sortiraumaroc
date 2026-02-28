import type { RequestHandler, Router } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminDashboard");

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

  // Pro Services (Visibility)
  usernameSubscriptionsSold: { value: number; delta: string };
  menuDigitalSold: { value: number; delta: string };
  videosSold: { value: number; delta: string };
  complementaryServicesSold: { value: number; delta: string };

  // Payout
  pendingPayouts: { value: number; delta: string };

  // Traffic (real data from analytics_page_views)
  currentVisitors: { value: number };
  uniqueVisitors: { value: number; delta: string };
  pageViews: { value: number; delta: string };
  avgTimeOnPage: { value: string; delta: string };
  engagementRate: { value: string; delta: string };
  mobileBounceRate: { value: string; delta: string };

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

        // Pro Services (Visibility)
        usernameSubsRes,
        prevUsernameSubsRes,
        menuDigitalRes,
        prevMenuDigitalRes,
        videosRes,
        prevVideosRes,
        complementaryServicesRes,
        prevComplementaryServicesRes,

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

        // Analytics: page views & sessions
        analyticsPageViewsRes,
        prevAnalyticsPageViewsRes,
        analyticsUniqueVisitorsRes,
        prevAnalyticsUniqueVisitorsRes,
        analyticsCurrentVisitorsRes,
      ] = await Promise.all([
        // Active users (registered consumers, excluding deleted accounts)
        supabase
          .from("consumer_users")
          .select("*", { count: "exact", head: true })
          .not("email", "like", "deleted+%@example.invalid")
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("consumer_users")
          .select("*", { count: "exact", head: true })
          .not("email", "like", "deleted+%@example.invalid")
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

        // Pro Services: Username subscriptions sold (from visibility_order_items via orders)
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "username_subscription")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", startStr)
          .lte("visibility_orders.created_at", endStr),
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "username_subscription")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", prevStartStr)
          .lte("visibility_orders.created_at", prevEndStr),

        // Pro Services: Menu Digital sold (from visibility_order_items via orders)
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "menu_digital")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", startStr)
          .lte("visibility_orders.created_at", endStr),
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "menu_digital")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", prevStartStr)
          .lte("visibility_orders.created_at", prevEndStr),

        // Pro Services: Videos sold (media_video type)
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "media_video")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", startStr)
          .lte("visibility_orders.created_at", endStr),
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "media_video")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", prevStartStr)
          .lte("visibility_orders.created_at", prevEndStr),

        // Pro Services: Complementary services (pack type - includes bundles/packs of services)
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "pack")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", startStr)
          .lte("visibility_orders.created_at", endStr),
        supabase
          .from("visibility_order_items")
          .select("id, visibility_orders!inner(id, payment_status, created_at)", { count: "exact", head: true })
          .eq("type", "pack")
          .eq("visibility_orders.payment_status", "paid")
          .gte("visibility_orders.created_at", prevStartStr)
          .lte("visibility_orders.created_at", prevEndStr),

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

        // Analytics: total page views in period
        supabase
          .from("analytics_page_views")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("analytics_page_views")
          .select("*", { count: "exact", head: true })
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Analytics: unique visitors (distinct session_id) — fetch session_ids to count distinct
        supabase
          .from("analytics_page_views")
          .select("session_id")
          .gte("created_at", startStr)
          .lte("created_at", endStr),
        supabase
          .from("analytics_page_views")
          .select("session_id")
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr),

        // Analytics: current visitors (sessions active in last 5 minutes)
        supabase
          .from("analytics_page_views")
          .select("session_id")
          .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()),
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

      // ── Analytics: real traffic data from analytics_page_views ──────────
      const totalPageViews = analyticsPageViewsRes.count || 0;
      const prevTotalPageViews = prevAnalyticsPageViewsRes.count || 0;

      // Unique visitors (distinct session_id)
      const uniqueSessionIds = new Set(
        ((analyticsUniqueVisitorsRes.data || []) as Array<{ session_id: string }>).map((r) => r.session_id),
      );
      const uniqueVisitors = uniqueSessionIds.size;

      const prevUniqueSessionIds = new Set(
        ((prevAnalyticsUniqueVisitorsRes.data || []) as Array<{ session_id: string }>).map((r) => r.session_id),
      );
      const prevUniqueVisitors = prevUniqueSessionIds.size;

      // Current visitors (distinct sessions in last 5 min)
      const currentVisitorSessions = new Set(
        ((analyticsCurrentVisitorsRes.data || []) as Array<{ session_id: string }>).map((r) => r.session_id),
      );
      const currentVisitors = currentVisitorSessions.size;

      // Avg time on page: we need duration data — fetch in a separate lightweight query
      // For now, compute from page views count / unique visitors as a proxy,
      // or do a targeted query for avg duration
      let avgTimeSeconds = 0;
      let prevAvgTimeSeconds = 0;
      let engagementRateVal = 0;
      let prevEngagementRateVal = 0;
      let mobileBounceRateVal = 0;
      let prevMobileBounceRateVal = 0;

      try {
        // Fetch session-level aggregates for the current period
        const { data: sessionAggData } = await supabase
          .from("analytics_page_views")
          .select("session_id, duration_seconds, had_interaction, is_mobile")
          .gte("created_at", startStr)
          .lte("created_at", endStr);

        const { data: prevSessionAggData } = await supabase
          .from("analytics_page_views")
          .select("session_id, duration_seconds, had_interaction, is_mobile")
          .gte("created_at", prevStartStr)
          .lte("created_at", prevEndStr);

        // Helper to compute session-level metrics
        function computeSessionMetrics(rows: Array<{ session_id: string; duration_seconds: number; had_interaction: boolean; is_mobile: boolean }>) {
          const sessions = new Map<string, { pages: number; totalDuration: number; hadInteraction: boolean; isMobile: boolean }>();
          for (const r of rows) {
            const s = sessions.get(r.session_id);
            if (!s) {
              sessions.set(r.session_id, {
                pages: 1,
                totalDuration: r.duration_seconds || 0,
                hadInteraction: r.had_interaction,
                isMobile: r.is_mobile,
              });
            } else {
              s.pages++;
              s.totalDuration += r.duration_seconds || 0;
              if (r.had_interaction) s.hadInteraction = true;
            }
          }

          let totalDuration = 0;
          let sessionCount = 0;
          let engagedCount = 0;
          let mobileTotal = 0;
          let mobileBounced = 0;

          for (const s of sessions.values()) {
            sessionCount++;
            totalDuration += s.totalDuration;

            // Engaged = 2+ pages OR had_interaction OR duration > 10s
            if (s.pages >= 2 || s.hadInteraction || s.totalDuration > 10) {
              engagedCount++;
            }

            if (s.isMobile) {
              mobileTotal++;
              if (s.pages === 1) mobileBounced++;
            }
          }

          return {
            avgTime: sessionCount > 0 ? Math.round(totalDuration / sessionCount) : 0,
            engagementRate: sessionCount > 0 ? (engagedCount / sessionCount) * 100 : 0,
            mobileBounceRate: mobileTotal > 0 ? (mobileBounced / mobileTotal) * 100 : 0,
          };
        }

        const currentMetrics = computeSessionMetrics(
          (sessionAggData || []) as Array<{ session_id: string; duration_seconds: number; had_interaction: boolean; is_mobile: boolean }>,
        );
        const prevMetrics = computeSessionMetrics(
          (prevSessionAggData || []) as Array<{ session_id: string; duration_seconds: number; had_interaction: boolean; is_mobile: boolean }>,
        );

        avgTimeSeconds = currentMetrics.avgTime;
        prevAvgTimeSeconds = prevMetrics.avgTime;
        engagementRateVal = currentMetrics.engagementRate;
        prevEngagementRateVal = prevMetrics.engagementRate;
        mobileBounceRateVal = currentMetrics.mobileBounceRate;
        prevMobileBounceRateVal = prevMetrics.mobileBounceRate;
      } catch (analyticsErr) {
        log.warn({ err: analyticsErr }, "Analytics session aggregation failed, using defaults");
      }

      // Format avg time as "Xm Xs"
      const formatAvgTime = (seconds: number): string => {
        if (seconds === 0) return "0s";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
      };

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

        usernameSubscriptionsSold: {
          value: usernameSubsRes.count || 0,
          delta: calculateDelta(usernameSubsRes.count || 0, prevUsernameSubsRes.count || 0),
        },
        menuDigitalSold: {
          value: menuDigitalRes.count || 0,
          delta: calculateDelta(menuDigitalRes.count || 0, prevMenuDigitalRes.count || 0),
        },
        videosSold: {
          value: videosRes.count || 0,
          delta: calculateDelta(videosRes.count || 0, prevVideosRes.count || 0),
        },
        complementaryServicesSold: {
          value: complementaryServicesRes.count || 0,
          delta: calculateDelta(complementaryServicesRes.count || 0, prevComplementaryServicesRes.count || 0),
        },

        pendingPayouts: {
          value: pendingPayouts,
          delta: "N/A",
        },

        currentVisitors: { value: currentVisitors },
        uniqueVisitors: {
          value: uniqueVisitors,
          delta: calculateDelta(uniqueVisitors, prevUniqueVisitors),
        },
        pageViews: {
          value: totalPageViews,
          delta: calculateDelta(totalPageViews, prevTotalPageViews),
        },
        avgTimeOnPage: {
          value: formatAvgTime(avgTimeSeconds),
          delta: calculateDelta(avgTimeSeconds, prevAvgTimeSeconds),
        },
        engagementRate: {
          value: `${engagementRateVal.toFixed(1)}%`,
          delta: calculateDelta(engagementRateVal, prevEngagementRateVal),
        },
        mobileBounceRate: {
          value: `${mobileBounceRateVal.toFixed(1)}%`,
          delta: calculateDelta(mobileBounceRateVal, prevMobileBounceRateVal),
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
      log.error({ err: error }, "stats error");
      return res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
    }
  }) as RequestHandler);

  // Endpoint for real-time visitor count (distinct sessions in last 5 min)
  router.get("/api/admin/dashboard/realtime", (async (_req, res) => {
    try {
      const supabase = getAdminSupabase();
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("analytics_page_views")
        .select("session_id")
        .gte("created_at", fiveMinAgo);

      const uniqueSessions = new Set(
        ((data || []) as Array<{ session_id: string }>).map((r) => r.session_id),
      );

      return res.json({
        currentVisitors: uniqueSessions.size,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ err: error }, "realtime error");
      return res.status(500).json({ error: "Erreur" });
    }
  }) as RequestHandler);
}
