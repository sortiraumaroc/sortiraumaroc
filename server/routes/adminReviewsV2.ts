/**
 * Admin Reviews V2 Routes
 *
 * Full moderation workflow for the reviews system:
 *   GET  /api/admin/reviews             — List reviews with filters
 *   GET  /api/admin/reviews/stats       — Dashboard stats
 *   GET  /api/admin/reviews/:id         — Get single review detail
 *   POST /api/admin/reviews/:id/moderate — Approve / Reject / Request modification
 *   GET  /api/admin/reviews/responses   — List pending pro responses
 *   POST /api/admin/reviews/responses/:id/moderate — Approve / Reject pro response
 *   GET  /api/admin/reviews/reports     — List review reports
 *   POST /api/admin/reviews/reports/:id/resolve — Resolve a report
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";

const log = createModuleLogger("adminReviewsV2");
import { getAuditActorInfo } from "./admin";
import {
  adminApproveReview,
  adminRejectReview,
  adminRequestModification,
  getUserEmail,
  getUserDisplayName,
  getEstablishmentInfo,
  updateEstablishmentRatingStats,
} from "../reviewLogic";
import {
  adminListReviewsSchema,
  moderateReviewSchema,
  moderateResponseSchema,
  adminListReportsSchema,
  resolveReportSchema,
} from "../schemas/reviews";
import { zBody, zParams, zIdParam } from "../lib/validate";
import {
  AdminModerateReviewSchema,
  AdminModerateResponseSchema,
  AdminResolveReportSchema,
} from "../schemas/adminReviewsV2";
import type { ReviewStatus } from "../../shared/reviewTypes";

// =============================================================================
// GET /api/admin/reviews
// List all reviews with filtering, sorting, pagination
// =============================================================================

export const listAdminReviewsV2: RequestHandler = async (req, res) => {
  try {
    const parsed = adminListReviewsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Paramètres invalides" });
    }

    const { status, establishment_id, sort_by, sort_order, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("reviews")
      .select(`
        *,
        establishments:establishment_id (id, name, title, city, universe, slug)
      `, { count: "exact" })
      .order(sort_by, { ascending: sort_order === "asc" })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (establishment_id) {
      query = query.eq("establishment_id", establishment_id);
    }

    const { data, error, count } = await query;

    if (error) {
      log.error({ err: error }, "listAdminReviews error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Enrich with user info
    const enriched = await Promise.all(
      (data ?? []).map(async (review) => {
        const userEmail = await getUserEmail(review.user_id);
        const userName = await getUserDisplayName(review.user_id);

        // Get pending gesture if any
        let gesture = null;
        if (
          review.commercial_gesture_status !== "none" &&
          review.commercial_gesture_status !== "expired"
        ) {
          const { data: gestureData } = await supabase
            .from("commercial_gestures")
            .select("id, message, status, proposed_at, responded_at")
            .eq("review_id", review.id)
            .single();
          gesture = gestureData;
        }

        // Get pro response if any
        let proResponse = null;
        const { data: responseData } = await supabase
          .from("review_responses")
          .select("id, content, status, published_at, created_at")
          .eq("review_id", review.id)
          .single();
        if (responseData) proResponse = responseData;

        // Get vote counts
        const { data: voteCounts } = await supabase
          .rpc("get_review_vote_counts", { p_review_id: review.id });

        // Get report count
        const { count: reportCount } = await supabase
          .from("review_reports")
          .select("*", { count: "exact", head: true })
          .eq("review_id", review.id)
          .eq("status", "pending");

        return {
          ...review,
          user_email: userEmail,
          user_name: userName,
          gesture,
          pro_response: proResponse,
          votes: voteCounts?.[0] ?? { useful_count: 0, not_useful_count: 0 },
          pending_reports: reportCount ?? 0,
        };
      }),
    );

    return res.json({
      ok: true,
      items: enriched,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listAdminReviews exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/admin/reviews/stats
// Dashboard statistics
// =============================================================================

export const getReviewStatsV2: RequestHandler = async (req, res) => {
  try {
    const supabase = getAdminSupabase();

    // Count reviews by status
    const { data: allReviews } = await supabase
      .from("reviews")
      .select("status");

    const reviewCounts: Record<string, number> = {
      pending_moderation: 0,
      approved: 0,
      rejected: 0,
      modification_requested: 0,
      pending_commercial_gesture: 0,
      resolved: 0,
      published: 0,
    };

    for (const r of allReviews ?? []) {
      reviewCounts[r.status] = (reviewCounts[r.status] ?? 0) + 1;
    }

    // Count pending review reports
    const { count: pendingReports } = await supabase
      .from("review_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // Count pending pro responses
    const { count: pendingResponses } = await supabase
      .from("review_responses")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_moderation");

    // Count gestures expiring soon (< 6h)
    const sixHoursFromNow = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { count: gesturesExpiringSoon } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_commercial_gesture")
      .eq("commercial_gesture_status", "none")
      .lte("gesture_deadline", sixHoursFromNow);

    return res.json({
      ok: true,
      reviews: reviewCounts,
      pending_reports: pendingReports ?? 0,
      pending_responses: pendingResponses ?? 0,
      gestures_expiring_soon: gesturesExpiringSoon ?? 0,
    });
  } catch (err) {
    log.error({ err }, "getReviewStats exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/admin/reviews/:id
// Get single review with full details
// =============================================================================

export const getAdminReviewV2: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();

    const { data: review, error } = await supabase
      .from("reviews")
      .select(`
        *,
        establishments:establishment_id (id, name, title, city, universe, cover_url, slug)
      `)
      .eq("id", id)
      .single();

    if (error || !review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable" });
    }

    // User info
    const userEmail = await getUserEmail(review.user_id);
    const userName = await getUserDisplayName(review.user_id);

    // Reservation info
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, starts_at, persons, checked_in_at, status")
      .eq("id", review.reservation_id)
      .single();

    // Gesture
    const { data: gesture } = await supabase
      .from("commercial_gestures")
      .select(`
        id, message, status, proposed_at, responded_at,
        consumer_promo_codes:promo_code_id (id, code, description, discount_bps)
      `)
      .eq("review_id", review.id)
      .single();

    // Pro response
    const { data: proResponse } = await supabase
      .from("review_responses")
      .select("*")
      .eq("review_id", review.id)
      .single();

    // Votes
    const { data: voteCounts } = await supabase
      .rpc("get_review_vote_counts", { p_review_id: review.id });

    // Reports
    const { data: reports } = await supabase
      .from("review_reports")
      .select("*")
      .eq("review_id", review.id)
      .order("created_at", { ascending: false });

    // Invitation
    const { data: invitation } = await supabase
      .from("review_invitations")
      .select("id, token, status, sent_at, clicked_at, completed_at")
      .eq("reservation_id", review.reservation_id)
      .single();

    return res.json({
      ok: true,
      review: {
        ...review,
        user_email: userEmail,
        user_name: userName,
        reservation,
        gesture: gesture ?? null,
        pro_response: proResponse ?? null,
        votes: voteCounts?.[0] ?? { useful_count: 0, not_useful_count: 0 },
        reports: reports ?? [],
        invitation: invitation ?? null,
      },
    });
  } catch (err) {
    log.error({ err }, "getAdminReview exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// POST /api/admin/reviews/:id/moderate
// Unified moderation action: approve / reject / request_modification
// =============================================================================

export const moderateReviewV2: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    const parsed = moderateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const { action, moderation_note } = parsed.data;
    let result: { ok: true; newStatus?: ReviewStatus } | { ok: false; error: string };

    switch (action) {
      case "approve":
        result = await adminApproveReview({ reviewId: id, adminUserId });
        break;
      case "reject":
        if (!moderation_note) {
          return res.status(400).json({ ok: false, error: "Raison de rejet requise" });
        }
        result = await adminRejectReview({ reviewId: id, adminUserId, reason: moderation_note });
        break;
      case "request_modification":
        if (!moderation_note) {
          return res.status(400).json({ ok: false, error: "Note de modification requise" });
        }
        result = await adminRequestModification({ reviewId: id, adminUserId, note: moderation_note });
        break;
      default:
        return res.status(400).json({ ok: false, error: "Action invalide" });
    }

    if (result.ok === false) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    // Audit log
    const actor = getAuditActorInfo(req);
    const supabase = getAdminSupabase();
    await supabase.from("admin_audit_log").insert({
      source: "admin",
      action: `review.${action}`,
      entity_type: "review",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: {
        moderation_note,
        new_status: "newStatus" in result ? result.newStatus : action,
        actor_email: actor.actor_email,
        actor_name: actor.actor_name,
        actor_role: actor.actor_role,
      },
    });

    return res.json({
      ok: true,
      action,
      new_status: "newStatus" in result ? result.newStatus : action,
    });
  } catch (err) {
    log.error({ err }, "moderateReview exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/admin/reviews/responses
// List pending pro responses to moderate
// =============================================================================

export const listPendingResponsesV2: RequestHandler = async (req, res) => {
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("review_responses")
      .select(`
        *,
        reviews:review_id (
          id, establishment_id, rating_overall, user_id, status, published_at,
          establishments:establishment_id (id, name, title, slug)
        )
      `)
      .eq("status", "pending_moderation")
      .order("created_at", { ascending: true });

    if (error) {
      log.error({ err: error }, "listPendingResponses error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, items: data ?? [] });
  } catch (err) {
    log.error({ err }, "listPendingResponses exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// POST /api/admin/reviews/responses/:id/moderate
// Approve or reject a pro public response
// =============================================================================

export const moderateResponseV2: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    const parsed = moderateResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const { action, moderation_note } = parsed.data;
    const supabase = getAdminSupabase();
    const now = new Date().toISOString();

    // Get the response
    const { data: response, error: fetchErr } = await supabase
      .from("review_responses")
      .select("*, reviews:review_id (id, establishment_id)")
      .eq("id", id)
      .single();

    if (fetchErr || !response) {
      return res.status(404).json({ ok: false, error: "Réponse introuvable" });
    }

    if (response.status !== "pending_moderation") {
      return res.status(400).json({ ok: false, error: "Réponse déjà traitée" });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const { error: updateErr } = await supabase
      .from("review_responses")
      .update({
        status: newStatus,
        moderated_by: adminUserId,
        moderated_at: now,
        moderation_note: moderation_note ?? null,
        ...(action === "approve" ? { published_at: now } : {}),
      })
      .eq("id", id);

    if (updateErr) {
      return res.status(500).json({ ok: false, error: updateErr.message });
    }

    // Audit log
    const actor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      source: "admin",
      action: `review_response.${action}`,
      entity_type: "review_response",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: {
        review_id: response.review_id,
        establishment_id: (response as any).reviews?.establishment_id,
        moderation_note,
        actor_email: actor.actor_email,
        actor_name: actor.actor_name,
        actor_role: actor.actor_role,
      },
    });

    return res.json({ ok: true, action, new_status: newStatus });
  } catch (err) {
    log.error({ err }, "moderateResponse exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/admin/reviews/reports
// List review reports
// =============================================================================

export const listReviewReportsV2: RequestHandler = async (req, res) => {
  try {
    const parsed = adminListReportsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Paramètres invalides" });
    }

    const { status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("review_reports")
      .select(`
        *,
        reviews:review_id (
          id, establishment_id, rating_overall, comment, user_id, status,
          establishments:establishment_id (id, name, title, slug)
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      log.error({ err: error }, "listReviewReports error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({
      ok: true,
      items: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listReviewReports exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// POST /api/admin/reviews/reports/:id/resolve
// Resolve a review report
// =============================================================================

export const resolveReviewReportV2: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    const parsed = resolveReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const { action, review_note } = parsed.data;
    const supabase = getAdminSupabase();
    const now = new Date().toISOString();

    // Get the report
    const { data: report, error: fetchErr } = await supabase
      .from("review_reports")
      .select("*, reviews:review_id (id, establishment_id)")
      .eq("id", id)
      .single();

    if (fetchErr || !report) {
      return res.status(404).json({ ok: false, error: "Signalement introuvable" });
    }

    if (report.status !== "pending") {
      return res.status(400).json({ ok: false, error: "Signalement déjà traité" });
    }

    const { error: updateErr } = await supabase
      .from("review_reports")
      .update({
        status: action,
        reviewed_by: adminUserId,
        reviewed_at: now,
        review_note: review_note ?? null,
      })
      .eq("id", id);

    if (updateErr) {
      return res.status(500).json({ ok: false, error: updateErr.message });
    }

    // Audit log
    const actor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      source: "admin",
      action: `review_report.${action}`,
      entity_type: "review_report",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: {
        review_id: report.review_id,
        review_note,
        actor_email: actor.actor_email,
        actor_name: actor.actor_name,
        actor_role: actor.actor_role,
      },
    });

    return res.json({ ok: true, action, status: action });
  } catch (err) {
    log.error({ err }, "resolveReviewReport exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerAdminReviewsV2Routes(app: Express) {
  app.get("/api/admin/v2/reviews", listAdminReviewsV2);
  app.get("/api/admin/v2/reviews/stats", getReviewStatsV2);
  app.get("/api/admin/v2/reviews/:id", zParams(zIdParam), getAdminReviewV2);
  app.post("/api/admin/v2/reviews/:id/moderate", zParams(zIdParam), zBody(AdminModerateReviewSchema), moderateReviewV2);
  app.get("/api/admin/v2/reviews/responses", listPendingResponsesV2);
  app.post("/api/admin/v2/reviews/responses/:id/moderate", zParams(zIdParam), zBody(AdminModerateResponseSchema), moderateResponseV2);
  app.get("/api/admin/v2/reviews/reports", listReviewReportsV2);
  app.post("/api/admin/v2/reviews/reports/:id/resolve", zParams(zIdParam), zBody(AdminResolveReportSchema), resolveReviewReportV2);
}
