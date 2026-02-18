/**
 * Username Subscription Cron Jobs
 *
 * Endpoints called by cron scheduler for:
 * 1. Expiring trials and subscriptions past their end date
 * 2. Sending renewal reminder emails (J-30, J-7, J-0, J+30)
 * 3. Releasing usernames after grace period ends
 */

import type { Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import {
  findExpiredSubscriptions,
  processExpiration,
  findGracePeriodExpired,
  releaseUsername,
  findSubscriptionsNeedingReminder,
  markReminderSent,
  sendRenewalReminderEmail,
} from "../subscriptions/usernameSubscription";
import { sendTemplateEmail } from "../emailService";

const supabase = getAdminSupabase();

// ---------------------------------------------------------------------------
// POST /api/internal/cron/subscriptions/expire
// Process expired trials and subscriptions (move to grace_period)
// Called every hour by cron
// ---------------------------------------------------------------------------

export async function cronSubscriptionsExpire(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    const expiredSubscriptions = await findExpiredSubscriptions();
    const processedCount = expiredSubscriptions.length;

    if (processedCount === 0) {
      return res.json({
        ok: true,
        message: "No expired subscriptions to process",
        processed: 0,
      });
    }

    const results: Array<{ id: string; status: string; success: boolean; error?: string }> = [];

    for (const sub of expiredSubscriptions) {
      try {
        await processExpiration(sub.id);
        results.push({ id: sub.id, status: sub.status, success: true });
      } catch (err: any) {
        console.error(`[cronSubscriptionsExpire] Failed to process ${sub.id}:`, err);
        results.push({ id: sub.id, status: sub.status, success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    // Admin notification
    if (processedCount > 0) {
      void emitAdminNotification({
        type: "subscription_cron_expire",
        title: "Cron subscriptions:expire execute",
        body: `${successCount}/${processedCount} abonnement(s) expire(s) traite(s).`,
        data: {
          total: processedCount,
          success: successCount,
        },
      });
    }

    console.log(`[cronSubscriptionsExpire] Processed ${successCount}/${processedCount} subscriptions`);

    return res.json({
      ok: true,
      processed: processedCount,
      success: successCount,
      results,
    });
  } catch (err) {
    console.error("[cronSubscriptionsExpire] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/internal/cron/subscriptions/reminders
// Send renewal reminder emails at J-30, J-7
// Called daily by cron
// ---------------------------------------------------------------------------

export async function cronSubscriptionsReminders(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    const reminderDays = [30, 7]; // J-30 and J-7
    const results: Array<{
      days: number;
      sent: number;
      subscriptionIds: string[];
    }> = [];

    for (const days of reminderDays) {
      try {
        const subscriptions = await findSubscriptionsNeedingReminder(days);
        const sentIds: string[] = [];

        for (const sub of subscriptions) {
          try {
            await sendRenewalReminderEmail(sub.establishment_id, days);
            await markReminderSent(sub.id, `${days}d`);
            sentIds.push(sub.id);
          } catch (err) {
            console.error(`[cronSubscriptionsReminders] Failed to send ${days}d reminder for ${sub.id}:`, err);
          }
        }

        results.push({
          days,
          sent: sentIds.length,
          subscriptionIds: sentIds,
        });
      } catch (err) {
        console.error(`[cronSubscriptionsReminders] Failed to process ${days}d reminders:`, err);
        results.push({ days, sent: 0, subscriptionIds: [] });
      }
    }

    const totalSent = results.reduce((acc, r) => acc + r.sent, 0);

    // Admin notification
    if (totalSent > 0) {
      void emitAdminNotification({
        type: "subscription_cron_reminders",
        title: "Cron subscriptions:reminders execute",
        body: `${totalSent} rappel(s) de renouvellement envoye(s).`,
        data: {
          total: totalSent,
          breakdown: results.map((r) => ({ days: r.days, sent: r.sent })),
        },
      });
    }

    console.log(`[cronSubscriptionsReminders] Sent ${totalSent} reminders`);

    return res.json({
      ok: true,
      totalSent,
      results,
    });
  } catch (err) {
    console.error("[cronSubscriptionsReminders] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/internal/cron/subscriptions/release-usernames
// Release usernames after grace period ends (90 days after expiration)
// Called daily by cron
// ---------------------------------------------------------------------------

export async function cronSubscriptionsReleaseUsernames(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    const expiredGracePeriod = await findGracePeriodExpired();
    const processedCount = expiredGracePeriod.length;

    if (processedCount === 0) {
      return res.json({
        ok: true,
        message: "No usernames to release",
        released: 0,
      });
    }

    const results: Array<{ id: string; establishmentId: string; success: boolean; error?: string }> = [];

    for (const sub of expiredGracePeriod) {
      try {
        await releaseUsername(sub.id);
        results.push({ id: sub.id, establishmentId: sub.establishment_id, success: true });
      } catch (err: any) {
        console.error(`[cronSubscriptionsRelease] Failed to release username for ${sub.id}:`, err);
        results.push({ id: sub.id, establishmentId: sub.establishment_id, success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    // Admin notification
    if (processedCount > 0) {
      void emitAdminNotification({
        type: "subscription_cron_release",
        title: "Cron subscriptions:release execute",
        body: `${successCount}/${processedCount} username(s) libere(s).`,
        data: {
          total: processedCount,
          success: successCount,
        },
      });
    }

    console.log(`[cronSubscriptionsRelease] Released ${successCount}/${processedCount} usernames`);

    return res.json({
      ok: true,
      released: successCount,
      total: processedCount,
      results,
    });
  } catch (err) {
    console.error("[cronSubscriptionsRelease] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/internal/cron/subscriptions/trial-reminders
// Send trial expiration reminders at J-3 and J-1 before trial ends
// Called daily by cron
// ---------------------------------------------------------------------------

export async function cronSubscriptionsTrialReminders(req: Request, res: Response) {
  try {
    // Verify cron secret
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return res.status(401).json({ ok: false, error: "Invalid cron secret" });
    }

    // Find all trials ending within 3 days (covers both J-3 and J-1 reminders)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: trialsEnding, error } = await supabase
      .from("username_subscriptions")
      .select(`
        id,
        establishment_id,
        trial_ends_at,
        renewal_reminder_sent_at,
        establishments:establishment_id (
          id,
          name,
          username
        )
      `)
      .eq("status", "trial")
      .gte("trial_ends_at", new Date().toISOString())
      .lte("trial_ends_at", threeDaysFromNow.toISOString());

    if (error) {
      console.error("[cronSubscriptionsTrialReminders] Error fetching trials:", error);
      return res.status(500).json({ ok: false, error: "Database error" });
    }

    const sentIds: string[] = [];
    const now = new Date();

    for (const trial of trialsEnding || []) {
      try {
        const trialEndsAt = new Date(trial.trial_ends_at!);
        const daysUntilExpiry = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const sent = (trial.renewal_reminder_sent_at as string[]) || [];

        // Determine which reminder to send based on days remaining
        let templateKey: string | null = null;
        let reminderKey: string | null = null;

        if (daysUntilExpiry <= 1 && !sent.includes("trial_1d")) {
          // J-1: 1 day or less remaining
          templateKey = "username_trial_reminder_1d";
          reminderKey = "trial_1d";
        } else if (daysUntilExpiry <= 3 && daysUntilExpiry > 1 && !sent.includes("trial_3d")) {
          // J-3: 2-3 days remaining
          templateKey = "username_trial_reminder_3d";
          reminderKey = "trial_3d";
        }

        if (!templateKey || !reminderKey) {
          continue; // Already sent or not time yet
        }

        // Send trial reminder email
        const establishment = (trial as any).establishments;

        // Get owner email
        const { data: membership } = await supabase
          .from("pro_establishment_memberships")
          .select("user_id")
          .eq("establishment_id", trial.establishment_id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();

        if (membership) {
          const { data: user } = await supabase
            .from("users")
            .select("email")
            .eq("id", membership.user_id)
            .single();

          if (user?.email) {
            await sendTemplateEmail({
              templateKey,
              lang: "fr",
              fromKey: "noreply",
              to: [user.email],
              variables: {
                establishment_name: establishment?.name || "Votre etablissement",
                username: establishment?.username || "votre-etablissement",
                subscribe_url: `${process.env.VITE_APP_URL || "https://sam.ma"}/pro/visibility`,
              },
            });

            // Mark as sent
            await supabase
              .from("username_subscriptions")
              .update({
                renewal_reminder_sent_at: [...sent, reminderKey],
              })
              .eq("id", trial.id);

            sentIds.push(`${trial.id}:${reminderKey}`);
          }
        }
      } catch (err) {
        console.error(`[cronSubscriptionsTrialReminders] Failed to send reminder for ${trial.id}:`, err);
      }
    }

    console.log(`[cronSubscriptionsTrialReminders] Sent ${sentIds.length} trial reminders`);

    return res.json({
      ok: true,
      sent: sentIds.length,
      reminders: sentIds,
    });
  } catch (err) {
    console.error("[cronSubscriptionsTrialReminders] Unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
