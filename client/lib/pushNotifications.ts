/**
 * Push Notifications Client
 *
 * This module handles registering for push notifications via Firebase Cloud Messaging.
 * It manages the FCM token lifecycle and registration with our backend.
 */

import { getFirebaseApp, isFirebaseConfigured } from "./firebase";
import { getMessaging, getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { getConsumerAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// VAPID key for web push (get from Firebase Console > Project Settings > Cloud Messaging)
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let messagingInstance: ReturnType<typeof getMessaging> | null = null;
let currentToken: string | null = null;
let messageListeners: Array<(payload: MessagePayload) => void> = [];

// ---------------------------------------------------------------------------
// Initialize Firebase Messaging
// ---------------------------------------------------------------------------

function getMessagingInstance() {
  if (!isFirebaseConfigured()) return null;

  const app = getFirebaseApp();
  if (!app) return null;

  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(app);
    } catch (error) {
      console.warn("[PushNotifications] Messaging not supported:", error);
      return null;
    }
  }

  return messagingInstance;
}

// ---------------------------------------------------------------------------
// Check if push notifications are supported
// ---------------------------------------------------------------------------

export function isPushSupported(): boolean {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    isFirebaseConfigured() &&
    Boolean(VAPID_KEY)
  );
}

// ---------------------------------------------------------------------------
// Get the current notification permission status
// ---------------------------------------------------------------------------

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

// ---------------------------------------------------------------------------
// Request notification permission
// ---------------------------------------------------------------------------

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    console.warn("[PushNotifications] Notifications not supported");
    return "denied";
  }

  const permission = await Notification.requestPermission();
  return permission;
}

// ---------------------------------------------------------------------------
// Get the FCM token (after permission is granted)
// ---------------------------------------------------------------------------

export async function getFCMToken(): Promise<string | null> {
  if (!isPushSupported()) {
    console.warn("[PushNotifications] Push not supported");
    return null;
  }

  const permission = getNotificationPermission();
  if (permission !== "granted") {
    console.warn("[PushNotifications] Permission not granted");
    return null;
  }

  const messaging = getMessagingInstance();
  if (!messaging) {
    console.warn("[PushNotifications] Messaging not available");
    return null;
  }

  try {
    // Register service worker for background notifications
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    currentToken = token;
    return token;
  } catch (error) {
    console.error("[PushNotifications] Error getting token:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Register token with backend
// ---------------------------------------------------------------------------

export async function registerPushToken(token: string): Promise<boolean> {
  const accessToken = await getConsumerAccessToken();
  if (!accessToken) {
    console.warn("[PushNotifications] Not authenticated, cannot register token");
    return false;
  }

  try {
    const response = await fetch("/api/consumer/push/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        token,
        device_type: "web",
        device_name: navigator.userAgent.slice(0, 100),
      }),
    });

    const data = await response.json();
    return data.ok === true;
  } catch (error) {
    console.error("[PushNotifications] Error registering token:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unregister token from backend
// ---------------------------------------------------------------------------

export async function unregisterPushToken(token: string): Promise<boolean> {
  const accessToken = await getConsumerAccessToken();
  if (!accessToken) return false;

  try {
    const response = await fetch("/api/consumer/push/unregister", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();
    return data.ok === true;
  } catch (error) {
    console.error("[PushNotifications] Error unregistering token:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Full setup flow: request permission + get token + register
// ---------------------------------------------------------------------------

export async function setupPushNotifications(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  if (!isPushSupported()) {
    return { success: false, error: "Push notifications not supported" };
  }

  // Request permission
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return { success: false, error: "Permission denied" };
  }

  // Get FCM token
  const token = await getFCMToken();
  if (!token) {
    return { success: false, error: "Failed to get token" };
  }

  // Register with backend
  const registered = await registerPushToken(token);
  if (!registered) {
    return { success: false, error: "Failed to register token" };
  }

  return { success: true, token };
}

// ---------------------------------------------------------------------------
// Listen for foreground messages
// ---------------------------------------------------------------------------

export function onForegroundMessage(callback: (payload: MessagePayload) => void): () => void {
  messageListeners.push(callback);

  // Set up the actual Firebase listener if not already done
  const messaging = getMessagingInstance();
  if (messaging && messageListeners.length === 1) {
    onMessage(messaging, (payload) => {
      messageListeners.forEach((listener) => listener(payload));
    });
  }

  // Return unsubscribe function
  return () => {
    messageListeners = messageListeners.filter((l) => l !== callback);
  };
}

// ---------------------------------------------------------------------------
// Update push preferences
// ---------------------------------------------------------------------------

export async function updatePushPreferences(preferences: {
  push_notifications_enabled?: boolean;
  push_waitlist_enabled?: boolean;
  push_bookings_enabled?: boolean;
  push_marketing_enabled?: boolean;
}): Promise<boolean> {
  const accessToken = await getConsumerAccessToken();
  if (!accessToken) return false;

  try {
    const response = await fetch("/api/consumer/push/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferences),
    });

    const data = await response.json();
    return data.ok === true;
  } catch (error) {
    console.error("[PushNotifications] Error updating preferences:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Get current token (cached)
// ---------------------------------------------------------------------------

export function getCurrentToken(): string | null {
  return currentToken;
}
