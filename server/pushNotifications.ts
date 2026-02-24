/**
 * Push Notifications Service (Firebase Cloud Messaging)
 *
 * This module handles sending push notifications to users via FCM.
 * It supports:
 * - Sending to specific device tokens
 * - Sending to a user by looking up their registered FCM tokens
 * - Batch sending for efficiency
 */

import admin from "firebase-admin";
import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("pushNotifications");

const supabase = getAdminSupabase();

// ---------------------------------------------------------------------------
// Firebase Admin SDK Initialization
// ---------------------------------------------------------------------------

let firebaseInitialized = false;

function initializeFirebaseAdmin(): boolean {
  if (firebaseInitialized) return true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

  if (!serviceAccountJson && !projectId) {
    log.warn("Firebase not configured - push notifications disabled");
    return false;
  }

  try {
    if (serviceAccountJson) {
      // Initialize with service account JSON
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    } else if (projectId) {
      // Initialize with application default credentials (for GCP environments)
      admin.initializeApp({
        projectId,
      });
    }

    firebaseInitialized = true;
    log.info("Firebase Admin SDK initialized");
    return true;
  } catch (error) {
    log.error({ err: error }, "Failed to initialize Firebase");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PushNotificationPayload = {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
};

export type SendPushResult = {
  ok: boolean;
  successCount?: number;
  failureCount?: number;
  errors?: string[];
};

// ---------------------------------------------------------------------------
// Send to specific FCM tokens
// ---------------------------------------------------------------------------

export async function sendPushNotification(args: {
  tokens: string[];
  notification: PushNotificationPayload;
}): Promise<SendPushResult> {
  if (!initializeFirebaseAdmin()) {
    return { ok: false, errors: ["Firebase not configured"] };
  }

  const { tokens, notification } = args;

  if (!tokens.length) {
    return { ok: true, successCount: 0, failureCount: 0 };
  }

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: notification.data,
      android: {
        priority: "high",
        notification: {
          sound: notification.sound || "default",
          channelId: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: notification.sound || "default",
            badge: notification.badge,
          },
        },
      },
      webpush: {
        notification: {
          icon: "/logo.png",
          badge: "/logo.png",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Handle invalid tokens - remove them from database
    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          failedTokens.push(tokens[idx]);
        }
      }
    });

    // Clean up invalid tokens
    if (failedTokens.length > 0) {
      await supabase
        .from("consumer_fcm_tokens")
        .delete()
        .in("token", failedTokens);
    }

    return {
      ok: response.successCount > 0 || response.failureCount === 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      errors: response.responses
        .filter((r) => !r.success)
        .map((r) => r.error?.message || "Unknown error"),
    };
  } catch (error) {
    log.error({ err: error }, "Error sending push notification");
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

// ---------------------------------------------------------------------------
// Send to a consumer user (by user ID)
// ---------------------------------------------------------------------------

export async function sendPushToConsumerUser(args: {
  userId: string;
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}): Promise<SendPushResult> {
  if (!initializeFirebaseAdmin()) {
    return { ok: false, errors: ["Firebase not configured"] };
  }

  const { userId, title, body, imageUrl, data } = args;

  // Get user's FCM tokens
  const { data: tokenRows, error } = await supabase
    .from("consumer_fcm_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(10); // Limit to 10 most recent tokens per user

  if (error) {
    log.error({ err: error }, "Error fetching consumer FCM tokens");
    return { ok: false, errors: [error.message] };
  }

  const tokens = (tokenRows ?? []).map((r: any) => r.token).filter(Boolean);

  if (tokens.length === 0) {
    // User has no registered tokens - this is not an error
    return { ok: true, successCount: 0, failureCount: 0 };
  }

  return sendPushNotification({
    tokens,
    notification: { title, body, imageUrl, data },
  });
}

// ---------------------------------------------------------------------------
// Send to a pro user (by user ID)
// ---------------------------------------------------------------------------

export async function sendPushToProUser(args: {
  userId: string;
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}): Promise<SendPushResult> {
  if (!initializeFirebaseAdmin()) {
    return { ok: false, errors: ["Firebase not configured"] };
  }

  const { userId, title, body, imageUrl, data } = args;

  // Get user's FCM tokens from pro table
  const { data: tokenRows, error } = await supabase
    .from("pro_fcm_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    log.error({ err: error }, "Error fetching pro FCM tokens");
    return { ok: false, errors: [error.message] };
  }

  const tokens = (tokenRows ?? []).map((r: any) => r.token).filter(Boolean);

  if (tokens.length === 0) {
    return { ok: true, successCount: 0, failureCount: 0 };
  }

  return sendPushNotification({
    tokens,
    notification: { title, body, imageUrl, data },
  });
}

// ---------------------------------------------------------------------------
// Send to all pro members of an establishment
// ---------------------------------------------------------------------------

export async function sendPushToEstablishmentPros(args: {
  establishmentId: string;
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}): Promise<SendPushResult> {
  if (!initializeFirebaseAdmin()) {
    return { ok: false, errors: ["Firebase not configured"] };
  }

  const { establishmentId, title, body, imageUrl, data } = args;

  // Get all pro user IDs for this establishment
  const { data: memberships, error: memberError } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .eq("establishment_id", establishmentId);

  if (memberError) {
    return { ok: false, errors: [memberError.message] };
  }

  const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];

  if (userIds.length === 0) {
    return { ok: true, successCount: 0, failureCount: 0 };
  }

  // Get all FCM tokens for these users
  const { data: tokenRows, error: tokenError } = await supabase
    .from("pro_fcm_tokens")
    .select("token")
    .in("user_id", userIds)
    .eq("active", true);

  if (tokenError) {
    return { ok: false, errors: [tokenError.message] };
  }

  const tokens = (tokenRows ?? []).map((r: any) => r.token).filter(Boolean);

  if (tokens.length === 0) {
    return { ok: true, successCount: 0, failureCount: 0 };
  }

  return sendPushNotification({
    tokens,
    notification: { title, body, imageUrl, data },
  });
}

// ---------------------------------------------------------------------------
// Send topic message (for broadcast notifications)
// ---------------------------------------------------------------------------

export async function sendPushToTopic(args: {
  topic: string;
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}): Promise<SendPushResult> {
  if (!initializeFirebaseAdmin()) {
    return { ok: false, errors: ["Firebase not configured"] };
  }

  const { topic, title, body, imageUrl, data } = args;

  try {
    const message: admin.messaging.Message = {
      topic,
      notification: {
        title,
        body,
        imageUrl,
      },
      data,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    };

    const messageId = await admin.messaging().send(message);
    return { ok: true, successCount: 1, failureCount: 0 };
  } catch (error) {
    log.error({ err: error }, "Error sending push to topic");
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}
