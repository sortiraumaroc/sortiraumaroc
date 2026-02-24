// =============================================================================
// SAM LOYALTY V2 — Realtime Notifications (Phase 6)
// Notifications temps réel déclenchées par les événements de fidélité.
// Spec: 19 événements → 9 implémentés ici (temps réel), 10 dans crons.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("loyaltyRealtime");
import { sendTemplateEmail } from "./emailService";
import { emitConsumerUserEvent } from "./consumerNotifications";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";

const BASE_URL = process.env.PUBLIC_URL || "https://sam.ma";

// =============================================================================
// HELPERS
// =============================================================================

async function getUserEmailAndName(
  supabase: SupabaseClient,
  userId: string
): Promise<{ email: string | null; name: string }> {
  try {
    const { data } = await supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();

    const rec = data as Record<string, unknown> | null;
    const email = typeof rec?.email === "string" && (rec.email as string).includes("@")
      ? (rec.email as string).trim()
      : null;
    const name = typeof rec?.full_name === "string" ? (rec.full_name as string).trim() : "";

    if (email && name) return { email, name };

    // Fallback to auth.users
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const authEmail = authData?.user?.email?.trim() ?? null;
    const meta = authData?.user?.user_metadata as Record<string, unknown> | undefined;
    const authName = (meta?.full_name ?? meta?.name ?? "") as string;

    return {
      email: email ?? authEmail,
      name: name || authName || "Client",
    };
  } catch (err) {
    log.warn({ err }, "Failed to fetch user email/name for loyalty notification");
    return { email: null, name: "Client" };
  }
}

// =============================================================================
// 1. TAMPON VALIDÉ — Client (In-app)
// =============================================================================

export async function notifyStampValidated(args: {
  userId: string;
  cardId: string;
  stampNumber: number;
  stampsRequired: number;
  programName: string;
  establishmentName: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.stamp_validated",
      metadata: {
        card_id: args.cardId,
        stamp_number: args.stampNumber,
        stamps_required: args.stampsRequired,
        program_name: args.programName,
        establishment_name: args.establishmentName,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyStampValidated error");
  }
}

// =============================================================================
// 2. TAMPON CONDITIONNEL REFUSÉ — Client (In-app)
// =============================================================================

export async function notifyConditionalStampRefused(args: {
  userId: string;
  cardId: string;
  amountSpent: number;
  minimumRequired: number;
  programName: string;
  establishmentName: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.conditional_stamp_refused",
      metadata: {
        card_id: args.cardId,
        amount_spent: args.amountSpent,
        minimum_required: args.minimumRequired,
        program_name: args.programName,
        establishment_name: args.establishmentName,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyConditionalStampRefused error");
  }
}

// =============================================================================
// 3. CARTE À MI-PARCOURS (50%) — Client (In-app)
// =============================================================================

export async function notifyCardHalfway(args: {
  userId: string;
  cardId: string;
  stampNumber: number;
  stampsRequired: number;
  programName: string;
  establishmentName: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.card_halfway",
      metadata: {
        card_id: args.cardId,
        stamp_number: args.stampNumber,
        stamps_required: args.stampsRequired,
        program_name: args.programName,
        establishment_name: args.establishmentName,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyCardHalfway error");
  }
}

// =============================================================================
// 4. CARTE PRESQUE COMPLÈTE (1 tampon restant) — Client (Email + In-app)
// =============================================================================

export async function notifyCardAlmostComplete(args: {
  userId: string;
  cardId: string;
  stampsRequired: number;
  programName: string;
  establishmentName: string;
  rewardDescription: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const { email, name } = await getUserEmailAndName(supabase, args.userId);

    // In-app
    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.card_almost_complete",
      email,
      metadata: {
        card_id: args.cardId,
        stamps_required: args.stampsRequired,
        program_name: args.programName,
        establishment_name: args.establishmentName,
        reward_description: args.rewardDescription,
      },
    });

    // Email
    if (email) {
      void sendTemplateEmail({
        templateKey: "loyalty_card_almost_complete",
        lang: "fr",
        fromKey: "noreply",
        to: [email],
        variables: {
          user_name: name,
          program_name: args.programName,
          establishment_name: args.establishmentName,
          reward_description: args.rewardDescription,
        },
        ctaUrl: `${BASE_URL}/ma-fidelite`,
        meta: { source: "loyaltyRealtimeNotif.cardAlmostComplete", card_id: args.cardId },
      });
    }
  } catch (err) {
    log.error({ err }, "notifyCardAlmostComplete error");
  }
}

// =============================================================================
// 5. CARTE COMPLÉTÉE — CADEAU DÉBLOQUÉ — Client (Email + SMS + In-app)
// =============================================================================

export async function notifyRewardUnlocked(args: {
  userId: string;
  cardId: string;
  programName: string;
  establishmentName: string;
  rewardDescription: string;
  rewardExpiresAt: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const { email, name } = await getUserEmailAndName(supabase, args.userId);

    // In-app
    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.reward_unlocked",
      email,
      metadata: {
        card_id: args.cardId,
        program_name: args.programName,
        establishment_name: args.establishmentName,
        reward_description: args.rewardDescription,
        reward_expires_at: args.rewardExpiresAt,
      },
    });

    // Email
    if (email) {
      void sendTemplateEmail({
        templateKey: "loyalty_reward_unlocked",
        lang: "fr",
        fromKey: "noreply",
        to: [email],
        variables: {
          user_name: name,
          program_name: args.programName,
          establishment_name: args.establishmentName,
          reward_description: args.rewardDescription,
          reward_expires_at: new Date(args.rewardExpiresAt).toLocaleDateString("fr-FR"),
        },
        ctaUrl: `${BASE_URL}/ma-fidelite`,
        meta: { source: "loyaltyRealtimeNotif.rewardUnlocked", card_id: args.cardId },
      });
    }

    // SMS (best-effort, via loyalty_notifications queue for processing)
    await supabase.from("loyalty_notifications").insert({
      user_id: args.userId,
      card_id: args.cardId,
      notification_type: "reward_unlocked",
      channel: "sms",
      status: "pending",
    });
  } catch (err) {
    log.error({ err }, "notifyRewardUnlocked error");
  }
}

// =============================================================================
// 6. CADEAU SAM.MA REÇU — Client (Email + SMS + In-app)
// =============================================================================

export async function notifyPlatformGiftReceived(args: {
  userId: string;
  distributionId: string;
  giftDescription: string;
  giftType: string;
  giftValue: number;
  establishmentName: string;
  expiresAt: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const { email, name } = await getUserEmailAndName(supabase, args.userId);

    // In-app
    await emitConsumerUserEvent({
      supabase,
      userId: args.userId,
      eventType: "loyalty.gift_received",
      email,
      metadata: {
        distribution_id: args.distributionId,
        gift_description: args.giftDescription,
        gift_type: args.giftType,
        gift_value: args.giftValue,
        establishment_name: args.establishmentName,
        expires_at: args.expiresAt,
      },
    });

    // Email
    if (email) {
      void sendTemplateEmail({
        templateKey: "loyalty_gift_received",
        lang: "fr",
        fromKey: "noreply",
        to: [email],
        variables: {
          user_name: name,
          gift_description: args.giftDescription,
          establishment_name: args.establishmentName,
          expires_at: new Date(args.expiresAt).toLocaleDateString("fr-FR"),
        },
        ctaUrl: `${BASE_URL}/mes-cadeaux`,
        meta: { source: "loyaltyRealtimeNotif.giftReceived", distribution_id: args.distributionId },
      });
    }

    // SMS (queued)
    await supabase.from("loyalty_notifications").insert({
      user_id: args.userId,
      card_id: null,
      notification_type: "platform_gift_received",
      channel: "sms",
      status: "pending",
    });
  } catch (err) {
    log.error({ err }, "notifyPlatformGiftReceived error");
  }
}

// =============================================================================
// 7. CADEAU OFFERT PAR PRO (À APPROUVER) — Admin (Email + In-app)
// =============================================================================

export async function notifyAdminGiftToApprove(args: {
  giftId: string;
  giftDescription: string;
  giftValue: number;
  establishmentName: string;
  establishmentId: string;
}): Promise<void> {
  try {
    // Admin in-app
    await emitAdminNotification({
      type: "loyalty_gift_to_approve",
      title: "Cadeau sam.ma à approuver",
      body: `${args.establishmentName} propose un cadeau : "${args.giftDescription}" (${args.giftValue} MAD)`,
      data: {
        gift_id: args.giftId,
        establishment_id: args.establishmentId,
        establishment_name: args.establishmentName,
        gift_description: args.giftDescription,
        gift_value: args.giftValue,
      },
    });

    // Admin email (best-effort, template doit exister)
    void sendTemplateEmail({
      templateKey: "admin_loyalty_gift_to_approve",
      lang: "fr",
      fromKey: "noreply",
      to: [process.env.ADMIN_EMAIL || "admin@sam.ma"],
      variables: {
        establishment_name: args.establishmentName,
        gift_description: args.giftDescription,
        gift_value: args.giftValue,
      },
      ctaUrl: `${BASE_URL}/admin/loyalty`,
      meta: { source: "loyaltyRealtimeNotif.giftToApprove", gift_id: args.giftId },
    });
  } catch (err) {
    log.error({ err }, "notifyAdminGiftToApprove error");
  }
}

// =============================================================================
// 8. CADEAU SAM.MA DISTRIBUÉ — Pro (In-app)
// =============================================================================

export async function notifyProGiftDistributed(args: {
  establishmentId: string;
  giftDescription: string;
  distributedCount: number;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    await notifyProMembers({
      supabase,
      establishmentId: args.establishmentId,
      category: "loyalty",
      title: "Cadeau sam.ma distribué",
      body: `Votre cadeau "${args.giftDescription}" a été distribué à ${args.distributedCount} client(s).`,
      data: {
        gift_description: args.giftDescription,
        distributed_count: args.distributedCount,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyProGiftDistributed error");
  }
}

// =============================================================================
// 9. CADEAU SAM.MA CONSOMMÉ — Pro (In-app)
// =============================================================================

export async function notifyProGiftConsumed(args: {
  establishmentId: string;
  giftDescription: string;
  consumerName: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    await notifyProMembers({
      supabase,
      establishmentId: args.establishmentId,
      category: "loyalty",
      title: "Cadeau sam.ma consommé",
      body: `${args.consumerName} a utilisé le cadeau "${args.giftDescription}".`,
      data: {
        gift_description: args.giftDescription,
        consumer_name: args.consumerName,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyProGiftConsumed error");
  }
}
