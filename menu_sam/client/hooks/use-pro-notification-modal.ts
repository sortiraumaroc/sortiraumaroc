import * as React from "react";
import { toast } from "sonner";
import type { NotificationModalContent, NotificationType } from "@/components/pro/notification-modal";

// ✅ MP3 in public folder
const AUDIO_SRC = "/sounds/default_audio.mp3"; // or "/sounds/default_audio.mp3"

// --------------------
// ✅ Audio manager (loop ringtone)
// --------------------
let sharedAudioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!sharedAudioEl) {
    sharedAudioEl = new Audio(AUDIO_SRC);
    sharedAudioEl.loop = true;
    sharedAudioEl.preload = "auto";
    sharedAudioEl.volume = 0.85;
  }
  return sharedAudioEl;
}

async function startRingtone() {
  try {
    const a = getAudio();
    a.currentTime = 0;
    await a.play();
  } catch {
    // iOS may block until user interaction; unlock effect below handles it
  }
}

function stopRingtone() {
  try {
    const a = getAudio();
    a.pause();
    a.currentTime = 0;
  } catch {
    // ignore
  }
}

// Optional: to avoid playing while muted
function shouldRing(type: NotificationModalContent["type"]) {
  // ✅ ring for these 3 (you can add chef/paiement if needed)
  return type === "new_order" || type === "serveur" || type === "addition";
}

export function useProNotificationModal(selectedPlaceId: number | null) {
  const [currentNotification, setCurrentNotification] =
    React.useState<NotificationModalContent | null>(null);

  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [isAccepting, setIsAccepting] = React.useState(false);
  const [isTerminating, setIsTerminating] = React.useState(false);

  const previousOrderIdsRef = React.useRef(new Set<string>());
  const previousNotificationIdsRef = React.useRef(new Set<string>());

  // ✅ Unlock audio on first interaction (important for iPhone)
  React.useEffect(() => {
    if (!soundEnabled) {
      stopRingtone();
      return;
    }

    let unlocked = false;

    const unlock = async () => {
      if (unlocked) return;
      unlocked = true;

      // attempt a play/pause to unlock
      try {
        const a = getAudio();
        await a.play();
        a.pause();
        a.currentTime = 0;
      } catch {
        // ignore
      }

      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      unlocked = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundEnabled]);

  // ✅ Control ringtone based on currentNotification
  React.useEffect(() => {
    if (!soundEnabled) {
      stopRingtone();
      return;
    }

    if (currentNotification && shouldRing(currentNotification.type)) {
      void startRingtone();
    } else {
      stopRingtone();
    }

    // stop sound if component unmounts
    return () => {
      stopRingtone();
    };
  }, [currentNotification, soundEnabled]);

  // ✅ Polling (kept as-is, but no direct sound here anymore)
  React.useEffect(() => {
    if (!selectedPlaceId) return;

    const pollNotifications = async () => {
      try {
        // 1) Fetch new orders
        const ordersRes = await fetch(`/api/mysql/orders/${selectedPlaceId}`);
        const orders = ordersRes.ok ? await ordersRes.json() : [];

        const newOrders = (Array.isArray(orders) ? orders : []).filter(
          (o: any) => o.kitchenStatus === "new"
        );

        const currentOrderIds = new Set(newOrders.map((o: any) => String(o.id)));
        const addedOrders = newOrders.filter(
          (o: any) => !previousOrderIdsRef.current.has(String(o.id))
        );

        if (addedOrders.length > 0 && !currentNotification) {
          const order = addedOrders[0];
          const notification: NotificationModalContent = {
            id: String(order.id),
            type: "new_order",
            title: "🍽️ Nouvelle Commande",
            message: `Commande reçue${order.tableNumber ? ` — Table ${order.tableNumber}` : ""}`,
            tableNumber: order.tableNumber,
            timestamp: new Date(),
          };
          setCurrentNotification(notification);
        }

        previousOrderIdsRef.current = currentOrderIds;

        // 2) Fetch pending table notifications
        const notifRes = await fetch(`/api/mysql/notifications/${selectedPlaceId}?status=pending`);
        const notifications = notifRes.ok ? await notifRes.json() : [];

        const pendingNotifications = Array.isArray(notifications)
          ? notifications.filter((n: any) => n.status === "pending")
          : [];

        const currentNotificationIds = new Set(
          pendingNotifications.map((n: any) => String(n.id))
        );

        const addedNotifications = pendingNotifications.filter(
          (n: any) => !previousNotificationIdsRef.current.has(String(n.id))
        );

        if (addedNotifications.length > 0 && !currentNotification) {
          const notif = addedNotifications[0];
          const typeLabels: Record<string, string> = {
            serveur: "👨‍💼 Appel Serveur",
            addition: "🧾 Demande Addition",
            chef: "👨‍🍳 Appel Chef",
            paiement: "💳 Appel Paiement",
          };

          const notification: NotificationModalContent = {
            id: String(notif.id),
            type: notif.type as NotificationType,
            title: typeLabels[notif.type] || "Appel",
            message: `Table ${notif.tableNumber || "?"}${notif.message ? ` — ${notif.message}` : ""}`,
            tableNumber: notif.tableNumber,
            timestamp: new Date(),
          };

          setCurrentNotification(notification);
        }

        previousNotificationIdsRef.current = currentNotificationIds;
      } catch (error) {
        console.error("Error polling notifications:", error);
      }
    };

    void pollNotifications();
    const interval = window.setInterval(() => void pollNotifications(), 2000);
    return () => window.clearInterval(interval);
  }, [currentNotification, selectedPlaceId]);

  // ✅ Close (X): stop audio + close modal
  const dismissNotification = React.useCallback(() => {
    stopRingtone();
    setCurrentNotification(null);
  }, []);

  // ✅ Accept order: stop audio + close modal
  const acceptNotification = React.useCallback(async () => {
    if (!currentNotification || currentNotification.type !== "new_order") return;

    setIsAccepting(true);
    try {
      const response = await fetch(`/api/mysql/orders/${currentNotification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenStatus: "accepted" }),
      });

      if (!response.ok) {
        toast.error("Impossible d'accepter la commande");
        return;
      }

      toast.success("Commande acceptée", {
        duration: 2000,
        className: "border-sam-success/30 bg-sam-success text-white",
      });

      stopRingtone();
      setCurrentNotification(null);
    } catch (error) {
      console.error("Error accepting order:", error);
      toast.error("Erreur lors de l'acceptation");
    } finally {
      setIsAccepting(false);
    }
  }, [currentNotification]);

  // ✅ Terminer (serveur/addition): stop audio + close modal
  const terminateNotification = React.useCallback(async () => {
    if (!currentNotification) return;

    // ✅ allow 3 types if you want terminate for all:
    const isTableCall =
      currentNotification.type === "serveur" ||
      currentNotification.type === "addition" ||
      currentNotification.type === "paiement" ||
      currentNotification.type === "chef";

    if (!isTableCall) return;

    setIsTerminating(true);
    try {
      const response = await fetch(`/api/mysql/notifications/${currentNotification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      if (!response.ok) {
        toast.error("Impossible de terminer l'appel");
        return;
      }

      toast.success("Appel marqué comme terminé", {
        duration: 2000,
        className: "border-sam-success/30 bg-sam-success text-white",
      });

      stopRingtone();
      setCurrentNotification(null);
    } catch (error) {
      console.error("Error terminating notification:", error);
      toast.error("Erreur lors de la fermeture");
    } finally {
      setIsTerminating(false);
    }
  }, [currentNotification]);

  return {
    notification: currentNotification,
    onDismiss: dismissNotification,
    onAccept: acceptNotification,
    onTerminate: terminateNotification,
    isAccepting,
    isTerminating,
    soundEnabled,
    setSoundEnabled,
  };
}
