/**
 * Consumer Reviews V2 Routes
 *
 * Endpoints:
 *   GET  /api/consumer/reviews/invitation/:token    — Get invitation details
 *   POST /api/consumer/reviews                      — Submit a review
 *   POST /api/consumer/reviews/gesture/respond       — Respond to commercial gesture
 *   POST /api/consumer/reviews/vote                  — Vote on a review
 *   POST /api/consumer/reviews/report                — Report a review
 *   GET  /api/consumer/reviews/mine                  — List my reviews
 */

import type { Request, Response, RequestHandler } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  reviewSubmitRateLimiter,
  reviewVoteRateLimiter,
  reviewReportRateLimiter,
} from "../middleware/rateLimiter";
import { sanitizeReviewBody } from "../middleware/reviewSecurity";
import { emitAdminNotification } from "../adminNotifications";
import {
  getEstablishmentInfo,
  getUserDisplayName,
  validateReviewSubmission,
  respondToGesture,
} from "../reviewLogic";
import {
  submitReviewSchema,
  respondGestureSchema,
  voteSchema,
  reportReviewSchema,
} from "../schemas/reviews";
import { zBody, zParams } from "../lib/validate";
import {
  submitReviewBodySchema,
  respondGestureBodySchema,
  voteBodySchema,
  reportReviewBodySchema,
  ReviewInvitationTokenParams,
  GestureIdParams,
} from "../schemas/reviewsV2";
import {
  computeOverallRating,
  getCriteriaForUniverse,
  universeUsesHygiene,
  universeUsesOrganization,
} from "../../shared/reviewTypes";
import {
  detectSpamPatterns,
  checkReviewCooldown,
  checkDuplicateContent,
  checkVoteBurst,
} from "../middleware/reviewSecurity";
import { getClientIp } from "../middleware/rateLimiter";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("reviewsV2");

// ---------------------------------------------------------------------------
// Auth helper: Extract user from Bearer token
// ---------------------------------------------------------------------------

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getUserFromBearerToken(token: string): Promise<
  { ok: true; user: { id: string; email?: string | null } } | { ok: false; error: string; status: number }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

// ---------------------------------------------------------------------------
// GET /api/consumer/reviews/invitation/:token
// Get review invitation details for the submission page
// ---------------------------------------------------------------------------

export const getReviewInvitationV2: RequestHandler = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ ok: false, error: "Token requis" });
    }

    const supabase = getAdminSupabase();

    const { data: invitation, error } = await supabase
      .from("review_invitations")
      .select(`
        id, reservation_id, user_id, establishment_id, token, status,
        eligible_at, expires_at, clicked_at, completed_at, review_id
      `)
      .eq("token", token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ ok: false, error: "Invitation introuvable" });
    }

    // Check if already completed
    if (invitation.status === "completed") {
      return res.status(400).json({ ok: false, error: "Avis déjà soumis", code: "ALREADY_COMPLETED" });
    }

    // Check if expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "Invitation expirée", code: "EXPIRED" });
    }

    // Get establishment info
    const estInfo = await getEstablishmentInfo(invitation.establishment_id);

    // Get reservation info
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, starts_at, persons, checked_in_at")
      .eq("id", invitation.reservation_id)
      .single();

    // Mark as clicked if not already
    if (invitation.status === "sent" || invitation.status === "reminder_3d" || invitation.status === "reminder_7d") {
      await supabase
        .from("review_invitations")
        .update({ status: "clicked", clicked_at: new Date().toISOString() })
        .eq("id", invitation.id);
    }

    // Get criteria list based on establishment universe
    const universe = estInfo?.universe ?? "restaurant";
    const criteria = getCriteriaForUniverse(universe);

    return res.json({
      ok: true,
      invitation: {
        id: invitation.id,
        user_id: invitation.user_id,
        establishment: estInfo
          ? {
              id: estInfo.id,
              name: estInfo.name,
              universe: estInfo.universe,
              slug: estInfo.slug,
            }
          : null,
        reservation: reservation
          ? {
              id: reservation.id,
              starts_at: reservation.starts_at,
              persons: reservation.persons,
            }
          : null,
        criteria, // e.g. ["welcome","quality","value","ambiance","hygiene"]
        uses_hygiene: universeUsesHygiene(universe),
        uses_organization: universeUsesOrganization(universe),
      },
    });
  } catch (err) {
    log.error({ err }, "getReviewInvitation exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/consumer/reviews
// Submit a new review
// ---------------------------------------------------------------------------

export const submitReviewV2: RequestHandler = async (req, res) => {
  try {
    // Validate input
    const parsed = submitReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Données invalides",
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    const input = parsed.data;
    const supabase = getAdminSupabase();

    // Get invitation by token
    const { data: invitation, error: invError } = await supabase
      .from("review_invitations")
      .select("*")
      .eq("token", input.invitation_token)
      .single();

    if (invError || !invitation) {
      return res.status(404).json({ ok: false, error: "Invitation introuvable" });
    }

    if (invitation.status === "completed") {
      return res.status(400).json({ ok: false, error: "Avis déjà soumis" });
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "Invitation expirée" });
    }

    // Get establishment universe for criteria validation
    const estInfo = await getEstablishmentInfo(invitation.establishment_id);
    const universe = estInfo?.universe ?? "restaurant";

    // Validate criteria ratings based on universe
    const validation = validateReviewSubmission(input as unknown as Record<string, unknown>, universe);
    if (validation.ok === false) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const reviewData = validation.data;

    // --- Anti-fraud checks ---

    // 1. Cooldown: prevent rapid-fire submissions
    const cooldownErr = await checkReviewCooldown(invitation.user_id);
    if (cooldownErr) {
      return res.status(429).json({ ok: false, error: cooldownErr });
    }

    // 2. Duplicate content detection
    const dupErr = await checkDuplicateContent(invitation.user_id, reviewData.comment);
    if (dupErr) {
      return res.status(400).json({ ok: false, error: dupErr });
    }

    // 3. Spam pattern detection
    const spamCheck = detectSpamPatterns(reviewData.comment);
    if (spamCheck.isSpam) {
      log.warn({ userId: invitation.user_id, score: spamCheck.score, reasons: spamCheck.reasons }, "spam detected");
      // Don't block, but flag for priority moderation (admin will see it)
      // We still allow submission but log it
    }

    // Create the review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .insert({
        reservation_id: invitation.reservation_id,
        user_id: invitation.user_id,
        establishment_id: invitation.establishment_id,
        rating_welcome: reviewData.rating_welcome,
        rating_quality: reviewData.rating_quality,
        rating_value: reviewData.rating_value,
        rating_ambiance: reviewData.rating_ambiance,
        rating_hygiene: reviewData.rating_hygiene,
        rating_organization: reviewData.rating_organization,
        rating_overall: reviewData.rating_overall,
        comment: reviewData.comment,
        would_recommend: reviewData.would_recommend,
        photos: reviewData.photos,
        status: "pending_moderation",
      })
      .select("id")
      .single();

    if (reviewError) {
      log.error({ err: reviewError }, "submitReview insert error");
      if (reviewError.code === "23505") {
        return res.status(400).json({ ok: false, error: "Un avis a déjà été soumis pour cette réservation" });
      }
      return res.status(500).json({ ok: false, error: reviewError.message });
    }

    // Update invitation status
    await supabase
      .from("review_invitations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        review_id: review.id,
      })
      .eq("id", invitation.id);

    // Emit admin notification
    const spamFlag = spamCheck.isSpam ? " ⚠️ SPAM SUSPECT" : "";
    await emitAdminNotification({
      type: "review_submitted",
      title: `Nouvel avis à modérer${spamFlag}`,
      body: `Un avis (${reviewData.rating_overall}/5) a été soumis pour ${estInfo?.name ?? "un établissement"}.${spamCheck.isSpam ? ` Score spam: ${spamCheck.score}` : ""}`,
      data: {
        reviewId: review.id,
        establishmentId: invitation.establishment_id,
        rating: reviewData.rating_overall,
        spam_score: spamCheck.score,
        spam_reasons: spamCheck.reasons,
      },
    });

    return res.json({
      ok: true,
      review_id: review.id,
      message: "Merci pour votre avis ! Il sera publié après modération.",
    });
  } catch (err) {
    log.error({ err }, "submitReview exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/consumer/reviews/gesture/respond
// Client responds to a commercial gesture (accept/refuse)
// ---------------------------------------------------------------------------

export const respondToGestureV2: RequestHandler = async (req, res) => {
  try {
    // Authenticate
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) return res.status(401).json({ ok: false, error: "Non autorisé" });

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) return res.status(userResult.status).json({ ok: false, error: userResult.error });

    // Validate input
    const parsed = respondGestureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const result = await respondToGesture({
      gestureId: parsed.data.gesture_id,
      userId: userResult.user.id,
      action: parsed.data.action,
    });

    if (result.ok === false) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    const message =
      parsed.data.action === "accept"
        ? "Geste commercial accepté. Votre avis ne sera pas publié."
        : "Geste commercial refusé. Votre avis sera publié avec mention du geste.";

    return res.json({ ok: true, message, new_status: result.newReviewStatus });
  } catch (err) {
    log.error({ err }, "respondToGesture exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/consumer/reviews/vote
// Vote on a published review (useful / not_useful)
// ---------------------------------------------------------------------------

export const voteReviewV2: RequestHandler = async (req, res) => {
  try {
    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const { review_id, vote, fingerprint } = parsed.data;
    const supabase = getAdminSupabase();

    // Get user_id if authenticated
    let userId: string | null = null;
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (token) {
      const userResult = await getUserFromBearerToken(token);
      if (userResult.ok) userId = userResult.user.id;
    }

    // Need at least userId or fingerprint
    if (!userId && !fingerprint) {
      return res.status(400).json({ ok: false, error: "Identification requise (connectez-vous ou autorisez les cookies)" });
    }

    // Verify review is published
    const { data: review } = await supabase
      .from("reviews")
      .select("id, status, establishment_id")
      .eq("id", review_id)
      .eq("status", "published")
      .single();

    if (!review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable" });
    }

    // Anti-fraud: vote-burst detection
    const ip = getClientIp(req);
    const burstErr = checkVoteBurst(ip, review_id, review.establishment_id);
    if (burstErr) {
      return res.status(429).json({ ok: false, error: burstErr });
    }

    // Upsert vote (update if exists, insert if not)
    if (userId) {
      // Try update first
      const { data: existing } = await supabase
        .from("review_votes")
        .select("id, vote")
        .eq("review_id", review_id)
        .eq("user_id", userId)
        .single();

      if (existing) {
        if (existing.vote === vote) {
          // Same vote → remove it (toggle off)
          await supabase.from("review_votes").delete().eq("id", existing.id);
          return res.json({ ok: true, action: "removed", vote: null });
        }
        // Different vote → update
        await supabase.from("review_votes").update({ vote }).eq("id", existing.id);
        return res.json({ ok: true, action: "updated", vote });
      }

      // New vote
      const { error: insertErr } = await supabase
        .from("review_votes")
        .insert({ review_id, user_id: userId, vote });

      if (insertErr) {
        log.error({ err: insertErr }, "vote insert error");
        return res.status(500).json({ ok: false, error: "Erreur lors du vote" });
      }

      return res.json({ ok: true, action: "created", vote });
    } else {
      // Fingerprint-based vote
      const { data: existing } = await supabase
        .from("review_votes")
        .select("id, vote")
        .eq("review_id", review_id)
        .eq("fingerprint", fingerprint!)
        .single();

      if (existing) {
        if (existing.vote === vote) {
          await supabase.from("review_votes").delete().eq("id", existing.id);
          return res.json({ ok: true, action: "removed", vote: null });
        }
        await supabase.from("review_votes").update({ vote }).eq("id", existing.id);
        return res.json({ ok: true, action: "updated", vote });
      }

      const { error: insertErr } = await supabase
        .from("review_votes")
        .insert({ review_id, fingerprint, vote });

      if (insertErr) {
        log.error({ err: insertErr }, "vote insert error");
        return res.status(500).json({ ok: false, error: "Erreur lors du vote" });
      }

      return res.json({ ok: true, action: "created", vote });
    }
  } catch (err) {
    log.error({ err }, "vote exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/consumer/reviews/report
// Report a published review
// ---------------------------------------------------------------------------

export const reportReviewV2: RequestHandler = async (req, res) => {
  try {
    const parsed = reportReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const { review_id, reason, reporter_type } = parsed.data;
    const supabase = getAdminSupabase();

    // Get reporter_id if authenticated
    let reporterId: string | null = null;
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (token) {
      const userResult = await getUserFromBearerToken(token);
      if (userResult.ok) reporterId = userResult.user.id;
    }

    // Verify review exists and is published
    const { data: review } = await supabase
      .from("reviews")
      .select("id, status, establishment_id")
      .eq("id", review_id)
      .eq("status", "published")
      .single();

    if (!review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable" });
    }

    // Create report
    const { data: report, error: insertErr } = await supabase
      .from("review_reports")
      .insert({
        review_id,
        reporter_id: reporterId,
        reporter_type: reporter_type ?? (reporterId ? "user" : "visitor"),
        reason,
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return res.status(400).json({ ok: false, error: "Vous avez déjà signalé cet avis" });
      }
      log.error({ err: insertErr }, "report insert error");
      return res.status(500).json({ ok: false, error: "Erreur lors du signalement" });
    }

    // Notify admin
    await emitAdminNotification({
      type: "review_reported",
      title: "Avis signalé",
      body: `Un avis a été signalé: "${reason.substring(0, 80)}..."`,
      data: { reportId: report.id, reviewId: review_id },
    });

    return res.json({
      ok: true,
      report_id: report.id,
      message: "Merci pour votre signalement. Notre équipe va l'examiner.",
    });
  } catch (err) {
    log.error({ err }, "report exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/consumer/reviews/mine
// List authenticated user's own reviews
// ---------------------------------------------------------------------------

export const listMyReviewsV2: RequestHandler = async (req, res) => {
  try {
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) return res.status(401).json({ ok: false, error: "Non autorisé" });

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) return res.status(userResult.status).json({ ok: false, error: userResult.error });

    const supabase = getAdminSupabase();

    const { data: reviews, error } = await supabase
      .from("reviews")
      .select(`
        id, establishment_id, rating_welcome, rating_quality, rating_value,
        rating_ambiance, rating_hygiene, rating_organization, rating_overall,
        comment, would_recommend, photos, status, commercial_gesture_status,
        gesture_mention, published_at, created_at, updated_at,
        establishments:establishment_id (id, name, title, city, universe, cover_url, slug)
      `)
      .eq("user_id", userResult.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      log.error({ err: error }, "listMyReviews error");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    // Check if there's a pending gesture for any review
    const reviewIds = (reviews ?? []).map((r) => r.id);
    let gestureMap: Record<string, any> = {};

    if (reviewIds.length > 0) {
      const { data: gestures } = await supabase
        .from("commercial_gestures")
        .select("id, review_id, message, status, proposed_at")
        .in("review_id", reviewIds);

      for (const g of gestures ?? []) {
        gestureMap[g.review_id] = g;
      }
    }

    const enriched = (reviews ?? []).map((r) => ({
      ...r,
      gesture: gestureMap[r.id] ?? null,
    }));

    return res.json({ ok: true, reviews: enriched });
  } catch (err) {
    log.error({ err }, "listMyReviews exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/consumer/reviews/gesture/:gestureId
// Get gesture details for the response page
// ---------------------------------------------------------------------------

export const getGestureDetailsV2: RequestHandler = async (req, res) => {
  try {
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) return res.status(401).json({ ok: false, error: "Non autorisé" });

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) return res.status(userResult.status).json({ ok: false, error: userResult.error });

    const { gestureId } = req.params;
    const supabase = getAdminSupabase();

    const { data: gesture, error } = await supabase
      .from("commercial_gestures")
      .select(`
        id, review_id, establishment_id, message, status, proposed_at, responded_at,
        consumer_promo_codes:promo_code_id (id, code, description, discount_bps, starts_at, ends_at)
      `)
      .eq("id", gestureId)
      .single();

    if (error || !gesture) {
      return res.status(404).json({ ok: false, error: "Geste commercial introuvable" });
    }

    // Verify user is the review author
    const { data: review } = await supabase
      .from("reviews")
      .select("user_id")
      .eq("id", gesture.review_id)
      .single();

    if (!review || review.user_id !== userResult.user.id) {
      return res.status(403).json({ ok: false, error: "Non autorisé" });
    }

    // Get establishment info
    const estInfo = await getEstablishmentInfo(gesture.establishment_id);

    return res.json({
      ok: true,
      gesture: {
        ...gesture,
        establishment: estInfo
          ? { id: estInfo.id, name: estInfo.name }
          : null,
      },
    });
  } catch (err) {
    log.error({ err }, "getGestureDetails exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerConsumerReviewsV2Routes(app: Express) {
  app.get("/api/consumer/v2/reviews/invitation/:token", zParams(ReviewInvitationTokenParams), getReviewInvitationV2);
  app.post("/api/consumer/v2/reviews", reviewSubmitRateLimiter, sanitizeReviewBody, zBody(submitReviewBodySchema), submitReviewV2);
  app.post("/api/consumer/v2/reviews/gesture/respond", zBody(respondGestureBodySchema), respondToGestureV2);
  app.post("/api/consumer/v2/reviews/vote", reviewVoteRateLimiter, zBody(voteBodySchema), voteReviewV2);
  app.post("/api/consumer/v2/reviews/report", reviewReportRateLimiter, sanitizeReviewBody, zBody(reportReviewBodySchema), reportReviewV2);
  app.get("/api/consumer/v2/reviews/mine", listMyReviewsV2);
  app.get("/api/consumer/v2/reviews/gesture/:gestureId", zParams(GestureIdParams), getGestureDetailsV2);
}
