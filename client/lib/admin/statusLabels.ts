/**
 * Labels français pour les statuts utilisés dans l'admin.
 * Les valeurs techniques (clés) restent en anglais pour la compatibilité avec l'API.
 */

// Statuts de réservation
export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  requested: "En attente",
  pending_pro_validation: "Validation pro",
  confirmed: "Confirmée",
  refused: "Refusée",
  waitlist: "Liste d'attente",
  cancelled: "Annulée",
  cancelled_user: "Annulée (client)",
  cancelled_pro: "Annulée (pro)",
  noshow: "No-show",
  unknown: "Inconnu",
};

// Statuts de paiement
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  refunded: "Remboursé",
  partially_refunded: "Partiellement remboursé",
  failed: "Échoué",
  unknown: "Inconnu",
};

// Statuts d'établissement
export const ESTABLISHMENT_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  pending: "En attente",
  disabled: "Suspendu",
  rejected: "Rejeté",
  draft: "Brouillon",
};

// Statuts de payout
export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  approved: "Approuvé",
  rejected: "Rejeté",
  paid: "Payé",
  sent: "Envoyé",
  failed: "Échoué",
  cancelled: "Annulé",
};

// Statuts de discrepancy (anomalies financières)
export const DISCREPANCY_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  acknowledged: "Reconnu",
  resolved: "Résolu",
};

// Sévérité
export const SEVERITY_LABELS: Record<string, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

// Statuts de livraison (visibilité)
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  delivered: "Livré",
  cancelled: "Annulé",
  refunded: "Remboursé",
};

// Statuts de ticket support
export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  pending: "En attente",
  resolved: "Résolu",
  closed: "Fermé",
};

// Statuts de commande/facture
export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  rejected: "Rejeté",
  paid: "Payé",
  cancelled: "Annulé",
  pending: "En attente",
  completed: "Terminé",
};

// Statuts d'email
export const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  sent: "Envoyé",
  delivered: "Délivré",
  opened: "Ouvert",
  clicked: "Cliqué",
  bounced: "Rebondi",
  failed: "Échoué",
};

// Statuts de pack/offre
export const PACK_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  expired: "Expiré",
  consumed: "Consommé",
  partially_consumed: "Partiellement consommé",
};

// Fonction utilitaire pour obtenir le label d'un statut
export function getStatusLabel(
  status: string | null | undefined,
  labels: Record<string, string>,
  fallback?: string
): string {
  if (!status) return fallback ?? "—";
  return labels[status.toLowerCase()] ?? status;
}

// Fonction pour formatter un statut de réservation
export function formatReservationStatus(status: string | null | undefined): string {
  return getStatusLabel(status, RESERVATION_STATUS_LABELS);
}

// Fonction pour formatter un statut de paiement
export function formatPaymentStatus(status: string | null | undefined): string {
  return getStatusLabel(status, PAYMENT_STATUS_LABELS);
}

// Fonction pour formatter un statut d'établissement
export function formatEstablishmentStatus(status: string | null | undefined): string {
  return getStatusLabel(status, ESTABLISHMENT_STATUS_LABELS);
}

// Fonction pour formatter un statut de payout
export function formatPayoutStatus(status: string | null | undefined): string {
  return getStatusLabel(status, PAYOUT_STATUS_LABELS);
}

// Fonction pour formatter un statut de discrepancy
export function formatDiscrepancyStatus(status: string | null | undefined): string {
  return getStatusLabel(status, DISCREPANCY_STATUS_LABELS);
}

// Fonction pour formatter une sévérité
export function formatSeverity(severity: string | null | undefined): string {
  return getStatusLabel(severity, SEVERITY_LABELS);
}

// Fonction pour formatter un statut de livraison
export function formatDeliveryStatus(status: string | null | undefined): string {
  return getStatusLabel(status, DELIVERY_STATUS_LABELS);
}
