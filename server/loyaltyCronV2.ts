// =============================================================================
// SAM LOYALTY V2 — Cron Jobs
// Expirations, rappels, détection anti-fraude
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import {
  detectAbnormalFrequency,
  detectSuspiciousAmountPattern,
} from "./loyaltyFraudDetection";
import { processPendingLoyaltyNotifications } from "./loyaltyNotificationSender";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("loyaltyCronV2");

// =============================================================================
// TYPES
// =============================================================================

type CronJobSchedule = "daily" | "every_1h" | "every_15min" | "every_5min";

type CronJobDef = {
  name: string;
  schedule: CronJobSchedule;
  dailyHour?: number;
  dailyMinute?: number;
  handler: () => Promise<{ processed: number; message: string }>;
};

// =============================================================================
// CRON JOB 1 — Expiration des cartes de fidélité (quotidien 00h)
// =============================================================================

async function expireLoyaltyCards(): Promise<{ processed: number; message: string }> {
  const supabase = getAdminSupabase();

  // Cartes actives dont expires_at est dépassé
  const { data } = await supabase
    .from("loyalty_cards")
    .update({ status: "expired" })
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .select("id, user_id");

  const processed = data?.length ?? 0;

  // Notifications aux clients
  if (data && data.length > 0) {
    const notifications = data.map((card) => ({
      user_id: card.user_id,
      card_id: card.id,
      notification_type: "stamps_expired",
      channel: "email",
      status: "pending",
    }));
    await supabase.from("loyalty_notifications").insert(notifications);
  }

  return { processed, message: `${processed} carte(s) expirée(s)` };
}

// =============================================================================
// CRON JOB 2 — Expiration des cadeaux fidélité (quotidien 00h)
// =============================================================================

async function expireLoyaltyRewards(): Promise<{ processed: number; message: string }> {
  const supabase = getAdminSupabase();

  // Cartes complétées dont reward_expires_at est dépassé
  const { data: cardsExpired } = await supabase
    .from("loyalty_cards")
    .update({ status: "expired" })
    .in("status", ["completed", "reward_pending"])
    .not("reward_expires_at", "is", null)
    .lt("reward_expires_at", new Date().toISOString())
    .select("id, user_id");

  // Aussi expirer les rewards V1
  await supabase
    .from("loyalty_rewards")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());

  const processed = cardsExpired?.length ?? 0;

  // Notifications
  if (cardsExpired && cardsExpired.length > 0) {
    const notifications = cardsExpired.map((card) => ({
      user_id: card.user_id,
      card_id: card.id,
      notification_type: "reward_expired",
      channel: "email",
      status: "pending",
    }));
    await supabase.from("loyalty_notifications").insert(notifications);
  }

  return { processed, message: `${processed} cadeau(x) fidélité expiré(s)` };
}

// =============================================================================
// CRON JOB 3 — Expiration des cadeaux sam.ma (quotidien 00h)
// =============================================================================

async function expirePlatformGiftDistributions(): Promise<{
  processed: number;
  message: string;
}> {
  const supabase = getAdminSupabase();

  // Distributions non consommées dont expires_at est dépassé
  const { data } = await supabase
    .from("platform_gift_distributions")
    .update({ status: "expired" })
    .eq("status", "distributed")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  // Aussi expirer les platform_gifts eux-mêmes
  await supabase
    .from("platform_gifts")
    .update({ status: "expired" })
    .in("status", ["approved", "partially_distributed"])
    .lt("validity_end", new Date().toISOString());

  const processed = data?.length ?? 0;
  return { processed, message: `${processed} cadeau(x) sam.ma expiré(s)` };
}

// =============================================================================
// CRON JOB 4 — Rappel carte bientôt expirée J-15 (quotidien 10h)
// =============================================================================

async function remindExpiringCards(): Promise<{ processed: number; message: string }> {
  const supabase = getAdminSupabase();

  const j15 = new Date();
  j15.setDate(j15.getDate() + 15);
  const j15Start = new Date(j15.getFullYear(), j15.getMonth(), j15.getDate()).toISOString();
  const j15End = new Date(j15.getFullYear(), j15.getMonth(), j15.getDate() + 1).toISOString();

  // Cartes qui expirent dans exactement 15 jours
  const { data: cards } = await supabase
    .from("loyalty_cards")
    .select("id, user_id")
    .eq("status", "active")
    .gte("expires_at", j15Start)
    .lt("expires_at", j15End);

  if (!cards || cards.length === 0) {
    return { processed: 0, message: "Aucune carte à rappeler" };
  }

  // Vérifier qu'on n'a pas déjà envoyé ce rappel
  const cardIds = cards.map((c) => c.id);
  const { data: alreadySent } = await supabase
    .from("loyalty_notifications")
    .select("card_id")
    .eq("notification_type", "stamps_expiring_soon")
    .in("card_id", cardIds);

  const alreadySentIds = new Set((alreadySent ?? []).map((n) => n.card_id));
  const toNotify = cards.filter((c) => !alreadySentIds.has(c.id));

  if (toNotify.length === 0) {
    return { processed: 0, message: "Rappels déjà envoyés" };
  }

  const notifications = toNotify.map((card) => ({
    user_id: card.user_id,
    card_id: card.id,
    notification_type: "stamps_expiring_soon",
    channel: "email",
    status: "pending",
  }));

  await supabase.from("loyalty_notifications").insert(notifications);

  return { processed: toNotify.length, message: `${toNotify.length} rappel(s) carte J-15` };
}

// =============================================================================
// CRON JOB 5 — Rappel cadeau fidélité J-7 (quotidien 10h)
// =============================================================================

async function remindExpiringRewardsJ7(): Promise<{ processed: number; message: string }> {
  const supabase = getAdminSupabase();

  const j7 = new Date();
  j7.setDate(j7.getDate() + 7);
  const j7Start = new Date(j7.getFullYear(), j7.getMonth(), j7.getDate()).toISOString();
  const j7End = new Date(j7.getFullYear(), j7.getMonth(), j7.getDate() + 1).toISOString();

  const { data: cards } = await supabase
    .from("loyalty_cards")
    .select("id, user_id")
    .in("status", ["completed", "reward_pending"])
    .gte("reward_expires_at", j7Start)
    .lt("reward_expires_at", j7End);

  if (!cards || cards.length === 0) {
    return { processed: 0, message: "Aucun rappel J-7" };
  }

  // Dédup
  const cardIds = cards.map((c) => c.id);
  const { data: alreadySent } = await supabase
    .from("loyalty_notifications")
    .select("card_id")
    .eq("notification_type", "reward_expiring_soon")
    .in("card_id", cardIds);

  const alreadySentIds = new Set((alreadySent ?? []).map((n) => n.card_id));
  const toNotify = cards.filter((c) => !alreadySentIds.has(c.id));

  if (toNotify.length > 0) {
    await supabase.from("loyalty_notifications").insert(
      toNotify.map((card) => ({
        user_id: card.user_id,
        card_id: card.id,
        notification_type: "reward_expiring_soon",
        channel: "email",
        status: "pending",
      }))
    );
  }

  return { processed: toNotify.length, message: `${toNotify.length} rappel(s) cadeau J-7` };
}

// =============================================================================
// CRON JOB 6 — Rappel cadeau fidélité J-2 (quotidien 10h)
// =============================================================================

async function remindExpiringRewardsJ2(): Promise<{ processed: number; message: string }> {
  const supabase = getAdminSupabase();

  const j2 = new Date();
  j2.setDate(j2.getDate() + 2);
  const j2Start = new Date(j2.getFullYear(), j2.getMonth(), j2.getDate()).toISOString();
  const j2End = new Date(j2.getFullYear(), j2.getMonth(), j2.getDate() + 1).toISOString();

  const { data: cards } = await supabase
    .from("loyalty_cards")
    .select("id, user_id")
    .in("status", ["completed", "reward_pending"])
    .gte("reward_expires_at", j2Start)
    .lt("reward_expires_at", j2End);

  if (!cards || cards.length === 0) {
    return { processed: 0, message: "Aucun rappel J-2" };
  }

  // Pour J-2 on vérifie qu'on n'a pas déjà envoyé un rappel J-2 (pas J-7)
  // On utilise le canal "email" + "push" pour J-2
  const notifications = cards.flatMap((card) => [
    {
      user_id: card.user_id,
      card_id: card.id,
      notification_type: "reward_expiring_soon",
      channel: "email",
      status: "pending",
    },
    {
      user_id: card.user_id,
      card_id: card.id,
      notification_type: "reward_expiring_soon",
      channel: "push",
      status: "pending",
    },
  ]);

  await supabase.from("loyalty_notifications").insert(notifications);

  return { processed: cards.length, message: `${cards.length} rappel(s) cadeau J-2` };
}

// =============================================================================
// CRON JOB 7 — Rappel cadeau sam.ma J-7 (quotidien 10h)
// =============================================================================

async function remindExpiringPlatformGiftsJ7(): Promise<{
  processed: number;
  message: string;
}> {
  const supabase = getAdminSupabase();

  const j7 = new Date();
  j7.setDate(j7.getDate() + 7);
  const j7Start = new Date(j7.getFullYear(), j7.getMonth(), j7.getDate()).toISOString();
  const j7End = new Date(j7.getFullYear(), j7.getMonth(), j7.getDate() + 1).toISOString();

  const { data: distributions } = await supabase
    .from("platform_gift_distributions")
    .select("id, user_id")
    .eq("status", "distributed")
    .gte("expires_at", j7Start)
    .lt("expires_at", j7End);

  if (!distributions || distributions.length === 0) {
    return { processed: 0, message: "Aucun rappel cadeau sam.ma J-7" };
  }

  // Notifications (best-effort, utilise loyalty_notifications pour simplifier)
  const notifications = distributions.map((d) => ({
    user_id: d.user_id,
    card_id: null,
    notification_type: "reward_expiring_soon" as const,
    channel: "email" as const,
    status: "pending" as const,
  }));

  await supabase.from("loyalty_notifications").insert(notifications);

  return {
    processed: distributions.length,
    message: `${distributions.length} rappel(s) cadeau sam.ma J-7`,
  };
}

// =============================================================================
// CRON JOB 8 — Détection tamponnage suspect (quotidien 03h)
// =============================================================================

async function runFraudDetection(): Promise<{ processed: number; message: string }> {
  const result1 = await detectAbnormalFrequency();
  const result2 = await detectSuspiciousAmountPattern();

  const total = result1.alerts_created + result2.alerts_created;
  return {
    processed: total,
    message: `Détection fraude : ${result1.alerts_created} alerte(s) fréquence + ${result2.alerts_created} alerte(s) pattern montant`,
  };
}

// =============================================================================
// CRON JOB 9 — Envoi des notifications pending (toutes les 5 min)
// =============================================================================

async function sendPendingNotifications(): Promise<{ processed: number; message: string }> {
  const result = await processPendingLoyaltyNotifications({ batchSize: 50 });
  return {
    processed: result.processed,
    message: `Notifications: ${result.sent} envoyée(s), ${result.failed} échouée(s) / ${result.processed} traitée(s)`,
  };
}

// =============================================================================
// REGISTRE DES CRON JOBS
// =============================================================================

const CRON_JOBS: CronJobDef[] = [
  // Quotidien 00h — Expirations
  {
    name: "expire-loyalty-cards",
    schedule: "daily",
    dailyHour: 0,
    dailyMinute: 0,
    handler: expireLoyaltyCards,
  },
  {
    name: "expire-loyalty-rewards",
    schedule: "daily",
    dailyHour: 0,
    dailyMinute: 5,
    handler: expireLoyaltyRewards,
  },
  {
    name: "expire-platform-gifts",
    schedule: "daily",
    dailyHour: 0,
    dailyMinute: 10,
    handler: expirePlatformGiftDistributions,
  },
  // Quotidien 10h — Rappels
  {
    name: "remind-expiring-cards-j15",
    schedule: "daily",
    dailyHour: 10,
    dailyMinute: 0,
    handler: remindExpiringCards,
  },
  {
    name: "remind-expiring-rewards-j7",
    schedule: "daily",
    dailyHour: 10,
    dailyMinute: 5,
    handler: remindExpiringRewardsJ7,
  },
  {
    name: "remind-expiring-rewards-j2",
    schedule: "daily",
    dailyHour: 10,
    dailyMinute: 10,
    handler: remindExpiringRewardsJ2,
  },
  {
    name: "remind-platform-gifts-j7",
    schedule: "daily",
    dailyHour: 10,
    dailyMinute: 15,
    handler: remindExpiringPlatformGiftsJ7,
  },
  // Quotidien 03h — Détection anti-fraude
  {
    name: "fraud-detection",
    schedule: "daily",
    dailyHour: 3,
    dailyMinute: 0,
    handler: runFraudDetection,
  },
  // Toutes les 5 min — Envoi notifications pending
  {
    name: "send-pending-notifications",
    schedule: "every_5min",
    handler: sendPendingNotifications,
  },
];

// =============================================================================
// SMART SCHEDULER
// =============================================================================

function isJobDueNow(job: CronJobDef): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (job.schedule === "every_5min") return true;
  if (job.schedule === "every_15min") return true;
  if (job.schedule === "every_1h") return currentMinute < 5;

  if (job.schedule === "daily") {
    const jobHour = job.dailyHour ?? 0;
    const jobMinute = job.dailyMinute ?? 0;
    return currentHour === jobHour && Math.abs(currentMinute - jobMinute) < 5;
  }

  return false;
}

// =============================================================================
// MASTER RUNNER
// =============================================================================

/**
 * Exécute tous les cron jobs fidélité V2 qui sont dûs.
 * Appelé par un cron Plesk toutes les 5 minutes.
 */
export async function runAllLoyaltyCronJobs(options?: {
  smart?: boolean;
  forceAll?: boolean;
}): Promise<{
  results: Array<{ name: string; processed: number; message: string; error?: string }>;
}> {
  const smart = options?.smart ?? true;
  const results: Array<{ name: string; processed: number; message: string; error?: string }> = [];

  for (const job of CRON_JOBS) {
    if (smart && !options?.forceAll && !isJobDueNow(job)) continue;

    try {
      const result = await job.handler();
      results.push({ name: job.name, ...result });
      log.info({ job: job.name, message: result.message }, "Cron job completed");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        name: job.name,
        processed: 0,
        message: "Erreur",
        error: errorMsg,
      });
      log.error({ job: job.name, err }, "Cron job error");
    }
  }

  return { results };
}

/**
 * Retourne les schedules de tous les cron jobs (pour affichage admin).
 */
export function getLoyaltyCronSchedules(): Array<{
  name: string;
  schedule: string;
  dailyHour?: number;
  dailyMinute?: number;
}> {
  return CRON_JOBS.map((j) => ({
    name: j.name,
    schedule: j.schedule,
    dailyHour: j.dailyHour,
    dailyMinute: j.dailyMinute,
  }));
}

// =============================================================================
// EXPORTS INDIVIDUELS (pour endpoints cron individuels)
// =============================================================================

export {
  expireLoyaltyCards,
  expireLoyaltyRewards,
  expirePlatformGiftDistributions,
  remindExpiringCards,
  remindExpiringRewardsJ7,
  remindExpiringRewardsJ2,
  remindExpiringPlatformGiftsJ7,
  runFraudDetection,
  sendPendingNotifications,
};
