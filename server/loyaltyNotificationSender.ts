// =============================================================================
// SAM LOYALTY V2 — Notification Sender
// Traite les notifications pending dans loyalty_notifications et envoie
// les emails/push via sendTemplateEmail + emitConsumerUserEvent.
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import { sendTemplateEmail } from "./emailService";
import { emitConsumerUserEvent } from "./consumerNotifications";

// =============================================================================
// TEMPLATE MAPPING
// =============================================================================

/**
 * Mapping notification_type → templateKey email.
 * Les templates doivent exister dans la table email_templates.
 */
const NOTIFICATION_TEMPLATE_MAP: Record<
  string,
  { templateKey: string; eventType: string; ctaUrl?: string }
> = {
  stamps_expired: {
    templateKey: "loyalty_stamps_expired",
    eventType: "loyalty.stamps_expired",
    ctaUrl: "/ma-fidelite",
  },
  stamps_expiring_soon: {
    templateKey: "loyalty_stamps_expiring_j15",
    eventType: "loyalty.stamps_expiring_soon",
    ctaUrl: "/ma-fidelite",
  },
  reward_expired: {
    templateKey: "loyalty_reward_expired",
    eventType: "loyalty.reward_expired",
    ctaUrl: "/ma-fidelite",
  },
  reward_expiring_soon: {
    templateKey: "loyalty_reward_expiring_soon",
    eventType: "loyalty.reward_expiring_soon",
    ctaUrl: "/ma-fidelite",
  },
  reward_unlocked: {
    templateKey: "loyalty_reward_unlocked",
    eventType: "loyalty.reward_unlocked",
    ctaUrl: "/ma-fidelite",
  },
  platform_gift_received: {
    templateKey: "loyalty_gift_received",
    eventType: "loyalty.gift_received",
    ctaUrl: "/mes-cadeaux",
  },
  platform_gift_expiring_soon: {
    templateKey: "loyalty_gift_expiring_j7",
    eventType: "loyalty.gift_expiring_soon",
    ctaUrl: "/mes-cadeaux",
  },
};

// =============================================================================
// PROCESS PENDING NOTIFICATIONS
// =============================================================================

/**
 * Traite les notifications loyalty_notifications en status "pending".
 * Pour chaque notification :
 *   1. Récupère l'email du user
 *   2. Si channel = "email" → envoie via sendTemplateEmail
 *   3. Si channel = "push" → enregistre dans consumer_user_events
 *   4. Met à jour le status → "sent" ou "failed"
 *
 * Appelé par cron toutes les 5 minutes.
 */
export async function processPendingLoyaltyNotifications(opts?: {
  batchSize?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const supabase = getAdminSupabase();
  const batchSize = opts?.batchSize ?? 50;

  // Fetch pending notifications
  const { data: notifications } = await supabase
    .from("loyalty_notifications")
    .select("id, user_id, card_id, notification_type, channel, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (!notifications || notifications.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const notif of notifications) {
    try {
      // Mark as processing
      await supabase
        .from("loyalty_notifications")
        .update({ status: "processing" })
        .eq("id", notif.id);

      const templateInfo = NOTIFICATION_TEMPLATE_MAP[notif.notification_type];
      if (!templateInfo) {
        // Unknown notification type — mark as failed
        await supabase
          .from("loyalty_notifications")
          .update({ status: "failed", error_message: "Unknown notification_type" })
          .eq("id", notif.id);
        failed++;
        continue;
      }

      // Fetch user email
      const userEmail = await getUserEmail(supabase, notif.user_id);

      if (notif.channel === "email" || notif.channel === "email") {
        if (!userEmail) {
          await supabase
            .from("loyalty_notifications")
            .update({ status: "failed", error_message: "No email found" })
            .eq("id", notif.id);
          failed++;
          continue;
        }

        // Get user name for template variables
        const userName = await getUserName(supabase, notif.user_id);

        // Get card/program info for better context
        const cardInfo = notif.card_id
          ? await getCardInfo(supabase, notif.card_id)
          : null;

        const BASE_URL = process.env.PUBLIC_URL || "https://sam.ma";

        const result = await sendTemplateEmail({
          templateKey: templateInfo.templateKey,
          lang: "fr",
          fromKey: "noreply",
          to: [userEmail],
          variables: {
            user_name: userName,
            program_name: cardInfo?.program_name ?? "Programme de fidélité",
            establishment_name: cardInfo?.establishment_name ?? "",
            stamps_count: cardInfo?.stamps_count ?? 0,
            stamps_required: cardInfo?.stamps_required ?? 0,
            reward_description: cardInfo?.reward_description ?? "",
            expires_at: cardInfo?.expires_at ?? "",
          },
          ctaUrl: templateInfo.ctaUrl
            ? `${BASE_URL}${templateInfo.ctaUrl}`
            : undefined,
          meta: {
            source: "loyaltyNotificationSender",
            notification_id: notif.id,
            notification_type: notif.notification_type,
          },
        });

        if (result.ok) {
          await supabase
            .from("loyalty_notifications")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", notif.id);
          sent++;
        } else {
          const errorMsg = "error" in result ? (result as { error: string }).error : "Unknown error";
          await supabase
            .from("loyalty_notifications")
            .update({ status: "failed", error_message: errorMsg })
            .eq("id", notif.id);
          failed++;
        }
      } else if (notif.channel === "push") {
        // In-app notification via consumer_user_events
        await emitConsumerUserEvent({
          supabase,
          userId: notif.user_id,
          eventType: templateInfo.eventType,
          email: userEmail,
          metadata: {
            notification_id: notif.id,
            notification_type: notif.notification_type,
            card_id: notif.card_id,
          },
        });

        await supabase
          .from("loyalty_notifications")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", notif.id);
        sent++;
      } else {
        // Unknown channel
        await supabase
          .from("loyalty_notifications")
          .update({ status: "failed", error_message: `Unknown channel: ${notif.channel}` })
          .eq("id", notif.id);
        failed++;
      }
    } catch (err) {
      console.error(`[loyaltyNotifSender] Error processing notif ${notif.id}:`, err);
      try {
        await supabase
          .from("loyalty_notifications")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", notif.id);
      } catch {
        // best-effort
      }
      failed++;
    }
  }

  return { processed: notifications.length, sent, failed };
}

// =============================================================================
// DIRECT EMAIL SENDERS — Called from crons for immediate delivery
// =============================================================================

/**
 * Envoie un email de rappel J-15 carte de fidélité.
 * Appelé depuis remindExpiringCards() dans loyaltyCronV2.ts.
 */
export async function sendLoyaltyCardExpiringEmail(args: {
  userId: string;
  cardId: string;
  programName: string;
  establishmentName: string;
  stampsCount: number;
  stampsRequired: number;
  expiresAt: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const email = await getUserEmail(supabase, args.userId);
    if (!email) return;

    const userName = await getUserName(supabase, args.userId);
    const BASE_URL = process.env.PUBLIC_URL || "https://sam.ma";

    await sendTemplateEmail({
      templateKey: "loyalty_stamps_expiring_j15",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: userName,
        program_name: args.programName,
        establishment_name: args.establishmentName,
        stamps_count: args.stampsCount,
        stamps_required: args.stampsRequired,
        expires_at: new Date(args.expiresAt).toLocaleDateString("fr-FR"),
      },
      ctaUrl: `${BASE_URL}/ma-fidelite`,
      meta: {
        source: "loyaltyCronV2.remindExpiringCards",
        card_id: args.cardId,
      },
    });
  } catch (err) {
    console.error("[loyaltyNotifSender] sendLoyaltyCardExpiringEmail error:", err);
  }
}

/**
 * Envoie un email de rappel cadeau fidélité J-7 ou J-2.
 */
export async function sendRewardExpiringEmail(args: {
  userId: string;
  cardId: string;
  rewardDescription: string;
  establishmentName: string;
  expiresAt: string;
  daysRemaining: number;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const email = await getUserEmail(supabase, args.userId);
    if (!email) return;

    const userName = await getUserName(supabase, args.userId);
    const BASE_URL = process.env.PUBLIC_URL || "https://sam.ma";

    await sendTemplateEmail({
      templateKey: "loyalty_reward_expiring_soon",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: userName,
        reward_description: args.rewardDescription,
        establishment_name: args.establishmentName,
        days_remaining: args.daysRemaining,
        expires_at: new Date(args.expiresAt).toLocaleDateString("fr-FR"),
      },
      ctaUrl: `${BASE_URL}/ma-fidelite`,
      meta: {
        source: `loyaltyCronV2.remindExpiringRewards_J${args.daysRemaining}`,
        card_id: args.cardId,
      },
    });
  } catch (err) {
    console.error("[loyaltyNotifSender] sendRewardExpiringEmail error:", err);
  }
}

/**
 * Envoie un email de rappel cadeau sam.ma J-7.
 */
export async function sendPlatformGiftExpiringEmail(args: {
  userId: string;
  distributionId: string;
  giftDescription: string;
  expiresAt: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const email = await getUserEmail(supabase, args.userId);
    if (!email) return;

    const userName = await getUserName(supabase, args.userId);
    const BASE_URL = process.env.PUBLIC_URL || "https://sam.ma";

    await sendTemplateEmail({
      templateKey: "loyalty_gift_expiring_j7",
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: userName,
        gift_description: args.giftDescription,
        expires_at: new Date(args.expiresAt).toLocaleDateString("fr-FR"),
      },
      ctaUrl: `${BASE_URL}/mes-cadeaux`,
      meta: {
        source: "loyaltyCronV2.remindExpiringPlatformGiftsJ7",
        distribution_id: args.distributionId,
      },
    });
  } catch (err) {
    console.error("[loyaltyNotifSender] sendPlatformGiftExpiringEmail error:", err);
  }
}

/**
 * Envoie une notification in-app pour rappel cadeau J-2.
 */
export async function sendRewardExpiringPush(args: {
  userId: string;
  cardId: string;
  rewardDescription: string;
  daysRemaining: number;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const email = await getUserEmail(supabase, args.userId);

    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.reward_expiring_soon",
      email,
      metadata: {
        card_id: args.cardId,
        reward_description: args.rewardDescription,
        days_remaining: args.daysRemaining,
      },
    });
  } catch (err) {
    console.error("[loyaltyNotifSender] sendRewardExpiringPush error:", err);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

async function getUserEmail(
  supabase: ReturnType<typeof getAdminSupabase>,
  userId: string
): Promise<string | null> {
  try {
    // Try consumer_users first
    const { data } = await supabase
      .from("consumer_users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const email = (data as Record<string, unknown> | null)?.email;
    if (typeof email === "string" && email.includes("@")) return email.trim();

    // Fallback to auth.users
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    if (authData?.user?.email) return authData.user.email.trim();

    return null;
  } catch {
    return null;
  }
}

async function getUserName(
  supabase: ReturnType<typeof getAdminSupabase>,
  userId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("consumer_users")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const name = (data as Record<string, unknown> | null)?.full_name;
    if (typeof name === "string" && name.trim()) return name.trim();

    // Fallback to auth user_metadata
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const meta = authData?.user?.user_metadata as Record<string, unknown> | undefined;
    const authName = meta?.full_name ?? meta?.name;
    if (typeof authName === "string") return authName.trim();

    return "Client";
  } catch {
    return "Client";
  }
}

async function getCardInfo(
  supabase: ReturnType<typeof getAdminSupabase>,
  cardId: string
): Promise<{
  program_name: string;
  establishment_name: string;
  stamps_count: number;
  stamps_required: number;
  reward_description: string;
  expires_at: string;
} | null> {
  try {
    const { data } = await supabase
      .from("loyalty_cards")
      .select(`
        stamps_count,
        expires_at,
        reward_expires_at,
        program:loyalty_programs(name, stamps_required, reward_description, establishment:establishments(name))
      `)
      .eq("id", cardId)
      .maybeSingle();

    if (!data) return null;

    const program = (data as Record<string, unknown>).program as Record<string, unknown> | null;
    const establishment = program?.establishment as Record<string, unknown> | null;

    return {
      program_name: (program?.name as string) ?? "",
      establishment_name: (establishment?.name as string) ?? "",
      stamps_count: (data as Record<string, unknown>).stamps_count as number ?? 0,
      stamps_required: (program?.stamps_required as number) ?? 0,
      reward_description: (program?.reward_description as string) ?? "",
      expires_at: ((data as Record<string, unknown>).expires_at as string) ??
        ((data as Record<string, unknown>).reward_expires_at as string) ?? "",
    };
  } catch {
    return null;
  }
}
