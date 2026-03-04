/**
 * Routes API PRO - Dashboard, Metrics, Alerts, Impact Report, Online Status, Activity
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Dashboard metrics (reservations, visits, packs, reviews)
 * - Dashboard alerts (invoices, notifications)
 * - Impact report (no-show / protected analysis)
 * - Booking source stats (direct link vs platform)
 * - Online status / toggle
 * - Activity stats
 */

import type { RequestHandler } from "express";

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanManageReservations,
  isRecord,
  asString,
  asNumber,
} from "./proHelpers";
import { parseIsoDatetimeOrNull } from "./proInventory";
import { safeInt } from "./proVisibility";

const log = createModuleLogger("proDashboard");

// =============================================================================
// Local types & helpers
// =============================================================================

type ProImpactMetricBlock = {
  eligible: number;
  no_shows: number;
  honored: number;
  protected: number;
  no_show_rate: number;
  honored_rate: number;
  protected_share: number;
};

type ProImpactSeriesRow = {
  week_start: string;
  eligible: number;
  no_shows: number;
  protected: number;
  no_show_rate: number;
  protected_share: number;
};

function clampInt(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.min(max, Math.max(min, v));
}

function parseDateBoundary(raw: string, endOfDay: boolean): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const iso = endOfDay ? `${v}T23:59:59.999Z` : `${v}T00:00:00.000Z`;
    const ts = Date.parse(iso);
    return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  }

  const ts = Date.parse(v);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function startOfWeekUtcIso(inputIso: string): string {
  const d = new Date(inputIso);
  if (!Number.isFinite(d.getTime())) return inputIso;

  const day = d.getUTCDay(); // 0..6, Sunday=0
  const diffToMonday = (day + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function computeRates(b: Omit<ProImpactMetricBlock, "no_show_rate" | "honored_rate" | "protected_share">): ProImpactMetricBlock {
  const eligible = Math.max(0, Math.floor(b.eligible));
  const noShows = Math.max(0, Math.floor(b.no_shows));
  const honored = Math.max(0, Math.floor(b.honored));
  const protectedCount = Math.max(0, Math.floor(b.protected));

  const noShowRate = eligible > 0 ? noShows / eligible : 0;
  const honoredRate = eligible > 0 ? honored / eligible : 0;
  const protectedShare = eligible > 0 ? protectedCount / eligible : 0;

  return {
    eligible,
    no_shows: noShows,
    honored,
    protected: protectedCount,
    no_show_rate: noShowRate,
    honored_rate: honoredRate,
    protected_share: protectedShare,
  };
}

function isEligibleReservationStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? "").toLowerCase();
  if (!s) return false;
  if (s === "refused" || s === "waitlist") return false;
  if (s === "requested" || s === "pending_pro_validation") return false;
  if (s === "cancelled" || s.startsWith("cancelled_")) return false;
  return true;
}

function isProtectedReservation(row: { amount_deposit?: unknown; meta?: unknown }): boolean {
  const deposit =
    typeof row.amount_deposit === "number" && Number.isFinite(row.amount_deposit)
      ? Math.max(0, Math.round(row.amount_deposit))
      : 0;
  if (deposit > 0) return true;

  const meta = row.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return (meta as Record<string, unknown>).guarantee_required === true;
  }

  return false;
}

function getActivityImprovementTips(score: number, stats: { days_active: number; total_online_minutes: number; total_reservations_handled: number }): string[] {
  const tips: string[] = [];

  if (score < 30) {
    tips.push("Connectez-vous plus regulierement pour ameliorer votre visibilite");
  }

  if (stats.days_active < 15) {
    tips.push("Essayez d'etre en ligne au moins 15 jours par mois");
  }

  if (stats.total_online_minutes < 1800) { // Less than 30 hours/month
    tips.push("Augmentez votre temps en ligne pour etre mieux classe dans les recherches");
  }

  if (stats.total_reservations_handled < 5) {
    tips.push("Repondez rapidement aux demandes de reservation");
  }

  if (score >= 70) {
    tips.push("Excellent ! Maintenez votre activite pour garder votre visibilite");
  }

  return tips;
}

// =============================================================================
// Handlers
// =============================================================================

export const getProDashboardMetrics: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const since = parseIsoDatetimeOrNull(req.query.since);
  const until = parseIsoDatetimeOrNull(req.query.until);
  if (!since || !until) return res.status(400).json({ error: "since/until requis" });

  const sinceDate = new Date(since);
  const untilDate = new Date(until);
  if (!Number.isFinite(sinceDate.getTime()) || !Number.isFinite(untilDate.getTime()) || sinceDate.getTime() >= untilDate.getTime()) {
    return res.status(400).json({ error: "Fenetre since/until invalide" });
  }

  const supabase = getAdminSupabase();

  const [resvRes, visitsRes, packsRes, reviewsRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("*")
      .eq("establishment_id", establishmentId)
      .gte("starts_at", since)
      .lt("starts_at", until)
      .order("starts_at", { ascending: false })
      .limit(5000),
    supabase
      .from("establishment_visits")
      .select("visited_at")
      .eq("establishment_id", establishmentId)
      .gte("visited_at", since)
      .lt("visited_at", until)
      .order("visited_at", { ascending: false })
      .limit(5000),
    supabase
      .from("pack_purchases")
      .select("*")
      .eq("establishment_id", establishmentId)
      .gte("created_at", since)
      .lt("created_at", until)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("reviews")
      .select("rating")
      .eq("establishment_id", establishmentId)
      .eq("status", "published")
      .gte("created_at", since)
      .lt("created_at", until)
      .limit(5000),
  ]);

  if (resvRes.error) return res.status(500).json({ error: resvRes.error.message });
  if (visitsRes.error) return res.status(500).json({ error: visitsRes.error.message });
  if (packsRes.error) return res.status(500).json({ error: packsRes.error.message });
  // Reviews errors are non-fatal (table might not exist yet)

  // Calculate review stats
  const reviews = reviewsRes.data ?? [];
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? reviews.reduce((sum, r) => sum + (typeof r.rating === "number" ? r.rating : 0), 0) / reviewCount
    : null;

  // Calculate no-shows from reservations
  const reservations = resvRes.data ?? [];
  const noShowCount = reservations.filter((r: any) => r.status === "noshow").length;

  // Calculate new vs returning clients
  const currentPeriodUserIds = new Set<string>();
  for (const r of reservations) {
    if ((r as any).user_id) {
      currentPeriodUserIds.add((r as any).user_id);
    }
  }

  let newClientsCount = 0;
  let returningClientsCount = 0;

  if (currentPeriodUserIds.size > 0) {
    const { data: historicalReservations } = await supabase
      .from("reservations")
      .select("user_id")
      .eq("establishment_id", establishmentId)
      .lt("starts_at", since)
      .not("user_id", "is", null)
      .limit(10000);

    const historicalUserIds = new Set<string>();
    for (const r of historicalReservations ?? []) {
      if ((r as any).user_id) {
        historicalUserIds.add((r as any).user_id);
      }
    }

    for (const userId of currentPeriodUserIds) {
      if (historicalUserIds.has(userId)) {
        returningClientsCount += 1;
      } else {
        newClientsCount += 1;
      }
    }
  }

  res.json({
    ok: true,
    reservations,
    visits: visitsRes.data ?? [],
    packPurchases: packsRes.data ?? [],
    reviewCount,
    avgRating,
    noShowCount,
    newClientsCount,
    returningClientsCount,
  });
};

export const getProDashboardAlerts: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  const [invRes, notifRes] = await Promise.all([
    supabase
      .from("pro_invoices")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("status", "due")
      .order("due_date", { ascending: true })
      .limit(10),
    supabase
      .from("pro_notifications")
      .select("*")
      .eq("user_id", userResult.user.id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  if (invRes.error) return res.status(500).json({ error: invRes.error.message });
  if (notifRes.error) return res.status(500).json({ error: notifRes.error.message });

  res.json({
    ok: true,
    invoicesDue: invRes.data ?? [],
    notifications: notifRes.data ?? [],
    dayWindow: { start: start.toISOString(), end: end.toISOString() },
  });
};

// ---------------------------------------------------------------------------
// Impact Report (Phase 7)
// ---------------------------------------------------------------------------

export const getProImpactReport: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const now = new Date();
  const nowIso = now.toISOString();

  const afterEndIso = parseDateBoundary(String(req.query.after_end ?? ""), true) ?? nowIso;
  const afterStartIso =
    parseDateBoundary(String(req.query.after_start ?? ""), false) ??
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const beforeEndIso = parseDateBoundary(String(req.query.before_end ?? ""), true) ?? afterStartIso;
  const beforeStartIso =
    parseDateBoundary(String(req.query.before_start ?? ""), false) ??
    new Date(new Date(beforeEndIso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const seriesWeeks = clampInt(typeof req.query.series_weeks === "string" ? Number(req.query.series_weeks) : 12, 4, 26);

  const seriesEndIso = afterEndIso;
  const seriesFromIso = new Date(new Date(seriesEndIso).getTime() - seriesWeeks * 7 * 24 * 60 * 60 * 1000).toISOString();

  const fetchFromIso = [beforeStartIso, afterStartIso, seriesFromIso]
    .filter(Boolean)
    .map((x) => String(x))
    .sort()[0] ?? seriesFromIso;

  const supabase = getAdminSupabase();

  const batchSize = 10000;
  const maxRows = 50000;
  const rows: Array<{
    id: string;
    status: unknown;
    starts_at: string;
    checked_in_at: unknown;
    amount_deposit: unknown;
    meta: unknown;
  }> = [];

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id,status,starts_at,checked_in_at,amount_deposit,meta")
      .eq("establishment_id", establishmentId)
      .gte("starts_at", fetchFromIso)
      .lte("starts_at", seriesEndIso)
      .order("starts_at", { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) return res.status(500).json({ error: error.message });

    const page = (data ?? []) as any[];
    for (const item of page) {
      const startsAt = typeof item?.starts_at === "string" ? String(item.starts_at) : "";
      if (!startsAt) continue;
      rows.push({
        id: String(item.id ?? ""),
        status: item.status,
        starts_at: startsAt,
        checked_in_at: item.checked_in_at,
        amount_deposit: item.amount_deposit,
        meta: item.meta,
      });
    }

    if (page.length < batchSize) break;
  }

  const initBlock = (): Omit<ProImpactMetricBlock, "no_show_rate" | "honored_rate" | "protected_share"> => ({
    eligible: 0,
    no_shows: 0,
    honored: 0,
    protected: 0,
  });

  const before = initBlock();
  const after = initBlock();
  const afterProtected = initBlock();
  const afterNonProtected = initBlock();

  const series = new Map<string, { week_start: string } & ReturnType<typeof initBlock>>();

  const inRange = (iso: string, from: string, to: string) => iso >= from && iso <= to;

  for (const r of rows) {
    const startsAtIso = r.starts_at;
    const status = String(r.status ?? "").toLowerCase();

    if (!isEligibleReservationStatus(status)) continue;

    const protectedFlag = isProtectedReservation(r);
    const isNoShow = status === "noshow";
    const isHonored = !!(typeof r.checked_in_at === "string" && (r.checked_in_at as string).trim());

    if (inRange(startsAtIso, beforeStartIso, beforeEndIso)) {
      before.eligible += 1;
      if (isNoShow) before.no_shows += 1;
      if (isHonored) before.honored += 1;
      if (protectedFlag) before.protected += 1;
    }

    if (inRange(startsAtIso, afterStartIso, afterEndIso)) {
      after.eligible += 1;
      if (isNoShow) after.no_shows += 1;
      if (isHonored) after.honored += 1;
      if (protectedFlag) after.protected += 1;

      const group = protectedFlag ? afterProtected : afterNonProtected;
      group.eligible += 1;
      if (isNoShow) group.no_shows += 1;
      if (isHonored) group.honored += 1;
      if (protectedFlag) group.protected += 1;
    }

    if (inRange(startsAtIso, seriesFromIso, seriesEndIso)) {
      const weekStart = startOfWeekUtcIso(startsAtIso);
      const bucket = series.get(weekStart) ?? { week_start: weekStart, ...initBlock() };
      bucket.eligible += 1;
      if (isNoShow) bucket.no_shows += 1;
      if (protectedFlag) bucket.protected += 1;
      series.set(weekStart, bucket);
    }
  }

  const seriesRows: ProImpactSeriesRow[] = Array.from(series.values())
    .map((b) => ({
      week_start: b.week_start,
      eligible: b.eligible,
      no_shows: b.no_shows,
      protected: b.protected,
      no_show_rate: b.eligible > 0 ? b.no_shows / b.eligible : 0,
      protected_share: b.eligible > 0 ? b.protected / b.eligible : 0,
    }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start));

  return res.json({
    ok: true,
    generated_at: nowIso,
    periods: {
      before: { start: beforeStartIso, end: beforeEndIso },
      after: { start: afterStartIso, end: afterEndIso },
      series: { start: seriesFromIso, end: seriesEndIso, weeks: seriesWeeks },
    },
    kpi: {
      before: computeRates(before),
      after: computeRates(after),
      after_protected: computeRates(afterProtected),
      after_non_protected: computeRates(afterNonProtected),
      series: seriesRows,
      assumptions: {
        eligible_status_excluded: ["refused", "waitlist", "requested", "pending_pro_validation", "cancelled*"],
        honored_definition: "checked_in_at != null",
        no_show_definition: "status = noshow",
        protected_definition: "amount_deposit > 0 OR meta.guarantee_required=true",
      },
    },
  });
};

// ---------------------------------------------------------------------------
// Booking Source Stats (Direct Link vs Platform)
// ---------------------------------------------------------------------------

export const getProBookingSourceStats: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser(token);
  if (sessionError || !sessionData?.user?.id) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const userId = sessionData.user.id;
  const establishmentId = asString(req.params.establishmentId);

  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  // Check membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", establishmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "Not a member of this establishment" });
  }

  // Parse period filter
  const period = asString(req.query.period) || "month";
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "day":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week": {
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "month":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const startIso = startDate.toISOString();

  // Get stats by booking source
  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("id, booking_source, amount_total, status, commission_amount")
    .eq("establishment_id", establishmentId)
    .gte("created_at", startIso)
    .in("status", ["confirmed", "pending_pro_validation", "noshow"]);

  if (resError) {
    return res.status(500).json({ error: resError.message });
  }

  const rows = (reservations ?? []) as Array<{
    id: string;
    booking_source: string | null;
    amount_total: number | null;
    status: string;
    commission_amount: number | null;
  }>;

  // Calculate stats
  let platformCount = 0;
  let platformRevenue = 0;
  let platformCommissions = 0;
  let directLinkCount = 0;
  let directLinkRevenue = 0;
  let directLinkSavings = 0;

  // Get establishment commission rate for savings calculation
  const { data: commissionOverride } = await supabase
    .from("establishment_commission_overrides")
    .select("commission_percent")
    .eq("establishment_id", establishmentId)
    .eq("active", true)
    .maybeSingle();

  const { data: financeRules } = await supabase
    .from("finance_rules")
    .select("standard_commission_percent")
    .eq("id", 1)
    .maybeSingle();

  const commissionRate =
    (commissionOverride as any)?.commission_percent ??
    (financeRules as any)?.standard_commission_percent ??
    10;

  for (const r of rows) {
    const source = r.booking_source || "platform";
    const amount = typeof r.amount_total === "number" ? r.amount_total : 0;
    const commission = typeof r.commission_amount === "number" ? r.commission_amount : 0;

    if (source === "direct_link") {
      directLinkCount++;
      directLinkRevenue += amount;
      // Calculate savings (commission that would have been charged)
      directLinkSavings += Math.round((amount * commissionRate) / 100);
    } else {
      platformCount++;
      platformRevenue += amount;
      platformCommissions += commission;
    }
  }

  const totalCount = platformCount + directLinkCount;
  const conversionRate = totalCount > 0 ? Math.round((directLinkCount / totalCount) * 100) : 0;

  return res.json({
    ok: true,
    period,
    startDate: startIso,
    stats: {
      platform: {
        count: platformCount,
        revenue: platformRevenue,
        commissions: platformCommissions,
      },
      directLink: {
        count: directLinkCount,
        revenue: directLinkRevenue,
        savings: directLinkSavings,
      },
      total: {
        count: totalCount,
        revenue: platformRevenue + directLinkRevenue,
      },
      directLinkPercent: conversionRate,
    },
  });
};

// ---------------------------------------------------------------------------
// PRO Online Status (Activity/Assiduity System)
// ---------------------------------------------------------------------------

export const getProOnlineStatus: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get establishment online status and activity data
  const { data: establishment, error: estErr } = await supabase
    .from("establishments")
    .select("id, name, is_online, online_since, last_online_at, total_online_minutes, activity_score")
    .eq("id", establishmentId)
    .maybeSingle();

  if (estErr) return res.status(500).json({ error: estErr.message });
  if (!establishment) return res.status(404).json({ error: "Establishment not found" });

  // Get recent activity stats (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: recentActivity } = await supabase
    .from("pro_activity_daily")
    .select("date, online_minutes, sessions_count, reservations_handled, reservations_confirmed")
    .eq("establishment_id", establishmentId)
    .gte("date", sevenDaysAgo)
    .order("date", { ascending: false });

  // Calculate current session duration if online
  let currentSessionMinutes = 0;
  if (establishment.is_online && establishment.online_since) {
    currentSessionMinutes = Math.floor((Date.now() - new Date(establishment.online_since).getTime()) / 60000);
  }

  return res.json({
    ok: true,
    status: {
      is_online: establishment.is_online ?? false,
      online_since: establishment.online_since,
      last_online_at: establishment.last_online_at,
      current_session_minutes: currentSessionMinutes,
      total_online_minutes: establishment.total_online_minutes ?? 0,
      activity_score: establishment.activity_score ?? 0,
    },
    recent_activity: recentActivity ?? [],
  });
};

export const toggleProOnlineStatus: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const body = isRecord(req.body) ? req.body : {};
  const isOnline = typeof body.is_online === "boolean" ? body.is_online : undefined;

  if (isOnline === undefined) {
    return res.status(400).json({ error: "is_online (boolean) is required" });
  }

  const supabase = getAdminSupabase();

  // Call the RPC function to toggle status
  const { data, error } = await supabase.rpc("toggle_establishment_online", {
    p_establishment_id: establishmentId,
    p_user_id: userResult.user.id,
    p_is_online: isOnline,
  });

  if (error) {
    log.error({ err: error }, "toggleProOnlineStatus RPC error");
    return res.status(500).json({ error: error.message });
  }

  const result = data as { ok: boolean; action?: string; error?: string; [key: string]: unknown };

  if (!result.ok) {
    return res.status(400).json({ error: result.error || "toggle_failed" });
  }

  // Log the action
  await supabase.from("system_logs").insert({
    actor_user_id: userResult.user.id,
    actor_role: `pro:${permission.role}`,
    action: isOnline ? "establishment.went_online" : "establishment.went_offline",
    entity_type: "establishment",
    entity_id: establishmentId,
    payload: result,
  });

  return res.json({
    ok: true,
    is_online: isOnline,
    ...result,
  });
};

export const getProActivityStats: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const supabase = getAdminSupabase();

  // Get establishment activity score
  const { data: establishment } = await supabase
    .from("establishments")
    .select("activity_score, total_online_minutes, is_online, last_online_at")
    .eq("id", establishmentId)
    .maybeSingle();

  // Get last 30 days activity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: dailyStats } = await supabase
    .from("pro_activity_daily")
    .select("*")
    .eq("establishment_id", establishmentId)
    .gte("date", thirtyDaysAgo)
    .order("date", { ascending: true });

  // Calculate aggregates
  const stats = (dailyStats ?? []).reduce(
    (acc, day) => {
      acc.total_online_minutes += day.online_minutes || 0;
      acc.total_sessions += day.sessions_count || 0;
      acc.total_reservations_handled += day.reservations_handled || 0;
      acc.total_reservations_confirmed += day.reservations_confirmed || 0;
      acc.days_active += 1;
      return acc;
    },
    {
      total_online_minutes: 0,
      total_sessions: 0,
      total_reservations_handled: 0,
      total_reservations_confirmed: 0,
      days_active: 0,
    }
  );

  const confirmationRate =
    stats.total_reservations_handled > 0
      ? Math.round((stats.total_reservations_confirmed / stats.total_reservations_handled) * 100)
      : 0;

  return res.json({
    ok: true,
    activity_score: establishment?.activity_score ?? 0,
    is_online: establishment?.is_online ?? false,
    last_online_at: establishment?.last_online_at,
    period: "30_days",
    stats: {
      ...stats,
      total_online_hours: Math.round(stats.total_online_minutes / 60),
      avg_daily_minutes: stats.days_active > 0 ? Math.round(stats.total_online_minutes / stats.days_active) : 0,
      confirmation_rate: confirmationRate,
    },
    daily_breakdown: dailyStats ?? [],
    // Tips for improving score
    tips: getActivityImprovementTips(establishment?.activity_score ?? 0, stats),
  });
};

// ---------------------------------------------------------------------------
// Marketing Campaigns (list / create / delete)
// ---------------------------------------------------------------------------

export const listProCampaigns: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_campaigns")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const campaigns = (data ?? []) as Array<Record<string, unknown>>;

  const getStartIso = (c: Record<string, unknown>): string => {
    const starts = asString(c.starts_at);
    if (starts) return starts;
    const created = asString(c.created_at);
    return created ?? nowIso;
  };

  const getEndIso = (c: Record<string, unknown>): string => {
    const ends = asString(c.ends_at);
    return ends ?? nowIso;
  };

  // Derive reservation/pack conversions within the campaign window.
  // This is not perfect attribution (it counts all conversions during the period)
  // but gives PRO users usable, real-time visibility without additional client integrations.
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = Number.NEGATIVE_INFINITY;

  for (const c of campaigns) {
    const sMs = Date.parse(getStartIso(c));
    const eMs = Date.parse(getEndIso(c));
    if (Number.isFinite(sMs)) minStartMs = Math.min(minStartMs, sMs);
    if (Number.isFinite(eMs)) maxEndMs = Math.max(maxEndMs, eMs);
  }

  let reservationTimes: number[] = [];
  let packPurchaseTimes: number[] = [];

  if (Number.isFinite(minStartMs) && Number.isFinite(maxEndMs)) {
    const minIso = new Date(minStartMs).toISOString();
    const maxIso = new Date(maxEndMs).toISOString();

    const [{ data: reservations }, { data: purchases }] = await Promise.all([
      supabase
        .from("reservations")
        .select("created_at")
        .eq("establishment_id", establishmentId)
        .gte("created_at", minIso)
        .lte("created_at", maxIso)
        .limit(5000),
      supabase
        .from("pack_purchases")
        .select("created_at,payment_status")
        .eq("establishment_id", establishmentId)
        .gte("created_at", minIso)
        .lte("created_at", maxIso)
        .limit(5000),
    ]);

    reservationTimes = (reservations ?? [])
      .map((r) => (isRecord(r) ? Date.parse(asString((r as any).created_at) ?? "") : NaN))
      .filter((t) => Number.isFinite(t));

    packPurchaseTimes = (purchases ?? [])
      .filter((p) => {
        const ps = isRecord(p) ? asString((p as any).payment_status) : null;
        return (ps ?? "").toLowerCase() === "paid";
      })
      .map((p) => (isRecord(p) ? Date.parse(asString((p as any).created_at) ?? "") : NaN))
      .filter((t) => Number.isFinite(t));
  }

  const patched = campaigns.map((c) => {
    const sMs = Date.parse(getStartIso(c));
    const eMs = Date.parse(getEndIso(c));

    const windowStart = Number.isFinite(sMs) ? sMs : nowMs;
    const windowEnd = Number.isFinite(eMs) ? eMs : nowMs;

    const derivedReservations = reservationTimes.reduce(
      (acc, t) => (t >= windowStart && t <= windowEnd ? acc + 1 : acc),
      0,
    );
    const derivedPacks = packPurchaseTimes.reduce((acc, t) => (t >= windowStart && t <= windowEnd ? acc + 1 : acc), 0);

    const existingReservations = safeInt((c as any).reservations_count);
    const existingPacks = safeInt((c as any).packs_count);

    const next: Record<string, unknown> = {
      ...c,
      reservations_count: Math.max(existingReservations, derivedReservations),
      packs_count: Math.max(existingPacks, derivedPacks),
    };

    // Best-effort auto-end campaigns when their end date has passed
    if (asString(c.ends_at)) {
      const endsMs = Date.parse(asString(c.ends_at) ?? "");
      const status = (asString(c.status) ?? "").toLowerCase();
      if (Number.isFinite(endsMs) && endsMs < nowMs && status === "active") {
        next.status = "ended";
      }
    }

    return next;
  });

  return res.json({ ok: true, campaigns: patched });
};

export const createProCampaign: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (permission.role !== "owner" && permission.role !== "marketing") {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const type = asString(req.body.type) ?? "home_feature";
  const title = asString(req.body.title) ?? "";
  const budget = asNumber(req.body.budget);

  const billingModelRaw = asString((req.body as any).billing_model) ?? asString((req.body as any).billingModel) ?? "cpc";
  const billing_model = billingModelRaw.trim().toLowerCase();

  const startsAtRaw = asString(req.body.starts_at);
  const endsAtRaw = asString(req.body.ends_at);

  if (!title || title.length < 2) return res.status(400).json({ error: "Titre requis" });
  if (budget === undefined || !Number.isFinite(budget) || budget <= 0) return res.status(400).json({ error: "Budget invalide" });
  if (billing_model !== "cpc" && billing_model !== "cpm") {
    return res.status(400).json({ error: "Mode de facturation invalide" });
  }

  const starts_at = startsAtRaw ? new Date(startsAtRaw).toISOString() : null;
  const ends_at = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;

  const nowMs = Date.now();
  const startsMs = starts_at ? Date.parse(starts_at) : null;
  const endsMs = ends_at ? Date.parse(ends_at) : null;

  let status: "draft" | "active" | "ended" = "active";
  if (startsMs != null && Number.isFinite(startsMs) && startsMs > nowMs) status = "draft";
  if (endsMs != null && Number.isFinite(endsMs) && endsMs <= nowMs) status = "ended";

  // Default pricing (in cents)
  const cpc_cents = 200; // 2 MAD / click
  const cpm_cents = 2000; // 20 MAD / 1000 impressions

  const budgetCents = Math.round(budget);

  const supabase = getAdminSupabase();
  const { data: created, error } = await supabase
    .from("pro_campaigns")
    .insert({
      establishment_id: establishmentId,
      type,
      title,
      billing_model,
      budget: budgetCents,
      cpc_cents,
      cpm_cents,
      spent_cents: 0,
      remaining_cents: Math.max(0, budgetCents),
      impressions: 0,
      clicks: 0,
      reservations_count: 0,
      packs_count: 0,
      starts_at,
      ends_at,
      status,
      metrics: {},
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, campaign: created });
};

export const deleteProCampaign: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const campaignId = typeof req.params.campaignId === "string" ? req.params.campaignId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!campaignId) return res.status(400).json({ error: "campaignId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  if (permission.role !== "owner" && permission.role !== "marketing") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Toggle Google Reviews visibility
// POST /api/pro/establishments/:establishmentId/toggle-google-reviews
// ---------------------------------------------------------------------------
export const toggleGoogleReviews: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const permission = await ensureCanManageReservations({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const body = isRecord(req.body) ? req.body : {};
  const hideGoogleReviews = typeof body.hide_google_reviews === "boolean" ? body.hide_google_reviews : undefined;

  if (hideGoogleReviews === undefined) {
    return res.status(400).json({ error: "hide_google_reviews (boolean) is required" });
  }

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("establishments")
    .update({ hide_google_reviews: hideGoogleReviews })
    .eq("id", establishmentId);

  if (error) {
    log.error({ err: error }, "toggleGoogleReviews error");
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, hide_google_reviews: hideGoogleReviews });
};
