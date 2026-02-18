/**
 * Reservation V2 — Admin Routes
 *
 * 13 endpoints for admin management:
 * - Global reservation view & stats
 * - No-show dispute arbitration
 * - Sanctions management
 * - Client suspension management
 * - Pro trust scores
 * - Alerts & patterns
 */

import type { Router, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";
import { arbitrateDispute } from "../noShowDisputeLogic";
import { liftSuspension, recomputeClientScoreV2 } from "../clientScoringV2";
import { auditAdminAction } from "../auditLogV2";
import { getClientIp } from "../middleware/rateLimiter";

// =============================================================================
// 1. GET /api/admin/reservations
// =============================================================================

const listAdminReservations: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const status = String(req.query.status ?? "");
  const estId = String(req.query.establishment_id ?? "");
  const date = String(req.query.date ?? "");
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  let query = supabase
    .from("reservations")
    .select(`
      id, user_id, establishment_id, starts_at, party_size, status, type,
      payment_type, stock_type, booking_reference, pro_processing_deadline,
      created_at, updated_at, cancellation_reason, cancelled_at,
      pro_venue_response, consumed_at, auto_validated_at,
      establishments!inner(name, city),
      consumer_users!inner(full_name, email)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (estId) query = query.eq("establishment_id", estId);
  if (date) query = query.gte("starts_at", `${date}T00:00:00`).lt("starts_at", `${date}T23:59:59`);

  const { data, error, count } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true });

  const { data: rows, error: fetchError } = await query;

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  res.json({ ok: true, reservations: rows ?? [], total: count ?? 0 });
};

// =============================================================================
// 2. GET /api/admin/disputes
// =============================================================================

const listAdminDisputes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const status = String(req.query.status ?? "disputed_pending_arbitration");

  const { data, error } = await supabase
    .from("no_show_disputes")
    .select(`
      id, reservation_id, user_id, establishment_id,
      declared_by, declared_at, client_response, client_responded_at,
      dispute_status, evidence_client, evidence_pro, created_at,
      consumer_users!inner(full_name, email),
      establishments!inner(name, city)
    `)
    .eq("dispute_status", status)
    .order("declared_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, disputes: data ?? [] });
};

// =============================================================================
// 3. POST /api/admin/disputes/:id/arbitrate
// =============================================================================

const arbitrateDisputeRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const body = req.body as Record<string, unknown>;
  const decision = String(body.decision ?? "");
  if (!["favor_client", "favor_pro", "indeterminate"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'favor_client', 'favor_pro', or 'indeterminate'" });
  }

  const adminSession = (req as any).adminSession;
  const adminUserId = adminSession?.sub ?? "admin";

  const supabase = getAdminSupabase();
  const result = await arbitrateDispute({
    supabase,
    disputeId: req.params.id,
    adminUserId,
    decision: decision as "favor_client" | "favor_pro" | "indeterminate",
    notes: typeof body.notes === "string" ? body.notes : undefined,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });

  void auditAdminAction("admin.dispute.arbitrate", {
    adminId: adminUserId,
    targetType: "dispute",
    targetId: req.params.id,
    details: { decision, sanctionApplied: result.sanctionApplied, notes: body.notes },
    ip: getClientIp(req),
  });

  res.json({ ok: true, decision: result.decision, sanctionApplied: result.sanctionApplied });
};

// =============================================================================
// 4. GET /api/admin/sanctions
// =============================================================================

const listAdminSanctions: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishment_sanctions")
    .select(`
      id, establishment_id, type, reason, related_dispute_id,
      imposed_by, imposed_at, lifted_by, lifted_at, lift_reason,
      deactivation_start, deactivation_end, created_at,
      establishments!inner(name, city)
    `)
    .order("imposed_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, sanctions: data ?? [] });
};

// =============================================================================
// 5-6. Deactivate / Reactivate establishment
// =============================================================================

const deactivateEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const estId = req.params.id;
  const body = req.body as Record<string, unknown>;
  const days = Number(body.days ?? 30);
  const reason = String(body.reason ?? "Décision administrative");
  const adminSession = (req as any).adminSession;
  const adminUserId = adminSession?.sub ?? "admin";

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();
  const deactivationEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // Record sanction
  await supabase.from("establishment_sanctions").insert({
    establishment_id: estId,
    type: `deactivation_${days}d`,
    reason,
    imposed_by: adminUserId,
    imposed_at: nowIso,
    deactivation_start: nowIso,
    deactivation_end: deactivationEnd,
  });

  // Update trust score
  await supabase
    .from("pro_trust_scores")
    .upsert(
      {
        establishment_id: estId,
        current_sanction: days <= 7 ? "deactivated_7d" : "deactivated_30d",
        deactivated_until: deactivationEnd,
        updated_at: nowIso,
      },
      { onConflict: "establishment_id" },
    );

  void auditAdminAction("admin.establishment.deactivate", {
    adminId: adminUserId,
    targetType: "establishment",
    targetId: estId,
    details: { days, reason, deactivationEnd },
    ip: getClientIp(req),
  });

  res.json({ ok: true, deactivatedUntil: deactivationEnd });
};

const reactivateEstablishment: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const estId = req.params.id;
  const body = req.body as Record<string, unknown>;
  const adminSession = (req as any).adminSession;
  const adminUserId = adminSession?.sub ?? "admin";

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Lift deactivation
  await supabase
    .from("pro_trust_scores")
    .update({
      current_sanction: "none",
      deactivated_until: null,
      updated_at: nowIso,
    })
    .eq("establishment_id", estId);

  // Mark latest sanction as lifted
  const { data: latestSanction } = await supabase
    .from("establishment_sanctions")
    .select("id")
    .eq("establishment_id", estId)
    .is("lifted_at", null)
    .order("imposed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSanction) {
    await supabase
      .from("establishment_sanctions")
      .update({
        lifted_by: adminUserId,
        lifted_at: nowIso,
        lift_reason: String(body.reason ?? "Réactivation administrative"),
      })
      .eq("id", (latestSanction as any).id);
  }

  void auditAdminAction("admin.establishment.reactivate", {
    adminId: adminUserId,
    targetType: "establishment",
    targetId: estId,
    details: { reason: body.reason },
    ip: getClientIp(req),
  });

  res.json({ ok: true });
};

// =============================================================================
// 7. POST /api/admin/sanctions/:id/lift
// =============================================================================

const liftSanction: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const sanctionId = req.params.id;
  const body = req.body as Record<string, unknown>;
  const adminSession = (req as any).adminSession;
  const adminUserId = adminSession?.sub ?? "admin";

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Get the sanction to find establishment
  const { data: sanction, error } = await supabase
    .from("establishment_sanctions")
    .select("id, establishment_id, type, lifted_at")
    .eq("id", sanctionId)
    .single();

  if (error || !sanction) return res.status(404).json({ error: "sanction_not_found" });

  if ((sanction as any).lifted_at) {
    return res.status(409).json({ error: "sanction_already_lifted" });
  }

  await supabase
    .from("establishment_sanctions")
    .update({
      lifted_by: adminUserId,
      lifted_at: nowIso,
      lift_reason: String(body.reason ?? "Levée anticipée"),
    })
    .eq("id", sanctionId);

  // Also update trust score if it was a deactivation
  const estId = String((sanction as any).establishment_id);
  await supabase
    .from("pro_trust_scores")
    .update({
      current_sanction: "none",
      deactivated_until: null,
      updated_at: nowIso,
    })
    .eq("establishment_id", estId);

  res.json({ ok: true });
};

// =============================================================================
// 8. GET /api/admin/clients/low-score
// =============================================================================

const getAdminLowScoreClients: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const threshold = Number(req.query.threshold ?? 30);

  const { data, error } = await supabase
    .from("consumer_user_stats")
    .select(`
      user_id, reliability_score, no_shows_count, late_cancellations,
      very_late_cancellations, consecutive_no_shows, consecutive_honored,
      is_suspended, suspended_until, suspension_reason, total_reservations,
      consumer_users!inner(full_name, email, phone)
    `)
    .or(`reliability_score.lt.${threshold},is_suspended.eq.true`)
    .order("reliability_score", { ascending: true })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, clients: data ?? [] });
};

// =============================================================================
// 9. POST /api/admin/clients/:id/unsuspend
// =============================================================================

const unsuspendClient: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = req.params.id;
  const supabase = getAdminSupabase();

  const result = await liftSuspension({ supabase, userId });

  void auditAdminAction("admin.client.lift_suspension", {
    adminId: ((req as any).adminSession?.sub ?? "admin") as string,
    targetType: "user",
    targetId: userId,
    details: { newScore: result.score, newLevel: result.level },
    ip: getClientIp(req),
  });

  res.json({ ok: true, score: result.score, stars: result.stars, level: result.level });
};

// =============================================================================
// 10. GET /api/admin/pro-trust-scores
// =============================================================================

const getAdminProTrustScores: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_trust_scores")
    .select(`
      establishment_id, trust_score, response_rate, avg_response_time_minutes,
      false_no_show_count, total_disputes, cancellation_rate, sanctions_count,
      current_sanction, deactivated_until, last_calculated_at,
      establishments!inner(name, city, is_active)
    `)
    .order("trust_score", { ascending: true })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, trustScores: data ?? [] });
};

// =============================================================================
// 11. GET /api/admin/stats/reservations
// =============================================================================

const getAdminReservationStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const period = String(req.query.period ?? "30d");
  const daysAgo = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  const { data: all } = await supabase
    .from("reservations")
    .select("id, status, payment_type, party_size, stock_type")
    .gt("created_at", since);

  const reservations = (all ?? []) as Record<string, unknown>[];
  const total = reservations.length;
  const byStatus: Record<string, number> = {};
  const byPayment: Record<string, number> = {};
  const byStock: Record<string, number> = {};
  let totalGuests = 0;

  for (const r of reservations) {
    const st = String(r.status);
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    const pt = String(r.payment_type ?? "unknown");
    byPayment[pt] = (byPayment[pt] ?? 0) + 1;
    const sk = String(r.stock_type ?? "unknown");
    byStock[sk] = (byStock[sk] ?? 0) + 1;
    totalGuests += Number(r.party_size ?? 0);
  }

  res.json({
    ok: true,
    stats: { period, total, totalGuests, byStatus, byPayment, byStock },
  });
};

// =============================================================================
// 12. GET /api/admin/stats/quotas
// =============================================================================

const getAdminQuotaStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // Get current capacity configurations
  const { data: configs } = await supabase
    .from("establishment_capacity")
    .select("establishment_id, total_capacity, paid_stock_percentage, free_stock_percentage, buffer_percentage, is_closed")
    .eq("is_closed", false);

  const establishments = new Set<string>();
  let totalCapacity = 0;
  let totalPaidPct = 0;
  let totalFreePct = 0;
  let totalBufferPct = 0;
  let configCount = 0;

  for (const c of (configs ?? []) as Record<string, unknown>[]) {
    establishments.add(String(c.establishment_id));
    totalCapacity += Number(c.total_capacity ?? 0);
    totalPaidPct += Number(c.paid_stock_percentage ?? 0);
    totalFreePct += Number(c.free_stock_percentage ?? 0);
    totalBufferPct += Number(c.buffer_percentage ?? 0);
    configCount++;
  }

  res.json({
    ok: true,
    quotas: {
      activeEstablishments: establishments.size,
      configCount,
      totalCapacity,
      avgPaidPct: configCount > 0 ? Math.round(totalPaidPct / configCount) : 0,
      avgFreePct: configCount > 0 ? Math.round(totalFreePct / configCount) : 0,
      avgBufferPct: configCount > 0 ? Math.round(totalBufferPct / configCount) : 0,
    },
  });
};

// =============================================================================
// 13. GET /api/admin/alerts
// =============================================================================

const getAdminAlerts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const alerts: Array<{ type: string; severity: string; message: string; data?: unknown }> = [];

  // Unresponsive pros (pending reservations past deadline)
  const { data: unresponsive } = await supabase
    .from("reservations")
    .select("id, establishment_id, pro_processing_deadline")
    .in("status", ["pending_pro_validation", "on_hold"])
    .lt("pro_processing_deadline", new Date().toISOString())
    .not("pro_processing_deadline", "is", null)
    .limit(20);

  if (unresponsive && unresponsive.length > 0) {
    alerts.push({
      type: "unresponsive_pros",
      severity: "warning",
      message: `${unresponsive.length} réservation(s) non traitée(s) par les pros (deadline dépassée)`,
      data: { count: unresponsive.length },
    });
  }

  // Pending arbitrations
  const { data: pendingArb, count: arbCount } = await supabase
    .from("no_show_disputes")
    .select("id", { count: "exact", head: true })
    .eq("dispute_status", "disputed_pending_arbitration");

  if (arbCount && arbCount > 0) {
    alerts.push({
      type: "pending_arbitrations",
      severity: "high",
      message: `${arbCount} litige(s) no-show en attente d'arbitrage`,
      data: { count: arbCount },
    });
  }

  // Deactivated establishments
  const { data: deactivated } = await supabase
    .from("pro_trust_scores")
    .select("establishment_id, current_sanction, deactivated_until")
    .in("current_sanction", ["deactivated_7d", "deactivated_30d"]);

  if (deactivated && deactivated.length > 0) {
    alerts.push({
      type: "deactivated_establishments",
      severity: "info",
      message: `${deactivated.length} établissement(s) actuellement désactivé(s)`,
      data: { count: deactivated.length },
    });
  }

  // Suspended clients
  const { count: suspendedCount } = await supabase
    .from("consumer_user_stats")
    .select("user_id", { count: "exact", head: true })
    .eq("is_suspended", true);

  if (suspendedCount && suspendedCount > 0) {
    alerts.push({
      type: "suspended_clients",
      severity: "info",
      message: `${suspendedCount} client(s) actuellement suspendu(s)`,
      data: { count: suspendedCount },
    });
  }

  res.json({ ok: true, alerts });
};

// =============================================================================
// Route registration
// =============================================================================

export function registerReservationV2AdminRoutes(app: Router): void {
  // Reservations overview
  app.get("/api/admin/reservations", listAdminReservations);

  // Disputes
  app.get("/api/admin/disputes", listAdminDisputes);
  app.post("/api/admin/disputes/:id/arbitrate", arbitrateDisputeRoute);

  // Sanctions
  app.get("/api/admin/sanctions", listAdminSanctions);
  app.post("/api/admin/establishments/:id/deactivate", deactivateEstablishment);
  app.post("/api/admin/establishments/:id/reactivate", reactivateEstablishment);
  app.post("/api/admin/sanctions/:id/lift", liftSanction);

  // Client management
  app.get("/api/admin/clients/low-score", getAdminLowScoreClients);
  app.post("/api/admin/clients/:id/unsuspend", unsuspendClient);

  // Pro trust scores
  app.get("/api/admin/pro-trust-scores", getAdminProTrustScores);

  // Statistics
  app.get("/api/admin/stats/reservations", getAdminReservationStats);
  app.get("/api/admin/stats/quotas", getAdminQuotaStats);

  // Alerts
  app.get("/api/admin/alerts", getAdminAlerts);
}
