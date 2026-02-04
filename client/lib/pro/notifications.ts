import type { Establishment, ProInvoice, ProNotification } from "@/lib/pro/types";

import { formatDateJjMmAa } from "@shared/datetime";

export type ProNotificationTargetTab =
  | "dashboard"
  | "establishment"
  | "reservations"
  | "qr"
  | "slots"
  | "billing"
  | "visibility"
  | "notifications"
  | "team"
  | "messages"
  | "assistance"
  | string;

export function getLocalDayWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export function getNotificationTargetTab(n: ProNotification): ProNotificationTargetTab | null {
  const data = n.data;
  if (!data || typeof data !== "object") return null;
  const tab = (data as Record<string, unknown>).targetTab;
  return typeof tab === "string" && tab.length ? tab : null;
}

export function sortNotificationsByCreatedAtDesc(items: ProNotification[]): ProNotification[] {
  return [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function filterNotificationsForDay(items: ProNotification[], now = new Date()): ProNotification[] {
  const { start, end } = getLocalDayWindow(now);
  const startMs = start.getTime();
  const endMs = end.getTime();

  return items.filter((n) => {
    const t = new Date(n.created_at).getTime();
    if (Number.isNaN(t)) return false;
    return t >= startMs && t < endMs;
  });
}

export function filterNotificationsForEstablishment(items: ProNotification[], establishmentId: string): ProNotification[] {
  return items.filter((n) => !n.establishment_id || n.establishment_id === establishmentId);
}

export function buildDemoNotificationsForToday(userId: string, establishmentId: string | null) {
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const eid = establishmentId ?? null;

  return [
    {
      created_at: iso(now - 1000 * 60 * 2),
      category: "booking",
      title: "Nouvelle réservation confirmée",
      body: "Un client a confirmé une réservation pour ce soir à 21:00 (2 personnes).",
      data: { targetTab: "reservations" },
    },
    {
      created_at: iso(now - 1000 * 60 * 10),
      category: "booking",
      title: "Pack acheté",
      body: "Un client vient d’acheter le pack “Dîner romantique”.",
      data: { targetTab: "slots" },
    },
    {
      created_at: iso(now - 1000 * 60 * 18),
      category: "messages",
      title: "Nouveau message",
      body: "Un client vous a envoyé un message : “Est-ce possible de réserver en terrasse ?”.",
      data: { targetTab: "messages" },
    },
    {
      created_at: iso(now - 1000 * 60 * 60),
      category: "visibility",
      title: "Nouvel avis",
      body: "Vous avez reçu un nouvel avis : 5★ — “Super expérience, on recommande !”.",
      data: { targetTab: "visibility" },
    },
    {
      created_at: iso(now - 1000 * 60 * 60 * 3),
      category: "booking",
      title: "Stock pack faible",
      body: "Le pack “Menu découverte” arrive à épuisement (stock restant : 2).",
      data: { targetTab: "slots" },
    },
    {
      created_at: iso(now - 1000 * 60 * 60 * 5),
      category: "booking",
      title: "Réservation annulée",
      body: "Une réservation a été annulée par le client (demain à 20:30).",
      data: { targetTab: "reservations" },
    },
  ].map((n, i) => ({
    id: `demo-today-${i + 1}`,
    user_id: userId,
    establishment_id: eid,
    read_at: null,
    ...n,
  })) satisfies ProNotification[];
}

export function buildSystemNotificationsForToday({
  userId,
  establishment,
  invoicesDue,
}: {
  userId: string;
  establishment: Establishment;
  invoicesDue: ProInvoice[];
}): ProNotification[] {
  const items: ProNotification[] = [];

  if (establishment.edit_status === "pending_modification") {
    // Use establishment.updated_at as the real date of the moderation request
    const moderationDate = establishment.updated_at ?? new Date().toISOString();
    items.push({
      id: `system-edit-status:${establishment.id}`,
      user_id: userId,
      establishment_id: establishment.id,
      category: "moderation",
      title: "Modération en cours",
      body: "Une modification de votre fiche est en cours de modération.",
      data: { targetTab: "establishment" },
      created_at: moderationDate,
      read_at: null,
    });
  }

  if (invoicesDue.length) {
    // Use the oldest invoice's due_date as the notification date
    const oldestDueDate = invoicesDue
      .map((inv) => inv.due_date)
      .filter(Boolean)
      .sort()[0] ?? new Date().toISOString();
    items.push({
      id: `system-invoices-due:${establishment.id}`,
      user_id: userId,
      establishment_id: establishment.id,
      category: "billing",
      title: "Facture en attente",
      body: `${invoicesDue.length} facture${invoicesDue.length > 1 ? "s" : ""} en attente de paiement.`,
      data: { targetTab: "billing" },
      created_at: oldestDueDate,
      read_at: null,
    });
  }

  return items;
}

export function formatRelativeTimeFr(isoTime: string, now = new Date()): string {
  const t = new Date(isoTime).getTime();
  const nowMs = now.getTime();

  if (Number.isNaN(t)) return "";

  const diff = Math.max(0, nowMs - t);
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes <= 0) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;

  return formatDateJjMmAa(isoTime);
}
