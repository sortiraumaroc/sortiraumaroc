/**
 * notificationHelpers — Logique partagée pour les notifications Admin
 *
 * Fournit le routage intelligent, la catégorisation et les styles de badges
 * utilisés par AdminNotificationsSheet, AdminNotificationsPanel et AdminTopbar.
 */

import type { AdminNotification } from "@/lib/adminApi";

// =============================================================================
// Helpers internes
// =============================================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// =============================================================================
// Catégories
// =============================================================================

export type NotificationCategory =
  | "booking"
  | "finance"
  | "visibility"
  | "review"
  | "ramadan"
  | "moderation"
  | "support"
  | "alert"
  | "system";

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  booking: "Réservation",
  finance: "Finance",
  visibility: "Visibilité",
  review: "Avis",
  ramadan: "Ramadan",
  moderation: "Modération",
  support: "Support",
  alert: "Alerte",
  system: "Système",
};

export const ALL_CATEGORIES: NotificationCategory[] = [
  "booking",
  "finance",
  "moderation",
  "support",
  "visibility",
  "review",
  "ramadan",
  "alert",
  "system",
];

// =============================================================================
// getNotificationCategory — détermine la catégorie depuis le type
// =============================================================================

export function getNotificationCategory(type: string): NotificationCategory {
  const t = type.toLowerCase();
  if (t.includes("reservation") || t.includes("booking") || t.includes("waitlist"))
    return "booking";
  if (t.includes("payment") || t.includes("payout") || t.includes("finance"))
    return "finance";
  if (t.includes("visibility")) return "visibility";
  if (t.includes("review") || t.includes("signal")) return "review";
  if (t.includes("ramadan")) return "ramadan";
  if (
    t.includes("moderation") ||
    t.includes("profile_update") ||
    t.includes("inventory_change") ||
    t.includes("inventory") ||
    t.includes("ad_campaign") ||
    t.includes("pack") ||
    t.includes("deal") ||
    t.includes("offer") ||
    t.includes("claim") ||
    t.includes("username") ||
    t.includes("revendication")
  )
    return "moderation";
  if (t.includes("message") || t.includes("support")) return "support";
  if (t.includes("fraud") || t.includes("alert")) return "alert";
  return "system";
}

// =============================================================================
// categoryBadgeClass — classes CSS pour le badge de catégorie
// =============================================================================

export function categoryBadgeClass(category: string): string {
  switch (category) {
    case "moderation":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "finance":
      return "bg-red-100 text-red-700 border-red-200";
    case "booking":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "support":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "visibility":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "review":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "alert":
      return "bg-red-100 text-red-800 border-red-300";
    case "ramadan":
      return "bg-amber-100 text-amber-800 border-amber-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

// =============================================================================
// getNotificationHref — routage intelligent vers la page admin correspondante
// =============================================================================

export function getNotificationHref(n: AdminNotification): string | null {
  const type = String(n.type ?? "").trim().toLowerCase();
  const data = asRecord(n.data) ?? {};

  const establishmentId =
    typeof data.establishmentId === "string"
      ? data.establishmentId
      : typeof data.establishment_id === "string"
        ? data.establishment_id
        : null;
  const reservationId =
    typeof data.reservationId === "string"
      ? data.reservationId
      : typeof data.reservation_id === "string"
        ? data.reservation_id
        : null;

  // Finance
  if (type.includes("finance_discrepancy")) return "/admin/finance/discrepancies";
  if (type.includes("payout")) return "/admin/finance/payouts";

  // Visibilité
  if (
    type.includes("visibility_order") ||
    type.includes("visibility-order") ||
    type.includes("visibility order") ||
    (type.includes("visibility") &&
      (type.includes("order") || type.includes("created") || type.includes("paid")))
  ) {
    return "/admin/visibility?tab=orders";
  }

  // Modération profil
  if (type.includes("profile_update")) return "/admin/moderation";

  // Inventaire
  if (type.includes("inventory_change") || type.includes("inventory")) {
    if (establishmentId)
      return `/admin/establishments/${encodeURIComponent(establishmentId)}`;
    return "/admin/inventory-moderation";
  }

  // Campagnes pub
  if (type.includes("ad_campaign")) return "/admin/ads";

  // Revendications
  if (type.includes("claim_request") || type.includes("claim-request") || type.includes("claim") || type.includes("revendication"))
    return "/admin/claim-requests";

  // Usernames
  if (type.includes("username_request") || type.includes("username")) return "/admin/usernames";

  // Paiements
  if (type.includes("payment")) return "/admin/payments";

  // Ramadan
  if (type.includes("ramadan")) return "/admin/ramadan";

  // Packs / deals / offres
  if (type.includes("pack") || type.includes("deal") || type.includes("offer"))
    return "/admin/packs-moderation";

  // Avis / signalements
  if (type.includes("review") || type.includes("signal")) return "/admin/reviews";

  // Support
  if (type.includes("support")) return "/admin/support";

  // Messages
  if (type.includes("message")) {
    if (establishmentId)
      return `/admin/establishments/${encodeURIComponent(establishmentId)}`;
    return "/admin/support";
  }

  // Réservations
  if (
    type.includes("reservation") ||
    type.includes("booking") ||
    type.includes("waitlist") ||
    type.includes("cancellation") ||
    type.includes("cancel") ||
    type.includes("change") ||
    type.includes("noshow")
  ) {
    if (reservationId && establishmentId) {
      return `/admin/reservations?establishment_id=${encodeURIComponent(establishmentId)}&search=${encodeURIComponent(reservationId)}`;
    }
    if (reservationId)
      return `/admin/reservations?search=${encodeURIComponent(reservationId)}`;
    if (establishmentId)
      return `/admin/reservations?establishment_id=${encodeURIComponent(establishmentId)}`;
    return "/admin/reservations";
  }

  // Fallback: page établissement si on a un ID
  if (establishmentId)
    return `/admin/establishments/${encodeURIComponent(establishmentId)}`;

  return null;
}
