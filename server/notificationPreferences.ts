/**
 * Notification Preferences — User preference management
 *
 * Handles CRUD for notification_preferences table.
 * Used by:
 *   - Notification Engine (to check if a channel is allowed)
 *   - Client API (to read/update preferences)
 *   - Push Marketing (to filter opted-out users)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import type { NotificationPreferences } from "../shared/notificationsBannersWheelTypes";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("notificationPreferences");

// =============================================================================
// Cache (5 min TTL, per user)
// =============================================================================

const prefsCache = new Map<string, { prefs: NotificationPreferences | null; ts: number }>();
const PREFS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Default preferences
// =============================================================================

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, "user_id" | "user_type" | "updated_at"> = {
  email_transactional: true,
  sms_enabled: true,
  push_enabled: true,
  reservation_reminders: true,
  loyalty_reminders: true,
  marketing_push: true,
  preferred_lang: "fr",
  pro_popups_enabled: true,
  pro_sound_enabled: true,
};

// =============================================================================
// Read
// =============================================================================

/**
 * Get notification preferences for a user. Returns defaults if no row exists.
 */
export async function getUserPreferences(
  userId: string,
  userType: "consumer" | "pro" = "consumer",
): Promise<NotificationPreferences> {
  // Check cache
  const cached = prefsCache.get(userId);
  if (cached && Date.now() - cached.ts < PREFS_CACHE_TTL) {
    if (cached.prefs) return cached.prefs;
    // Return defaults if null (no row in DB)
    return {
      user_id: userId,
      user_type: userType,
      ...DEFAULT_PREFERENCES,
      updated_at: new Date().toISOString(),
    };
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    const defaultPrefs: NotificationPreferences = {
      user_id: userId,
      user_type: userType,
      ...DEFAULT_PREFERENCES,
      updated_at: new Date().toISOString(),
    };
    prefsCache.set(userId, { prefs: null, ts: Date.now() });
    return defaultPrefs;
  }

  const prefs = data as NotificationPreferences;
  prefsCache.set(userId, { prefs, ts: Date.now() });
  return prefs;
}

// =============================================================================
// Write
// =============================================================================

/** Updatable fields */
export type PreferencesUpdate = Partial<
  Pick<
    NotificationPreferences,
    | "email_transactional"
    | "sms_enabled"
    | "push_enabled"
    | "reservation_reminders"
    | "loyalty_reminders"
    | "marketing_push"
    | "preferred_lang"
    | "pro_popups_enabled"
    | "pro_sound_enabled"
  >
>;

/**
 * Update notification preferences for a user (upsert).
 */
export async function updateUserPreferences(
  userId: string,
  userType: "consumer" | "pro",
  updates: PreferencesUpdate,
): Promise<NotificationPreferences> {
  const supabase = getAdminSupabase();

  // Build safe update object
  const safeUpdates: Record<string, unknown> = {};
  const boolFields: (keyof PreferencesUpdate)[] = [
    "email_transactional",
    "sms_enabled",
    "push_enabled",
    "reservation_reminders",
    "loyalty_reminders",
    "marketing_push",
    "pro_popups_enabled",
    "pro_sound_enabled",
  ];

  for (const field of boolFields) {
    if (typeof updates[field] === "boolean") {
      safeUpdates[field] = updates[field];
    }
  }

  if (updates.preferred_lang && ["fr", "en", "ar"].includes(updates.preferred_lang)) {
    safeUpdates.preferred_lang = updates.preferred_lang;
  }

  const row = {
    user_id: userId,
    user_type: userType,
    ...DEFAULT_PREFERENCES,
    ...safeUpdates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update notification preferences: ${error.message}`);
  }

  const prefs = (data ?? row) as NotificationPreferences;

  // Invalidate cache
  prefsCache.delete(userId);

  // Sync with consumer_users push preferences if consumer
  if (userType === "consumer") {
    void syncConsumerPushPreferences(userId, prefs);
  }

  return prefs;
}

// =============================================================================
// Sync with existing consumer_users push preferences
// =============================================================================

/**
 * Keep consumer_users push columns in sync with notification_preferences.
 * Best-effort: if it fails, the notification_preferences table is the source of truth.
 */
async function syncConsumerPushPreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  const supabase = getAdminSupabase();
  try {
    await supabase
      .from("consumer_users")
      .update({
        push_notifications_enabled: prefs.push_enabled,
        push_marketing_enabled: prefs.marketing_push,
        push_bookings_enabled: prefs.reservation_reminders,
      })
      .eq("id", userId);
  } catch (err) {
    log.warn({ err }, "Best-effort: sync consumer push preferences failed");
  }
}

// =============================================================================
// Cache management
// =============================================================================

/**
 * Invalidate cache for a specific user (e.g., after unsubscribe).
 */
export function invalidatePreferencesCache(userId: string): void {
  prefsCache.delete(userId);
}

/**
 * Clear all cached preferences.
 */
export function clearAllPreferencesCache(): void {
  prefsCache.clear();
}
