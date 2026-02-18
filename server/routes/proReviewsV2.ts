/**
 * Pro Reviews V2 Routes
 *
 * Endpoints for establishment pro members:
 *   GET  /api/pro/establishments/:eid/reviews                 — List reviews for establishment
 *   GET  /api/pro/establishments/:eid/reviews/:id             — Get single review detail
 *   POST /api/pro/establishments/:eid/reviews/:id/gesture     — Propose commercial gesture
 *   POST /api/pro/establishments/:eid/reviews/:id/response    — Submit public response
 *   GET  /api/pro/establishments/:eid/reviews/stats           — Review stats for establishment
 */

import type { Request, Response, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { randomBytes } from "crypto";
import {
  proposeCommercialGesture,
  getEstablishmentInfo,
  getUserDisplayName,
  updateEstablishmentRatingStats,
} from "../reviewLogic";
import { emitAdminNotification } from "../adminNotifications";
import {
  proposeGestureSchema,
  submitResponseSchema,
  proListReviewsSchema,
} from "../schemas/reviews";

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
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

/** Helper: require auth and return user, or send error response */
async function requireAuth(req: Request, res: Response): Promise<{ id: string; email?: string | null } | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) { res.status(401).json({ ok: false, error: "Non autorisé" }); return null; }
  const result = await getUserFromBearerToken(token);
  if (result.ok === false) { res.status(result.status).json({ ok: false, error: result.error }); return null; }
  return result.user;
}

async function ensureProMembership(args: {
  userId: string;
  establishmentId: string;
}): Promise<{ ok: true; role: string } | { ok: false; status: number; error: string }> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("user_id", args.userId)
    .eq("establishment_id", args.establishmentId)
    .single();

  if (error || !data) {
    return { ok: false, status: 403, error: "Vous n'avez pas accès à cet établissement" };
  }

  return { ok: true, role: data.role };
}

/** Helper: require pro membership, or send error response */
async function requireProMembership(req: Request, res: Response, userId: string, eid: string): Promise<string | null> {
  const result = await ensureProMembership({ userId, establishmentId: eid });
  if (result.ok === false) { res.status(result.status).json({ ok: false, error: result.error }); return null; }
  return result.role;
}

// Helper: generate promo code
function generateSamPromoCode(suffixLength = 10): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = Math.max(6, Math.min(32, Math.round(suffixLength)));
  const bytes = randomBytes(n);
  let out = "SAM";
  for (let i = 0; i < n; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

// =============================================================================
// GET /api/pro/establishments/:eid/reviews
// List reviews for a pro establishment
// =============================================================================

export const listProEstablishmentReviewsV2: RequestHandler = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { eid } = req.params;
    const role = await requireProMembership(req, res, user.id, eid);
    if (!role) return;

    const parsed = proListReviewsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Paramètres invalides" });
    }

    const { status, sort_by, sort_order, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("reviews")
      .select(`
        id, reservation_id, user_id, establishment_id,
        rating_welcome, rating_quality, rating_value, rating_ambiance,
        rating_hygiene, rating_organization, rating_overall,
        comment, would_recommend, photos, status,
        commercial_gesture_status, gesture_deadline, client_gesture_deadline,
        gesture_mention, published_at, created_at, updated_at
      `, { count: "exact" })
      .eq("establishment_id", eid)
      .order(sort_by, { ascending: sort_order === "asc" })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      if (status === "pending_commercial_gesture") {
        query = query.eq("status", "pending_commercial_gesture");
      } else if (status === "published") {
        query = query.eq("status", "published");
      } else if (status === "resolved") {
        query = query.eq("status", "resolved");
      }
    } else {
      // Show reviews that are relevant to pro
      query = query.in("status", [
        "pending_commercial_gesture",
        "published",
        "resolved",
      ]);
    }

    const { data: reviews, error, count } = await query;

    if (error) {
      console.error("[proReviewsV2] listReviews error:", error);
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    // Enrich with user names and gestures
    const enriched = await Promise.all(
      (reviews ?? []).map(async (review) => {
        const userName = await getUserDisplayName(review.user_id);

        // Get gesture if applicable
        let gesture = null;
        if (review.commercial_gesture_status !== "none") {
          const { data: g } = await supabase
            .from("commercial_gestures")
            .select("id, message, status, proposed_at, responded_at")
            .eq("review_id", review.id)
            .single();
          gesture = g;
        }

        // Get pro response if any
        let proResponse = null;
        const { data: resp } = await supabase
          .from("review_responses")
          .select("id, content, status, published_at")
          .eq("review_id", review.id)
          .single();
        if (resp) proResponse = resp;

        return {
          ...review,
          user_name: userName,
          gesture,
          pro_response: proResponse,
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
    console.error("[proReviewsV2] listReviews exception:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/pro/establishments/:eid/reviews/:id
// Get single review detail for pro
// =============================================================================

export const getProReviewDetailV2: RequestHandler = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { eid, id } = req.params;
    const role = await requireProMembership(req, res, user.id, eid);
    if (!role) return;

    const supabase = getAdminSupabase();

    const { data: review, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("id", id)
      .eq("establishment_id", eid)
      .single();

    if (error || !review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable" });
    }

    const userName = await getUserDisplayName(review.user_id);

    // Reservation
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, starts_at, persons, checked_in_at")
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

    // Can propose gesture?
    const canGesture =
      review.status === "pending_commercial_gesture" &&
      review.commercial_gesture_status === "none" &&
      review.gesture_deadline &&
      new Date(review.gesture_deadline) > new Date();

    // Can respond publicly?
    const canRespond =
      review.status === "published" &&
      !proResponse;

    return res.json({
      ok: true,
      review: {
        ...review,
        user_name: userName,
        reservation,
        gesture: gesture ?? null,
        pro_response: proResponse ?? null,
        can_propose_gesture: canGesture,
        can_respond: canRespond,
      },
    });
  } catch (err) {
    console.error("[proReviewsV2] getReviewDetail exception:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// POST /api/pro/establishments/:eid/reviews/:id/gesture
// Pro proposes a commercial gesture (creates promo code + message)
// =============================================================================

export const proposeGestureV2: RequestHandler = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { eid, id } = req.params;
    const role = await requireProMembership(req, res, user.id, eid);
    if (!role) return;

    // Only owner/manager can propose gestures
    if (role !== "owner" && role !== "manager") {
      return res.status(403).json({ ok: false, error: "Seul le propriétaire ou gérant peut proposer un geste" });
    }

    const parsed = proposeGestureSchema.safeParse({ ...req.body, review_id: id });
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Données invalides",
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    const { message, discount_bps, promo_code, starts_at, ends_at } = parsed.data;
    const supabase = getAdminSupabase();

    // Create the promo code for this gesture
    const code = promo_code?.trim().toUpperCase() || generateSamPromoCode();

    const { data: promoCode, error: promoErr } = await supabase
      .from("consumer_promo_codes")
      .insert({
        code,
        description: `Geste commercial — ${message.substring(0, 100)}`,
        discount_bps,
        applies_to_establishment_ids: [eid],
        active: true,
        starts_at: starts_at ?? null,
        ends_at: ends_at ?? null,
        max_uses_total: 1,
        max_uses_per_user: 1,
      })
      .select("id")
      .single();

    if (promoErr) {
      if (/duplicate key/.test(promoErr.message)) {
        return res.status(409).json({ ok: false, error: "Ce code promo existe déjà" });
      }
      console.error("[proReviewsV2] promo code creation error:", promoErr);
      return res.status(500).json({ ok: false, error: "Erreur lors de la création du code promo" });
    }

    // Propose the gesture
    const result = await proposeCommercialGesture({
      reviewId: id,
      establishmentId: eid,
      message,
      promoCodeId: promoCode.id,
    });

    if (result.ok === false) {
      // Cleanup promo code if gesture failed
      await supabase.from("consumer_promo_codes").delete().eq("id", promoCode.id);
      return res.status(400).json({ ok: false, error: result.error });
    }

    return res.json({
      ok: true,
      gesture_id: result.gestureId,
      promo_code: code,
      message: "Geste commercial proposé. Le client a 48h pour répondre.",
    });
  } catch (err) {
    console.error("[proReviewsV2] proposeGesture exception:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// POST /api/pro/establishments/:eid/reviews/:id/response
// Pro submits a public response (will be moderated)
// =============================================================================

export const submitProResponseV2: RequestHandler = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { eid, id } = req.params;
    const role = await requireProMembership(req, res, user.id, eid);
    if (!role) return;

    const parsed = submitResponseSchema.safeParse({ ...req.body, review_id: id });
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Données invalides" });
    }

    const { content } = parsed.data;
    const supabase = getAdminSupabase();

    // Verify review is published and belongs to this establishment
    const { data: review, error: reviewErr } = await supabase
      .from("reviews")
      .select("id, status, establishment_id")
      .eq("id", id)
      .eq("establishment_id", eid)
      .eq("status", "published")
      .single();

    if (reviewErr || !review) {
      return res.status(404).json({ ok: false, error: "Avis introuvable ou non publié" });
    }

    // Check no existing response
    const { data: existingResponse } = await supabase
      .from("review_responses")
      .select("id")
      .eq("review_id", id)
      .single();

    if (existingResponse) {
      return res.status(400).json({ ok: false, error: "Une réponse a déjà été soumise pour cet avis" });
    }

    // Create response (pending moderation)
    const { data: response, error: insertErr } = await supabase
      .from("review_responses")
      .insert({
        review_id: id,
        establishment_id: eid,
        content,
        status: "pending_moderation",
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return res.status(400).json({ ok: false, error: "Une réponse a déjà été soumise" });
      }
      console.error("[proReviewsV2] response insert error:", insertErr);
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    // Notify admin
    const estInfo = await getEstablishmentInfo(eid);
    await emitAdminNotification({
      type: "pro_response_submitted",
      title: "Réponse pro à modérer",
      body: `${estInfo?.name ?? "Un établissement"} a répondu à un avis. Modération requise.`,
      data: { responseId: response.id, reviewId: id, establishmentId: eid },
    });

    return res.json({
      ok: true,
      response_id: response.id,
      message: "Votre réponse a été soumise. Elle sera publiée après modération.",
    });
  } catch (err) {
    console.error("[proReviewsV2] submitResponse exception:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/pro/establishments/:eid/reviews/stats
// Review statistics for establishment dashboard
// =============================================================================

export const getProReviewStatsV2: RequestHandler = async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { eid } = req.params;
    const role = await requireProMembership(req, res, user.id, eid);
    if (!role) return;

    const supabase = getAdminSupabase();

    // Use the view for published review stats
    const { data: summary } = await supabase
      .from("v_establishment_review_summary")
      .select("*")
      .eq("establishment_id", eid)
      .single();

    // Count pending gestures
    const { count: pendingGestures } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("establishment_id", eid)
      .eq("status", "pending_commercial_gesture")
      .eq("commercial_gesture_status", "none");

    // Count reviews awaiting pro response (public response)
    const { count: awaitingResponse } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("establishment_id", eid)
      .eq("status", "published")
      .not("id", "in", `(SELECT review_id FROM review_responses WHERE establishment_id = '${eid}')`);

    // Simplified: just count published without a response
    const { data: publishedWithoutResponse } = await supabase
      .from("reviews")
      .select("id")
      .eq("establishment_id", eid)
      .eq("status", "published");

    let withoutResponseCount = 0;
    if (publishedWithoutResponse) {
      const reviewIds = publishedWithoutResponse.map((r) => r.id);
      if (reviewIds.length > 0) {
        const { data: existingResponses } = await supabase
          .from("review_responses")
          .select("review_id")
          .in("review_id", reviewIds);
        const respondedSet = new Set((existingResponses ?? []).map((r) => r.review_id));
        withoutResponseCount = reviewIds.filter((id) => !respondedSet.has(id)).length;
      }
    }

    return res.json({
      ok: true,
      summary: summary ?? {
        total_reviews: 0,
        avg_overall: 0,
        avg_welcome: 0,
        avg_quality: 0,
        avg_value: 0,
        avg_ambiance: 0,
        avg_hygiene: null,
        avg_organization: null,
        stars_5: 0,
        stars_4: 0,
        stars_3: 0,
        stars_2: 0,
        stars_1: 0,
        recommendation_rate: null,
        reviews_with_photos: 0,
      },
      pending_gestures: pendingGestures ?? 0,
      awaiting_response: withoutResponseCount,
    });
  } catch (err) {
    console.error("[proReviewsV2] getReviewStats exception:", err);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};
