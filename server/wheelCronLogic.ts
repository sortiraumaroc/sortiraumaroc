/**
 * Wheel Cron Logic — Automated tasks for Wheel of Fortune
 *
 * Cron jobs:
 *   1. Daily 14h: Remind eligible users who haven't played
 *   2. Daily: J-3 prize expiration reminders
 *   3. Daily: Expire unconsumed prizes
 *   4. Daily 23h: Send admin recap email
 *   5. Daily: End expired wheel events
 *   6. Real-time/daily: Alert depleted prizes
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { fireNotification, sendNotification } from "./notificationEngine";
import { emitAdminNotification } from "./adminNotifications";
import { getAudienceUserIds } from "./audienceSegmentService";
import { getDailyRecap } from "./wheelAdminLogic";
import { sendTemplateEmail } from "./emailService";
import type { WheelEventStatus } from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// 1. Daily reminder: users who haven't played today
// =============================================================================

/**
 * Send push notification at 14h to eligible users who haven't spun today.
 */
export async function sendDailyNotPlayedReminders(): Promise<{ sent: number }> {
  const supabase = getAdminSupabase();
  const now = new Date();

  // Find active wheel
  const { data: wheel } = await supabase
    .from("wheel_events")
    .select("id, name, eligibility, eligibility_filters")
    .eq("status", "active")
    .lte("start_date", now.toISOString())
    .gte("end_date", now.toISOString())
    .limit(1)
    .single();

  if (!wheel) return { sent: 0 };

  // Get eligible users
  let eligibleUserIds: string[];
  if (wheel.eligibility === "segment" && wheel.eligibility_filters) {
    eligibleUserIds = await getAudienceUserIds(
      wheel.eligibility_filters as Record<string, unknown>,
      { requirePushMarketing: true },
    );
  } else {
    // All active users with push marketing enabled
    const { data: users } = await supabase
      .from("consumer_users")
      .select("id")
      .eq("status", "active")
      .eq("push_marketing_enabled", true)
      .limit(50000);

    eligibleUserIds = (users ?? []).map((u: { id: string }) => u.id);
  }

  if (eligibleUserIds.length === 0) return { sent: 0 };

  // Get users who already played today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const playedUsers = new Set<string>();
  const batchSize = 1000;

  for (let i = 0; i < eligibleUserIds.length; i += batchSize) {
    const batch = eligibleUserIds.slice(i, i + batchSize);

    const { data: spins } = await supabase
      .from("wheel_spins")
      .select("user_id")
      .eq("wheel_event_id", wheel.id)
      .in("user_id", batch)
      .gte("created_at", todayStart.toISOString());

    if (spins) {
      for (const spin of spins as { user_id: string }[]) {
        playedUsers.add(spin.user_id);
      }
    }
  }

  // Users who haven't played
  const notPlayed = eligibleUserIds.filter((id) => !playedUsers.has(id));

  // Send reminders (limited to avoid spam)
  let sent = 0;
  const maxReminders = 5000;

  for (const userId of notPlayed.slice(0, maxReminders)) {
    void fireNotification({
      event_type: "wheel.daily_reminder",
      recipient_id: userId,
      recipient_type: "consumer",
      channels: ["push"],
      data: {
        wheel_name: wheel.name as string,
      },
    });
    sent++;
  }

  console.log(`[WheelCron] Sent ${sent} daily reminders (${notPlayed.length} eligible, ${playedUsers.size} already played)`);
  return { sent };
}

// =============================================================================
// 2. Prize expiration reminders (J-3)
// =============================================================================

/**
 * Send reminders for wheel prizes expiring in 3 days.
 */
export async function sendPrizeExpirationReminders(): Promise<{ sent: number }> {
  const supabase = getAdminSupabase();

  // Find gift distributions from wheel_of_fortune expiring in 3 days
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const threeDaysStart = new Date(threeDaysFromNow);
  threeDaysStart.setUTCHours(0, 0, 0, 0);
  const threeDaysEnd = new Date(threeDaysStart);
  threeDaysEnd.setUTCDate(threeDaysEnd.getUTCDate() + 1);

  const { data: expiring } = await supabase
    .from("platform_gift_distributions")
    .select("id, consumer_user_id, expires_at, notes")
    .eq("source", "wheel_of_fortune")
    .eq("status", "distributed")
    .gte("expires_at", threeDaysStart.toISOString())
    .lt("expires_at", threeDaysEnd.toISOString());

  if (!expiring || expiring.length === 0) return { sent: 0 };

  let sent = 0;

  for (const dist of expiring as { id: string; consumer_user_id: string; expires_at: string; notes: string }[]) {
    void fireNotification({
      event_type: "wheel.prize_expiring",
      recipient_id: dist.consumer_user_id,
      recipient_type: "consumer",
      channels: ["push", "in_app", "email"],
      data: {
        gift_id: dist.id,
        expires_at: dist.expires_at,
        days_remaining: "3",
      },
    });
    sent++;
  }

  console.log(`[WheelCron] Sent ${sent} prize expiration reminders`);
  return { sent };
}

// =============================================================================
// 3. Expire unconsumed prizes
// =============================================================================

/**
 * Mark expired wheel gift distributions as expired.
 */
export async function expireUnconsumedPrizes(): Promise<{ expired: number }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("platform_gift_distributions")
    .update({ status: "expired" })
    .eq("source", "wheel_of_fortune")
    .eq("status", "distributed")
    .lt("expires_at", now)
    .select("id");

  if (error) {
    console.error("[WheelCron] expireUnconsumedPrizes error:", error.message);
    return { expired: 0 };
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    console.log(`[WheelCron] Expired ${count} unconsumed wheel prizes`);
  }

  return { expired: count };
}

// =============================================================================
// 4. Daily admin recap (23h)
// =============================================================================

/**
 * Send daily recap email to admin at 23h.
 */
export async function sendDailyAdminRecap(): Promise<{ sent: boolean }> {
  const supabase = getAdminSupabase();

  // Find active wheel
  const { data: wheel } = await supabase
    .from("wheel_events")
    .select("id, name")
    .eq("status", "active")
    .limit(1)
    .single();

  if (!wheel) return { sent: false };

  const recap = await getDailyRecap(wheel.id as string);
  if (!recap) return { sent: false };

  // Build recap message for admin notification
  const prizesList = recap.prizes_awarded
    .map((p) => `${p.name}: ${p.count}`)
    .join(", ");

  const depletedList = recap.depleted_prizes.join(", ");
  const lowStockList = recap.low_stock_prizes
    .map((p) => `${p.name} (${p.remaining} restants)`)
    .join(", ");

  void emitAdminNotification({
    type: "wheel_daily_recap",
    title: `📊 Récap Roue — ${recap.date}`,
    body: `${recap.spins_count} spins, ${recap.wins_count} gains, ${recap.losses_count} pertes. ${prizesList ? `Lots: ${prizesList}` : ""} ${depletedList ? `⚠️ Épuisés: ${depletedList}` : ""} ${lowStockList ? `⚡ Stock bas: ${lowStockList}` : ""}`,
    data: { wheelId: wheel.id, recap },
  });

  // Also send email to admin
  try {
    await sendTemplateEmail({
      templateKey: "wheel_daily_recap",
      lang: "fr",
      fromKey: "noreply",
      to: ["admin@sam.ma"],
      variables: {
        wheel_name: wheel.name as string,
        date: recap.date,
        spins_count: String(recap.spins_count),
        wins_count: String(recap.wins_count),
        losses_count: String(recap.losses_count),
        prizes_list: prizesList || "Aucun",
        depleted_list: depletedList || "Aucun",
        low_stock_list: lowStockList || "Aucun",
      },
    });
  } catch (err) {
    console.error("[WheelCron] Recap email error:", err);
  }

  return { sent: true };
}

// =============================================================================
// 5. End expired wheel events
// =============================================================================

/**
 * Mark active wheel events as ended if end_date has passed.
 */
export async function endExpiredWheels(): Promise<{ ended: number }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("wheel_events")
    .update({ status: "ended" as WheelEventStatus, updated_at: now })
    .eq("status", "active")
    .lt("end_date", now)
    .select("id, name");

  if (error) {
    console.error("[WheelCron] endExpiredWheels error:", error.message);
    return { ended: 0 };
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    for (const wheel of data as { id: string; name: string }[]) {
      void emitAdminNotification({
        type: "wheel_ended",
        title: "Roue terminée",
        body: `La roue « ${wheel.name} » est terminée (fin de période).`,
        data: { wheelId: wheel.id },
      });
    }
    console.log(`[WheelCron] Ended ${count} expired wheel events`);
  }

  return { ended: count };
}

// =============================================================================
// 6. Alert depleted prizes
// =============================================================================

/**
 * Alert admin when prizes are depleted (remaining_quantity = 0).
 */
export async function alertDepletedPrizes(): Promise<{ alerted: number }> {
  const supabase = getAdminSupabase();

  // Find depleted prizes on active wheels
  const { data: depleted } = await supabase
    .from("wheel_prizes")
    .select("id, name, wheel_event_id, substitute_prize_id")
    .eq("remaining_quantity", 0);

  if (!depleted || depleted.length === 0) return { alerted: 0 };

  // Filter to active wheels only
  const wheelIds = [...new Set((depleted as { wheel_event_id: string }[]).map((p) => p.wheel_event_id))];

  const { data: activeWheels } = await supabase
    .from("wheel_events")
    .select("id")
    .in("id", wheelIds)
    .eq("status", "active");

  const activeWheelIds = new Set((activeWheels ?? []).map((w: { id: string }) => w.id));

  let alerted = 0;
  for (const prize of depleted as { id: string; name: string; wheel_event_id: string; substitute_prize_id: string | null }[]) {
    if (!activeWheelIds.has(prize.wheel_event_id)) continue;

    const hasSubstitute = !!prize.substitute_prize_id;

    void emitAdminNotification({
      type: "wheel_prize_depleted",
      title: `⚠️ Lot épuisé: ${prize.name}`,
      body: hasSubstitute
        ? `Le lot « ${prize.name} » est épuisé mais un substitut est configuré.`
        : `Le lot « ${prize.name} » est épuisé et n'a PAS de substitut ! Les probabilités sont redistribuées.`,
      data: { prizeId: prize.id, wheelId: prize.wheel_event_id, hasSubstitute },
    });
    alerted++;
  }

  return { alerted };
}
