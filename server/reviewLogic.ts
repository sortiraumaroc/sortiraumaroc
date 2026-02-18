// =============================================================================
// REVIEWS SYSTEM V2 — Server Business Logic
// Handles workflow transitions, rating updates, and helper functions
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import { sendTemplateEmail } from "./emailService";
import {
  type ReviewRow,
  type ReviewStatus,
  type GestureStatus,
  NEGATIVE_REVIEW_THRESHOLD,
  GESTURE_PRO_DEADLINE_HOURS,
  GESTURE_CLIENT_DEADLINE_HOURS,
  computeOverallRating,
  isNegativeRating,
} from "../shared/reviewTypes";

// =============================================================================
// HELPER: Get establishment info
// =============================================================================

export async function getEstablishmentInfo(establishmentId: string): Promise<{
  id: string;
  name: string;
  universe: string;
  slug: string | null;
} | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishments")
    .select("id, name, title, universe, slug")
    .eq("id", establishmentId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name || data.title || "Établissement",
    universe: data.universe || "restaurant",
    slug: data.slug || null,
  };
}

// =============================================================================
// HELPER: Get user email from consumer_users or auth
// =============================================================================

export async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = getAdminSupabase();

  // Try consumer_users first
  const { data: consumerUser } = await supabase
    .from("consumer_users")
    .select("email")
    .eq("id", userId)
    .single();

  if (consumerUser?.email) return consumerUser.email;

  // Fallback: auth.users via admin API
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    return authUser?.user?.email ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// HELPER: Get user display name
// =============================================================================

export async function getUserDisplayName(userId: string): Promise<string> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("consumer_users")
    .select("first_name, last_name")
    .eq("id", userId)
    .single();

  if (data?.first_name) {
    const lastName = data.last_name ? ` ${String(data.last_name).charAt(0)}.` : "";
    return `${data.first_name}${lastName}`;
  }

  // Fallback: auth metadata
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const meta = authUser?.user?.user_metadata;
    if (meta?.first_name) {
      const lastName = meta.last_name ? ` ${String(meta.last_name).charAt(0)}.` : "";
      return `${meta.first_name}${lastName}`;
    }
    if (meta?.full_name) return meta.full_name;
  } catch {
    // ignore
  }

  return "Client vérifié";
}

// =============================================================================
// UPDATE ESTABLISHMENT RATING STATS
// Called whenever a review is published or unpublished
// =============================================================================

export async function updateEstablishmentRatingStats(establishmentId: string): Promise<void> {
  const supabase = getAdminSupabase();

  try {
    // Use a single query to compute all stats
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("rating_overall, published_at")
      .eq("establishment_id", establishmentId)
      .eq("status", "published");

    if (error) {
      console.error("[reviewLogic] Error fetching reviews for stats:", error);
      return;
    }

    if (!reviews || reviews.length === 0) {
      // No published reviews → reset stats
      await supabase
        .from("establishments")
        .update({
          avg_rating: null,
          review_count: 0,
          reviews_last_30d: 0,
        })
        .eq("id", establishmentId);
      return;
    }

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let sum = 0;
    let count30d = 0;

    for (const r of reviews) {
      sum += Number(r.rating_overall);
      if (r.published_at && new Date(r.published_at).getTime() > thirtyDaysAgo) {
        count30d++;
      }
    }

    const avgRating = Math.round((sum / reviews.length) * 10) / 10;

    await supabase
      .from("establishments")
      .update({
        avg_rating: avgRating,
        review_count: reviews.length,
        reviews_last_30d: count30d,
      })
      .eq("id", establishmentId);
  } catch (err) {
    console.error("[reviewLogic] updateEstablishmentRatingStats error:", err);
  }
}

// =============================================================================
// WORKFLOW: Admin moderation actions
// =============================================================================

/**
 * Admin approves a review.
 * - If rating >= 4 → publish directly
 * - If rating < 4 → enter "pending_commercial_gesture" with 24h pro deadline
 */
export async function adminApproveReview(args: {
  reviewId: string;
  adminUserId: string;
}): Promise<{ ok: true; newStatus: ReviewStatus } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Get the review
  const { data: review, error: fetchErr } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", args.reviewId)
    .single();

  if (fetchErr || !review) {
    return { ok: false, error: "Review not found" };
  }

  if (review.status !== "pending_moderation") {
    return { ok: false, error: `Cannot approve review in status: ${review.status}` };
  }

  const isNegative = isNegativeRating(review.rating_overall);

  if (isNegative) {
    // Negative review → pending_commercial_gesture with 24h deadline
    const deadline = new Date(Date.now() + GESTURE_PRO_DEADLINE_HOURS * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabase
      .from("reviews")
      .update({
        status: "pending_commercial_gesture",
        moderated_by: args.adminUserId,
        moderated_at: now,
        gesture_deadline: deadline,
      })
      .eq("id", args.reviewId);

    if (updateErr) return { ok: false, error: updateErr.message };

    // Notify pro: they have 24h to respond
    const estInfo = await getEstablishmentInfo(review.establishment_id);
    if (estInfo) {
      await notifyProMembers({
        supabase,
        establishmentId: review.establishment_id,
        category: "reviews",
        title: "Avis négatif — Geste commercial possible",
        body: `Un avis (${review.rating_overall}/5) a été validé pour ${estInfo.name}. Vous avez 24h pour proposer un geste commercial.`,
        data: { reviewId: args.reviewId, rating: review.rating_overall },
      });

      // Send email to pro members
      await sendProGestureNotificationEmail(review, estInfo);
    }

    return { ok: true, newStatus: "pending_commercial_gesture" };
  } else {
    // Positive review → publish directly
    const { error: updateErr } = await supabase
      .from("reviews")
      .update({
        status: "published",
        moderated_by: args.adminUserId,
        moderated_at: now,
        published_at: now,
      })
      .eq("id", args.reviewId);

    if (updateErr) return { ok: false, error: updateErr.message };

    // Update establishment stats
    await updateEstablishmentRatingStats(review.establishment_id);

    // Notify pro
    const estInfo = await getEstablishmentInfo(review.establishment_id);
    if (estInfo) {
      await notifyProMembers({
        supabase,
        establishmentId: review.establishment_id,
        category: "reviews",
        title: "Nouvel avis publié",
        body: `Un avis (${review.rating_overall}/5) a été publié pour ${estInfo.name}.`,
        data: { reviewId: args.reviewId, rating: review.rating_overall },
      });
    }

    // Notify client that their review is published
    await sendReviewPublishedEmail(review, estInfo);

    return { ok: true, newStatus: "published" };
  }
}

/**
 * Admin rejects a review
 */
export async function adminRejectReview(args: {
  reviewId: string;
  adminUserId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data: review, error: fetchErr } = await supabase
    .from("reviews")
    .select("id, status, user_id, establishment_id")
    .eq("id", args.reviewId)
    .single();

  if (fetchErr || !review) return { ok: false, error: "Review not found" };
  if (review.status !== "pending_moderation") {
    return { ok: false, error: `Cannot reject review in status: ${review.status}` };
  }

  const { error: updateErr } = await supabase
    .from("reviews")
    .update({
      status: "rejected",
      moderated_by: args.adminUserId,
      moderated_at: now,
      moderation_note: args.reason,
    })
    .eq("id", args.reviewId);

  if (updateErr) return { ok: false, error: updateErr.message };

  // Notify user that their review was rejected
  const userEmail = await getUserEmail(review.user_id);
  if (userEmail) {
    const estInfo = await getEstablishmentInfo(review.establishment_id);
    await sendTemplateEmail({
      templateKey: "review_rejected",
      fromKey: "noreply",
      to: [userEmail],
      variables: {
        establishment_name: estInfo?.name ?? "l'établissement",
        rejection_reason: args.reason,
      },
      meta: { review_id: args.reviewId },
    }).catch((err) => console.error("[reviewLogic] Failed to send rejection email:", err));
  }

  return { ok: true };
}

/**
 * Admin requests modification from the client
 */
export async function adminRequestModification(args: {
  reviewId: string;
  adminUserId: string;
  note: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data: review, error: fetchErr } = await supabase
    .from("reviews")
    .select("id, status, user_id, establishment_id")
    .eq("id", args.reviewId)
    .single();

  if (fetchErr || !review) return { ok: false, error: "Review not found" };
  if (review.status !== "pending_moderation") {
    return { ok: false, error: `Cannot request modification for review in status: ${review.status}` };
  }

  const { error: updateErr } = await supabase
    .from("reviews")
    .update({
      status: "modification_requested",
      moderated_by: args.adminUserId,
      moderated_at: now,
      moderation_note: args.note,
    })
    .eq("id", args.reviewId);

  if (updateErr) return { ok: false, error: updateErr.message };

  // Notify user
  const userEmail = await getUserEmail(review.user_id);
  if (userEmail) {
    const estInfo = await getEstablishmentInfo(review.establishment_id);
    await sendTemplateEmail({
      templateKey: "review_modification_requested",
      fromKey: "noreply",
      to: [userEmail],
      variables: {
        establishment_name: estInfo?.name ?? "l'établissement",
        modification_note: args.note,
      },
      ctaUrl: `https://sam.ma/review/edit/${args.reviewId}`,
      ctaLabel: "Modifier mon avis",
      meta: { review_id: args.reviewId },
    }).catch((err) => console.error("[reviewLogic] Failed to send modification email:", err));
  }

  return { ok: true };
}

// =============================================================================
// WORKFLOW: Pro commercial gesture
// =============================================================================

/**
 * Pro proposes a commercial gesture (promo code + message)
 */
export async function proposeCommercialGesture(args: {
  reviewId: string;
  establishmentId: string;
  message: string;
  promoCodeId: string;
}): Promise<{ ok: true; gestureId: string } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Get the review
  const { data: review, error: fetchErr } = await supabase
    .from("reviews")
    .select("id, status, commercial_gesture_status, user_id, establishment_id, rating_overall")
    .eq("id", args.reviewId)
    .single();

  if (fetchErr || !review) return { ok: false, error: "Review not found" };

  if (review.status !== "pending_commercial_gesture") {
    return { ok: false, error: `Cannot propose gesture for review in status: ${review.status}` };
  }

  if (review.commercial_gesture_status !== "none") {
    return { ok: false, error: "A gesture has already been proposed" };
  }

  // Check gesture limit (max 2 per quarter per establishment per user)
  const { data: limitCheck } = await supabase
    .rpc("check_gesture_limit", {
      p_establishment_id: args.establishmentId,
      p_user_id: review.user_id,
    });

  if (limitCheck === false) {
    return { ok: false, error: "Limite de gestes commerciaux atteinte (max 2 par trimestre)" };
  }

  // Create gesture record
  const clientDeadline = new Date(Date.now() + GESTURE_CLIENT_DEADLINE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: gesture, error: insertErr } = await supabase
    .from("commercial_gestures")
    .insert({
      review_id: args.reviewId,
      establishment_id: args.establishmentId,
      promo_code_id: args.promoCodeId,
      message: args.message,
      status: "pending",
      proposed_at: now,
    })
    .select("id")
    .single();

  if (insertErr) return { ok: false, error: insertErr.message };

  // Update review with gesture status and client deadline
  await supabase
    .from("reviews")
    .update({
      commercial_gesture_status: "proposed",
      client_gesture_deadline: clientDeadline,
    })
    .eq("id", args.reviewId);

  // Notify client by email about the gesture
  const userEmail = await getUserEmail(review.user_id);
  if (userEmail) {
    const estInfo = await getEstablishmentInfo(review.establishment_id);
    await sendTemplateEmail({
      templateKey: "review_gesture_proposed",
      fromKey: "noreply",
      to: [userEmail],
      variables: {
        establishment_name: estInfo?.name ?? "l'établissement",
        gesture_message: args.message,
      },
      ctaUrl: `https://sam.ma/review/gesture/${gesture.id}`,
      ctaLabel: "Voir le geste commercial",
      meta: { review_id: args.reviewId, gesture_id: gesture.id },
    }).catch((err) => console.error("[reviewLogic] Failed to send gesture email:", err));
  }

  // Admin notification
  await emitAdminNotification({
    type: "gesture_proposed",
    title: "Geste commercial proposé",
    body: `Un geste commercial a été proposé pour l'avis ${review.rating_overall}/5.`,
    data: { reviewId: args.reviewId, gestureId: gesture.id },
  });

  return { ok: true, gestureId: gesture.id };
}

/**
 * Client responds to a commercial gesture
 */
export async function respondToGesture(args: {
  gestureId: string;
  userId: string;
  action: "accept" | "refuse";
}): Promise<{ ok: true; newReviewStatus: ReviewStatus } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Get gesture with review
  const { data: gesture, error: fetchErr } = await supabase
    .from("commercial_gestures")
    .select("*, reviews!inner(id, user_id, establishment_id, rating_overall, status, commercial_gesture_status)")
    .eq("id", args.gestureId)
    .single();

  if (fetchErr || !gesture) return { ok: false, error: "Gesture not found" };

  const review = (gesture as any).reviews;
  if (!review) return { ok: false, error: "Linked review not found" };

  // Verify the user is the review author
  if (review.user_id !== args.userId) {
    return { ok: false, error: "Not authorized" };
  }

  if (gesture.status !== "pending") {
    return { ok: false, error: `Gesture already ${gesture.status}` };
  }

  if (args.action === "accept") {
    // Client accepts → review becomes "resolved" (hidden), gesture accepted
    await supabase
      .from("commercial_gestures")
      .update({ status: "accepted", responded_at: now })
      .eq("id", args.gestureId);

    await supabase
      .from("reviews")
      .update({
        status: "resolved",
        commercial_gesture_status: "accepted",
      })
      .eq("id", review.id);

    // Admin notification
    await emitAdminNotification({
      type: "gesture_accepted",
      title: "Geste commercial accepté",
      body: `Le client a accepté le geste commercial. L'avis ne sera pas publié.`,
      data: { reviewId: review.id, gestureId: args.gestureId },
    });

    // Send gesture accepted confirmation email with promo code to client
    await sendGestureAcceptedEmail(review, args.gestureId);

    // Notify pro that gesture was accepted
    const estInfoAccepted = await getEstablishmentInfo(review.establishment_id);
    if (estInfoAccepted) {
      await notifyProMembers({
        supabase,
        establishmentId: review.establishment_id,
        category: "reviews",
        title: "Geste commercial accepté ✅",
        body: `Le client a accepté votre geste commercial pour ${estInfoAccepted.name}. L'avis ne sera pas publié.`,
        data: { reviewId: review.id, gestureId: args.gestureId },
      });
    }

    return { ok: true, newReviewStatus: "resolved" };
  } else {
    // Client refuses → publish the review with gesture mention
    await supabase
      .from("commercial_gestures")
      .update({ status: "refused", responded_at: now })
      .eq("id", args.gestureId);

    await supabase
      .from("reviews")
      .update({
        status: "published",
        commercial_gesture_status: "refused",
        gesture_mention: true,
        published_at: now,
      })
      .eq("id", review.id);

    // Update establishment stats
    await updateEstablishmentRatingStats(review.establishment_id);

    // Notify pro
    const estInfo = await getEstablishmentInfo(review.establishment_id);
    if (estInfo) {
      await notifyProMembers({
        supabase,
        establishmentId: review.establishment_id,
        category: "reviews",
        title: "Avis publié — Geste refusé",
        body: `Le client a refusé le geste commercial. L'avis (${review.rating_overall}/5) est désormais publié avec mention.`,
        data: { reviewId: review.id },
      });
    }

    // Admin notification
    await emitAdminNotification({
      type: "gesture_refused",
      title: "Geste commercial refusé → Avis publié",
      body: `Le client a refusé le geste commercial. L'avis (${review.rating_overall}/5) est publié avec mention.`,
      data: { reviewId: review.id, gestureId: args.gestureId },
    });

    // Notify client that their review is published
    const estInfoRefused = await getEstablishmentInfo(review.establishment_id);
    await sendReviewPublishedEmail(review, estInfoRefused);

    return { ok: true, newReviewStatus: "published" };
  }
}

// =============================================================================
// WORKFLOW: Publish review (used when gesture expires or directly)
// =============================================================================

/**
 * Publish a review (for use when gesture deadline expires or other auto-publish)
 */
export async function publishReview(args: {
  reviewId: string;
  gestureMention?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data: review, error: fetchErr } = await supabase
    .from("reviews")
    .select("id, establishment_id, rating_overall, status")
    .eq("id", args.reviewId)
    .single();

  if (fetchErr || !review) return { ok: false, error: "Review not found" };

  const { error: updateErr } = await supabase
    .from("reviews")
    .update({
      status: "published",
      published_at: now,
      gesture_mention: args.gestureMention ?? false,
    })
    .eq("id", args.reviewId);

  if (updateErr) return { ok: false, error: updateErr.message };

  await updateEstablishmentRatingStats(review.establishment_id);

  return { ok: true };
}

// =============================================================================
// HELPER: Send pro gesture notification email
// =============================================================================

async function sendProGestureNotificationEmail(
  review: any,
  estInfo: { id: string; name: string },
): Promise<void> {
  const supabase = getAdminSupabase();

  // Get pro members emails
  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .eq("establishment_id", estInfo.id)
    .limit(50);

  if (!memberships?.length) return;

  for (const membership of memberships) {
    const email = await getUserEmail(membership.user_id);
    if (!email) continue;

    await sendTemplateEmail({
      templateKey: "review_gesture_opportunity",
      fromKey: "pro",
      to: [email],
      variables: {
        establishment_name: estInfo.name,
        rating: String(review.rating_overall),
        comment_preview: String(review.comment ?? "").substring(0, 100),
      },
      ctaUrl: `https://sam.ma/pro/reviews?id=${review.id}`,
      ctaLabel: "Proposer un geste commercial",
      meta: { review_id: review.id },
    }).catch((err) =>
      console.error("[reviewLogic] Failed to send pro gesture email:", err),
    );
  }
}

// =============================================================================
// HELPER: Send "review published" email to client
// =============================================================================

async function sendReviewPublishedEmail(
  review: any,
  estInfo: { id: string; name: string; slug: string | null } | null,
): Promise<void> {
  const userEmail = await getUserEmail(review.user_id);
  if (!userEmail) return;

  const establishmentName = estInfo?.name ?? "l'établissement";
  const reviewUrl = estInfo?.slug
    ? `https://sam.ma/${estInfo.slug}#reviews`
    : `https://sam.ma`;

  await sendTemplateEmail({
    templateKey: "review_published",
    fromKey: "noreply",
    to: [userEmail],
    variables: {
      establishment_name: establishmentName,
    },
    ctaUrl: reviewUrl,
    ctaLabel: "Voir mon avis",
    meta: { review_id: review.id },
  }).catch((err) =>
    console.error("[reviewLogic] Failed to send review published email:", err),
  );
}

// =============================================================================
// HELPER: Send "gesture accepted" email with promo code to client
// =============================================================================

async function sendGestureAcceptedEmail(
  review: any,
  gestureId: string,
): Promise<void> {
  const supabase = getAdminSupabase();
  const userEmail = await getUserEmail(review.user_id);
  if (!userEmail) return;

  // Fetch gesture with promo code details
  const { data: gesture } = await supabase
    .from("commercial_gestures")
    .select("id, promo_code_id, message")
    .eq("id", gestureId)
    .single();

  if (!gesture) return;

  // Get promo code info
  let promoCode = "";
  let discountPercent = 0;
  if (gesture.promo_code_id) {
    const { data: code } = await supabase
      .from("promo_codes")
      .select("code, discount_bps")
      .eq("id", gesture.promo_code_id)
      .single();

    if (code) {
      promoCode = code.code || "";
      discountPercent = Math.round((code.discount_bps || 0) / 100);
    }
  }

  const estInfo = await getEstablishmentInfo(review.establishment_id);
  const establishmentName = estInfo?.name ?? "l'établissement";
  const bookingUrl = estInfo?.slug
    ? `https://sam.ma/${estInfo.slug}`
    : `https://sam.ma`;

  await sendTemplateEmail({
    templateKey: "review_gesture_accepted",
    fromKey: "noreply",
    to: [userEmail],
    variables: {
      establishment_name: establishmentName,
      promo_code: promoCode,
      discount_percent: String(discountPercent),
    },
    ctaUrl: bookingUrl,
    ctaLabel: "Réserver ma prochaine visite",
    meta: { review_id: review.id, gesture_id: gestureId },
  }).catch((err) =>
    console.error("[reviewLogic] Failed to send gesture accepted email:", err),
  );
}

// =============================================================================
// VALIDATION: Review submission input validation
// =============================================================================

export function validateReviewSubmission(input: Record<string, unknown>, universe: string): {
  ok: true;
  data: {
    rating_welcome: number;
    rating_quality: number;
    rating_value: number;
    rating_ambiance: number;
    rating_hygiene: number | null;
    rating_organization: number | null;
    rating_overall: number;
    comment: string;
    would_recommend: boolean | null;
    photos: string[];
  };
} | { ok: false; error: string } {
  // Validate common ratings
  for (const key of ["rating_welcome", "rating_quality", "rating_value", "rating_ambiance"]) {
    const val = input[key];
    if (typeof val !== "number" || val < 1 || val > 5 || !Number.isInteger(val)) {
      return { ok: false, error: `${key} must be an integer between 1 and 5` };
    }
  }

  // Validate category-specific ratings
  const usesHygiene = ["restaurant", "hotel", "wellness"].includes(universe);
  const usesOrganization = ["loisir", "evenement"].includes(universe);

  let hygiene: number | null = null;
  let organization: number | null = null;

  if (usesHygiene) {
    const val = input.rating_hygiene;
    if (typeof val !== "number" || val < 1 || val > 5 || !Number.isInteger(val)) {
      return { ok: false, error: "rating_hygiene must be an integer between 1 and 5 for this category" };
    }
    hygiene = val;
  }

  if (usesOrganization) {
    const val = input.rating_organization;
    if (typeof val !== "number" || val < 1 || val > 5 || !Number.isInteger(val)) {
      return { ok: false, error: "rating_organization must be an integer between 1 and 5 for this category" };
    }
    organization = val;
  }

  // Comment
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (comment.length < 50 || comment.length > 1500) {
    return { ok: false, error: "Comment must be between 50 and 1500 characters" };
  }

  // Would recommend (optional)
  const wouldRecommend = typeof input.would_recommend === "boolean" ? input.would_recommend : null;

  // Photos (optional, max 3)
  let photos: string[] = [];
  if (Array.isArray(input.photos)) {
    photos = input.photos
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .slice(0, 3);
  }

  // Compute overall
  const overall = computeOverallRating({
    welcome: input.rating_welcome as number,
    quality: input.rating_quality as number,
    value: input.rating_value as number,
    ambiance: input.rating_ambiance as number,
    hygiene,
    organization,
  });

  return {
    ok: true,
    data: {
      rating_welcome: input.rating_welcome as number,
      rating_quality: input.rating_quality as number,
      rating_value: input.rating_value as number,
      rating_ambiance: input.rating_ambiance as number,
      rating_hygiene: hygiene,
      rating_organization: organization,
      rating_overall: overall,
      comment,
      would_recommend: wouldRecommend,
      photos,
    },
  };
}
