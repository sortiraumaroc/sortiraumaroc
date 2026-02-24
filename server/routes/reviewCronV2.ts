/**
 * Review Cron Jobs V2
 *
 * All scheduled tasks for the reviews system:
 *
 * 1. cronCreateInvitations       — Creates invitations for checked-in reservations (eligible_at = check-in + 8h)
 * 2. cronSendInvitationEmails    — Sends invitation emails when eligible_at is reached
 * 3. cronSendReminders           — Sends J+3 and J+7 reminder emails
 * 4. cronExpireInvitations       — Expires invitations after 14 days
 * 5. cronExpireProGestureDeadline — Auto-publishes reviews when pro doesn't respond within 24h
 * 6. cronExpireClientGesture     — Publishes reviews when client doesn't respond to gesture within 48h
 *
 * Recommended cron schedule:
 *   - cronCreateInvitations:        every 30 minutes
 *   - cronSendInvitationEmails:     every 15 minutes
 *   - cronSendReminders:            every hour
 *   - cronExpireInvitations:        every hour
 *   - cronExpireProGestureDeadline: every 5 minutes
 *   - cronExpireClientGesture:      every 5 minutes
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";

const log = createModuleLogger("reviewCronV2");
import { emitAdminNotification } from "../adminNotifications";
import { notifyProMembers } from "../proNotifications";
import { sendTemplateEmail } from "../emailService";
import {
  updateEstablishmentRatingStats,
  publishReview,
  getUserEmail,
  getEstablishmentInfo,
} from "../reviewLogic";
import {
  INVITATION_DELAY_HOURS,
  REMINDER_1_DAYS,
  REMINDER_2_DAYS,
  INVITATION_EXPIRY_DAYS,
} from "../../shared/reviewTypes";

// ---------------------------------------------------------------------------
// Shared: Cron secret verification
// ---------------------------------------------------------------------------

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// 1. POST /api/admin/cron/review-create-invitations
// Creates invitation records for reservations with checked_in_at
// (Does NOT send emails — that's a separate cron)
// =============================================================================

export async function cronCreateInvitations(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();

  try {
    // Find reservations that:
    // - Have been checked in (checked_in_at IS NOT NULL)
    // - Checked in within the last 30 days (don't process very old ones)
    // - Don't already have a review invitation
    // - Don't already have a review

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: reservations, error: resError } = await supabase
      .from("reservations")
      .select("id, user_id, establishment_id, checked_in_at")
      .not("checked_in_at", "is", null)
      .gt("checked_in_at", thirtyDaysAgo)
      .not("user_id", "is", null);

    if (resError) {
      log.error({ err: resError }, "cronCreateInvitations fetch error");
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!reservations || reservations.length === 0) {
      return res.json({ ok: true, created: 0, message: "No eligible reservations" });
    }

    // Filter out those with existing invitations
    const reservationIds = reservations.map((r) => r.id);
    const { data: existingInvitations } = await supabase
      .from("review_invitations")
      .select("reservation_id")
      .in("reservation_id", reservationIds);

    const existingInvitationSet = new Set(
      (existingInvitations ?? []).map((i) => i.reservation_id),
    );

    // Filter out those with existing reviews
    const { data: existingReviews } = await supabase
      .from("reviews")
      .select("reservation_id")
      .in("reservation_id", reservationIds);

    const existingReviewSet = new Set(
      (existingReviews ?? []).map((r) => r.reservation_id),
    );

    // Build new invitations
    const newInvitations = reservations.filter((r) => {
      if (existingInvitationSet.has(r.id)) return false;
      if (existingReviewSet.has(r.id)) return false;
      return true;
    });

    if (newInvitations.length === 0) {
      return res.json({ ok: true, created: 0, message: "No new invitations needed" });
    }

    let created = 0;

    for (const reservation of newInvitations) {
      const checkedInAt = new Date(reservation.checked_in_at);
      const eligibleAt = new Date(checkedInAt.getTime() + INVITATION_DELAY_HOURS * 60 * 60 * 1000);
      const expiresAt = new Date(eligibleAt.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const { error: insertError } = await supabase
        .from("review_invitations")
        .insert({
          reservation_id: reservation.id,
          user_id: reservation.user_id,
          establishment_id: reservation.establishment_id,
          status: "pending",
          eligible_at: eligibleAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        // Ignore duplicate constraint errors (already created)
        if (insertError.code !== "23505") {
          log.error({ err: insertError }, "cronCreateInvitations insert error");
        }
        continue;
      }

      created++;
    }

    log.info({ created }, "cronCreateInvitations completed");
    return res.json({ ok: true, created, message: `Created ${created} invitations` });
  } catch (err) {
    log.error({ err }, "cronCreateInvitations unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// =============================================================================
// 2. POST /api/admin/cron/review-send-invitations
// Sends invitation emails for invitations whose eligible_at has passed
// =============================================================================

export async function cronSendInvitationEmails(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();

  try {
    const now = new Date().toISOString();

    // Find invitations that are "pending" and eligible_at has passed
    const { data: invitations, error } = await supabase
      .from("review_invitations")
      .select(`
        id, reservation_id, user_id, establishment_id, token,
        eligible_at, email_attempts, last_email_error
      `)
      .eq("status", "pending")
      .is("sent_at", null)
      .lte("eligible_at", now)
      .lt("email_attempts", 3)
      .order("eligible_at", { ascending: true })
      .limit(50);

    if (error) {
      log.error({ err: error }, "cronSendInvitationEmails fetch error");
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!invitations || invitations.length === 0) {
      return res.json({ ok: true, sent: 0, message: "No invitations to send" });
    }

    let sent = 0;
    let failed = 0;

    for (const inv of invitations) {
      const userEmail = await getUserEmail(inv.user_id);
      if (!userEmail) {
        // Mark as failed — no email found
        await supabase
          .from("review_invitations")
          .update({
            email_attempts: inv.email_attempts + 1,
            last_email_attempt_at: now,
            last_email_error: "No email found for user",
          })
          .eq("id", inv.id);
        failed++;
        continue;
      }

      const estInfo = await getEstablishmentInfo(inv.establishment_id);
      const reviewUrl = `https://sam.ma/review/${inv.token}`;

      const result = await sendTemplateEmail({
        templateKey: "review_invitation",
        fromKey: "noreply",
        to: [userEmail],
        variables: {
          establishment_name: estInfo?.name ?? "l'établissement",
          review_url: reviewUrl,
        },
        ctaUrl: reviewUrl,
        ctaLabel: "Donner mon avis",
        meta: {
          invitation_id: inv.id,
          reservation_id: inv.reservation_id,
        },
      });

      if (result.ok) {
        await supabase
          .from("review_invitations")
          .update({
            status: "sent",
            sent_at: now,
            email_attempts: inv.email_attempts + 1,
            last_email_attempt_at: now,
            last_email_error: null,
          })
          .eq("id", inv.id);
        sent++;
      } else {
        await supabase
          .from("review_invitations")
          .update({
            email_attempts: inv.email_attempts + 1,
            last_email_attempt_at: now,
            last_email_error: "error" in result ? result.error : "Unknown error",
          })
          .eq("id", inv.id);
        failed++;
      }
    }

    log.info({ sent, failed }, "cronSendInvitationEmails completed");
    return res.json({ ok: true, sent, failed, message: `Sent ${sent} invitation emails` });
  } catch (err) {
    log.error({ err }, "cronSendInvitationEmails unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// =============================================================================
// 3. POST /api/admin/cron/review-send-reminders
// Sends J+3 and J+7 reminder emails
// =============================================================================

export async function cronSendReminders(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();

  try {
    const now = new Date();
    let reminders3Sent = 0;
    let reminders7Sent = 0;

    // ---- J+3 Reminders ----
    // Invitations sent at least 3 days ago, no J+3 reminder yet, not completed/expired
    const threeDaysMs = REMINDER_1_DAYS * 24 * 60 * 60 * 1000;
    const threeDaysAgo = new Date(now.getTime() - threeDaysMs).toISOString();

    const { data: inv3, error: err3 } = await supabase
      .from("review_invitations")
      .select("id, user_id, establishment_id, token")
      .eq("status", "sent")
      .is("reminder_3d_sent_at", null)
      .lte("sent_at", threeDaysAgo)
      .order("sent_at", { ascending: true })
      .limit(50);

    if (err3) {
      log.error({ err: err3 }, "cronSendReminders J+3 fetch error");
    } else if (inv3 && inv3.length > 0) {
      for (const inv of inv3) {
        const userEmail = await getUserEmail(inv.user_id);
        if (!userEmail) continue;

        const estInfo = await getEstablishmentInfo(inv.establishment_id);
        const reviewUrl = `https://sam.ma/review/${inv.token}`;

        const result = await sendTemplateEmail({
          templateKey: "review_reminder_3d",
          fromKey: "noreply",
          to: [userEmail],
          variables: {
            establishment_name: estInfo?.name ?? "l'établissement",
            review_url: reviewUrl,
          },
          ctaUrl: reviewUrl,
          ctaLabel: "Donner mon avis",
          meta: { invitation_id: inv.id, reminder: "3d" },
        });

        if (result.ok) {
          await supabase
            .from("review_invitations")
            .update({
              status: "reminder_3d",
              reminder_3d_sent_at: now.toISOString(),
            })
            .eq("id", inv.id);
          reminders3Sent++;
        }
      }
    }

    // ---- J+7 Reminders ----
    // Invitations sent at least 7 days ago, no J+7 reminder yet, not completed/expired
    const sevenDaysMs = REMINDER_2_DAYS * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(now.getTime() - sevenDaysMs).toISOString();

    const { data: inv7, error: err7 } = await supabase
      .from("review_invitations")
      .select("id, user_id, establishment_id, token")
      .in("status", ["sent", "reminder_3d"])
      .is("reminder_7d_sent_at", null)
      .lte("sent_at", sevenDaysAgo)
      .order("sent_at", { ascending: true })
      .limit(50);

    if (err7) {
      log.error({ err: err7 }, "cronSendReminders J+7 fetch error");
    } else if (inv7 && inv7.length > 0) {
      for (const inv of inv7) {
        const userEmail = await getUserEmail(inv.user_id);
        if (!userEmail) continue;

        const estInfo = await getEstablishmentInfo(inv.establishment_id);
        const reviewUrl = `https://sam.ma/review/${inv.token}`;

        const result = await sendTemplateEmail({
          templateKey: "review_reminder_7d",
          fromKey: "noreply",
          to: [userEmail],
          variables: {
            establishment_name: estInfo?.name ?? "l'établissement",
            review_url: reviewUrl,
          },
          ctaUrl: reviewUrl,
          ctaLabel: "Dernière chance pour donner mon avis",
          meta: { invitation_id: inv.id, reminder: "7d" },
        });

        if (result.ok) {
          await supabase
            .from("review_invitations")
            .update({
              status: "reminder_7d",
              reminder_7d_sent_at: now.toISOString(),
            })
            .eq("id", inv.id);
          reminders7Sent++;
        }
      }
    }

    log.info({ reminders3Sent, reminders7Sent }, "cronSendReminders completed");
    return res.json({
      ok: true,
      reminders_3d_sent: reminders3Sent,
      reminders_7d_sent: reminders7Sent,
      message: `Sent ${reminders3Sent} J+3 and ${reminders7Sent} J+7 reminders`,
    });
  } catch (err) {
    log.error({ err }, "cronSendReminders unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// =============================================================================
// 4. POST /api/admin/cron/review-expire-invitations
// Expire invitations that have passed their expires_at date
// =============================================================================

export async function cronExpireInvitations(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();

  try {
    const now = new Date().toISOString();

    const { data: expiredInvitations, error } = await supabase
      .from("review_invitations")
      .select("id")
      .not("status", "in", '("completed","expired")')
      .lte("expires_at", now);

    if (error) {
      log.error({ err: error }, "cronExpireInvitations fetch error");
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!expiredInvitations || expiredInvitations.length === 0) {
      return res.json({ ok: true, expired: 0, message: "No invitations to expire" });
    }

    const ids = expiredInvitations.map((i) => i.id);

    const { error: updateErr } = await supabase
      .from("review_invitations")
      .update({ status: "expired" })
      .in("id", ids);

    if (updateErr) {
      log.error({ err: updateErr }, "cronExpireInvitations update error");
      return res.status(500).json({ ok: false, error: "Update error" });
    }

    log.info({ expired: ids.length }, "cronExpireInvitations completed");
    return res.json({ ok: true, expired: ids.length, message: `Expired ${ids.length} invitations` });
  } catch (err) {
    log.error({ err }, "cronExpireInvitations unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// =============================================================================
// 5. POST /api/admin/cron/review-expire-pro-gesture
// Auto-publish reviews when pro doesn't propose gesture within 24h
// =============================================================================

export async function cronExpireProGestureDeadline(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();

  try {
    const now = new Date().toISOString();

    // Find reviews where:
    // - Status is 'pending_commercial_gesture'
    // - commercial_gesture_status is 'none' (pro hasn't proposed yet)
    // - gesture_deadline has passed
    const { data: expired, error } = await supabase
      .from("reviews")
      .select("id, establishment_id, rating_overall, user_id")
      .eq("status", "pending_commercial_gesture")
      .eq("commercial_gesture_status", "none")
      .lte("gesture_deadline", now);

    if (error) {
      log.error({ err: error }, "cronExpireProGesture fetch error");
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!expired || expired.length === 0) {
      return res.json({ ok: true, published: 0, message: "No reviews to auto-publish" });
    }

    let published = 0;

    for (const review of expired) {
      // Update review: mark gesture as expired, publish the review
      const { error: updateErr } = await supabase
        .from("reviews")
        .update({
          status: "published",
          commercial_gesture_status: "expired",
          published_at: now,
          gesture_mention: false,
        })
        .eq("id", review.id);

      if (updateErr) {
        log.error({ err: updateErr, reviewId: review.id }, "cronExpireProGesture update error");
        continue;
      }

      // Update establishment stats
      await updateEstablishmentRatingStats(review.establishment_id);

      // Notify admin
      await emitAdminNotification({
        type: "review_auto_published_gesture_expired",
        title: "Avis auto-publié (délai pro expiré)",
        body: `L'avis (${review.rating_overall}/5) a été publié automatiquement — le pro n'a pas proposé de geste dans les 24h.`,
        data: { reviewId: review.id, establishmentId: review.establishment_id },
      });

      // Notify pro
      const estInfo = await getEstablishmentInfo(review.establishment_id);
      if (estInfo) {
        await notifyProMembers({
          supabase,
          establishmentId: review.establishment_id,
          category: "reviews",
          title: "Avis publié — Délai expiré",
          body: `L'avis (${review.rating_overall}/5) a été publié car aucun geste commercial n'a été proposé dans les 24h.`,
          data: { reviewId: review.id },
        });
      }

      // Notify client that their review is published
      const userEmail = await getUserEmail(review.user_id);
      if (userEmail) {
        const estName = estInfo?.name ?? "l'établissement";
        const slug = estInfo && "slug" in estInfo ? (estInfo as any).slug : null;
        const reviewUrl = slug
          ? `https://sam.ma/${slug}#reviews`
          : "https://sam.ma";

        await sendTemplateEmail({
          templateKey: "review_published",
          fromKey: "noreply",
          to: [userEmail],
          variables: { establishment_name: estName },
          ctaUrl: reviewUrl,
          ctaLabel: "Voir mon avis",
          meta: { review_id: review.id },
        }).catch((err) =>
          log.error({ err }, "cronExpireProGesture failed to send review published email"),
        );
      }

      published++;
    }

    log.info({ published }, "cronExpireProGesture completed (pro deadline expired)");
    return res.json({
      ok: true,
      published,
      message: `Auto-published ${published} reviews (pro gesture deadline expired)`,
    });
  } catch (err) {
    log.error({ err }, "cronExpireProGesture unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// =============================================================================
// 6. POST /api/admin/cron/review-expire-client-gesture
// Publish reviews when client doesn't respond to gesture within 48h
// =============================================================================

export async function cronExpireClientGesture(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();

  try {
    const now = new Date().toISOString();

    // Find reviews where:
    // - commercial_gesture_status is 'proposed'
    // - client_gesture_deadline has passed
    const { data: expired, error } = await supabase
      .from("reviews")
      .select("id, establishment_id, rating_overall, user_id")
      .eq("commercial_gesture_status", "proposed")
      .lte("client_gesture_deadline", now);

    if (error) {
      log.error({ err: error }, "cronExpireClientGesture fetch error");
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    if (!expired || expired.length === 0) {
      return res.json({ ok: true, published: 0, message: "No client gestures to expire" });
    }

    let published = 0;

    for (const review of expired) {
      // Expire the gesture in commercial_gestures table
      await supabase
        .from("commercial_gestures")
        .update({ status: "expired" })
        .eq("review_id", review.id)
        .eq("status", "pending");

      // Publish the review with gesture mention
      const { error: updateErr } = await supabase
        .from("reviews")
        .update({
          status: "published",
          commercial_gesture_status: "expired",
          published_at: now,
          gesture_mention: true, // Mention that a gesture was proposed
        })
        .eq("id", review.id);

      if (updateErr) {
        log.error({ err: updateErr, reviewId: review.id }, "cronExpireClientGesture update error");
        continue;
      }

      // Update establishment stats
      await updateEstablishmentRatingStats(review.establishment_id);

      // Notify admin
      await emitAdminNotification({
        type: "review_published_client_gesture_expired",
        title: "Avis publié (délai client expiré)",
        body: `L'avis (${review.rating_overall}/5) a été publié avec mention — le client n'a pas répondu au geste dans les 48h.`,
        data: { reviewId: review.id },
      });

      // Notify pro
      const estInfo = await getEstablishmentInfo(review.establishment_id);
      if (estInfo) {
        await notifyProMembers({
          supabase,
          establishmentId: review.establishment_id,
          category: "reviews",
          title: "Avis publié — Pas de réponse du client",
          body: `L'avis (${review.rating_overall}/5) a été publié avec mention de geste commercial — le client n'a pas répondu dans les 48h.`,
          data: { reviewId: review.id },
        });
      }

      // Notify client that gesture expired and review is published
      const userEmail = await getUserEmail(review.user_id);
      if (userEmail) {
        const estName = estInfo?.name ?? "l'établissement";

        await sendTemplateEmail({
          templateKey: "review_gesture_expired_client",
          fromKey: "noreply",
          to: [userEmail],
          variables: { establishment_name: estName },
          meta: { review_id: review.id },
        }).catch((err) =>
          log.error({ err }, "cronExpireClientGesture failed to send gesture expired email"),
        );
      }

      published++;
    }

    log.info({ published }, "cronExpireClientGesture completed (client gesture deadline expired)");
    return res.json({
      ok: true,
      published,
      message: `Auto-published ${published} reviews (client gesture deadline expired)`,
    });
  } catch (err) {
    log.error({ err }, "cronExpireClientGesture unexpected error");
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerReviewCronV2Routes(app: Express) {
  app.post("/api/admin/cron/v2/review-create-invitations", cronCreateInvitations);
  app.post("/api/admin/cron/v2/review-send-invitations", cronSendInvitationEmails);
  app.post("/api/admin/cron/v2/review-send-reminders", cronSendReminders);
  app.post("/api/admin/cron/v2/review-expire-invitations", cronExpireInvitations);
  app.post("/api/admin/cron/v2/review-expire-pro-gesture", cronExpireProGestureDeadline);
  app.post("/api/admin/cron/v2/review-expire-client-gesture", cronExpireClientGesture);
}
