/**
 * Admin Reviews & Reports Routes
 * Handles moderation of customer reviews and establishment reports
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { createModuleLogger } from "../lib/logger";
import { adminSupabase } from "../supabase";
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { getAuditActorInfo } from "./admin";
import { zBody, zParams, zIdParam } from "../lib/validate";
import { AdminRejectReviewSchema, AdminResolveReportSchema } from "../schemas/adminReviews";

const log = createModuleLogger("adminReviews");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewStatus =
  | "pending_moderation"
  | "sent_to_pro"
  | "pro_responded_hidden"
  | "approved"
  | "rejected"
  | "auto_published";

type ReportStatus = "pending" | "investigating" | "resolved" | "dismissed";

interface ReviewRow {
  id: string;
  establishment_id: string;
  user_id: string;
  reservation_id: string | null;
  overall_rating: number;
  criteria_ratings: Record<string, number>;
  title: string | null;
  comment: string | null;
  anonymous: boolean;
  status: ReviewStatus;
  sent_to_pro_at: string | null;
  pro_response_deadline: string | null;
  pro_response_type: string | null;
  pro_response_at: string | null;
  pro_promo_code_id: string | null;
  pro_reminder_sent: boolean;
  moderated_by: string | null;
  moderated_at: string | null;
  rejection_reason: string | null;
  pro_public_response: string | null;
  pro_public_response_at: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface ReportRow {
  id: string;
  establishment_id: string;
  reporter_user_id: string | null;
  reason_code: string;
  reason_text: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  action_taken: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helper: Update establishment rating stats after review publication
// ---------------------------------------------------------------------------

async function updateEstablishmentRatingStats(establishmentId: string): Promise<void> {
  const { error } = await adminSupabase.rpc("update_establishment_rating_stats", {
    p_establishment_id: establishmentId,
  });

  if (error) {
    log.error({ err: error }, "Error updating establishment rating stats");
  }
}

// ---------------------------------------------------------------------------
// Helper: Get establishment name for notifications
// ---------------------------------------------------------------------------

async function getEstablishmentName(establishmentId: string): Promise<string> {
  const { data } = await adminSupabase
    .from("establishments")
    .select("name, title")
    .eq("id", establishmentId)
    .single();

  return data?.name || data?.title || "Établissement";
}

// ---------------------------------------------------------------------------
// Helper: Get user email for notifications
// ---------------------------------------------------------------------------

async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await adminSupabase
    .from("consumer_users")
    .select("email")
    .eq("id", userId)
    .single();

  return data?.email || null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/reviews
// List all reviews with filters
// ---------------------------------------------------------------------------

export const listAdminReviews: RequestHandler = async (req, res) => {
  try {
    const {
      status,
      establishment_id,
      limit = "50",
      offset = "0",
    } = req.query;

    let query = adminSupabase
      .from("reviews")
      .select(`
        *,
        establishments:establishment_id (id, name, title, city, universe)
      `)
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (establishment_id) {
      query = query.eq("establishment_id", establishment_id);
    }

    const { data, error } = await query;

    if (error) {
      log.error({ err: error }, "listAdminReviews error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Get user emails for each review
    const reviewsWithUserInfo = await Promise.all(
      (data || []).map(async (review) => {
        const userEmail = await getUserEmail(review.user_id);
        return {
          ...review,
          user_email: review.anonymous ? null : userEmail,
        };
      })
    );

    return res.json({ ok: true, items: reviewsWithUserInfo });
  } catch (err) {
    log.error({ err }, "listAdminReviews exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/reviews/:id
// Get single review details
// ---------------------------------------------------------------------------

export const getAdminReview: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await adminSupabase
      .from("reviews")
      .select(`
        *,
        establishments:establishment_id (id, name, title, city, universe, cover_url)
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ ok: false, error: "Review not found" });
    }

    const userEmail = await getUserEmail(data.user_id);

    return res.json({
      ok: true,
      review: {
        ...data,
        user_email: data.anonymous ? null : userEmail,
      },
    });
  } catch (err) {
    log.error({ err }, "getAdminReview exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/reviews/:id/approve
// Approve and publish a review
// ---------------------------------------------------------------------------

export const approveReview: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    // Get the review
    const { data: review, error: fetchError } = await adminSupabase
      .from("reviews")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !review) {
      return res.status(404).json({ ok: false, error: "Review not found" });
    }

    if (review.status === "approved" || review.status === "auto_published") {
      return res.status(400).json({ ok: false, error: "Review already published" });
    }

    // Update review status
    const { error: updateError } = await adminSupabase
      .from("reviews")
      .update({
        status: "approved",
        moderated_by: adminUserId,
        moderated_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    // Update establishment rating stats
    await updateEstablishmentRatingStats(review.establishment_id);

    // Log to audit
    const actor = getAuditActorInfo(req);
    await adminSupabase.from("admin_audit_log").insert({
      source: "admin",
      action: "review.approve",
      entity_type: "review",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: { establishment_id: review.establishment_id, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
    });

    return res.json({ ok: true, status: "approved" });
  } catch (err) {
    log.error({ err }, "approveReview exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/reviews/:id/reject
// Reject a review (with reason)
// ---------------------------------------------------------------------------

export const rejectReview: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Rejection reason is required" });
    }

    // Get the review
    const { data: review, error: fetchError } = await adminSupabase
      .from("reviews")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !review) {
      return res.status(404).json({ ok: false, error: "Review not found" });
    }

    if (review.status === "rejected") {
      return res.status(400).json({ ok: false, error: "Review already rejected" });
    }

    // Update review status
    const { error: updateError } = await adminSupabase
      .from("reviews")
      .update({
        status: "rejected",
        moderated_by: adminUserId,
        moderated_at: new Date().toISOString(),
        rejection_reason: reason.trim(),
      })
      .eq("id", id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    // Log to audit
    const actor = getAuditActorInfo(req);
    await adminSupabase.from("admin_audit_log").insert({
      source: "admin",
      action: "review.reject",
      entity_type: "review",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: { establishment_id: review.establishment_id, reason: reason.trim(), actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
    });

    return res.json({ ok: true, status: "rejected" });
  } catch (err) {
    log.error({ err }, "rejectReview exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/reviews/:id/send-to-pro
// Send a negative review to pro for response (24h deadline)
// ---------------------------------------------------------------------------

export const sendReviewToPro: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    // Get the review
    const { data: review, error: fetchError } = await adminSupabase
      .from("reviews")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !review) {
      return res.status(404).json({ ok: false, error: "Review not found" });
    }

    if (review.status !== "pending_moderation") {
      return res.status(400).json({ ok: false, error: "Review is not pending moderation" });
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

    // Update review status
    const { error: updateError } = await adminSupabase
      .from("reviews")
      .update({
        status: "sent_to_pro",
        sent_to_pro_at: now.toISOString(),
        pro_response_deadline: deadline.toISOString(),
        moderated_by: adminUserId,
        moderated_at: now.toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    // Get establishment name for notification
    const establishmentName = await getEstablishmentName(review.establishment_id);

    // Notify pro members
    await notifyProMembers({
      supabase: adminSupabase,
      establishmentId: review.establishment_id,
      title: "Nouvel avis à traiter",
      body: `Un avis client nécessite votre attention pour ${establishmentName}. Vous avez 24h pour y répondre.`,
      category: "review",
      data: {
        reviewId: id,
        targetTab: "reviews",
        deadline: deadline.toISOString(),
      },
    });

    // Log to audit
    const actor = getAuditActorInfo(req);
    await adminSupabase.from("admin_audit_log").insert({
      source: "admin",
      action: "review.send_to_pro",
      entity_type: "review",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: {
        establishment_id: review.establishment_id,
        deadline: deadline.toISOString(),
        actor_email: actor.actor_email,
        actor_name: actor.actor_name,
        actor_role: actor.actor_role,
      },
    });

    return res.json({
      ok: true,
      status: "sent_to_pro",
      deadline: deadline.toISOString(),
    });
  } catch (err) {
    log.error({ err }, "sendReviewToPro exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// List all establishment reports
// ---------------------------------------------------------------------------

export const listAdminReports: RequestHandler = async (req, res) => {
  try {
    const {
      status,
      establishment_id,
      limit = "50",
      offset = "0",
    } = req.query;

    let query = adminSupabase
      .from("establishment_reports")
      .select(`
        *,
        establishments:establishment_id (id, name, title, city, universe)
      `)
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (establishment_id) {
      query = query.eq("establishment_id", establishment_id);
    }

    const { data, error } = await query;

    if (error) {
      log.error({ err: error }, "listAdminReports error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Get reporter emails
    const reportsWithUserInfo = await Promise.all(
      (data || []).map(async (report) => {
        let reporterEmail = null;
        if (report.reporter_user_id) {
          reporterEmail = await getUserEmail(report.reporter_user_id);
        }
        return {
          ...report,
          reporter_email: reporterEmail,
        };
      })
    );

    return res.json({ ok: true, items: reportsWithUserInfo });
  } catch (err) {
    log.error({ err }, "listAdminReports exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/reports/:id/resolve
// Resolve an establishment report
// ---------------------------------------------------------------------------

export const resolveReport: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, action_taken } = req.body;
    const adminUserId = req.headers["x-admin-user-id"] as string || "admin";

    if (!status || !["resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ ok: false, error: "Invalid status. Must be 'resolved' or 'dismissed'" });
    }

    // Get the report
    const { data: report, error: fetchError } = await adminSupabase
      .from("establishment_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !report) {
      return res.status(404).json({ ok: false, error: "Report not found" });
    }

    if (report.status === "resolved" || report.status === "dismissed") {
      return res.status(400).json({ ok: false, error: "Report already resolved" });
    }

    // Update report
    const { error: updateError } = await adminSupabase
      .from("establishment_reports")
      .update({
        status,
        resolved_by: adminUserId,
        resolved_at: new Date().toISOString(),
        resolution_notes: notes || null,
        action_taken: action_taken || null,
      })
      .eq("id", id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    // Log to audit
    const actor = getAuditActorInfo(req);
    await adminSupabase.from("admin_audit_log").insert({
      source: "admin",
      action: `report.${status}`,
      entity_type: "establishment_report",
      entity_id: id,
      actor_user_id: adminUserId,
      actor_id: actor.actor_id,
      metadata: {
        establishment_id: report.establishment_id,
        action_taken,
        notes,
        actor_email: actor.actor_email,
        actor_name: actor.actor_name,
        actor_role: actor.actor_role,
      },
    });

    return res.json({ ok: true, status });
  } catch (err) {
    log.error({ err }, "resolveReport exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/reviews/stats
// Get review/report statistics for dashboard
// ---------------------------------------------------------------------------

export const getReviewStats: RequestHandler = async (req, res) => {
  try {
    // Count reviews by status
    const { data: reviewCounts } = await adminSupabase
      .from("reviews")
      .select("status")
      .then(({ data }) => {
        const counts: Record<string, number> = {
          pending_moderation: 0,
          sent_to_pro: 0,
          approved: 0,
          rejected: 0,
          auto_published: 0,
          pro_responded_hidden: 0,
        };
        (data || []).forEach((r) => {
          counts[r.status] = (counts[r.status] || 0) + 1;
        });
        return { data: counts };
      });

    // Count reports by status
    const { data: reportCounts } = await adminSupabase
      .from("establishment_reports")
      .select("status")
      .then(({ data }) => {
        const counts: Record<string, number> = {
          pending: 0,
          investigating: 0,
          resolved: 0,
          dismissed: 0,
        };
        (data || []).forEach((r) => {
          counts[r.status] = (counts[r.status] || 0) + 1;
        });
        return { data: counts };
      });

    // Count reviews expiring soon (pro deadline < 6h)
    const sixHoursFromNow = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { count: expiringCount } = await adminSupabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent_to_pro")
      .lt("pro_response_deadline", sixHoursFromNow);

    return res.json({
      ok: true,
      reviews: reviewCounts,
      reports: reportCounts,
      expiring_soon: expiringCount || 0,
    });
  } catch (err) {
    log.error({ err }, "getReviewStats exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerAdminReviewRoutes(app: Express) {
  app.get("/api/admin/reviews", listAdminReviews);
  app.get("/api/admin/reviews/stats", getReviewStats);
  app.post("/api/admin/reviews/:id/approve", zParams(zIdParam), approveReview);
  app.post("/api/admin/reviews/:id/reject", zParams(zIdParam), zBody(AdminRejectReviewSchema), rejectReview);
  app.post("/api/admin/reviews/:id/send-to-pro", zParams(zIdParam), sendReviewToPro);
  app.get("/api/admin/reports", listAdminReports);
  app.post("/api/admin/reports/:id/resolve", zParams(zIdParam), zBody(AdminResolveReportSchema), resolveReport);
}
