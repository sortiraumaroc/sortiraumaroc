/**
 * Review Cron Jobs
 *
 * Endpoints called by cron scheduler for:
 * 1. Sending review invitations after customer visits
 * 2. Auto-publishing reviews after 24h without pro response
 */

import type { Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
const supabase = getAdminSupabase();
import { emitAdminNotification } from "../adminNotifications";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// POST /api/admin/cron/review-invitations
// Send review invitations to customers who visited an establishment
// Called every 30 minutes by cron
// ---------------------------------------------------------------------------

export async function cronSendReviewInvitations(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    // Find reservations that:
    // - Have status 'honored' or 'completed'
    // - Were completed more than 2 hours ago (give customer time to leave)
    // - Less than 7 days ago (don't send invitations for old reservations)
    // - Don't already have a review invitation

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: eligibleReservations, error: resError } = await supabase
      .from("reservations")
      .select(`
        id,
        user_id,
        establishment_id,
        starts_at
      `)
      .in("status", ["honored", "completed", "done"])
      .lt("starts_at", twoHoursAgo)
      .gt("starts_at", sevenDaysAgo)
      .not("user_id", "is", null);

    if (resError) {
      console.error("[cronReviewInvitations] Error fetching reservations:", resError);
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!eligibleReservations || eligibleReservations.length === 0) {
      return res.json({ ok: true, message: "No eligible reservations", invitationsSent: 0 });
    }

    // Get existing invitations to filter out duplicates
    const reservationIds = eligibleReservations.map((r) => r.id);
    const { data: existingInvitations } = await supabase
      .from("review_invitations")
      .select("reservation_id")
      .in("reservation_id", reservationIds);

    const existingReservationIds = new Set(
      (existingInvitations || []).map((i) => i.reservation_id)
    );

    // Also check if user already left a review for this establishment
    const { data: existingReviews } = await supabase
      .from("reviews")
      .select("user_id, establishment_id");

    const existingReviewKeys = new Set(
      (existingReviews || []).map((r) => `${r.user_id}-${r.establishment_id}`)
    );

    // Filter to only new invitations
    const newInvitations = eligibleReservations.filter((r) => {
      // Skip if invitation already exists
      if (existingReservationIds.has(r.id)) return false;

      // Skip if user already reviewed this establishment
      const reviewKey = `${r.user_id}-${r.establishment_id}`;
      if (existingReviewKeys.has(reviewKey)) return false;

      return true;
    });

    if (newInvitations.length === 0) {
      return res.json({ ok: true, message: "No new invitations needed", invitationsSent: 0 });
    }

    // Create invitations
    let invitationsSent = 0;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    for (const reservation of newInvitations) {
      const token = crypto.randomBytes(32).toString("hex");

      const { error: insertError } = await supabase
        .from("review_invitations")
        .insert({
          reservation_id: reservation.id,
          user_id: reservation.user_id,
          establishment_id: reservation.establishment_id,
          token,
          status: "pending",
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("[cronReviewInvitations] Error creating invitation:", insertError);
        continue;
      }

      // TODO: Send email to customer with review link
      // await sendReviewInvitationEmail(reservation.user_id, token, ...);

      invitationsSent++;
    }

    console.log(`[cronReviewInvitations] Sent ${invitationsSent} review invitations`);

    return res.json({
      ok: true,
      message: `Created ${invitationsSent} review invitations`,
      invitationsSent,
    });
  } catch (err) {
    console.error("[cronReviewInvitations] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/review-auto-publish
// Auto-publish reviews that have been sent to pro for 24h without response
// Called every 5 minutes by cron
// ---------------------------------------------------------------------------

export async function cronAutoPublishReviews(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    const now = new Date().toISOString();

    // Find reviews that:
    // - Status is 'sent_to_pro'
    // - pro_response_deadline has passed

    const { data: expiredReviews, error: reviewsError } = await supabase
      .from("reviews")
      .select(`
        id,
        establishment_id,
        overall_rating,
        title
      `)
      .eq("status", "sent_to_pro")
      .lt("pro_response_deadline", now);

    if (reviewsError) {
      console.error("[cronAutoPublish] Error fetching reviews:", reviewsError);
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!expiredReviews || expiredReviews.length === 0) {
      return res.json({ ok: true, message: "No reviews to auto-publish", autoPublished: 0 });
    }

    let autoPublished = 0;

    for (const review of expiredReviews) {
      // Update review status to auto_published
      const { error: updateError } = await supabase
        .from("reviews")
        .update({
          status: "auto_published",
          published_at: now,
        })
        .eq("id", review.id);

      if (updateError) {
        console.error("[cronAutoPublish] Error updating review:", updateError);
        continue;
      }

      // Update establishment rating stats
      await updateEstablishmentRatingStats(review.establishment_id);

      // Emit admin notification
      await emitAdminNotification({
        type: "review_auto_published",
        title: "Avis auto-publié",
        body: `Un avis (${review.overall_rating}/5) a été auto-publié après 24h sans réponse du pro.`,
        data: {
          category: "reviews",
          link: `/admin/reviews?id=${review.id}`,
        },
      });

      autoPublished++;
    }

    console.log(`[cronAutoPublish] Auto-published ${autoPublished} reviews`);

    return res.json({
      ok: true,
      message: `Auto-published ${autoPublished} reviews`,
      autoPublished,
    });
  } catch (err) {
    console.error("[cronAutoPublish] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// Helper: Update establishment rating stats
// ---------------------------------------------------------------------------

async function updateEstablishmentRatingStats(establishmentId: string) {
  try {
    // Calculate average rating from published reviews
    const { data: reviews, error } = await supabase
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

    await supabase
      .from("establishments")
      .update({
        rating_average: Math.round(avg * 10) / 10,
        rating_count: count,
      })
      .eq("id", establishmentId);
  } catch (err) {
    console.error("[cronAutoPublish] Error updating establishment stats:", err);
  }
}
