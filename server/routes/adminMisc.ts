/**
 * Admin Misc Routes — Support tickets, health/diagnostics, test email,
 * platform settings, username moderation, username subscriptions,
 * claim requests, establishment leads, finance payouts/discrepancies,
 * and cron audit log cleanup.
 *
 * Extracted from the monolithic admin.ts.
 */

import type { RequestHandler } from "express";
import { randomBytes } from "crypto";

import {
  requireAdminKey,
  requireSuperadmin,
  isRecord,
  asString,
  asNumber,
  getAdminSupabase,
  getAuditActorInfo,
  getAdminSessionSub,
  hasValidAdminSession,
  checkAdminKey,
} from "./adminHelpers";
import { emitAdminNotification } from "../adminNotifications";
import {
  assertAdminApiEnabled,
} from "../supabaseAdmin";
import {
  parseCookies,
  getSessionCookieName,
  verifyAdminSessionToken,
} from "../adminSession";
import {
  renderSambookingEmail,
  sendSambookingEmail,
  type SambookingSenderKey,
} from "../email";
import { sendTemplateEmail } from "../emailService";
import {
  ensureEscrowHoldForReservation,
  settleEscrowForReservation,
  ensureInvoiceForReservation,
} from "../finance";
import {
  listPlatformSettings,
  updatePlatformSetting,
  getPlatformSettingsSnapshot,
  invalidateSettingsCache,
  type PlatformSetting,
} from "../platformSettings";
import {
  listSubscriptions,
  extendSubscription,
  adminCancelSubscription,
  getSubscriptionStats,
  type SubscriptionListFilters,
} from "../subscriptions/usernameSubscription";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminMisc");

// =============================================================================
// Local types
// =============================================================================

type SupportTicketRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  priority: string;
  establishment_id: string | null;
  created_by_user_id: string | null;
  created_by_role: string | null;
  subject: string;
  body: string;
  assignee_user_id: string | null;
};

type SupportTicketMessageRow = {
  id: string;
  ticket_id: string;
  created_at: string;
  from_role: string;
  author_user_id: string | null;
  body: string;
  is_internal: boolean;
  meta: unknown;
};

type AdminUnifiedLogItem = {
  id: string;
  created_at: string;
  source: "admin" | "system";
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id?: string | null;
  actor_role?: string | null;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  details: unknown;
};

type ProductionCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
};

type ProductionCheckResponse = {
  ok: true;
  at: string;
  env: {
    node_env: string;
    allow_demo_routes: boolean;
  };
  checks: ProductionCheckItem[];
};

type ImpactMetricBlock = {
  eligible: number;
  no_shows: number;
  honored: number;
  protected: number;
  no_show_rate: number;
  honored_rate: number;
  protected_share: number;
};

type ImpactUniverseRow = ImpactMetricBlock & { universe: string };

type ImpactSeriesRow = {
  week_start: string;
  universe: string;
  eligible: number;
  no_shows: number;
  protected: number;
  no_show_rate: number;
  protected_share: number;
};

function asJsonObject(v: unknown): Record<string, unknown> | undefined {
  return (!!v && typeof v === "object") ? v as Record<string, unknown> : undefined;
}

// =============================================================================
// Local helpers
// =============================================================================

function asEmailSenderKey(v: unknown): SambookingSenderKey | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (
    s === "hello" ||
    s === "support" ||
    s === "pro" ||
    s === "finance" ||
    s === "noreply"
  )
    return s;
  return null;
}

function splitEmails(raw: unknown): string[] {
  const s = typeof raw === "string" ? raw : "";
  return s
    .split(/[,;\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clampText(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : "";
  return s.length > max ? s.slice(0, max) : s;
}

function generateProvisionalPassword(): string {
  const token = randomBytes(18).toString("base64url");
  return `Sam-${token}`;
}

/** Get admin session token from request (for adminHealth) */
function getAdminSessionToken(
  req: Parameters<RequestHandler>[0],
): { token: string; source: "cookie" | "header" } | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim())
    return { token: headerToken.trim(), source: "header" };

  const authHeader = req.header("authorization") ?? undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, source: "header" };
  }

  return null;
}

// Impact report helpers
function startOfWeekUtcIso(inputIso: string): string {
  const d = new Date(inputIso);
  if (!Number.isFinite(d.getTime())) return inputIso;

  const day = d.getUTCDay(); // 0..6, Sunday=0
  const diffToMonday = (day + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

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

function computeRates(
  b: Omit<
    ImpactMetricBlock,
    "no_show_rate" | "honored_rate" | "protected_share"
  >,
): ImpactMetricBlock {
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

function normalizeUniverse(kindRaw: unknown): string {
  const k = String(kindRaw ?? "")
    .trim()
    .toLowerCase();
  if (!k) return "unknown";
  if (k.includes("restaurant")) return "restaurant";
  if (k.includes("hotel")) return "hotel";
  if (k.includes("wellness") || k.includes("spa")) return "wellness";
  if (k.includes("loisir") || k.includes("sport") || k.includes("culture"))
    return "loisir";
  return k;
}

function isProtectedReservation(row: {
  amount_deposit?: unknown;
  meta?: unknown;
}): boolean {
  const deposit =
    typeof row.amount_deposit === "number" &&
    Number.isFinite(row.amount_deposit)
      ? Math.max(0, Math.round(row.amount_deposit))
      : 0;
  if (deposit > 0) return true;

  const meta = row.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return (meta as Record<string, unknown>).guarantee_required === true;
  }

  return false;
}

async function runSupabaseTableCheck(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  table: string;
  label: string;
  select?: string;
}): Promise<ProductionCheckItem> {
  try {
    const select = args.select ?? "id";
    const { error } = await args.supabase
      .from(args.table as any)
      .select(select)
      .limit(1);
    if (error)
      return {
        key: `table:${args.table}`,
        label: args.label,
        ok: false,
        detail: error.message,
      };
    return { key: `table:${args.table}`, label: args.label, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return {
      key: `table:${args.table}`,
      label: args.label,
      ok: false,
      detail: msg,
    };
  }
}

async function runSupabaseSchemaTableCheck(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  schema: string;
  table: string;
  label: string;
}): Promise<ProductionCheckItem> {
  try {
    const { error } = await args.supabase
      .schema(args.schema as any)
      .from(args.table as any)
      .select("id")
      .limit(1);
    const key = `table:${args.schema}.${args.table}`;
    if (error)
      return { key, label: args.label, ok: false, detail: error.message };
    return { key, label: args.label, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return {
      key: `table:${args.schema}.${args.table}`,
      label: args.label,
      ok: false,
      detail: msg,
    };
  }
}

const AUDIT_LOG_RETENTION_DAYS = 30;

// =============================================================================
// SUPPORT TICKETS
// =============================================================================

export const listAdminSupportTickets: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "open";
  const priority =
    typeof req.query.priority === "string"
      ? req.query.priority.trim().toLowerCase()
      : "all";
  const role =
    typeof req.query.role === "string"
      ? req.query.role.trim().toLowerCase()
      : "all";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const safeLimit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("support_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (status && status !== "all") q = q.eq("status", status);
  if (priority && priority !== "all") q = q.eq("priority", priority);
  if (role && role !== "all") q = q.eq("created_by_role", role);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as SupportTicketRow[] });
};

export const getAdminSupportTicket: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json({ item: data as SupportTicketRow });
};

export const listAdminSupportTicketMessages: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const ticketId = typeof req.params.id === "string" ? req.params.id : "";
  if (!ticketId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as SupportTicketMessageRow[] });
};

export const postAdminSupportTicketMessage: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const ticketId = typeof req.params.id === "string" ? req.params.id : "";
  if (!ticketId) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = asString(req.body.body);
  const isInternal =
    typeof req.body.is_internal === "boolean" ? req.body.is_internal : false;

  if (!body) return res.status(400).json({ error: "Contenu requis" });

  const supabase = getAdminSupabase();
  const createdAt = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      from_role: "admin",
      author_user_id: null,
      body,
      is_internal: isInternal,
      created_at: createdAt,
    })
    .select("*")
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  const { error: touchErr } = await supabase
    .from("support_tickets")
    .update({ updated_at: createdAt })
    .eq("id", ticketId);

  if (touchErr) return res.status(500).json({ error: touchErr.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "support.ticket.message",
    entity_type: "support_tickets",
    entity_id: ticketId,
    metadata: { is_internal: isInternal, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, item: inserted as SupportTicketMessageRow });
};

export const updateAdminSupportTicket: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const ticketId = typeof req.params.id === "string" ? req.params.id : "";
  if (!ticketId) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const status = asString(req.body.status);
  const priority = asString(req.body.priority);
  const assigneeUserId = asString(req.body.assignee_user_id);

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch.status = status || null;
  if (priority !== undefined) patch.priority = priority || null;
  if (assigneeUserId !== undefined)
    patch.assignee_user_id = assigneeUserId || null;
  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*");

  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "support.ticket.update",
    entity_type: "support_tickets",
    entity_id: ticketId,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// =============================================================================
// HEALTH / DIAGNOSTICS
// =============================================================================

export const adminHealth: RequestHandler = async (req, res) => {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false)
    return res.status(503).json({ ok: false, error: enabled.message });

  const session = getAdminSessionToken(req);
  const authedBySession = session && verifyAdminSessionToken(session.token) !== null;
  const header = req.header("x-admin-key") ?? undefined;
  const authedByKey = checkAdminKey(header);

  if (!authedBySession && !authedByKey)
    return res.status(401).json({ ok: false, error: "Non autorisé" });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("admin_audit_log")
    .select("id")
    .limit(1);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  // Return the session token so frontend can decode user info
  res.json({ ok: true, session_token: session?.token ?? undefined });
};

export const adminProductionCheck: RequestHandler = async (req, res) => {
  // Admin-only endpoint: read-only health + schema sanity checks.
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const nodeEnv = String(process.env.NODE_ENV ?? "");
  const allowDemoRoutes =
    nodeEnv !== "production" &&
    String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";

  const checks: ProductionCheckItem[] = [];

  checks.push({
    key: "env:demo_routes_disabled",
    label: "Routes démo désactivées (server)",
    ok: !allowDemoRoutes,
    ...(allowDemoRoutes ? { detail: "ALLOW_DEMO_ROUTES=true" } : {}),
  });

  checks.push({
    key: "env:node_env_prod",
    label: "NODE_ENV=production (recommandé)",
    ok: nodeEnv === "production",
    ...(nodeEnv !== "production"
      ? { detail: `NODE_ENV=${nodeEnv || "(unset)"}` }
      : {}),
  });

  // Database/schema presence checks (fail-fast signals).
  const tableChecks = await Promise.all([
    runSupabaseTableCheck({
      supabase,
      table: "admin_audit_log",
      label: "Table admin_audit_log",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "system_logs",
      label: "Table system_logs",
    }),

    // Core booking data
    runSupabaseTableCheck({
      supabase,
      table: "establishments",
      label: "Table establishments",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "pro_slots",
      label: "Table pro_slots",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "reservations",
      label: "Table reservations",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "waitlist_entries",
      label: "Table waitlist_entries",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "waitlist_events",
      label: "Table waitlist_events",
    }),

    // Packs
    runSupabaseTableCheck({ supabase, table: "packs", label: "Table packs" }),
    runSupabaseTableCheck({
      supabase,
      table: "pack_purchases",
      label: "Table pack_purchases",
    }),

    // Notifications (consumer / pro)
    runSupabaseTableCheck({
      supabase,
      table: "consumer_user_events",
      label: "Table consumer_user_events",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "pro_notifications",
      label: "Table pro_notifications",
    }),

    // Content/CMS
    runSupabaseTableCheck({
      supabase,
      table: "content_pages",
      label: "Table content_pages",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "blog_articles",
      label: "Table blog_articles",
    }),

    // Home / moderation
    runSupabaseTableCheck({
      supabase,
      table: "home_curation_items",
      label: "Table home_curation_items",
    }),
    runSupabaseTableCheck({
      supabase,
      table: "moderation_queue",
      label: "Table moderation_queue",
    }),

    // Finance / Payout system
    runSupabaseSchemaTableCheck({
      supabase,
      schema: "finance",
      table: "payouts",
      label: "Table finance.payouts",
    }),
    runSupabaseSchemaTableCheck({
      supabase,
      schema: "finance",
      table: "payout_requests",
      label: "Table finance.payout_requests",
    }),
    runSupabaseSchemaTableCheck({
      supabase,
      schema: "finance",
      table: "pro_terms_acceptances",
      label: "Table finance.pro_terms_acceptances",
    }),
  ]);

  checks.push(...tableChecks);

  const payload: ProductionCheckResponse = {
    ok: true,
    at: new Date().toISOString(),
    env: {
      node_env: nodeEnv,
      allow_demo_routes: allowDemoRoutes,
    },
    checks,
  };

  res.json(payload);
};

// =============================================================================
// IMPACT REPORT
// =============================================================================

export const getAdminImpactReport: RequestHandler = async (req, res) => {
  // Phase 6: measurement-only endpoint.
  // No business rules are modified here — read-only analytics computed from existing reservation fields.
  if (!requireAdminKey(req, res)) return;

  const now = new Date();
  const nowIso = now.toISOString();

  const afterEndIso =
    parseDateBoundary(String(req.query.after_end ?? ""), true) ?? nowIso;
  const afterStartIso =
    parseDateBoundary(String(req.query.after_start ?? ""), false) ??
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const beforeEndIso =
    parseDateBoundary(String(req.query.before_end ?? ""), true) ??
    afterStartIso;
  const beforeStartIso =
    parseDateBoundary(String(req.query.before_start ?? ""), false) ??
    new Date(
      new Date(beforeEndIso).getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

  const seriesWeeks = clampInt(
    typeof req.query.series_weeks === "string"
      ? Number(req.query.series_weeks)
      : 12,
    4,
    26,
  );
  const seriesFromIso = new Date(
    now.getTime() - seriesWeeks * 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const fetchFromIso =
    [beforeStartIso, afterStartIso, seriesFromIso]
      .filter(Boolean)
      .map((x) => String(x))
      .sort()[0] ?? seriesFromIso;

  const supabase = getAdminSupabase();

  const batchSize = 10000;
  const maxRows = 50000;
  const rows: Array<{
    id: string;
    kind: unknown;
    status: unknown;
    starts_at: string;
    checked_in_at: unknown;
    amount_deposit: unknown;
    meta: unknown;
  }> = [];

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id,kind,status,starts_at,checked_in_at,amount_deposit,meta")
      .gte("starts_at", fetchFromIso)
      .lte("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) return res.status(500).json({ error: error.message });

    const page = (data ?? []) as any[];
    for (const item of page) {
      const startsAt =
        typeof item?.starts_at === "string" ? String(item.starts_at) : "";
      if (!startsAt) continue;
      rows.push({
        id: String(item.id ?? ""),
        kind: item.kind,
        status: item.status,
        starts_at: startsAt,
        checked_in_at: item.checked_in_at,
        amount_deposit: item.amount_deposit,
        meta: item.meta,
      });
    }

    if (page.length < batchSize) break;
  }

  const initBlock = (): Omit<
    ImpactMetricBlock,
    "no_show_rate" | "honored_rate" | "protected_share"
  > => ({
    eligible: 0,
    no_shows: 0,
    honored: 0,
    protected: 0,
  });

  const globalBefore = initBlock();
  const globalAfter = initBlock();

  const byUniverseBefore = new Map<string, ReturnType<typeof initBlock>>();
  const byUniverseAfter = new Map<string, ReturnType<typeof initBlock>>();

  const afterProtected = initBlock();
  const afterNonProtected = initBlock();

  const series = new Map<
    string,
    { week_start: string; universe: string } & ReturnType<typeof initBlock>
  >();

  const inRange = (iso: string, from: string, to: string) =>
    iso >= from && iso <= to;

  for (const r of rows) {
    const startsAtIso = r.starts_at;
    const status = String(r.status ?? "").toLowerCase();

    if (!isEligibleReservationStatus(status)) continue;

    const universe = normalizeUniverse(r.kind);
    const protectedFlag = isProtectedReservation(r);

    const isNoShow = status === "noshow";
    const isHonored = !!(
      typeof r.checked_in_at === "string" && r.checked_in_at.trim()
    );

    // BEFORE
    if (inRange(startsAtIso, beforeStartIso, beforeEndIso)) {
      globalBefore.eligible += 1;
      if (isNoShow) globalBefore.no_shows += 1;
      if (isHonored) globalBefore.honored += 1;
      if (protectedFlag) globalBefore.protected += 1;

      const b = byUniverseBefore.get(universe) ?? initBlock();
      b.eligible += 1;
      if (isNoShow) b.no_shows += 1;
      if (isHonored) b.honored += 1;
      if (protectedFlag) b.protected += 1;
      byUniverseBefore.set(universe, b);
    }

    // AFTER
    if (inRange(startsAtIso, afterStartIso, afterEndIso)) {
      globalAfter.eligible += 1;
      if (isNoShow) globalAfter.no_shows += 1;
      if (isHonored) globalAfter.honored += 1;
      if (protectedFlag) globalAfter.protected += 1;

      const a = byUniverseAfter.get(universe) ?? initBlock();
      a.eligible += 1;
      if (isNoShow) a.no_shows += 1;
      if (isHonored) a.honored += 1;
      if (protectedFlag) a.protected += 1;
      byUniverseAfter.set(universe, a);

      const group = protectedFlag ? afterProtected : afterNonProtected;
      group.eligible += 1;
      if (isNoShow) group.no_shows += 1;
      if (isHonored) group.honored += 1;
      if (protectedFlag) group.protected += 1;
    }

    // SERIES
    if (inRange(startsAtIso, seriesFromIso, nowIso)) {
      const weekStart = startOfWeekUtcIso(startsAtIso);
      const key = `${weekStart}::${universe}`;
      const bucket = series.get(key) ?? {
        week_start: weekStart,
        universe,
        ...initBlock(),
      };
      bucket.eligible += 1;
      if (isNoShow) bucket.no_shows += 1;
      if (protectedFlag) bucket.protected += 1;
      series.set(key, bucket);
    }
  }

  const uniBefore: ImpactUniverseRow[] = Array.from(byUniverseBefore.entries())
    .map(([universe, block]) => ({ universe, ...computeRates(block) }))
    .sort((a, b) => a.universe.localeCompare(b.universe));

  const uniAfter: ImpactUniverseRow[] = Array.from(byUniverseAfter.entries())
    .map(([universe, block]) => ({ universe, ...computeRates(block) }))
    .sort((a, b) => a.universe.localeCompare(b.universe));

  const seriesRows: ImpactSeriesRow[] = Array.from(series.values())
    .map((b) => ({
      week_start: b.week_start,
      universe: b.universe,
      eligible: b.eligible,
      no_shows: b.no_shows,
      protected: b.protected,
      no_show_rate: b.eligible > 0 ? b.no_shows / b.eligible : 0,
      protected_share: b.eligible > 0 ? b.protected / b.eligible : 0,
    }))
    .sort((a, b) => {
      if (a.week_start !== b.week_start)
        return a.week_start.localeCompare(b.week_start);
      return a.universe.localeCompare(b.universe);
    });

  return res.json({
    ok: true,
    generated_at: nowIso,
    periods: {
      before: { start: beforeStartIso, end: beforeEndIso },
      after: { start: afterStartIso, end: afterEndIso },
      series: { start: seriesFromIso, end: nowIso, weeks: seriesWeeks },
    },
    kpi: {
      before: computeRates(globalBefore),
      after: computeRates(globalAfter),
      after_protected: computeRates(afterProtected),
      after_non_protected: computeRates(afterNonProtected),
      by_universe_before: uniBefore,
      by_universe_after: uniAfter,
      series: seriesRows,
      assumptions: {
        eligible_status_excluded: [
          "refused",
          "waitlist",
          "requested",
          "pending_pro_validation",
          "cancelled*",
        ],
        honored_definition: "checked_in_at != null",
        no_show_definition: "status = noshow",
        protected_definition:
          "amount_deposit > 0 OR meta.guarantee_required=true",
      },
    },
  });
};

// =============================================================================
// ADMIN LOGS
// =============================================================================

export const listAdminLogs: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const sourceRaw =
    typeof req.query.source === "string"
      ? req.query.source.trim().toLowerCase()
      : "all";
  const entityType =
    typeof req.query.entity_type === "string"
      ? req.query.entity_type.trim()
      : "";
  const entityId =
    typeof req.query.entity_id === "string" ? req.query.entity_id.trim() : "";
  const actionFilter =
    typeof req.query.action === "string" ? req.query.action.trim() : "";

  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(500, Math.max(1, Math.floor(limit)))
    : 200;

  const internalLimit = Math.min(1000, safeLimit * 2);

  const supabase = getAdminSupabase();

  const fetchAdmin = async () => {
    let q = supabase
      .from("admin_audit_log")
      .select("id,created_at,action,entity_type,entity_id,actor_id,metadata")
      .order("created_at", { ascending: false })
      .limit(internalLimit);

    if (entityType) q = q.eq("entity_type", entityType);
    if (entityId) q = q.eq("entity_id", entityId);
    if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);

    return q;
  };

  const fetchSystem = async () => {
    let q = supabase
      .from("system_logs")
      .select(
        "id,created_at,action,entity_type,entity_id,actor_user_id,actor_role,payload",
      )
      .order("created_at", { ascending: false })
      .limit(internalLimit);

    if (entityType) q = q.eq("entity_type", entityType);
    if (entityId) q = q.eq("entity_id", entityId);
    if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);

    return q;
  };

  const wantAdmin = sourceRaw === "all" || sourceRaw === "admin";
  const wantSystem = sourceRaw === "all" || sourceRaw === "system";

  const [
    { data: adminRows, error: adminErr },
    { data: systemRows, error: systemErr },
  ] = await Promise.all([
    wantAdmin
      ? fetchAdmin()
      : Promise.resolve({ data: [], error: null } as any),
    wantSystem
      ? fetchSystem()
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (adminErr) return res.status(500).json({ error: adminErr.message });
  if (systemErr) return res.status(500).json({ error: systemErr.message });

  const adminItems: AdminUnifiedLogItem[] = (
    (adminRows ?? []) as Array<any>
  ).map((row) => ({
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    source: "admin" as const,
    action: String(row.action ?? ""),
    entity_type: row.entity_type == null ? null : String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    actor_id: row.actor_id ?? null,
    actor_email: row.metadata?.actor_email ?? row.metadata?.actor ?? null,
    actor_name: row.metadata?.actor_name ?? null,
    actor_role: row.metadata?.actor_role ?? null,
    details: row.metadata ?? null,
  }));

  const systemItems: AdminUnifiedLogItem[] = (
    (systemRows ?? []) as Array<any>
  ).map((row) => ({
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    source: "system",
    action: String(row.action ?? ""),
    entity_type: row.entity_type == null ? null : String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    actor_user_id: row.actor_user_id == null ? null : String(row.actor_user_id),
    actor_role: row.actor_role == null ? null : String(row.actor_role),
    details: row.payload ?? null,
  }));

  const items = [...adminItems, ...systemItems]
    .filter((x) => x.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, safeLimit);

  res.json({ ok: true, items });
};

// =============================================================================
// TEST EMAIL
// =============================================================================

export const sendAdminTestEmail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const fromKey = asEmailSenderKey(req.body?.from);
  if (!fromKey)
    return res.status(400).json({ ok: false, error: "Expéditeur invalide" });

  const toList = splitEmails(req.body?.to);
  if (!toList.length || !toList.every(isEmailAddress)) {
    return res
      .status(400)
      .json({ ok: false, error: "Email destinataire invalide" });
  }

  const subject = clampText(req.body?.subject, 160) || "Test email";
  const bodyText =
    clampText(req.body?.message, 4000) ||
    "Bonjour,\n\nCeci est un email de test Sortir Au Maroc.";

  const ctaLabel = clampText(req.body?.cta_label, 60) || null;
  const ctaUrl = clampText(req.body?.cta_url, 500) || null;

  const emailId = randomBytes(16).toString("hex");

  const actorSub = getAdminSessionSub(req) ?? "admin_key";
  const supabase = getAdminSupabase();

  const meta = {
    email_id: emailId,
    from_key: fromKey,
    to: toList,
    subject,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    actor: actorSub,
  };

  const rendered = await renderSambookingEmail({
    emailId,
    fromKey,
    to: toList,
    subject,
    bodyText,
    ctaLabel,
    ctaUrl,
    variables: {
      date: new Date().toISOString(),
    },
  });

  await supabase.from("system_logs").insert({
    actor_user_id: null,
    actor_role: "admin",
    action: "email.queued",
    entity_type: "email",
    entity_id: emailId,
    payload: {
      ...meta,
      html: rendered.html.slice(0, 50_000),
      text: rendered.text.slice(0, 20_000),
    },
  });

  try {
    const sent = await sendSambookingEmail({
      emailId,
      fromKey,
      to: toList,
      subject,
      bodyText,
      ctaLabel,
      ctaUrl,
      variables: {
        date: new Date().toISOString(),
      },
    });

    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "admin",
      action: "email.sent",
      entity_type: "email",
      entity_id: emailId,
      payload: { ...meta, message_id: sent.messageId || null },
    });

    return res.json({
      ok: true,
      email_id: emailId,
      message_id: sent.messageId || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Erreur email");

    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "admin",
      action: "email.failed",
      entity_type: "email",
      entity_id: emailId,
      payload: { ...meta, error: msg },
    });

    void emitAdminNotification({
      type: "email_failed",
      title: "Email échoué",
      body: `${fromKey} → ${toList.join(", ")} · ${subject}`,
      data: { emailId, error: msg },
    });

    return res.status(503).json({ ok: false, email_id: emailId, error: msg });
  }
};

// =============================================================================
// PLATFORM SETTINGS (Superadmin only)
// =============================================================================

/**
 * GET /api/admin/settings/platform
 * List all platform settings (Superadmin only)
 */
export const listPlatformSettingsHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  try {
    const settings = await listPlatformSettings();
    res.json({ ok: true, items: settings });
  } catch (error) {
    log.error({ err: error }, "Platform settings list error");
    res.status(500).json({ error: "Erreur lors de la récupération des paramètres" });
  }
};

/**
 * GET /api/admin/settings/platform/snapshot
 * Get platform settings snapshot (for quick access to feature flags)
 */
export const getPlatformSettingsSnapshotHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  try {
    const snapshot = await getPlatformSettingsSnapshot();
    res.json({ ok: true, snapshot });
  } catch (error) {
    log.error({ err: error }, "Platform settings snapshot error");
    res.status(500).json({ error: "Erreur lors de la récupération du snapshot" });
  }
};

/**
 * POST /api/admin/settings/platform/:key/update
 * Update a platform setting (Superadmin only)
 */
export const updatePlatformSettingHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const key = typeof req.params.key === "string" ? req.params.key.trim() : "";
  if (!key) return res.status(400).json({ error: "Clé requise" });

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const { value } = req.body;
  if (typeof value !== "string") {
    return res.status(400).json({ error: "Valeur requise (string)" });
  }

  const updatedBy = getAdminSessionSub(req) || "unknown";

  try {
    const updated = await updatePlatformSetting(key, value, updatedBy);

    // Also log to audit
    const supabase = getAdminSupabase();
    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "settings.platform.update",
      entity_type: "platform_settings",
      entity_id: key,
      metadata: {
        key,
        new_value: value,
        actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
      },
    });

    res.json({ ok: true, item: updated });
  } catch (error) {
    log.error({ err: error }, "Platform setting update error");
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
};

/**
 * POST /api/admin/settings/platform/set-mode
 * Quick switch for platform mode (test/commercial)
 */
export const setPlatformModeHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const { mode } = req.body;
  if (mode !== "test" && mode !== "commercial" && mode !== "maintenance") {
    return res.status(400).json({ error: "Mode invalide. Valeurs acceptées: test, commercial, maintenance" });
  }

  const updatedBy = getAdminSessionSub(req) || "unknown";

  try {
    // Update mode
    await updatePlatformSetting("PLATFORM_MODE", mode, updatedBy);

    // If switching to test mode, disable payment features
    if (mode === "test") {
      await Promise.all([
        updatePlatformSetting("PAYMENTS_RESERVATIONS_ENABLED", "false", updatedBy),
        updatePlatformSetting("COMMISSIONS_ENABLED", "false", updatedBy),
        updatePlatformSetting("SUBSCRIPTIONS_ENABLED", "false", updatedBy),
        updatePlatformSetting("PACKS_PURCHASES_ENABLED", "false", updatedBy),
        updatePlatformSetting("PAYOUTS_ENABLED", "false", updatedBy),
        updatePlatformSetting("GUARANTEE_DEPOSITS_ENABLED", "false", updatedBy),
        updatePlatformSetting("WALLET_CREDITS_ENABLED", "false", updatedBy),
      ]);
    }

    // If switching to commercial mode, enable payment features
    if (mode === "commercial") {
      await Promise.all([
        updatePlatformSetting("PAYMENTS_RESERVATIONS_ENABLED", "true", updatedBy),
        updatePlatformSetting("COMMISSIONS_ENABLED", "true", updatedBy),
        updatePlatformSetting("PACKS_PURCHASES_ENABLED", "true", updatedBy),
        updatePlatformSetting("PAYOUTS_ENABLED", "true", updatedBy),
        updatePlatformSetting("GUARANTEE_DEPOSITS_ENABLED", "true", updatedBy),
      ]);
    }

    // Log mode change
    const supabase = getAdminSupabase();
    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "settings.platform.mode_change",
      entity_type: "platform_settings",
      entity_id: "PLATFORM_MODE",
      metadata: {
        new_mode: mode,
        actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
      },
    });

    const snapshot = await getPlatformSettingsSnapshot();
    res.json({ ok: true, mode, snapshot });
  } catch (error) {
    log.error({ err: error }, "Platform mode change error");
    res.status(500).json({ error: "Erreur lors du changement de mode" });
  }
};

/**
 * POST /api/admin/settings/platform/invalidate-cache
 * Force refresh of platform settings cache
 */
export const invalidatePlatformSettingsCacheHandler: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  invalidateSettingsCache();
  res.json({ ok: true, message: "Cache invalidé" });
};

// =============================================================================
// USERNAME MODERATION
// =============================================================================

/**
 * GET /api/admin/username-requests
 * List pending username requests for moderation
 */
export const listUsernameRequests: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

  const { data: requests, error, count } = await supabase
    .from("establishment_username_requests")
    .select(`
      *,
      establishments:establishment_id (
        id,
        name,
        city,
        username
      )
    `, { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    requests: requests ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
};

/**
 * POST /api/admin/username-requests/:requestId/approve
 * Approve a username request
 */
export const approveUsernameRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const requestId = req.params.requestId;
  const adminUserId = res.locals.adminUserId;

  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from("establishment_username_requests")
    .select("*, establishments:establishment_id (id, name)")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();

  if (fetchError || !request) {
    return res.status(404).json({ error: "Demande non trouvée ou déjà traitée" });
  }

  // Check username still available (race condition protection)
  const { data: existingUsername } = await supabase
    .from("establishments")
    .select("id")
    .ilike("username", request.requested_username)
    .neq("id", request.establishment_id)
    .maybeSingle();

  if (existingUsername) {
    // Username was taken in the meantime, reject
    await supabase
      .from("establishment_username_requests")
      .update({
        status: "rejected",
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: "Ce nom d'utilisateur a été pris entre temps",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return res.status(400).json({ error: "Ce nom d'utilisateur n'est plus disponible" });
  }

  // Update the establishment with the new username
  const { error: updateError } = await supabase
    .from("establishments")
    .update({
      username: request.requested_username,
      username_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.establishment_id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  // Mark request as approved
  await supabase
    .from("establishment_username_requests")
    .update({
      status: "approved",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  // TODO: Send notification to pro user

  res.json({
    ok: true,
    message: `Nom d'utilisateur @${request.requested_username} approuvé`,
  });
};

/**
 * POST /api/admin/username-requests/:requestId/reject
 * Reject a username request
 */
export const rejectUsernameRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const requestId = req.params.requestId;
  const adminUserId = res.locals.adminUserId;
  const reason = typeof req.body?.reason === "string" ? req.body.reason : null;

  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from("establishment_username_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();

  if (fetchError || !request) {
    return res.status(404).json({ error: "Demande non trouvée ou déjà traitée" });
  }

  // Mark request as rejected
  const { error: updateError } = await supabase
    .from("establishment_username_requests")
    .update({
      status: "rejected",
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || "Demande refusée par l'administrateur",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  // TODO: Send notification to pro user

  res.json({
    ok: true,
    message: `Demande de @${request.requested_username} refusée`,
  });
};

// =============================================================================
// USERNAME SUBSCRIPTIONS
// =============================================================================

export const listAdminUsernameSubscriptions: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const establishmentId = typeof req.query.establishmentId === "string" ? req.query.establishmentId : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) || 50 : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset) || 0 : 0;

  const filters: SubscriptionListFilters = {
    status: status as any,
    establishmentId,
    search,
    limit,
    offset,
  };

  try {
    const result = await listSubscriptions(filters);
    res.json({
      subscriptions: result.subscriptions,
      total: result.total,
      limit,
      offset,
    });
  } catch (e) {
    log.error({ err: e }, "listSubscriptions error");
    res.status(500).json({ error: e instanceof Error ? e.message : "Erreur" });
  }
};

export const getAdminUsernameSubscriptionStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const stats = await getSubscriptionStats();
    res.json(stats);
  } catch (e) {
    log.error({ err: e }, "getSubscriptionStats error");
    res.status(500).json({ error: e instanceof Error ? e.message : "Erreur" });
  }
};

export const extendAdminUsernameSubscription: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body)) return res.status(400).json({ error: "Corps de requete invalide" });

  const subscriptionId = typeof req.params.id === "string" ? req.params.id : "";
  if (!subscriptionId) return res.status(400).json({ error: "Identifiant requis" });

  const additionalDays = typeof req.body.days === "number" ? req.body.days : parseInt(String(req.body.days)) || 0;
  if (additionalDays <= 0) return res.status(400).json({ error: "Nombre de jours requis" });

  const adminSession = getAdminSessionSub(req);
  const adminUserId = adminSession ?? "admin";

  try {
    const subscription = await extendSubscription(subscriptionId, additionalDays, adminUserId);

    const supabase = getAdminSupabase();
    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "username_subscription.extend",
      entity_type: "username_subscription",
      entity_id: subscriptionId,
      metadata: { additionalDays, actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role },
    });

    res.json({ ok: true, subscription });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erreur" });
  }
};

export const cancelAdminUsernameSubscription: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const subscriptionId = typeof req.params.id === "string" ? req.params.id : "";
  if (!subscriptionId) return res.status(400).json({ error: "Identifiant requis" });

  const adminSession = getAdminSessionSub(req);
  const adminUserId = adminSession ?? "admin";

  try {
    const subscription = await adminCancelSubscription(subscriptionId, adminUserId);

    const supabase = getAdminSupabase();
    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "username_subscription.cancel",
      entity_type: "username_subscription",
      entity_id: subscriptionId,
      metadata: { actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role },
    });

    res.json({ ok: true, subscription });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erreur" });
  }
};

// =============================================================================
// CLAIM REQUESTS
// =============================================================================

export const listAdminClaimRequests: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) || 50 : 50;

  const supabase = getAdminSupabase();

  let query = supabase
    .from("claim_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ items: data ?? [] });
};

export const getAdminClaimRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("claim_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return res.status(404).json({ error: "Demande non trouvée" });
  }

  res.json({ item: data });
};

export const updateAdminClaimRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const payload = isRecord(req.body) ? req.body : {};
  const status = asString(payload.status);
  const notes = asString(payload.notes);

  if (!status) {
    return res.status(400).json({ error: "Statut requis" });
  }

  if (!["pending", "approved", "rejected", "contacted"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  const supabase = getAdminSupabase();

  // Map frontend status values to DB CHECK constraint values
  // DB allows: pending, contacted, verified, rejected, completed
  // Frontend sends: pending, contacted, approved, rejected
  const DB_STATUS_MAP: Record<string, string> = {
    pending: "pending",
    contacted: "contacted",
    approved: "approved", // will be stored; DB constraint updated
    rejected: "rejected",
  };

  const dbStatus = DB_STATUS_MAP[status] ?? status;

  const sendCredentials = payload.sendCredentials === true;

  const updateData: Record<string, unknown> = {
    status: dbStatus,
    updated_at: new Date().toISOString(),
  };

  if (notes !== null) {
    updateData.admin_notes = notes;
  }

  if (status === "approved" || status === "rejected") {
    updateData.processed_at = new Date().toISOString();
    const actor = getAuditActorInfo(req);
    updateData.processed_by = actor.actor_id ?? null;
  }

  const { data, error } = await supabase
    .from("claim_requests")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // If approved + sendCredentials -> create Pro account + send welcome email
  let credentials: { email: string; temporaryPassword: string; userId: string } | null = null;

  if (status === "approved" && sendCredentials && data) {
    const claimEmail = (data as any).email;
    const claimEstablishmentId = (data as any).establishment_id;
    const claimEstablishmentName = (data as any).establishment_name || "votre établissement";
    const claimFirstName = (data as any).first_name || "";

    if (claimEmail && claimEmail.includes("@")) {
      const provisionalPassword = generateProvisionalPassword();

      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1 });
      const { data: existingLookup } = await supabase
        .from("pro_profiles")
        .select("user_id")
        .eq("email", claimEmail.toLowerCase().trim())
        .maybeSingle();

      let userId: string | null = null;

      if (existingLookup?.user_id) {
        // User already exists -- just link to establishment if not already
        userId = existingLookup.user_id;
      } else {
        // Create new Supabase auth user
        const { data: createdUser, error: createUserErr } =
          await supabase.auth.admin.createUser({
            email: claimEmail.toLowerCase().trim(),
            password: provisionalPassword,
            email_confirm: true,
          });

        if (createUserErr || !createdUser.user) {
          log.error({ err: createUserErr }, "claim approve failed to create user");
          // Return success for the claim update but note the error
          const auditActor = getAuditActorInfo(req);
          await supabase.from("admin_audit_log").insert({
            actor_id: auditActor.actor_id,
            action: `claim_request.${status}`,
            entity_type: "claim_request",
            entity_id: id,
            metadata: { status, notes, sendCredentials, create_user_error: createUserErr?.message, actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role },
          });
          return res.json({ ok: true, item: data, credentialsError: createUserErr?.message ?? "Impossible de créer le compte" });
        }

        userId = createdUser.user.id;

        // Create pro_profiles entry
        await supabase.from("pro_profiles").upsert(
          { user_id: userId, email: claimEmail.toLowerCase().trim(), client_type: "A", must_change_password: true },
          { onConflict: "user_id" },
        );
      }

      // Link to establishment if not already linked
      if (userId && claimEstablishmentId) {
        const { data: existingMembership } = await supabase
          .from("pro_establishment_memberships")
          .select("id")
          .eq("user_id", userId)
          .eq("establishment_id", claimEstablishmentId)
          .maybeSingle();

        if (!existingMembership) {
          await supabase.from("pro_establishment_memberships").insert({
            user_id: userId,
            establishment_id: claimEstablishmentId,
            role: "owner",
          });
        }
      }

      // Send welcome email with credentials
      const baseUrl = (process.env.PUBLIC_URL ?? "https://sam.ma").replace(/\/+$/, "");
      const loginUrl = `${baseUrl}/pro`;

      try {
        await sendTemplateEmail({
          templateKey: "pro_welcome_password",
          lang: "fr",
          fromKey: "pro",
          to: [claimEmail.toLowerCase().trim()],
          variables: {
            email: claimEmail.toLowerCase().trim(),
            password: provisionalPassword,
            establishment_name: claimEstablishmentName,
            login_url: loginUrl,
            first_name: claimFirstName,
          },
        });
      } catch (emailErr) {
        log.error({ err: emailErr }, "claim approve failed to send welcome email");
      }

      credentials = {
        email: claimEmail.toLowerCase().trim(),
        temporaryPassword: provisionalPassword,
        userId: userId!,
      };
    }
  }

  // Audit log
  const auditActor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: auditActor.actor_id,
    action: `claim_request.${status}`,
    entity_type: "claim_request",
    entity_id: id,
    metadata: {
      status,
      notes,
      sendCredentials,
      credentials_sent: !!credentials,
      actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
    },
  });

  res.json({ ok: true, item: data, credentials });
};

// =============================================================================
// ESTABLISHMENT LEADS
// =============================================================================

export const listAdminEstablishmentLeads: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) || 200 : 200;

  const supabase = getAdminSupabase();

  let query = supabase
    .from("lead_establishment_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ items: data ?? [] });
};

export const updateAdminEstablishmentLead: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const payload = isRecord(req.body) ? req.body : {};
  const status = asString(payload.status);
  const notes = asString(payload.notes);

  if (!status) {
    return res.status(400).json({ error: "Statut requis" });
  }

  if (!["new", "contacted", "converted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  const supabase = getAdminSupabase();

  const updateData: Record<string, unknown> = {
    status,
  };

  if (notes !== null) {
    updateData.admin_notes = notes;
  }

  if (status === "converted" || status === "rejected") {
    updateData.processed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("lead_establishment_requests")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, item: data });
};

// =============================================================================
// FINANCE: DISCREPANCIES & PAYOUTS
// =============================================================================

export const listAdminFinanceDiscrepancies: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const statusRaw =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "open";
  const severityRaw =
    typeof req.query.severity === "string"
      ? req.query.severity.trim().toLowerCase()
      : "all";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const allowedStatus = new Set(["open", "acknowledged", "resolved", "all"]);
  const allowedSeverity = new Set(["low", "medium", "high", "all"]);

  const status = allowedStatus.has(statusRaw) ? statusRaw : "open";
  const severity = allowedSeverity.has(severityRaw) ? severityRaw : "all";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_reconciliation_discrepancies")
    .select(
      "id,created_at,entity_type,entity_id,kind,expected_amount_cents,actual_amount_cents,currency,severity,status,opened_at,resolved_at,notes,metadata",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (severity !== "all") q = q.eq("severity", severity);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

export const updateAdminFinanceDiscrepancy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const statusRaw = asString(req.body.status);
  const notesRaw = asString(req.body.notes);

  const allowedStatus = new Set(["open", "acknowledged", "resolved"]);
  if (statusRaw && !allowedStatus.has(statusRaw))
    return res.status(400).json({ error: "status invalide" });

  const patch: Record<string, unknown> = {};
  if (statusRaw) patch.status = statusRaw;
  if (notesRaw !== undefined) patch.notes = notesRaw || null;
  if (statusRaw === "resolved") patch.resolved_at = new Date().toISOString();

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("finance_reconciliation_discrepancies")
    .update(patch)
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "finance.discrepancy.update",
    entity_type: "finance.reconciliation_discrepancies",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const runAdminFinanceReconciliation: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id,status,payment_status,checked_in_at,amount_deposit")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  const actor = { userId: null, role: "system:reconcile" };
  const cancelStatuses = new Set([
    "cancelled",
    "cancelled_user",
    "cancelled_pro",
    "refused",
    "waitlist",
  ]);

  let holdsEnsured = 0;
  let settlesAttempted = 0;
  let errorsCount = 0;

  for (const row of (reservations ?? []) as Array<any>) {
    const reservationId = String(row?.id ?? "");
    if (!reservationId) continue;

    const deposit =
      typeof row?.amount_deposit === "number" &&
      Number.isFinite(row.amount_deposit)
        ? Math.round(row.amount_deposit)
        : 0;
    const payment = String(row?.payment_status ?? "").toLowerCase();
    const status = String(row?.status ?? "").toLowerCase();
    const checkedInAt = row?.checked_in_at ? String(row.checked_in_at) : null;

    try {
      if (deposit > 0 && payment === "paid") {
        await ensureEscrowHoldForReservation({ reservationId, actor });
        holdsEnsured++;
      }

      if (deposit > 0) {
        if (checkedInAt) {
          await settleEscrowForReservation({
            reservationId,
            actor,
            reason: "checkin",
          });
          settlesAttempted++;
        } else if (status === "noshow") {
          await settleEscrowForReservation({
            reservationId,
            actor,
            reason: "noshow",
          });
          settlesAttempted++;
        } else if (payment === "refunded" || cancelStatuses.has(status)) {
          await settleEscrowForReservation({
            reservationId,
            actor,
            reason: "cancel",
          });
          settlesAttempted++;
        }
      }
    } catch (e) {
      errorsCount++;
      log.error({ err: e, reservationId }, "reconciliation failed");
    }
  }

  const auditActor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: auditActor.actor_id,
    action: "finance.reconcile.run",
    entity_type: "finance.reconciliation_discrepancies",
    entity_id: null,
    metadata: { limit, holdsEnsured, settlesAttempted, errorsCount, actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role },
  });

  res.json({ ok: true, limit, holdsEnsured, settlesAttempted, errorsCount });
};

export const listAdminFinancePayouts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const statusRaw =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "pending";
  const establishmentId =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";
  const currency =
    typeof req.query.currency === "string"
      ? req.query.currency.trim().toUpperCase()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const allowedStatus = new Set([
    "pending",
    "processing",
    "sent",
    "failed",
    "cancelled",
    "all",
  ]);
  const status = allowedStatus.has(statusRaw) ? statusRaw : "pending";

  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_payouts")
    .select(
      "id,created_at,requested_at,processed_at,establishment_id,amount_cents,currency,status,provider,provider_reference,failure_reason,idempotency_key,metadata",
    )
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (establishmentId) q = q.eq("establishment_id", establishmentId);
  if (currency) q = q.eq("currency", currency);

  const { data: payouts, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const establishmentIds = Array.from(
    new Set(
      ((payouts ?? []) as Array<any>)
        .map((p) => String(p?.establishment_id ?? ""))
        .filter(Boolean),
    ),
  );

  let establishmentsById = new Map<
    string,
    { id: string; name: string | null; city: string | null }
  >();
  if (establishmentIds.length) {
    const { data: ests, error: estErr } = await supabase
      .from("establishments")
      .select("id,name,city")
      .in("id", establishmentIds)
      .limit(1000);

    if (!estErr) {
      establishmentsById = new Map(
        ((ests ?? []) as Array<any>)
          .map((row) => ({
            id: String(row?.id ?? ""),
            name: row?.name == null ? null : String(row.name),
            city: row?.city == null ? null : String(row.city),
          }))
          .filter((x) => x.id)
          .map((x) => [x.id, x] as const),
      );
    }
  }

  const items = ((payouts ?? []) as Array<any>).map((row) => {
    const estId = String(row?.establishment_id ?? "");
    return {
      ...row,
      establishment: estId ? (establishmentsById.get(estId) ?? null) : null,
    };
  });

  res.json({ ok: true, items });
};

export const updateAdminFinancePayout: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const statusRaw = asString(req.body.status);
  const providerRaw = asString(req.body.provider);
  const providerRefRaw = asString(req.body.provider_reference);
  const failureReasonRaw = asString(req.body.failure_reason);
  const metadataRaw = asJsonObject(req.body.metadata);

  const allowedStatus = new Set([
    "pending",
    "processing",
    "sent",
    "failed",
    "cancelled",
  ]);
  if (statusRaw && !allowedStatus.has(statusRaw))
    return res.status(400).json({ error: "status invalide" });

  const patch: Record<string, unknown> = {};
  if (statusRaw) patch.status = statusRaw;
  if (providerRaw !== undefined) patch.provider = providerRaw || null;
  if (providerRefRaw !== undefined)
    patch.provider_reference = providerRefRaw || null;
  if (failureReasonRaw !== undefined)
    patch.failure_reason = failureReasonRaw || null;
  if (metadataRaw !== undefined)
    patch.metadata = Object.keys(metadataRaw).length ? metadataRaw : null;

  if (
    statusRaw &&
    (statusRaw === "sent" ||
      statusRaw === "failed" ||
      statusRaw === "cancelled")
  ) {
    patch.processed_at = new Date().toISOString();
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_payouts")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "finance.payout.update",
    entity_type: "finance.payouts",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  if (statusRaw === "failed") {
    void emitAdminNotification({
      type: "payout_failed",
      title: "Paiement échoué",
      body: `Payout ${id}${failureReasonRaw ? ` · ${failureReasonRaw}` : ""}`,
      data: {
        payoutId: id,
        status: statusRaw,
        failureReason: failureReasonRaw ?? null,
      },
    });
  }

  res.json({ ok: true });
};

// =============================================================================
// CRON: AUDIT LOG CLEANUP
// =============================================================================

export const cronAuditLogCleanup: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);
  const cutoffISO = cutoff.toISOString();

  try {
    // Delete in batches to avoid timeout on large tables
    let totalDeleted = 0;
    let batchDeleted = 0;
    const BATCH_SIZE = 1000;

    do {
      // Select IDs of old rows (batch)
      const { data: oldRows, error: selectErr } = await supabase
        .from("admin_audit_log")
        .select("id")
        .lt("created_at", cutoffISO)
        .limit(BATCH_SIZE);

      if (selectErr) {
        log.error({ err: selectErr }, "AuditLogCleanup select error");
        return res.status(500).json({ error: selectErr.message });
      }

      if (!oldRows || oldRows.length === 0) break;

      const ids = oldRows.map((r: { id: string }) => r.id);
      const { error: deleteErr } = await supabase
        .from("admin_audit_log")
        .delete()
        .in("id", ids);

      if (deleteErr) {
        log.error({ err: deleteErr }, "AuditLogCleanup delete error");
        return res.status(500).json({ error: deleteErr.message, deleted_so_far: totalDeleted });
      }

      batchDeleted = ids.length;
      totalDeleted += batchDeleted;
    } while (batchDeleted === BATCH_SIZE);

    log.info({ totalDeleted, retentionDays: AUDIT_LOG_RETENTION_DAYS }, "AuditLogCleanup purged entries");

    res.json({
      ok: true,
      deleted: totalDeleted,
      retention_days: AUDIT_LOG_RETENTION_DAYS,
      cutoff: cutoffISO,
    });
  } catch (err) {
    log.error({ err }, "AuditLogCleanup unexpected error");
    res.status(500).json({ error: "Erreur lors du nettoyage des logs" });
  }
};

/**
 * Standalone function (no req/res) for use in server startup auto-cleanup.
 * Deletes admin_audit_log rows older than 30 days.
 */
export async function purgeOldAuditLogs(): Promise<{ deleted: number }> {
  const supabase = getAdminSupabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);
  const cutoffISO = cutoff.toISOString();

  let totalDeleted = 0;
  let batchDeleted = 0;
  const BATCH_SIZE = 1000;

  do {
    const { data: oldRows, error: selectErr } = await supabase
      .from("admin_audit_log")
      .select("id")
      .lt("created_at", cutoffISO)
      .limit(BATCH_SIZE);

    if (selectErr || !oldRows || oldRows.length === 0) break;

    const ids = oldRows.map((r: { id: string }) => r.id);
    const { error: deleteErr } = await supabase
      .from("admin_audit_log")
      .delete()
      .in("id", ids);

    if (deleteErr) break;

    batchDeleted = ids.length;
    totalDeleted += batchDeleted;
  } while (batchDeleted === BATCH_SIZE);

  if (totalDeleted > 0) {
    log.info({ totalDeleted, retentionDays: AUDIT_LOG_RETENTION_DAYS }, "AuditLogCleanup auto-purged entries");
  }

  return { deleted: totalDeleted };
}
