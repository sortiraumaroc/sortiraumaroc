/**
 * Username Subscription Helpers
 *
 * Manages the lifecycle of username subscriptions for book.sam.ma/:username feature.
 * Supports trial periods (14 days) and annual paid subscriptions.
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { sendTemplateEmail } from "../emailService";
import type { FinanceActor } from "../finance/types";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("usernameSubscription");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsernameSubscriptionStatus =
  | "trial"
  | "pending"
  | "active"
  | "grace_period"
  | "expired"
  | "cancelled";

export type UsernameSubscription = {
  id: string;
  establishment_id: string;
  visibility_order_id: string | null;
  status: UsernameSubscriptionStatus;
  is_trial: boolean;
  trial_ends_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  renewal_reminder_sent_at: string[];
  cancelled_at: string | null;
  cancelled_by: string | null;
  price_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type UsernameSubscriptionWithDetails = UsernameSubscription & {
  establishment?: {
    id: string;
    name: string;
    username: string | null;
  } | null;
  days_remaining?: number;
  can_use_username: boolean;
};

// Trial duration in days
const TRIAL_DURATION_DAYS = 14;

// Grace period after trial (username reserved but link disabled)
const TRIAL_GRACE_DAYS = 7;

// Grace period after paid subscription expires
const PAID_GRACE_DAYS = 90;

// Subscription price in centimes (2400 DH HT)
const SUBSCRIPTION_PRICE_CENTS = 240000;

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Get the current subscription for an establishment
 */
export async function getSubscription(
  establishmentId: string
): Promise<UsernameSubscription | null> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("username_subscriptions")
    .select("*")
    .eq("establishment_id", establishmentId)
    .in("status", ["trial", "pending", "active", "grace_period"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Handle case where table doesn't exist yet (migration not run)
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      log.warn("Table username_subscriptions does not exist yet");
      return null;
    }
    throw error;
  }
  return data as UsernameSubscription | null;
}

/**
 * Get subscription with establishment details and computed fields
 */
export async function getSubscriptionWithDetails(
  establishmentId: string
): Promise<UsernameSubscriptionWithDetails | null> {
  const supabase = getAdminSupabase();

  const { data: sub, error } = await supabase
    .from("username_subscriptions")
    .select(
      `
      *,
      establishments:establishment_id (
        id,
        name,
        username
      )
    `
    )
    .eq("establishment_id", establishmentId)
    .in("status", ["trial", "pending", "active", "grace_period"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Handle case where table doesn't exist yet (migration not run)
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      log.warn("Table username_subscriptions does not exist yet");
      return null;
    }
    throw error;
  }
  if (!sub) return null;

  const subscription = sub as UsernameSubscription & {
    establishments: { id: string; name: string; username: string | null } | null;
  };

  // Compute days remaining
  let daysRemaining: number | undefined;
  let canUseUsername = false;

  const now = new Date();

  if (subscription.status === "trial" && subscription.trial_ends_at) {
    const trialEnd = new Date(subscription.trial_ends_at);
    daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    canUseUsername = trialEnd > now;
  } else if (subscription.status === "active" && subscription.expires_at) {
    const expiresAt = new Date(subscription.expires_at);
    daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    canUseUsername = expiresAt > now;
  } else if (subscription.status === "grace_period") {
    canUseUsername = false; // Link disabled during grace period
  }

  return {
    ...subscription,
    establishment: subscription.establishments,
    days_remaining: daysRemaining,
    can_use_username: canUseUsername,
  };
}

/**
 * Check if an establishment can use the username feature
 * Returns true if: active subscription OR active trial (not expired)
 */
export async function isUsernameAccessAllowed(
  establishmentId: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  // Use the SQL function for consistent logic
  const { data, error } = await supabase.rpc("is_username_subscription_active", {
    p_establishment_id: establishmentId,
  });

  if (error) {
    log.error({ err: error }, "Error checking username access");
    return false;
  }

  return data === true;
}

/**
 * Check if username is reserved (even during grace period)
 */
export async function isUsernameReserved(
  establishmentId: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase.rpc("is_username_reserved", {
    p_establishment_id: establishmentId,
  });

  if (error) {
    log.error({ err: error }, "Error checking username reservation");
    return false;
  }

  return data === true;
}

// ---------------------------------------------------------------------------
// Trial Management
// ---------------------------------------------------------------------------

/**
 * Start a free 14-day trial for an establishment
 */
export async function startTrial(
  establishmentId: string,
  userId: string
): Promise<UsernameSubscription> {
  const supabase = getAdminSupabase();

  // Check if there's already an active subscription or trial
  const existing = await getSubscription(establishmentId);
  if (existing) {
    throw new Error(
      existing.status === "trial"
        ? "Un essai gratuit est deja actif"
        : "Un abonnement est deja actif"
    );
  }

  // Check if establishment already had a trial before
  const { data: previousTrial, error: trialCheckError } = await supabase
    .from("username_subscriptions")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("is_trial", true)
    .limit(1)
    .maybeSingle();

  // Handle case where table doesn't exist yet (migration not run)
  if (trialCheckError) {
    if (trialCheckError.code === "42P01" || trialCheckError.message?.includes("does not exist")) {
      throw new Error("La fonctionnalite d'essai n'est pas encore disponible. Veuillez reessayer plus tard.");
    }
    throw trialCheckError;
  }
  if (previousTrial) {
    throw new Error("Vous avez deja utilise votre essai gratuit");
  }

  // Calculate trial end date
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

  // Create trial subscription
  const { data, error } = await supabase
    .from("username_subscriptions")
    .insert({
      establishment_id: establishmentId,
      status: "trial",
      is_trial: true,
      trial_ends_at: trialEndsAt.toISOString(),
      price_cents: 0,
      currency: "MAD",
    })
    .select()
    .single();

  // Handle case where table doesn't exist yet (migration not run)
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      throw new Error("La fonctionnalite d'essai n'est pas encore disponible. Veuillez reessayer plus tard.");
    }
    throw error;
  }

  // Send welcome email
  await sendTrialStartedEmail(establishmentId, trialEndsAt);

  return data as UsernameSubscription;
}

// ---------------------------------------------------------------------------
// Paid Subscription Management
// ---------------------------------------------------------------------------

/**
 * Create or upgrade subscription after payment
 * Called from payments webhook when visibility order is paid
 */
export async function ensureSubscriptionForOrder(
  orderId: string,
  actor: FinanceActor
): Promise<UsernameSubscription | null> {
  const supabase = getAdminSupabase();

  // Get the order and check if it contains username_subscription item
  const { data: order, error: orderError } = await supabase
    .from("visibility_orders")
    .select(
      `
      id,
      establishment_id,
      payment_status,
      paid_at,
      visibility_order_items!inner (
        id,
        type,
        duration_days,
        total_price_cents,
        currency
      )
    `
    )
    .eq("id", orderId)
    .single();

  if (orderError) throw orderError;
  if (!order) return null;

  // Find username_subscription item
  const items = (order as any).visibility_order_items as Array<{
    id: string;
    type: string;
    duration_days: number | null;
    total_price_cents: number;
    currency: string;
  }>;

  const subscriptionItem = items.find((i) => i.type === "username_subscription");
  if (!subscriptionItem) return null;

  // Check payment status
  if ((order as any).payment_status !== "paid") {
    return null;
  }

  const establishmentId = (order as any).establishment_id as string;
  const durationDays = subscriptionItem.duration_days ?? 365;
  const priceCents = subscriptionItem.total_price_cents;
  const currency = subscriptionItem.currency || "MAD";

  // Check for existing subscription
  const existing = await getSubscription(establishmentId);

  const now = new Date();
  let startsAt = now;
  let expiresAt = new Date(now);

  if (existing) {
    // If upgrading from trial or renewing, extend from current end date
    if (existing.status === "trial" && existing.trial_ends_at) {
      const trialEnd = new Date(existing.trial_ends_at);
      if (trialEnd > now) {
        startsAt = trialEnd;
        expiresAt = new Date(trialEnd);
      }
    } else if (existing.status === "active" && existing.expires_at) {
      const currentEnd = new Date(existing.expires_at);
      if (currentEnd > now) {
        // Renewal: add to existing subscription
        startsAt = currentEnd;
        expiresAt = new Date(currentEnd);
      }
    }

    // Expire the existing subscription
    await supabase
      .from("username_subscriptions")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("id", existing.id);
  }

  // Calculate new expiration
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  // Grace period is 90 days after expiration
  const gracePeriodEndsAt = new Date(expiresAt);
  gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + PAID_GRACE_DAYS);

  // Create new active subscription
  const { data, error } = await supabase
    .from("username_subscriptions")
    .insert({
      establishment_id: establishmentId,
      visibility_order_id: orderId,
      status: "active",
      is_trial: false,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      grace_period_ends_at: gracePeriodEndsAt.toISOString(),
      price_cents: priceCents,
      currency,
    })
    .select()
    .single();

  if (error) throw error;

  // Send activation email
  await sendSubscriptionActivatedEmail(establishmentId, expiresAt);

  return data as UsernameSubscription;
}

/**
 * Cancel subscription (stops reminders, but keeps access until expiration)
 */
export async function cancelSubscription(
  establishmentId: string,
  userId: string
): Promise<UsernameSubscription | null> {
  const supabase = getAdminSupabase();

  const existing = await getSubscription(establishmentId);
  if (!existing) {
    throw new Error("Aucun abonnement actif");
  }

  if (existing.status === "trial") {
    throw new Error("Impossible d'annuler un essai gratuit");
  }

  if (existing.cancelled_at) {
    throw new Error("L'abonnement est deja annule");
  }

  const { data, error } = await supabase
    .from("username_subscriptions")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) throw error;
  return data as UsernameSubscription;
}

// ---------------------------------------------------------------------------
// Cron Job Helpers
// ---------------------------------------------------------------------------

/**
 * Find subscriptions that need expiration processing
 */
export async function findExpiredSubscriptions(): Promise<UsernameSubscription[]> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Find active subscriptions past expiration date
  const { data: activeExpired, error: activeError } = await supabase
    .from("username_subscriptions")
    .select("*")
    .eq("status", "active")
    .lt("expires_at", now);

  if (activeError) throw activeError;

  // Find trials past end date
  const { data: trialsExpired, error: trialsError } = await supabase
    .from("username_subscriptions")
    .select("*")
    .eq("status", "trial")
    .lt("trial_ends_at", now);

  if (trialsError) throw trialsError;

  return [
    ...(activeExpired || []),
    ...(trialsExpired || []),
  ] as UsernameSubscription[];
}

/**
 * Process expiration for a subscription
 */
export async function processExpiration(
  subscriptionId: string
): Promise<void> {
  const supabase = getAdminSupabase();

  const { data: sub, error: fetchError } = await supabase
    .from("username_subscriptions")
    .select("*, establishments:establishment_id (id, name, username)")
    .eq("id", subscriptionId)
    .single();

  if (fetchError) throw fetchError;

  const subscription = sub as UsernameSubscription & {
    establishments: { id: string; name: string; username: string | null } | null;
  };

  if (subscription.status === "trial") {
    // Trial expired - set short grace period
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setDate(gracePeriodEnds.getDate() + TRIAL_GRACE_DAYS);

    await supabase
      .from("username_subscriptions")
      .update({
        status: "expired",
        grace_period_ends_at: gracePeriodEnds.toISOString(),
      })
      .eq("id", subscriptionId);

    // Send trial ended email
    await sendTrialEndedEmail(
      subscription.establishment_id,
      subscription.establishments?.username || null
    );
  } else if (subscription.status === "active") {
    // Paid subscription expired - enter grace period
    await supabase
      .from("username_subscriptions")
      .update({ status: "grace_period" })
      .eq("id", subscriptionId);

    // Send expiration email
    await sendSubscriptionExpiredEmail(
      subscription.establishment_id,
      subscription.establishments?.username || null,
      subscription.grace_period_ends_at
        ? new Date(subscription.grace_period_ends_at)
        : null
    );
  }
}

/**
 * Find subscriptions in grace period that should be fully expired
 * (username released after grace period ends)
 */
export async function findGracePeriodExpired(): Promise<UsernameSubscription[]> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("username_subscriptions")
    .select("*")
    .eq("status", "grace_period")
    .lt("grace_period_ends_at", now);

  if (error) throw error;
  return (data || []) as UsernameSubscription[];
}

/**
 * Release username after grace period
 */
export async function releaseUsername(subscriptionId: string): Promise<void> {
  const supabase = getAdminSupabase();

  // Get subscription with establishment
  const { data: sub, error: fetchError } = await supabase
    .from("username_subscriptions")
    .select("establishment_id")
    .eq("id", subscriptionId)
    .single();

  if (fetchError) throw fetchError;

  const establishmentId = (sub as any).establishment_id;

  // Clear the username from establishment
  await supabase
    .from("establishments")
    .update({ username: null, username_changed_at: null })
    .eq("id", establishmentId);

  // Mark subscription as fully expired
  await supabase
    .from("username_subscriptions")
    .update({ status: "expired" })
    .eq("id", subscriptionId);
}

/**
 * Find subscriptions needing renewal reminders
 */
export async function findSubscriptionsNeedingReminder(
  daysBeforeExpiry: number
): Promise<UsernameSubscription[]> {
  const supabase = getAdminSupabase();

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);

  // Find subscriptions expiring around target date that haven't received this reminder
  const reminderKey = `${daysBeforeExpiry}d`;

  const { data, error } = await supabase
    .from("username_subscriptions")
    .select("*")
    .eq("status", "active")
    .is("cancelled_at", null) // Don't send reminders to cancelled subscriptions
    .gte("expires_at", targetDate.toISOString().split("T")[0])
    .lt("expires_at", new Date(targetDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  if (error) throw error;

  // Filter out subscriptions that already received this reminder
  return ((data || []) as UsernameSubscription[]).filter((sub) => {
    const sentReminders = sub.renewal_reminder_sent_at || [];
    return !sentReminders.includes(reminderKey);
  });
}

/**
 * Mark reminder as sent
 */
export async function markReminderSent(
  subscriptionId: string,
  reminderKey: string
): Promise<void> {
  const supabase = getAdminSupabase();

  const { data: sub, error: fetchError } = await supabase
    .from("username_subscriptions")
    .select("renewal_reminder_sent_at")
    .eq("id", subscriptionId)
    .single();

  if (fetchError) throw fetchError;

  const currentReminders = ((sub as any).renewal_reminder_sent_at as string[]) || [];

  await supabase
    .from("username_subscriptions")
    .update({
      renewal_reminder_sent_at: [...currentReminders, reminderKey],
    })
    .eq("id", subscriptionId);
}

// ---------------------------------------------------------------------------
// Email Helpers
// ---------------------------------------------------------------------------

async function getEstablishmentEmail(
  establishmentId: string
): Promise<{ email: string; name: string; username: string | null } | null> {
  const supabase = getAdminSupabase();

  // Get establishment with owner email
  const { data, error } = await supabase
    .from("establishments")
    .select(
      `
      id,
      name,
      username,
      pro_memberships!inner (
        user_id,
        role
      )
    `
    )
    .eq("id", establishmentId)
    .eq("pro_memberships.role", "owner")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const membership = ((data as any).pro_memberships as Array<{ user_id: string }>)?.[0];
  if (!membership) return null;

  // Get user email
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("email")
    .eq("id", membership.user_id)
    .single();

  if (userError || !user) return null;

  return {
    email: (user as any).email,
    name: (data as any).name,
    username: (data as any).username,
  };
}

async function sendTrialStartedEmail(
  establishmentId: string,
  trialEndsAt: Date
): Promise<void> {
  const info = await getEstablishmentEmail(establishmentId);
  if (!info) return;

  try {
    await sendTemplateEmail({
      templateKey: "username_trial_started",
      lang: "fr",
      fromKey: "noreply",
      to: [info.email],
      variables: {
        establishment_name: info.name,
        trial_ends_at: trialEndsAt.toLocaleDateString("fr-FR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        pro_url: `${process.env.VITE_APP_URL || "https://sam.ma"}/pro`,
      },
    });
  } catch (err) {
    log.error({ err }, "Failed to send trial started email");
  }
}

async function sendTrialEndedEmail(
  establishmentId: string,
  username: string | null
): Promise<void> {
  const info = await getEstablishmentEmail(establishmentId);
  if (!info) return;

  try {
    await sendTemplateEmail({
      templateKey: "username_trial_ended",
      lang: "fr",
      fromKey: "noreply",
      to: [info.email],
      variables: {
        establishment_name: info.name,
        username: username || info.username || "votre-etablissement",
        subscribe_url: `${process.env.VITE_APP_URL || "https://sam.ma"}/pro/visibility`,
      },
    });
  } catch (err) {
    log.error({ err }, "Failed to send trial ended email");
  }
}

async function sendSubscriptionActivatedEmail(
  establishmentId: string,
  expiresAt: Date
): Promise<void> {
  const info = await getEstablishmentEmail(establishmentId);
  if (!info) return;

  try {
    await sendTemplateEmail({
      templateKey: "username_subscription_activated",
      lang: "fr",
      fromKey: "noreply",
      to: [info.email],
      variables: {
        establishment_name: info.name,
        username: info.username || "votre-etablissement",
        expires_at: expiresAt.toLocaleDateString("fr-FR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        pro_url: `${process.env.VITE_APP_URL || "https://sam.ma"}/pro`,
      },
    });
  } catch (err) {
    log.error({ err }, "Failed to send subscription activated email");
  }
}

async function sendSubscriptionExpiredEmail(
  establishmentId: string,
  username: string | null,
  gracePeriodEndsAt: Date | null
): Promise<void> {
  const info = await getEstablishmentEmail(establishmentId);
  if (!info) return;

  try {
    await sendTemplateEmail({
      templateKey: "username_subscription_expired",
      lang: "fr",
      fromKey: "noreply",
      to: [info.email],
      variables: {
        establishment_name: info.name,
        username: username || info.username || "votre-etablissement",
        grace_period_ends_at: gracePeriodEndsAt
          ? gracePeriodEndsAt.toLocaleDateString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "90 jours",
        renew_url: `${process.env.VITE_APP_URL || "https://sam.ma"}/pro/visibility`,
      },
    });
  } catch (err) {
    log.error({ err }, "Failed to send subscription expired email");
  }
}

export async function sendRenewalReminderEmail(
  establishmentId: string,
  daysRemaining: number
): Promise<void> {
  const info = await getEstablishmentEmail(establishmentId);
  if (!info) return;

  // Select template based on days remaining
  let templateKey: string;
  if (daysRemaining === 30) {
    templateKey = "username_subscription_reminder_30d";
  } else if (daysRemaining === 7) {
    templateKey = "username_subscription_reminder_7d";
  } else {
    return; // Unknown reminder type
  }

  const sub = await getSubscription(establishmentId);
  if (!sub?.expires_at) return;

  try {
    await sendTemplateEmail({
      templateKey,
      lang: "fr",
      fromKey: "noreply",
      to: [info.email],
      variables: {
        establishment_name: info.name,
        username: info.username || "votre-etablissement",
        expires_at: new Date(sub.expires_at).toLocaleDateString("fr-FR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        renew_url: `${process.env.VITE_APP_URL || "https://sam.ma"}/pro/visibility`,
      },
    });
  } catch (err) {
    log.error({ err, daysRemaining }, "Failed to send renewal reminder email");
  }
}

// ---------------------------------------------------------------------------
// Admin Helpers
// ---------------------------------------------------------------------------

export type SubscriptionListFilters = {
  status?: UsernameSubscriptionStatus;
  establishmentId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listSubscriptions(
  filters: SubscriptionListFilters = {}
): Promise<{ subscriptions: UsernameSubscriptionWithDetails[]; total: number }> {
  const supabase = getAdminSupabase();
  const { status, establishmentId, search, limit = 50, offset = 0 } = filters;

  let query = supabase
    .from("username_subscriptions")
    .select(
      `
      *,
      establishments:establishment_id (
        id,
        name,
        username
      )
    `,
      { count: "exact" }
    );

  if (status) {
    query = query.eq("status", status);
  }

  if (establishmentId) {
    query = query.eq("establishment_id", establishmentId);
  }

  if (search) {
    // Search by establishment name
    query = query.ilike("establishments.name", `%${search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const subscriptions = (data || []).map((sub: any) => {
    const now = new Date();
    let daysRemaining: number | undefined;
    let canUseUsername = false;

    if (sub.status === "trial" && sub.trial_ends_at) {
      const trialEnd = new Date(sub.trial_ends_at);
      daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      canUseUsername = trialEnd > now;
    } else if (sub.status === "active" && sub.expires_at) {
      const expiresAt = new Date(sub.expires_at);
      daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      canUseUsername = expiresAt > now;
    }

    return {
      ...sub,
      establishment: sub.establishments,
      days_remaining: daysRemaining,
      can_use_username: canUseUsername,
    } as UsernameSubscriptionWithDetails;
  });

  return {
    subscriptions,
    total: count || 0,
  };
}

/**
 * Extend a subscription manually (admin action)
 */
export async function extendSubscription(
  subscriptionId: string,
  additionalDays: number,
  adminUserId: string
): Promise<UsernameSubscription> {
  const supabase = getAdminSupabase();

  const { data: sub, error: fetchError } = await supabase
    .from("username_subscriptions")
    .select("*")
    .eq("id", subscriptionId)
    .single();

  if (fetchError) throw fetchError;
  if (!sub) throw new Error("Abonnement non trouve");

  const subscription = sub as UsernameSubscription;

  let newExpiresAt: Date;
  let newGracePeriodEndsAt: Date;

  if (subscription.status === "trial" && subscription.trial_ends_at) {
    // Extend trial
    newExpiresAt = new Date(subscription.trial_ends_at);
    newExpiresAt.setDate(newExpiresAt.getDate() + additionalDays);

    const { data, error } = await supabase
      .from("username_subscriptions")
      .update({ trial_ends_at: newExpiresAt.toISOString() })
      .eq("id", subscriptionId)
      .select()
      .single();

    if (error) throw error;
    return data as UsernameSubscription;
  }

  // Extend paid subscription
  if (subscription.expires_at) {
    newExpiresAt = new Date(subscription.expires_at);
  } else {
    newExpiresAt = new Date();
  }

  newExpiresAt.setDate(newExpiresAt.getDate() + additionalDays);

  newGracePeriodEndsAt = new Date(newExpiresAt);
  newGracePeriodEndsAt.setDate(newGracePeriodEndsAt.getDate() + PAID_GRACE_DAYS);

  // If in grace_period, reactivate
  const newStatus = subscription.status === "grace_period" ? "active" : subscription.status;

  const { data, error } = await supabase
    .from("username_subscriptions")
    .update({
      status: newStatus,
      expires_at: newExpiresAt.toISOString(),
      grace_period_ends_at: newGracePeriodEndsAt.toISOString(),
    })
    .eq("id", subscriptionId)
    .select()
    .single();

  if (error) throw error;
  return data as UsernameSubscription;
}

/**
 * Admin cancel subscription
 */
export async function adminCancelSubscription(
  subscriptionId: string,
  adminUserId: string
): Promise<UsernameSubscription> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("username_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: adminUserId,
    })
    .eq("id", subscriptionId)
    .select()
    .single();

  if (error) throw error;
  return data as UsernameSubscription;
}

/**
 * Get subscription statistics for admin dashboard
 */
export async function getSubscriptionStats(): Promise<{
  active_count: number;
  trial_count: number;
  grace_period_count: number;
  mrr_cents: number;
  expiring_this_month: number;
}> {
  const supabase = getAdminSupabase();

  // Count by status
  const { data: statusCounts, error: countError } = await supabase
    .from("username_subscriptions")
    .select("status")
    .in("status", ["active", "trial", "grace_period"]);

  if (countError) throw countError;

  const counts = (statusCounts || []).reduce(
    (acc, row) => {
      const status = (row as any).status as string;
      if (status === "active") acc.active++;
      else if (status === "trial") acc.trial++;
      else if (status === "grace_period") acc.grace++;
      return acc;
    },
    { active: 0, trial: 0, grace: 0 }
  );

  // Calculate MRR (Monthly Recurring Revenue)
  // Annual subscription = 240000 centimes, so MRR = 240000 / 12 per active sub
  const mrrCents = counts.active * Math.round(SUBSCRIPTION_PRICE_CENTS / 12);

  // Count expiring this month
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const { data: expiringData, error: expiringError } = await supabase
    .from("username_subscriptions")
    .select("id")
    .eq("status", "active")
    .gte("expires_at", now.toISOString())
    .lte("expires_at", endOfMonth.toISOString());

  if (expiringError) throw expiringError;

  return {
    active_count: counts.active,
    trial_count: counts.trial,
    grace_period_count: counts.grace,
    mrr_cents: mrrCents,
    expiring_this_month: (expiringData || []).length,
  };
}
