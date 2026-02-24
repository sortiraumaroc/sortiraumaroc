/**
 * Loyalty V2 — Admin Routes
 *
 * 15 endpoints admin :
 * - Programmes : liste, détail, suspend, unsuspend, stats globales
 * - Alertes : liste, review, dismiss
 * - Cadeaux sam.ma : liste, approve, reject, distribute (3 modes), stats
 * - Module : toggle global, toggle per-establishment
 */

import type { Router, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";
import {
  SuspendProgramSchema,
  ReviewAlertSchema,
  DismissAlertSchema,
  ApproveGiftSchema,
  RejectGiftSchema,
  DistributeGiftManualSchema,
  DistributeGiftCriteriaSchema,
  DistributeGiftPublicSchema,
  ListAdminProgramsQuery,
  ListAdminAlertsQuery,
  ListAdminGiftsQuery,
} from "../schemas/loyaltyV2Admin";

const log = createModuleLogger("loyaltyV2Admin");
import { updateProgramStatus } from "../loyaltyV2Logic";
import {
  approvePlatformGift,
  rejectPlatformGift,
  distributeManual,
  distributeByCriteria,
  publishForFirstCome,
  getAdminGifts,
  getGiftStats,
} from "../platformGiftLogic";
import {
  getAlerts,
  reviewAlert,
  dismissAlert,
} from "../loyaltyFraudDetection";
import type { PlatformGiftStatus, DistributionCriteria } from "../../shared/loyaltyTypesV2";
import { isValidUUID, sanitizeText } from "../sanitizeV2";
import { auditAdminAction } from "../auditLogV2";
import { getClientIp } from "../middleware/rateLimiter";

// =============================================================================
// 1. GET /api/admin/loyalty/programs — Liste de tous les programmes
// =============================================================================

const listAdminPrograms: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const status = String(req.query.status ?? "");
    const estId = String(req.query.establishment_id ?? "");
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    let query = supabase
      .from("loyalty_programs")
      .select("*, establishment:establishments(id, name, slug, city, logo_url)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (estId) query = query.eq("establishment_id", estId);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, programs: data ?? [] });
  } catch (err) {
    log.error({ err }, "listAdminPrograms error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. GET /api/admin/loyalty/programs/:id — Détail d'un programme
// =============================================================================

const getAdminProgramDetail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const programId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("*, establishment:establishments(id, name, slug, city, logo_url)")
      .eq("id", programId)
      .maybeSingle();

    if (!program) return res.status(404).json({ error: "Program not found" });

    // Stats
    const { data: cards } = await supabase
      .from("loyalty_cards")
      .select("status, cycle_number")
      .eq("program_id", programId);

    const active = (cards ?? []).filter((c) => c.status === "active").length;
    const completed = (cards ?? []).filter(
      (c) => c.status === "completed" || c.status === "reward_pending" || c.status === "reward_used"
    ).length;

    res.json({
      ok: true,
      program,
      stats: {
        total_cards: cards?.length ?? 0,
        active_cards: active,
        completed_cards: completed,
        completion_rate: (cards?.length ?? 0) > 0 ? completed / (cards?.length ?? 1) : 0,
      },
    });
  } catch (err) {
    log.error({ err }, "getAdminProgramDetail error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. POST /api/admin/loyalty/programs/:id/suspend — Suspendre
// =============================================================================

const suspendProgram: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const programId = req.params.id;
    if (!programId || !isValidUUID(programId)) return res.status(400).json({ error: "Invalid programId" });

    const body = req.body as Record<string, unknown>;
    const reason = sanitizeText(String(body.reason ?? ""), 2000);

    // Fetch establishment_id
    const supabase = getAdminSupabase();
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("establishment_id")
      .eq("id", programId)
      .maybeSingle();

    if (!program) return res.status(404).json({ error: "Program not found" });

    const result = await updateProgramStatus({
      programId,
      establishmentId: program.establishment_id,
      newStatus: "suspended",
      suspendedBy: String(body.admin_id ?? "admin"),
      suspendedReason: reason || "Suspendu par l'admin",
    });

    void auditAdminAction("admin.loyalty.suspend_program", {
      adminId: String(body.admin_id ?? "admin"),
      targetType: "loyalty_program",
      targetId: programId,
      details: { reason, frozen_cards: result.frozenCount ?? 0 },
      ip: getClientIp(req),
    });

    res.json({
      ok: result.ok,
      frozen_cards: result.frozenCount ?? 0,
      message: `Programme suspendu. ${result.frozenCount ?? 0} carte(s) gelée(s).`,
    });
  } catch (err) {
    log.error({ err }, "suspendProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. POST /api/admin/loyalty/programs/:id/unsuspend — Réactiver
// =============================================================================

const unsuspendProgram: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const programId = req.params.id;
    if (!programId || !isValidUUID(programId)) return res.status(400).json({ error: "Invalid programId" });

    const supabase = getAdminSupabase();
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("establishment_id")
      .eq("id", programId)
      .maybeSingle();

    if (!program) return res.status(404).json({ error: "Program not found" });

    const result = await updateProgramStatus({
      programId,
      establishmentId: program.establishment_id,
      newStatus: "active",
    });

    void auditAdminAction("admin.loyalty.unsuspend_program", {
      targetType: "loyalty_program",
      targetId: programId,
      details: { unfrozen_cards: result.unfrozenCount ?? 0 },
      ip: getClientIp(req),
    });

    res.json({
      ok: result.ok,
      unfrozen_cards: result.unfrozenCount ?? 0,
      message: `Programme réactivé. ${result.unfrozenCount ?? 0} carte(s) dégelée(s).`,
    });
  } catch (err) {
    log.error({ err }, "unsuspendProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. GET /api/admin/loyalty/stats — Statistiques globales fidélité
// =============================================================================

const getAdminLoyaltyStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const { count: programsActive } = await supabase
      .from("loyalty_programs")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: programsTotal } = await supabase
      .from("loyalty_programs")
      .select("id", { count: "exact", head: true });

    const { count: cardsActive } = await supabase
      .from("loyalty_cards")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    const { count: cardsCompleted } = await supabase
      .from("loyalty_cards")
      .select("id", { count: "exact", head: true })
      .in("status", ["completed", "reward_pending", "reward_used"]);

    const { count: rewardsActive } = await supabase
      .from("loyalty_rewards")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    const { count: rewardsUsed } = await supabase
      .from("loyalty_rewards")
      .select("id", { count: "exact", head: true })
      .eq("status", "used");

    const { count: alertsPending } = await supabase
      .from("loyalty_alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: giftsTotal } = await supabase
      .from("platform_gifts")
      .select("id", { count: "exact", head: true });

    const { count: giftsDistributed } = await supabase
      .from("platform_gift_distributions")
      .select("id", { count: "exact", head: true })
      .eq("status", "distributed");

    const { count: giftsConsumed } = await supabase
      .from("platform_gift_distributions")
      .select("id", { count: "exact", head: true })
      .eq("status", "consumed");

    res.json({
      ok: true,
      stats: {
        programs_active: programsActive ?? 0,
        programs_total: programsTotal ?? 0,
        cards_active: cardsActive ?? 0,
        cards_completed: cardsCompleted ?? 0,
        rewards_active: rewardsActive ?? 0,
        rewards_used: rewardsUsed ?? 0,
        alerts_pending: alertsPending ?? 0,
        gifts_total: giftsTotal ?? 0,
        gifts_distributed: giftsDistributed ?? 0,
        gifts_consumed: giftsConsumed ?? 0,
      },
    });
  } catch (err) {
    log.error({ err }, "getAdminLoyaltyStats error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. GET /api/admin/loyalty/alerts — Alertes
// =============================================================================

const listAdminAlerts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const status = String(req.query.status ?? "");
    const alertType = String(req.query.alert_type ?? "");
    const estId = String(req.query.establishment_id ?? "");

    const alerts = await getAlerts({
      status: status || undefined,
      alertType: alertType || undefined,
      establishmentId: estId || undefined,
    });

    res.json({ ok: true, alerts });
  } catch (err) {
    log.error({ err }, "listAdminAlerts error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 7. POST /api/admin/loyalty/alerts/:id/review — Marquer comme examiné
// =============================================================================

const reviewAdminAlert: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const alertId = req.params.id;
    if (!alertId || !isValidUUID(alertId)) return res.status(400).json({ error: "Invalid alertId" });

    const body = req.body as Record<string, unknown>;

    const result = await reviewAlert({
      alertId,
      reviewedBy: String(body.admin_id ?? "admin"),
      reviewNotes: body.notes ? sanitizeText(String(body.notes), 2000) : undefined,
    });

    void auditAdminAction("admin.loyalty.review_alert", {
      adminId: String(body.admin_id ?? "admin"),
      targetType: "loyalty_alert",
      targetId: alertId,
      ip: getClientIp(req),
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, "reviewAdminAlert error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 8. POST /api/admin/loyalty/alerts/:id/dismiss — Ignorer
// =============================================================================

const dismissAdminAlert: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const alertId = req.params.id;
    if (!alertId || !isValidUUID(alertId)) return res.status(400).json({ error: "Invalid alertId" });

    const body = req.body as Record<string, unknown>;

    const result = await dismissAlert({
      alertId,
      reviewedBy: String(body.admin_id ?? "admin"),
      reviewNotes: body.notes ? sanitizeText(String(body.notes), 2000) : undefined,
    });

    void auditAdminAction("admin.loyalty.dismiss_alert", {
      adminId: String(body.admin_id ?? "admin"),
      targetType: "loyalty_alert",
      targetId: alertId,
      ip: getClientIp(req),
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, "dismissAdminAlert error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 9. GET /api/admin/gifts — Tous les cadeaux offerts par les pros
// =============================================================================

const listAdminGifts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const status = String(req.query.status ?? "") as PlatformGiftStatus | "";
    const estId = String(req.query.establishment_id ?? "");

    const gifts = await getAdminGifts({
      status: status || undefined,
      establishmentId: estId || undefined,
    });

    res.json({ ok: true, gifts });
  } catch (err) {
    log.error({ err }, "listAdminGifts error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 10. POST /api/admin/gifts/:id/approve — Approuver un cadeau
// =============================================================================

const approveGift: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const giftId = req.params.id;
    if (!giftId || !isValidUUID(giftId)) return res.status(400).json({ error: "Invalid giftId" });

    const body = req.body as Record<string, unknown>;

    const result = await approvePlatformGift({
      giftId,
      approvedBy: String(body.admin_id ?? "admin"),
    });

    if (result.ok) {
      void auditAdminAction("admin.loyalty.approve_gift", {
        adminId: String(body.admin_id ?? "admin"),
        targetType: "platform_gift",
        targetId: giftId,
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    log.error({ err }, "approveGift error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 11. POST /api/admin/gifts/:id/reject — Rejeter un cadeau
// =============================================================================

const rejectGift: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const giftId = req.params.id;
    if (!giftId || !isValidUUID(giftId)) return res.status(400).json({ error: "Invalid giftId" });

    const body = req.body as Record<string, unknown>;
    const reason = sanitizeText(String(body.reason ?? ""), 2000);

    if (!reason) return res.status(400).json({ error: "reason required" });

    const result = await rejectPlatformGift({
      giftId,
      rejectedBy: String(body.admin_id ?? "admin"),
      reason,
    });

    if (result.ok) {
      void auditAdminAction("admin.loyalty.reject_gift", {
        adminId: String(body.admin_id ?? "admin"),
        targetType: "platform_gift",
        targetId: giftId,
        details: { reason },
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    log.error({ err }, "rejectGift error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 12. POST /api/admin/gifts/:id/distribute/manual — Distribution manuelle
// =============================================================================

const distributeGiftManual: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const giftId = req.params.id;
    if (!giftId || !isValidUUID(giftId)) return res.status(400).json({ error: "Invalid giftId" });

    const body = req.body as Record<string, unknown>;
    const userIds = Array.isArray(body.user_ids) ? (body.user_ids as string[]) : [];

    if (userIds.length === 0) {
      return res.status(400).json({ error: "user_ids array required" });
    }

    // Validate all user IDs
    if (userIds.length > 1000 || userIds.some((id) => !isValidUUID(id))) {
      return res.status(400).json({ error: "Invalid user_ids (max 1000, all must be valid UUIDs)" });
    }

    const result = await distributeManual({
      giftId,
      userIds,
      distributedBy: String(body.admin_id ?? "admin"),
    });

    if (result.ok) {
      void auditAdminAction("admin.loyalty.distribute_gift", {
        adminId: String(body.admin_id ?? "admin"),
        targetType: "platform_gift",
        targetId: giftId,
        details: { mode: "manual", recipients_count: userIds.length },
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    log.error({ err }, "distributeGiftManual error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 13. POST /api/admin/gifts/:id/distribute/criteria — Distribution par critères
// =============================================================================

const distributeGiftCriteria: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const giftId = req.params.id;
    if (!giftId || !isValidUUID(giftId)) return res.status(400).json({ error: "Invalid giftId" });

    const body = req.body as Record<string, unknown>;

    const criteria: DistributionCriteria = {
      city: body.city ? String(body.city) : undefined,
      min_reservations: body.min_reservations ? Number(body.min_reservations) : undefined,
      inactive_days: body.inactive_days ? Number(body.inactive_days) : undefined,
      max_recipients: body.max_recipients ? Number(body.max_recipients) : undefined,
    };

    const result = await distributeByCriteria({
      giftId,
      criteria,
      distributedBy: String(body.admin_id ?? "admin"),
    });

    if (result.ok) {
      void auditAdminAction("admin.loyalty.distribute_gift", {
        adminId: String(body.admin_id ?? "admin"),
        targetType: "platform_gift",
        targetId: giftId,
        details: { mode: "criteria", criteria },
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    log.error({ err }, "distributeGiftCriteria error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 14. POST /api/admin/gifts/:id/distribute/public — Premier arrivé
// =============================================================================

const distributeGiftPublic: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const giftId = req.params.id;
    if (!giftId || !isValidUUID(giftId)) return res.status(400).json({ error: "Invalid giftId" });

    const body = req.body as Record<string, unknown>;

    const result = await publishForFirstCome({
      giftId,
      publishedBy: String(body.admin_id ?? "admin"),
    });

    if (result.ok) {
      void auditAdminAction("admin.loyalty.distribute_gift", {
        adminId: String(body.admin_id ?? "admin"),
        targetType: "platform_gift",
        targetId: giftId,
        details: { mode: "public_first_come" },
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    log.error({ err }, "distributeGiftPublic error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 15. GET /api/admin/gifts/:id/stats — Stats d'un cadeau
// =============================================================================

const getGiftStatsAdmin: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const giftId = req.params.id;
    const stats = await getGiftStats(giftId);
    res.json({ ok: true, stats });
  } catch (err) {
    log.error({ err }, "getGiftStatsAdmin error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerLoyaltyV2AdminRoutes(app: Router): void {
  // Programmes
  app.get("/api/admin/loyalty/programs", zQuery(ListAdminProgramsQuery), listAdminPrograms);
  app.get("/api/admin/loyalty/programs/:id", zParams(zIdParam), getAdminProgramDetail);
  app.post("/api/admin/loyalty/programs/:id/suspend", zParams(zIdParam), zBody(SuspendProgramSchema), suspendProgram);
  app.post("/api/admin/loyalty/programs/:id/unsuspend", zParams(zIdParam), unsuspendProgram);
  app.get("/api/admin/loyalty/stats", getAdminLoyaltyStats);

  // Alertes
  app.get("/api/admin/loyalty/alerts", zQuery(ListAdminAlertsQuery), listAdminAlerts);
  app.post("/api/admin/loyalty/alerts/:id/review", zParams(zIdParam), zBody(ReviewAlertSchema), reviewAdminAlert);
  app.post("/api/admin/loyalty/alerts/:id/dismiss", zParams(zIdParam), zBody(DismissAlertSchema), dismissAdminAlert);

  // Cadeaux sam.ma
  app.get("/api/admin/gifts", zQuery(ListAdminGiftsQuery), listAdminGifts);
  app.post("/api/admin/gifts/:id/approve", zParams(zIdParam), zBody(ApproveGiftSchema), approveGift);
  app.post("/api/admin/gifts/:id/reject", zParams(zIdParam), zBody(RejectGiftSchema), rejectGift);
  app.post("/api/admin/gifts/:id/distribute/manual", zParams(zIdParam), zBody(DistributeGiftManualSchema), distributeGiftManual);
  app.post("/api/admin/gifts/:id/distribute/criteria", zParams(zIdParam), zBody(DistributeGiftCriteriaSchema), distributeGiftCriteria);
  app.post("/api/admin/gifts/:id/distribute/public", zParams(zIdParam), zBody(DistributeGiftPublicSchema), distributeGiftPublic);
  app.get("/api/admin/gifts/:id/stats", zParams(zIdParam), getGiftStatsAdmin);
}
