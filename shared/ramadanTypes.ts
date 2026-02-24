/**
 * Ramadan 2026 Module — Types partagés client/serveur
 *
 * Suit le même pattern que shared/packsBillingTypes.ts :
 *   - Statuts de modération + machine à états
 *   - Interface RamadanOfferRow (1:1 avec la table SQL)
 *   - Interface RamadanQrScanRow
 */

// =============================================================================
// 1. Types d'offre Ramadan
// =============================================================================

export type RamadanOfferType =
  | "ftour"
  | "shour"
  | "traiteur"
  | "pack_famille"
  | "special";

export const RAMADAN_OFFER_TYPE_LABELS: Record<RamadanOfferType, string> = {
  ftour: "Ftour",
  shour: "S'hour",
  traiteur: "Traiteur",
  pack_famille: "Pack Famille",
  special: "Spécial Ramadan",
};

// =============================================================================
// 2. Statuts de modération
// =============================================================================

export type RamadanOfferModerationStatus =
  | "draft"
  | "pending_moderation"
  | "approved"
  | "rejected"
  | "modification_requested"
  | "active"
  | "expired"
  | "suspended";

/** Statuts visibles par les consommateurs */
export const RAMADAN_OFFER_VISIBLE_STATUSES: RamadanOfferModerationStatus[] = [
  "active",
];

/** Statuts permettant au pro de modifier l'offre */
export const RAMADAN_OFFER_EDITABLE_STATUSES: RamadanOfferModerationStatus[] = [
  "draft",
  "modification_requested",
  "rejected",
];

/** Machine à états : transitions valides */
export const RAMADAN_OFFER_MODERATION_TRANSITIONS: Record<
  RamadanOfferModerationStatus,
  RamadanOfferModerationStatus[]
> = {
  draft: ["pending_moderation"],
  pending_moderation: ["approved", "modification_requested", "rejected"],
  modification_requested: ["pending_moderation"],
  approved: ["active"],
  active: ["suspended", "expired"],
  suspended: ["active", "expired"],
  expired: [], // terminal
  rejected: ["draft"], // le pro peut retravailler et resoumettre
};

/** Labels pour l'affichage des statuts */
export const RAMADAN_OFFER_STATUS_LABELS: Record<RamadanOfferModerationStatus, string> = {
  draft: "Brouillon",
  pending_moderation: "En attente de modération",
  approved: "Approuvée",
  rejected: "Rejetée",
  modification_requested: "Modification demandée",
  active: "Active",
  expired: "Expirée",
  suspended: "Suspendue",
};

// =============================================================================
// 3. Créneau horaire
// =============================================================================

export interface RamadanOfferTimeSlot {
  start: string; // "18:30"
  end: string;   // "20:00"
  label: string; // "Ftour", "S'hour", etc.
}

// =============================================================================
// 4. Interface RamadanOfferRow (1:1 avec la table SQL)
// =============================================================================

export interface RamadanOfferRow {
  id: string;
  establishment_id: string;
  creator_id: string;

  // Contenu
  title: string;
  description_fr: string | null;
  description_ar: string | null;

  // Type
  type: RamadanOfferType;

  // Tarification (centimes)
  price: number;
  original_price: number | null;
  currency: string;

  // Capacité & créneaux
  capacity_per_slot: number;
  slot_interval_minutes: number; // 15, 30, 45, 60, 90, 120
  time_slots: RamadanOfferTimeSlot[];

  // Médias
  photos: string[];
  cover_url: string | null;

  // Conditions
  conditions_fr: string | null;
  conditions_ar: string | null;

  // Modération
  moderation_status: RamadanOfferModerationStatus;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
  rejection_reason: string | null;

  // Validité
  valid_from: string; // "YYYY-MM-DD"
  valid_to: string;

  // Mise en avant
  is_featured: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 5. Interface RamadanQrScanRow
// =============================================================================

export type RamadanQrScanStatus = "valid" | "already_used" | "expired" | "invalid";

export interface RamadanQrScanRow {
  id: string;
  reservation_id: string;
  ramadan_offer_id: string | null;
  scanned_by: string;
  scanned_at: string;
  location: { lat: number; lng: number } | null;
  scan_status: RamadanQrScanStatus;
}

// =============================================================================
// 6. Input types pour la création/modification
// =============================================================================

export interface CreateRamadanOfferInput {
  establishmentId: string;
  title: string;
  descriptionFr?: string | null;
  descriptionAr?: string | null;
  type: RamadanOfferType;
  price: number; // centimes
  originalPrice?: number | null;
  capacityPerSlot?: number;
  slotIntervalMinutes?: number; // 15, 30, 45, 60, 90, 120 — default 30
  timeSlots: RamadanOfferTimeSlot[];
  photos?: string[];
  coverUrl?: string | null;
  conditionsFr?: string | null;
  conditionsAr?: string | null;
  validFrom: string; // "YYYY-MM-DD"
  validTo: string;
}

export interface UpdateRamadanOfferInput {
  title?: string;
  descriptionFr?: string | null;
  descriptionAr?: string | null;
  type?: RamadanOfferType;
  price?: number;
  originalPrice?: number | null;
  capacityPerSlot?: number;
  slotIntervalMinutes?: number;
  timeSlots?: RamadanOfferTimeSlot[];
  photos?: string[];
  coverUrl?: string | null;
  conditionsFr?: string | null;
  conditionsAr?: string | null;
  validFrom?: string;
  validTo?: string;
}

/** Champs significatifs qui nécessitent une re-modération si modifiés sur une offre active */
export const RAMADAN_OFFER_SIGNIFICANT_FIELDS = new Set([
  "title",
  "price",
  "originalPrice",
  "type",
  "coverUrl",
  "photos",
  "descriptionFr",
  "timeSlots",
  "capacityPerSlot",
]);

// =============================================================================
// 7. Seuil devis
// =============================================================================

/** Au-delà de ce nombre de personnes, le flux passe en "devis" */
export const RAMADAN_DEVIS_THRESHOLD = 15;

// =============================================================================
// 8. Helper : calcul du pourcentage de réduction
// =============================================================================

export function calculateRamadanDiscount(originalPrice: number, price: number): number {
  if (originalPrice <= 0 || price >= originalPrice) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}
