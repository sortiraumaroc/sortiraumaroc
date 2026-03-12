/**
 * Firebase Messaging Service Worker
 *
 * This service worker handles push notifications when the app is in the background.
 * It must be in the public folder to be served at the root level.
 */

// Import Firebase scripts
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

// Initialize Firebase — placeholders are replaced at build/serve time
// by the firebase-sw-config Vite plugin (see vite.config.ts).
firebase.initializeApp({
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background message received:", payload);

  const notificationTitle = payload.notification?.title || "Sortir Au Maroc";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    tag: payload.data?.type || "default",
    data: payload.data,
    requireInteraction: payload.data?.type === "waitlist_offer_received", // Keep waitlist offers visible
    actions: [],
  };

  // Add actions based on notification type
  if (payload.data?.type === "waitlist_offer_received") {
    notificationOptions.actions = [
      { action: "confirm", title: "Confirmer" },
      { action: "dismiss", title: "Plus tard" },
    ];
  }

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  console.log("[firebase-messaging-sw.js] Notification clicked:", event);

  event.notification.close();

  const data = event.notification.data || {};
  let url = "/";

  // Route based on notification type
  if (data.type === "waitlist_offer_received" && data.reservationId) {
    url = `/profile/bookings/${data.reservationId}`;
  } else if (data.type === "waitlist_offer_expired" && data.establishmentId) {
    url = `/e/${data.establishmentId}`;
  } else if (data.type === "booking_confirmed" && data.reservationId) {
    url = `/profile/bookings/${data.reservationId}`;
  } else if (data.reservationId) {
    url = `/profile/bookings/${data.reservationId}`;
  } else if (data.establishmentId) {
    url = `/e/${data.establishmentId}`;
  }

  // Handle action clicks
  if (event.action === "confirm" && data.reservationId) {
    url = `/profile/bookings/${data.reservationId}?action=confirm`;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if possible
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window if no existing window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification close (for analytics)
self.addEventListener("notificationclose", (event) => {
  console.log("[firebase-messaging-sw.js] Notification closed:", event);
  // Could send analytics event here
});
