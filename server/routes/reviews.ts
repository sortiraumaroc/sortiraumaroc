/**
 * Consumer Reviews & Reports Routes
 * Handles review submission and establishment reporting
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { consumerSupabase, adminSupabase } from "../supabase";
import { emitAdminNotification } from "../adminNotifications";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams } from "../lib/validate";
import { SubmitReviewSchema, SubmitReportSchema, EstablishmentReviewIdParams, ReviewInvitationTokenParams } from "../schemas/reviewsRoutes";

const log = createModuleLogger("reviews");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewInvitation {
  id: string;
  reservation_id: string;
  user_id: string;
  establishment_id: string;
  token: string;
  status: string;
  expires_at: string | null;
  review_id: string | null;
}

interface CriteriaRatings {
  accueil?: number;
  cadre_ambiance?: number;
  service?: number;
  qualite_prestation?: number;
  prix?: number;
  emplacement?: number;
}

// ---------------------------------------------------------------------------
// Helper: Get establishment name
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
// GET /api/consumer/reviews/invitation/:token
// Get review invitation details for the submission page
// ---------------------------------------------------------------------------

export const getReviewInvitation: RequestHandler = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ ok: false, error: "Token is required" });
    }

    const { data: invitation, error } = await consumerSupabase
      .from("review_invitations")
      .select(`
        *,
        establishments:establishment_id (id, name, title, city, universe, cover_url),
        reservations:reservation_id (id, date, time, persons)
      `)
      .eq("token", token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ ok: false, error: "Invitation not found" });
    }

    // Check if already completed
    if (invitation.status === "completed") {
      return res.status(400).json({ ok: false, error: "Review already submitted", code: "ALREADY_COMPLETED" });
    }

    // Check if expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "Invitation has expired", code: "EXPIRED" });
    }

    // Mark as clicked if not already
    if (invitation.status === "sent") {
      await consumerSupabase
        .from("review_invitations")
        .update({ status: "clicked", clicked_at: new Date().toISOString() })
        .eq("id", invitation.id);
    }

    return res.json({
      ok: true,
      invitation: {
        id: invitation.id,
        establishment: invitation.establishments,
        reservation: invitation.reservations,
        user_id: invitation.user_id,
      },
    });
  } catch (err) {
    log.error({ err }, "getReviewInvitation exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/consumer/reviews
// Submit a new review
// ---------------------------------------------------------------------------

export const submitReview: RequestHandler = async (req, res) => {
  try {
    const {
      invitation_token,
      overall_rating,
      criteria_ratings,
      title,
      comment,
      anonymous,
    } = req.body;

    // Validate required fields
    if (!invitation_token) {
      return res.status(400).json({ ok: false, error: "Invitation token is required" });
    }

    if (typeof overall_rating !== "number" || overall_rating < 1 || overall_rating > 5) {
      return res.status(400).json({ ok: false, error: "Rating must be between 1 and 5" });
    }

    // Get invitation
    const { data: invitation, error: invError } = await consumerSupabase
      .from("review_invitations")
      .select("*")
      .eq("token", invitation_token)
      .single();

    if (invError || !invitation) {
      return res.status(404).json({ ok: false, error: "Invitation not found" });
    }

    if (invitation.status === "completed") {
      return res.status(400).json({ ok: false, error: "Review already submitted" });
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "Invitation has expired" });
    }

    // Validate criteria ratings if provided
    const validCriteria: CriteriaRatings = {};
    if (criteria_ratings && typeof criteria_ratings === "object") {
      const validKeys = ["accueil", "cadre_ambiance", "service", "qualite_prestation", "prix", "emplacement"];
      for (const key of validKeys) {
        const value = criteria_ratings[key];
        if (typeof value === "number" && value >= 1 && value <= 5) {
          validCriteria[key as keyof CriteriaRatings] = value;
        }
      }
    }

    // Create the review
    const { data: review, error: reviewError } = await adminSupabase
      .from("reviews")
      .insert({
        establishment_id: invitation.establishment_id,
        user_id: invitation.user_id,
        reservation_id: invitation.reservation_id,
        overall_rating: Math.round(overall_rating * 10) / 10, // Round to 1 decimal
        criteria_ratings: validCriteria,
        title: title?.trim() || null,
        comment: comment?.trim() || null,
        anonymous: anonymous === true,
        status: "pending_moderation",
      })
      .select()
      .single();

    if (reviewError) {
      log.error({ err: reviewError }, "submitReview insert error");
      if (reviewError.code === "23505") {
        return res.status(400).json({ ok: false, error: "You have already submitted a review for this reservation" });
      }
      return res.status(500).json({ ok: false, error: reviewError.message });
    }

    // Update invitation status
    await consumerSupabase
      .from("review_invitations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        review_id: review.id,
      })
      .eq("id", invitation.id);

    // Get establishment name for notification
    const establishmentName = await getEstablishmentName(invitation.establishment_id);

    // Emit admin notification
    await emitAdminNotification({
      type: "review_submitted",
      title: "Nouvel avis à modérer",
      body: `Un avis (${overall_rating}/5) a été soumis pour ${establishmentName}.`,
      data: {
        reviewId: review.id,
        establishmentId: invitation.establishment_id,
        rating: overall_rating,
      },
    });

    return res.json({
      ok: true,
      review_id: review.id,
      message: "Merci pour votre avis ! Il sera publié après modération.",
    });
  } catch (err) {
    log.error({ err }, "submitReview exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/consumer/reports
// Report an establishment
// ---------------------------------------------------------------------------

export const submitReport: RequestHandler = async (req, res) => {
  try {
    const {
      establishment_id,
      reason_code,
      reason_text,
      user_id, // Optional - can be anonymous
    } = req.body;

    // Validate required fields
    if (!establishment_id) {
      return res.status(400).json({ ok: false, error: "Establishment ID is required" });
    }

    const validReasonCodes = [
      "inappropriate_content",
      "false_information",
      "closed_permanently",
      "duplicate_listing",
      "spam_or_scam",
      "safety_concern",
      "harassment",
      "other",
    ];

    if (!reason_code || !validReasonCodes.includes(reason_code)) {
      return res.status(400).json({ ok: false, error: "Valid reason code is required" });
    }

    // Verify establishment exists
    const { data: establishment, error: estError } = await adminSupabase
      .from("establishments")
      .select("id, name, title")
      .eq("id", establishment_id)
      .single();

    if (estError || !establishment) {
      return res.status(404).json({ ok: false, error: "Establishment not found" });
    }

    // Check for existing report from same user (if logged in)
    if (user_id) {
      const { data: existingReport } = await adminSupabase
        .from("establishment_reports")
        .select("id")
        .eq("establishment_id", establishment_id)
        .eq("reporter_user_id", user_id)
        .single();

      if (existingReport) {
        return res.status(400).json({
          ok: false,
          error: "Vous avez déjà signalé cet établissement",
          code: "ALREADY_REPORTED",
        });
      }
    }

    // Create the report
    const { data: report, error: reportError } = await adminSupabase
      .from("establishment_reports")
      .insert({
        establishment_id,
        reporter_user_id: user_id || null,
        reason_code,
        reason_text: reason_text?.trim() || null,
        status: "pending",
      })
      .select()
      .single();

    if (reportError) {
      log.error({ err: reportError }, "submitReport insert error");
      if (reportError.code === "23505") {
        return res.status(400).json({
          ok: false,
          error: "Vous avez déjà signalé cet établissement",
        });
      }
      return res.status(500).json({ ok: false, error: reportError.message });
    }

    // Get establishment name for notification
    const establishmentName = establishment.name || establishment.title || "Établissement";

    // Emit admin notification
    await emitAdminNotification({
      type: "report_submitted",
      title: "Nouveau signalement",
      body: `Un signalement "${reason_code}" a été soumis pour ${establishmentName}.`,
      data: {
        reportId: report.id,
        establishmentId: establishment_id,
        reasonCode: reason_code,
      },
    });

    return res.json({
      ok: true,
      report_id: report.id,
      message: "Merci pour votre signalement. Notre équipe va l'examiner.",
    });
  } catch (err) {
    log.error({ err }, "submitReport exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Helper: Check if string is valid UUID
// ---------------------------------------------------------------------------

function isUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// ---------------------------------------------------------------------------
// Helper: Resolve establishment ID from slug or UUID
// ---------------------------------------------------------------------------

async function resolveEstablishmentId(ref: string): Promise<string | null> {
  // If already a UUID, return it
  if (isUuid(ref)) {
    return ref;
  }

  // Try to find by slug
  const { data } = await adminSupabase
    .from("establishments")
    .select("id")
    .eq("slug", ref)
    .single();

  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/public/establishments/:id/reviews
// Get published reviews for an establishment (public)
// ---------------------------------------------------------------------------

export const listPublicEstablishmentReviews: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = "20", offset = "0" } = req.query;

    // Resolve slug to UUID if necessary
    const establishmentId = await resolveEstablishmentId(id);
    if (!establishmentId) {
      return res.json({ ok: true, reviews: [], stats: { avg_rating: 0, review_count: 0 } });
    }

    const { data, error } = await consumerSupabase
      .from("reviews")
      .select(`
        id,
        overall_rating,
        criteria_ratings,
        title,
        comment,
        anonymous,
        published_at,
        pro_public_response,
        pro_public_response_at
      `)
      .eq("establishment_id", establishmentId)
      .in("status", ["approved", "auto_published"])
      .order("published_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      log.error({ err: error }, "listPublicEstablishmentReviews error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Get user info for non-anonymous reviews
    const reviewsWithUserInfo = await Promise.all(
      (data || []).map(async (review) => {
        // For anonymous reviews, don't include user info
        if (review.anonymous) {
          return {
            ...review,
            user_name: null,
          };
        }

        // For non-anonymous, we could fetch user name from consumer_users
        // For now, we'll just indicate it's not anonymous
        return {
          ...review,
          user_name: "Client vérifié", // Placeholder - could be fetched from consumer_users
        };
      })
    );

    // Get stats
    const { data: statsData } = await consumerSupabase
      .from("reviews")
      .select("overall_rating")
      .eq("establishment_id", establishmentId)
      .in("status", ["approved", "auto_published"]);

    let avgRating = 0;
    let reviewCount = 0;
    if (statsData && statsData.length > 0) {
      reviewCount = statsData.length;
      const sum = statsData.reduce((acc, r) => acc + r.overall_rating, 0);
      avgRating = Math.round((sum / reviewCount) * 10) / 10;
    }

    return res.json({
      ok: true,
      reviews: reviewsWithUserInfo,
      stats: {
        avg_rating: avgRating,
        review_count: reviewCount,
      },
    });
  } catch (err) {
    log.error({ err }, "listPublicEstablishmentReviews exception");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerReviewRoutes(app: Express) {
  app.get("/api/public/establishments/:id/reviews", zParams(EstablishmentReviewIdParams), listPublicEstablishmentReviews);
  app.get("/api/consumer/reviews/invitation/:token", zParams(ReviewInvitationTokenParams), getReviewInvitation);
  app.post("/api/consumer/reviews", zBody(SubmitReviewSchema), submitReview);
  app.post("/api/consumer/reports", zBody(SubmitReportSchema), submitReport);
}
