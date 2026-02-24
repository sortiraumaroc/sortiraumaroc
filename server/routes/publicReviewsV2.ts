/**
 * Public Reviews V2 Routes
 *
 * Public endpoints (no auth required):
 *   GET /api/public/establishments/:ref/reviews         — List published reviews
 *   GET /api/public/establishments/:ref/reviews/summary — Review summary stats
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zParams } from "../lib/validate";
import { EstablishmentRefParams } from "../schemas/publicRoutes";

const log = createModuleLogger("publicReviewsV2");
import { reviewPublicReadRateLimiter } from "../middleware/rateLimiter";
import { getUserDisplayName } from "../reviewLogic";
import { publicListReviewsSchema } from "../schemas/reviews";

// ---------------------------------------------------------------------------
// Helper: Resolve establishment ref (UUID or slug) to UUID
// ---------------------------------------------------------------------------

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

async function resolveEstablishmentId(ref: string): Promise<string | null> {
  if (isUuid(ref)) return ref;

  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("establishments")
    .select("id")
    .eq("slug", ref)
    .single();

  return data?.id ?? null;
}

// =============================================================================
// GET /api/public/establishments/:ref/reviews
// List published reviews for an establishment (public, paginated, sortable)
// =============================================================================

export const listPublicReviewsV2: RequestHandler = async (req, res) => {
  try {
    const { ref } = req.params;
    const establishmentId = await resolveEstablishmentId(ref);

    if (!establishmentId) {
      return res.json({ ok: true, items: [], total: 0, stats: null });
    }

    const parsed = publicListReviewsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Paramètres invalides" });
    }

    const { sort_by, sort_order, page, limit, min_rating, with_photos } = parsed.data;
    const offset = (page - 1) * limit;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("reviews")
      .select(`
        id, user_id,
        rating_welcome, rating_quality, rating_value, rating_ambiance,
        rating_hygiene, rating_organization, rating_overall,
        comment, would_recommend, photos,
        gesture_mention, published_at, created_at
      `, { count: "exact" })
      .eq("establishment_id", establishmentId)
      .eq("status", "published")
      .order(sort_by === "useful_count" ? "published_at" : sort_by, { ascending: sort_order === "asc" })
      .range(offset, offset + limit - 1);

    if (min_rating) {
      query = query.gte("rating_overall", min_rating);
    }

    if (with_photos) {
      // Filter reviews that have at least one photo
      query = query.not("photos", "eq", "{}");
    }

    const { data: reviews, error, count } = await query;

    if (error) {
      log.error({ err: error }, "listPublicReviews error");
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Enrich with user display names and pro responses
    const enriched = await Promise.all(
      (reviews ?? []).map(async (review) => {
        const userName = await getUserDisplayName(review.user_id);

        // Get approved pro response if any
        const { data: proResponse } = await supabase
          .from("review_responses")
          .select("content, published_at")
          .eq("review_id", review.id)
          .eq("status", "approved")
          .single();

        // Get vote counts
        const { data: voteCounts } = await supabase
          .rpc("get_review_vote_counts", { p_review_id: review.id });

        const votes = voteCounts?.[0] ?? { useful_count: 0, not_useful_count: 0 };

        return {
          id: review.id,
          user_name: userName,
          rating_welcome: review.rating_welcome,
          rating_quality: review.rating_quality,
          rating_value: review.rating_value,
          rating_ambiance: review.rating_ambiance,
          rating_hygiene: review.rating_hygiene,
          rating_organization: review.rating_organization,
          rating_overall: review.rating_overall,
          comment: review.comment,
          would_recommend: review.would_recommend,
          photos: review.photos ?? [],
          gesture_mention: review.gesture_mention,
          published_at: review.published_at,
          created_at: review.created_at,
          pro_response: proResponse ?? null,
          votes,
        };
      }),
    );

    // Sort by useful_count if requested
    if (sort_by === "useful_count") {
      enriched.sort((a, b) => {
        const aCount = a.votes.useful_count ?? 0;
        const bCount = b.votes.useful_count ?? 0;
        return sort_order === "desc" ? bCount - aCount : aCount - bCount;
      });
    }

    return res.json({
      ok: true,
      items: enriched,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listPublicReviews exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/public/establishments/:ref/reviews/summary
// Aggregated review stats for an establishment
// =============================================================================

export const getPublicReviewSummaryV2: RequestHandler = async (req, res) => {
  try {
    const { ref } = req.params;
    const establishmentId = await resolveEstablishmentId(ref);

    if (!establishmentId) {
      return res.json({
        ok: true,
        summary: null,
      });
    }

    const supabase = getAdminSupabase();

    // Use the materialized view
    const { data: summary, error } = await supabase
      .from("v_establishment_review_summary")
      .select("*")
      .eq("establishment_id", establishmentId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows (not an error)
      log.error({ err: error }, "getReviewSummary error");
    }

    // Get establishment universe for criteria context
    const { data: establishment } = await supabase
      .from("establishments")
      .select("universe")
      .eq("id", establishmentId)
      .single();

    return res.json({
      ok: true,
      summary: summary
        ? {
            total_reviews: summary.total_reviews,
            avg_overall: summary.avg_overall,
            avg_welcome: summary.avg_welcome,
            avg_quality: summary.avg_quality,
            avg_value: summary.avg_value,
            avg_ambiance: summary.avg_ambiance,
            avg_hygiene: summary.avg_hygiene,
            avg_organization: summary.avg_organization,
            stars_distribution: {
              5: summary.stars_5,
              4: summary.stars_4,
              3: summary.stars_3,
              2: summary.stars_2,
              1: summary.stars_1,
            },
            recommendation_rate: summary.recommendation_rate,
            reviews_with_photos: summary.reviews_with_photos,
          }
        : {
            total_reviews: 0,
            avg_overall: 0,
            avg_welcome: 0,
            avg_quality: 0,
            avg_value: 0,
            avg_ambiance: 0,
            avg_hygiene: null,
            avg_organization: null,
            stars_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            recommendation_rate: null,
            reviews_with_photos: 0,
          },
      universe: establishment?.universe ?? "restaurant",
    });
  } catch (err) {
    log.error({ err }, "getReviewSummary exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerPublicReviewsV2Routes(app: Express) {
  app.get("/api/public/v2/establishments/:ref/reviews", zParams(EstablishmentRefParams), reviewPublicReadRateLimiter, listPublicReviewsV2);
  app.get("/api/public/v2/establishments/:ref/reviews/summary", zParams(EstablishmentRefParams), getPublicReviewSummaryV2);
}
