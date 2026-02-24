/**
 * Pro Reviews Routes
 *
 * API endpoints for pro users to manage reviews sent to them
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { notifyProMembers } from "../proNotifications";
import { zBody, zParams, zIdParam } from "../lib/validate";
import { RespondToReviewSchema, AddPublicResponseSchema } from "../schemas/proMisc";

const log = createModuleLogger("proReviews");

// ---------------------------------------------------------------------------
// Auth helpers (same pattern as pro.ts)
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
  const supabaseClient = getAdminSupabase();
  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProReview {
  id: string;
  establishment_id: string;
  establishment_name: string | null;
  user_id: string;
  user_name: string | null;
  reservation_id: string | null;
  overall_rating: number;
  criteria_ratings: Record<string, number>;
  title: string | null;
  comment: string | null;
  anonymous: boolean;
  status: string;
  sent_to_pro_at: string | null;
  pro_response_deadline: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// GET /api/pro/reviews/pending
// List reviews pending pro response for the authenticated pro's establishments
// ---------------------------------------------------------------------------

export async function listProPendingReviews(req: Request, res: Response) {
  try {
    // Authenticate via Bearer token
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Non autorisé" });
    }

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) {
      return res.status(userResult.status).json({ ok: false, error: userResult.error });
    }

    const proUserId = userResult.user.id;

    // Get pro's establishments via memberships
    const { data: proEstablishments, error: estError } = await getAdminSupabase()
      .from("pro_establishment_memberships")
      .select("establishment_id")
      .eq("user_id", proUserId);

    if (estError) {
      log.error({ err: estError }, "Error fetching pro establishments");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    const establishmentIds = (proEstablishments || []).map((e) => e.establishment_id);

    if (!establishmentIds.length) {
      return res.json({ ok: true, reviews: [] });
    }

    // Get reviews sent to pro (status = 'sent_to_pro') for these establishments
    const { data: reviews, error: reviewsError } = await getAdminSupabase()
      .from("reviews")
      .select(`
        id,
        establishment_id,
        user_id,
        reservation_id,
        overall_rating,
        criteria_ratings,
        title,
        comment,
        anonymous,
        status,
        sent_to_pro_at,
        pro_response_deadline,
        created_at
      `)
      .in("establishment_id", establishmentIds)
      .eq("status", "sent_to_pro")
      .order("sent_to_pro_at", { ascending: true });

    if (reviewsError) {
      log.error({ err: reviewsError }, "Error fetching reviews");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    // Enrich with establishment names and user names
    const enrichedReviews: ProReview[] = [];

    for (const review of reviews || []) {
      // Get establishment name
      const { data: establishment } = await getAdminSupabase()
        .from("establishments")
        .select("name, title")
        .eq("id", review.establishment_id)
        .single();

      // Get user name (if not anonymous)
      let userName: string | null = null;
      if (!review.anonymous) {
        const { data: user } = await getAdminSupabase()
          .from("consumer_users")
          .select("display_name, first_name, last_name")
          .eq("id", review.user_id)
          .single();

        if (user) {
          userName = user.display_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || null;
        }
      }

      enrichedReviews.push({
        id: review.id,
        establishment_id: review.establishment_id,
        establishment_name: establishment?.name || establishment?.title || null,
        user_id: review.user_id,
        user_name: review.anonymous ? null : userName,
        reservation_id: review.reservation_id,
        overall_rating: review.overall_rating,
        criteria_ratings: review.criteria_ratings || {},
        title: review.title,
        comment: review.comment,
        anonymous: review.anonymous,
        status: review.status,
        sent_to_pro_at: review.sent_to_pro_at,
        pro_response_deadline: review.pro_response_deadline,
        created_at: review.created_at,
      });
    }

    return res.json({ ok: true, reviews: enrichedReviews });
  } catch (err) {
    log.error({ err }, "Unexpected error");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/pro/reviews/:id/respond
// Pro responds to a review (promo code or publish directly)
// ---------------------------------------------------------------------------

export async function respondToReview(req: Request, res: Response) {
  try {
    // Authenticate via Bearer token
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Non autorisé" });
    }

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) {
      return res.status(userResult.status).json({ ok: false, error: userResult.error });
    }

    const proUserId = userResult.user.id;

    const { id } = req.params;
    const { response_type, promo_code_id, publish } = req.body;

    // response_type: 'promo' | 'publish'
    // promo_code_id: UUID if response_type is 'promo'
    // publish: boolean (if response_type is 'promo', whether to also publish the review)

    if (!response_type || !["promo", "publish"].includes(response_type)) {
      return res.status(400).json({ ok: false, error: "Type de réponse invalide" });
    }

    // Verify the review exists and belongs to pro's establishment
    const { data: review, error: reviewError } = await getAdminSupabase()
      .from("reviews")
      .select("id, establishment_id, status, user_id")
      .eq("id", id)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable" });
    }

    if (review.status !== "sent_to_pro") {
      return res.status(400).json({ ok: false, error: "Cet avis n'est plus en attente de réponse" });
    }

    // Verify pro owns this establishment
    const { data: proEst, error: proEstError } = await getAdminSupabase()
      .from("pro_establishment_memberships")
      .select("establishment_id")
      .eq("user_id", proUserId)
      .eq("establishment_id", review.establishment_id)
      .single();

    if (proEstError || !proEst) {
      return res.status(403).json({ ok: false, error: "Vous n'avez pas accès à cet établissement" });
    }

    // Build update payload
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      pro_response_type: response_type,
    };

    if (response_type === "promo") {
      if (!promo_code_id) {
        return res.status(400).json({ ok: false, error: "Code promo requis" });
      }

      // Verify promo code exists and belongs to this establishment
      const { data: promoCode, error: promoError } = await getAdminSupabase()
        .from("promo_codes")
        .select("id, code")
        .eq("id", promo_code_id)
        .eq("establishment_id", review.establishment_id)
        .single();

      if (promoError || !promoCode) {
        return res.status(400).json({ ok: false, error: "Code promo invalide" });
      }

      updatePayload.pro_promo_code_id = promo_code_id;

      // If pro chooses to publish along with promo
      if (publish === true) {
        updatePayload.status = "approved";
        updatePayload.published_at = now;
      } else {
        // Pro made a gesture but doesn't want to publish
        updatePayload.status = "pro_responded_hidden";
      }

      // TODO: Send email to customer with promo code
      // await sendPromoCodeEmail(review.user_id, promoCode.code, ...);

    } else if (response_type === "publish") {
      // Pro chooses to publish directly
      updatePayload.status = "approved";
      updatePayload.published_at = now;
    }

    // Update the review
    const { error: updateError } = await getAdminSupabase()
      .from("reviews")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      log.error({ err: updateError }, "Error updating review");
      return res.status(500).json({ ok: false, error: "Erreur lors de la mise à jour" });
    }

    // Update establishment rating stats if published
    if (updatePayload.status === "approved") {
      await updateEstablishmentRatingStats(review.establishment_id);
    }

    return res.json({
      ok: true,
      message: response_type === "promo"
        ? (publish ? "Geste commercial envoyé et avis publié" : "Geste commercial envoyé (avis non publié)")
        : "Avis publié",
    });
  } catch (err) {
    log.error({ err }, "Unexpected error");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/pro/reviews/:id/public-response
// Pro adds a public response to a published review
// ---------------------------------------------------------------------------

export async function addPublicResponse(req: Request, res: Response) {
  try {
    // Authenticate via Bearer token
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Non autorisé" });
    }

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) {
      return res.status(userResult.status).json({ ok: false, error: userResult.error });
    }

    const proUserId = userResult.user.id;

    const { id } = req.params;
    const { response } = req.body;

    if (!response || typeof response !== "string" || response.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Réponse requise" });
    }

    if (response.length > 2000) {
      return res.status(400).json({ ok: false, error: "Réponse trop longue (max 2000 caractères)" });
    }

    // Verify the review exists and is published
    const { data: review, error: reviewError } = await getAdminSupabase()
      .from("reviews")
      .select("id, establishment_id, status")
      .eq("id", id)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable" });
    }

    if (!["approved", "auto_published"].includes(review.status)) {
      return res.status(400).json({ ok: false, error: "Cet avis n'est pas publié" });
    }

    // Verify pro owns this establishment
    const { data: proEst, error: proEstError } = await getAdminSupabase()
      .from("pro_establishment_memberships")
      .select("establishment_id")
      .eq("user_id", proUserId)
      .eq("establishment_id", review.establishment_id)
      .single();

    if (proEstError || !proEst) {
      return res.status(403).json({ ok: false, error: "Vous n'avez pas accès à cet établissement" });
    }

    // Update the review with public response
    const { error: updateError } = await getAdminSupabase()
      .from("reviews")
      .update({ pro_public_response: response.trim() })
      .eq("id", id);

    if (updateError) {
      log.error({ err: updateError }, "Error adding public response");
      return res.status(500).json({ ok: false, error: "Erreur lors de la mise à jour" });
    }

    return res.json({ ok: true, message: "Réponse publique ajoutée" });
  } catch (err) {
    log.error({ err }, "Unexpected error");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/pro/reviews/published
// List published reviews for pro's establishments
// ---------------------------------------------------------------------------

export async function listProPublishedReviews(req: Request, res: Response) {
  try {
    // Authenticate via Bearer token
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Non autorisé" });
    }

    const userResult = await getUserFromBearerToken(token);
    if (userResult.ok === false) {
      return res.status(userResult.status).json({ ok: false, error: userResult.error });
    }

    const proUserId = userResult.user.id;

    // Get pro's establishments via memberships
    const { data: proEstablishments, error: estError } = await getAdminSupabase()
      .from("pro_establishment_memberships")
      .select("establishment_id")
      .eq("user_id", proUserId);

    if (estError) {
      log.error({ err: estError }, "Error fetching pro establishments");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    const establishmentIds = (proEstablishments || []).map((e) => e.establishment_id);

    if (!establishmentIds.length) {
      return res.json({ ok: true, reviews: [] });
    }

    // Get published reviews for these establishments
    const { data: reviews, error: reviewsError } = await getAdminSupabase()
      .from("reviews")
      .select(`
        id,
        establishment_id,
        user_id,
        overall_rating,
        criteria_ratings,
        title,
        comment,
        anonymous,
        status,
        pro_public_response,
        published_at,
        created_at
      `)
      .in("establishment_id", establishmentIds)
      .in("status", ["approved", "auto_published"])
      .order("published_at", { ascending: false });

    if (reviewsError) {
      log.error({ err: reviewsError }, "Error fetching reviews");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    // Enrich with establishment names and user names
    const enrichedReviews: any[] = [];

    for (const review of reviews || []) {
      // Get establishment name
      const { data: establishment } = await getAdminSupabase()
        .from("establishments")
        .select("name, title")
        .eq("id", review.establishment_id)
        .single();

      // Get user name (if not anonymous)
      let userName: string | null = null;
      if (!review.anonymous) {
        const { data: user } = await getAdminSupabase()
          .from("consumer_users")
          .select("display_name, first_name, last_name")
          .eq("id", review.user_id)
          .single();

        if (user) {
          userName = user.display_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || null;
        }
      }

      enrichedReviews.push({
        id: review.id,
        establishment_id: review.establishment_id,
        establishment_name: establishment?.name || establishment?.title || null,
        user_name: review.anonymous ? null : userName,
        overall_rating: review.overall_rating,
        criteria_ratings: review.criteria_ratings || {},
        title: review.title,
        comment: review.comment,
        anonymous: review.anonymous,
        pro_public_response: review.pro_public_response,
        published_at: review.published_at,
        created_at: review.created_at,
      });
    }

    return res.json({ ok: true, reviews: enrichedReviews });
  } catch (err) {
    log.error({ err }, "Unexpected error");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
}

// ---------------------------------------------------------------------------
// Helper: Update establishment rating stats
// ---------------------------------------------------------------------------

async function updateEstablishmentRatingStats(establishmentId: string) {
  try {
    // Calculate average rating from published reviews
    const { data: reviews, error } = await getAdminSupabase()
      .from("reviews")
      .select("overall_rating")
      .eq("establishment_id", establishmentId)
      .in("status", ["approved", "auto_published"]);

    if (error || !reviews || reviews.length === 0) {
      return;
    }

    const sum = reviews.reduce((acc, r) => acc + Number(r.overall_rating), 0);
    const avg = sum / reviews.length;
    const count = reviews.length;

    await getAdminSupabase()
      .from("establishments")
      .update({
        rating_average: Math.round(avg * 10) / 10,
        rating_count: count,
      })
      .eq("id", establishmentId);
  } catch (err) {
    log.error({ err }, "Error updating establishment stats");
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerProReviewRoutes(app: Express) {
  app.get("/api/pro/reviews/pending", listProPendingReviews);
  app.post("/api/pro/reviews/:id/respond", zParams(zIdParam), zBody(RespondToReviewSchema), respondToReview);
  app.post("/api/pro/reviews/:id/public-response", zParams(zIdParam), zBody(AddPublicResponseSchema), addPublicResponse);
  app.get("/api/pro/reviews/published", listProPublishedReviews);
}
