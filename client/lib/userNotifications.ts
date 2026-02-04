import type { BookingRecord, PackPurchase } from "@/lib/userData";
import type { ConsumerNotificationRow } from "@/lib/consumerNotificationsApi";

export type UserNotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  createdAtIso: string;
  readAtIso?: string | null;
  href?: string;
};

const READ_IDS_KEY = "sam:user_notifications_read_ids";

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("sam:user_notifications_changed"));
}

export function getUserNotificationReadIds(): Set<string> {
  const raw = readJson(READ_IDS_KEY);
  const list = Array.isArray(raw) ? raw : [];
  const ids = list.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  return new Set(ids);
}

export function markUserNotificationRead(id: string): void {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return;
  const next = getUserNotificationReadIds();
  next.add(trimmed);
  writeJson(READ_IDS_KEY, Array.from(next));
}

export function markAllUserNotificationsRead(ids: string[]): void {
  const next = getUserNotificationReadIds();
  for (const id of ids) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) next.add(trimmed);
  }
  writeJson(READ_IDS_KEY, Array.from(next));
}

export function buildUserNotifications(args: {
  bookings: BookingRecord[];
  packPurchases: PackPurchase[];
  consumerEvents?: ConsumerNotificationRow[];
}): UserNotificationItem[] {
  const items: UserNotificationItem[] = [];

  // NOTE: We no longer create notifications from bookings/packs lists.
  // Reservations are already visible in "Mes réservations" section.
  // Only real event notifications from consumer_user_events are shown here.
  // This prevents notification spam and keeps the bell meaningful.

  for (const ev of args.consumerEvents ?? []) {
    const occurred = String(ev.occurred_at ?? "");
    const meta = (ev.metadata ?? {}) as Record<string, unknown>;

    const reservationId = typeof meta.reservationId === "string" ? meta.reservationId : null;
    const bookingRef = typeof meta.bookingReference === "string" ? meta.bookingReference : null;

    const href = reservationId
      ? ev.event_type === "message_received"
        ? `/profile/messages/${encodeURIComponent(reservationId)}`
        : `/profile/bookings/${encodeURIComponent(reservationId)}`
      : undefined;

    const formatted = (() => {
      if (ev.event_type === "message_received") {
        const subject = typeof meta.subject === "string" ? meta.subject : "Message";
        const snippet = typeof meta.snippet === "string" ? meta.snippet : "";
        return { title: "Nouveau message", body: `${subject}${snippet ? ` · ${snippet}` : ""}` };
      }

      if (ev.event_type === "payment_succeeded") {
        return {
          title: "Paiement confirmé",
          body: `Réservation ${bookingRef ?? reservationId ?? ""}`.trim(),
        };
      }

      if (ev.event_type === "refund_done") {
        return {
          title: "Remboursement",
          body: `Réservation ${bookingRef ?? reservationId ?? ""}`.trim(),
        };
      }

      if (ev.event_type === "payment_failed") {
        return {
          title: "Paiement",
          body: `Paiement en attente · Réservation ${bookingRef ?? reservationId ?? ""}`.trim(),
        };
      }

      // Account lifecycle events - these should NOT create notifications
      // They are internal events tracked for admin purposes only
      if (
        ev.event_type === "account.reactivated" ||
        ev.event_type === "account.deactivated" ||
        ev.event_type === "account.deleted" ||
        ev.event_type === "account.export_requested" ||
        ev.event_type === "password.reset_requested" ||
        ev.event_type === "password.reset_link_requested" ||
        ev.event_type === "password.reset_completed" ||
        ev.event_type === "password.changed" ||
        ev.event_type === "password.change_failed" ||
        ev.event_type === "profile.updated"
      ) {
        return null; // Skip - don't create a notification for these events
      }

      // Booking events
      if (ev.event_type === "booking_confirmed") {
        return {
          title: "Réservation confirmée",
          body: bookingRef ? `Réservation ${bookingRef}` : "Votre réservation a été confirmée.",
        };
      }

      if (ev.event_type === "booking_refused") {
        return {
          title: "Réservation refusée",
          body: bookingRef ? `Réservation ${bookingRef}` : "Votre réservation a été refusée.",
        };
      }

      if (ev.event_type === "booking_waitlisted") {
        return {
          title: "Liste d'attente",
          body: bookingRef ? `Réservation ${bookingRef} ajoutée à la liste d'attente` : "Ajouté à la liste d'attente.",
        };
      }

      if (ev.event_type === "booking_cancelled") {
        return {
          title: "Réservation annulée",
          body: bookingRef ? `Réservation ${bookingRef}` : "Votre réservation a été annulée.",
        };
      }

      if (ev.event_type === "booking_change_proposed") {
        return {
          title: "Modification proposée",
          body: bookingRef ? `Nouvelle proposition pour la réservation ${bookingRef}` : "Une modification a été proposée.",
        };
      }

      if (ev.event_type === "booking_change_accepted") {
        return {
          title: "Modification acceptée",
          body: bookingRef ? `Modification acceptée pour la réservation ${bookingRef}` : "Votre demande de modification a été acceptée.",
        };
      }

      if (ev.event_type === "booking_change_declined") {
        return {
          title: "Modification refusée",
          body: bookingRef ? `Modification refusée pour la réservation ${bookingRef}` : "Votre demande de modification a été refusée.",
        };
      }

      if (ev.event_type === "noshow_marked") {
        return {
          title: "Absence signalée",
          body: bookingRef ? `Absence signalée pour la réservation ${bookingRef}` : "Une absence a été signalée.",
        };
      }

      // Waitlist events
      if (ev.event_type === "waitlist_offer_sent" || ev.event_type === "waitlist_user_ready") {
        return {
          title: "Place disponible",
          body: bookingRef ? `Une place s'est libérée pour la réservation ${bookingRef}` : "Une place s'est libérée ! Répondez rapidement.",
        };
      }

      if (ev.event_type === "waitlist_offer_accepted") {
        return {
          title: "Offre acceptée",
          body: bookingRef ? `Réservation ${bookingRef} confirmée depuis la liste d'attente` : "Votre réservation a été confirmée.",
        };
      }

      if (ev.event_type === "waitlist_offer_refused") {
        return {
          title: "Offre refusée",
          body: bookingRef ? `Réservation ${bookingRef}` : "Vous avez refusé l'offre.",
        };
      }

      if (ev.event_type === "waitlist_offer_expired") {
        return {
          title: "Offre expirée",
          body: bookingRef ? `L'offre pour la réservation ${bookingRef} a expiré` : "L'offre a expiré.",
        };
      }

      if (ev.event_type === "waitlist_cancelled") {
        return {
          title: "Liste d'attente",
          body: bookingRef ? `Retrait de la liste d'attente pour ${bookingRef}` : "Vous avez été retiré de la liste d'attente.",
        };
      }

      if (ev.event_type === "waitlist_removed_by_pro") {
        return {
          title: "Liste d'attente",
          body: bookingRef ? `Retrait de la liste d'attente pour ${bookingRef}` : "L'établissement vous a retiré de la liste d'attente.",
        };
      }

      return { title: "Notification", body: bookingRef ? `Réservation ${bookingRef}` : String(ev.event_type ?? "").trim() };
    })() as { title: string; body: string } | null;

    // Skip events that should not create notifications
    if (!formatted) continue;

    const { title, body } = formatted;
    const readAtIso = typeof (ev as any).read_at === "string" && String((ev as any).read_at).trim() ? String((ev as any).read_at).trim() : null;

    items.push({
      id: `event:${ev.id}`,
      eventType: ev.event_type,
      title,
      body,
      createdAtIso: occurred,
      readAtIso,
      href,
    });
  }

  return items
    .filter((x) => x.createdAtIso)
    .sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime());
}

export function isUserNotificationRead(item: UserNotificationItem, readIds: Set<string> = getUserNotificationReadIds()): boolean {
  if (item.readAtIso) return true;
  return readIds.has(item.id);
}

export function getUserUnreadCount(items: UserNotificationItem[]): number {
  const readIds = getUserNotificationReadIds();
  return items.filter((x) => !isUserNotificationRead(x, readIds)).length;
}
