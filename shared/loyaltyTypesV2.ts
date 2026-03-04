// =============================================================================
// SAM LOYALTY SYSTEM V2 — Types Partagés
// Extension du système de fidélité : tampons conditionnels, cadeaux sam.ma,
// alertes anti-fraude, personnalisation visuelle étendue
// =============================================================================

// =============================================================================
// EXTENSIONS DES TYPES EXISTANTS
// =============================================================================

/** Fréquence de tamponnage */
export type StampFrequency = "once_per_day" | "once_per_week" | "unlimited";

/** Couleur du texte sur la carte */
export type CardTextColor = "light" | "dark" | "auto";

/** Statut du programme (remplace is_active simple) */
export type LoyaltyProgramStatus = "active" | "inactive" | "suspended";

/** Statut de carte V2 (ajoute 'frozen') */
export type LoyaltyCardStatusV2 =
  | "active"
  | "completed"
  | "reward_pending"
  | "reward_used"
  | "expired"
  | "frozen";

/** Type de tampon V2 (ajoute 'conditional_validated') */
export type StampTypeV2 =
  | "regular"
  | "bonus"
  | "birthday"
  | "happy_hour"
  | "sam_booking"
  | "retroactive"
  | "manual"
  | "conditional_validated";

// =============================================================================
// CHAMPS V2 DU PROGRAMME DE FIDÉLITÉ
// =============================================================================

/** Champs V2 ajoutés à loyalty_programs */
export type LoyaltyProgramV2Fields = {
  // Fréquence de tamponnage
  stamp_frequency: StampFrequency;
  stamp_requires_reservation: boolean;

  // Tampon conditionnel
  stamp_conditional: boolean;
  stamp_minimum_amount: number | null;
  stamp_minimum_currency: string;

  // Validité carte
  card_validity_days: number | null;
  is_renewable: boolean;

  // Personnalisation visuelle étendue
  card_background_image: string | null;
  card_background_opacity: number;
  card_logo: string | null;
  card_text_color: CardTextColor;
  card_stamp_filled_color: string | null;
  card_stamp_empty_color: string;
  card_stamp_custom_icon: string | null;

  // Statut programme
  status: LoyaltyProgramStatus;
  suspended_by: string | null;
  suspended_reason: string | null;
  suspended_at: string | null;
};

// =============================================================================
// CHAMPS V2 DE LA CARTE CLIENT
// =============================================================================

/** Champs V2 ajoutés à loyalty_cards */
export type LoyaltyCardV2Fields = {
  // Copie des infos récompense
  reward_description: string | null;
  reward_type: string | null;
  reward_value: string | null;

  // Dates récompense
  reward_expires_at: string | null;
  reward_claimed_at: string | null;

  // Token QR
  qr_reward_token: string | null;

  // Carte précédente
  previous_card_id: string | null;

  // Premier tampon
  started_at: string | null;

  // Copie stamps_required
  stamps_required: number | null;
};

// =============================================================================
// CHAMPS V2 DU TAMPON
// =============================================================================

/** Champs V2 ajoutés à loyalty_stamps */
export type LoyaltyStampV2Fields = {
  amount_spent: number | null;
};

// =============================================================================
// CADEAUX SAM.MA (PlatformGift)
// =============================================================================

/** Type de cadeau sam.ma */
export type PlatformGiftType =
  | "free_meal"
  | "free_service"
  | "percentage_discount"
  | "fixed_discount";

/** Statut d'un cadeau sam.ma */
export type PlatformGiftStatus =
  | "offered"
  | "approved"
  | "partially_distributed"
  | "fully_distributed"
  | "expired"
  | "rejected";

/** Cadeau offert par un pro à sam.ma */
export type PlatformGift = {
  id: string;
  establishment_id: string;
  offered_by: string;

  gift_type: PlatformGiftType;
  description: string;
  value: number;
  value_currency: string;

  total_quantity: number;
  distributed_count: number;
  consumed_count: number;

  conditions: string | null;
  validity_start: string;
  validity_end: string;

  status: PlatformGiftStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;

  created_at: string;
  updated_at: string;

  // Relations enrichies
  establishment?: {
    id: string;
    name: string;
    slug: string | null;
    logo_url: string | null;
    city: string | null;
  };
};

/** Création d'un cadeau sam.ma par le pro */
export type PlatformGiftCreate = {
  gift_type: PlatformGiftType;
  description: string;
  value: number;
  total_quantity: number;
  conditions?: string | null;
  validity_start: string;
  validity_end: string;
};

/** Stock restant calculé */
export function getPlatformGiftRemaining(gift: PlatformGift): number {
  return gift.total_quantity - gift.distributed_count;
}

// =============================================================================
// DISTRIBUTION DE CADEAUX SAM.MA
// =============================================================================

/** Mode de distribution */
export type DistributionMethod = "manual" | "criteria_based" | "first_come";

/** Statut d'une distribution */
export type PlatformGiftDistributionStatus = "distributed" | "consumed" | "expired";

/** Distribution individuelle d'un cadeau à un client */
export type PlatformGiftDistribution = {
  id: string;
  platform_gift_id: string;
  user_id: string;

  distribution_method: DistributionMethod;
  distributed_by: string | null;

  qr_gift_token: string;

  status: PlatformGiftDistributionStatus;
  distributed_at: string;
  consumed_at: string | null;
  consumed_scanned_by: string | null;
  expires_at: string;

  created_at: string;

  // Relations enrichies
  gift?: PlatformGift;
};

/** Critères pour distribution automatique */
export type DistributionCriteria = {
  city?: string;
  min_reservations?: number;
  min_score?: number;
  inactive_days?: number;
  max_recipients?: number;
};

// =============================================================================
// ALERTES ANTI-FRAUDE
// =============================================================================

/** Type d'alerte */
export type LoyaltyAlertType =
  | "suspicious_stamping"
  | "high_value_reward"
  | "abnormal_frequency"
  | "program_created"
  | "suspicious_amount_pattern";

/** Statut d'alerte */
export type LoyaltyAlertStatus = "pending" | "reviewed" | "dismissed";

/** Alerte anti-fraude */
export type LoyaltyAlert = {
  id: string;
  alert_type: LoyaltyAlertType;
  establishment_id: string;
  user_id: string | null;
  program_id: string | null;

  details: string;
  metadata: Record<string, unknown>;

  status: LoyaltyAlertStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;

  created_at: string;

  // Relations enrichies
  establishment?: {
    id: string;
    name: string;
  };
};

// =============================================================================
// CONSTANTES V2
// =============================================================================

/** Seuils anti-fraude configurables */
export const LOYALTY_FRAUD_THRESHOLDS = {
  /** Nombre max de tampons en X jours avant alerte suspicious_stamping */
  max_stamps_in_period: 5,
  /** Période en jours pour le seuil ci-dessus */
  suspicious_period_days: 3,

  /** Montant min de cadeau pour déclencher high_value_reward (en Dhs) */
  high_value_reward_threshold: 1000,

  /** Nombre de tampons sans réservation avant alerte abnormal_frequency */
  stamps_without_reservation_threshold: 20,

  /** Tolérance en % pour suspicious_amount_pattern (saisie pile le minimum) */
  amount_pattern_tolerance_percent: 5,
  /** Nombre min de tampons pour analyser le pattern */
  amount_pattern_min_samples: 5,
} as const;

/** Contribution fidélité au scoring client */
export const LOYALTY_SCORING = {
  /** Points ajoutés au score par tampon validé */
  points_per_stamp: 0.1,
  /** Plafond max de points via la fidélité */
  max_loyalty_points: 2,
} as const;

/** Valeurs par défaut des programmes */
export const LOYALTY_DEFAULTS = {
  stamps_required: 10,
  card_validity_days: 365,
  reward_validity_days: 30,
  stamp_frequency: "once_per_day" as StampFrequency,
  card_background_opacity: 0.3,
  card_text_color: "auto" as CardTextColor,
  card_stamp_empty_color: "#d1d5db",
  stamp_minimum_currency: "MAD",
} as const;

// =============================================================================
// TYPES POUR LES RÉPONSES API V2
// =============================================================================

/** Réponse du scan QR enrichie (tout en un) */
export type ScanLoyaltyResult = {
  /** Cartes de fidélité actives */
  cards: Array<{
    card_id: string;
    program_name: string;
    stamps_collected: number;
    stamps_required: number;
    status: LoyaltyCardStatusV2;
    is_conditional: boolean;
    minimum_amount: number | null;
  }>;
  /** Récompenses fidélité à consommer */
  loyalty_rewards: Array<{
    reward_id: string;
    card_id: string;
    description: string;
    reward_type: string;
    reward_value: string | null;
    expires_at: string;
  }>;
  /** Cadeaux sam.ma à consommer */
  platform_gifts: Array<{
    distribution_id: string;
    gift_description: string;
    gift_type: PlatformGiftType;
    gift_value: number;
    establishment_name: string;
    expires_at: string;
  }>;
  /** Résultat du tampon auto (si programme non conditionnel) */
  auto_stamp_result?: {
    success: boolean;
    card_id: string;
    stamp_number: number;
    stamps_remaining: number;
    message: string;
    reward_unlocked: boolean;
  } | null;
};

/** Résultat du tampon conditionnel */
export type ConditionalStampResult = {
  ok: boolean;
  approved: boolean;
  card_id: string;
  stamp_number?: number;
  stamps_remaining?: number;
  amount_spent: number;
  minimum_required: number;
  message: string;
  reward_unlocked?: boolean;
};

/** Stats admin globales fidélité */
export type LoyaltyAdminStats = {
  total_programs_active: number;
  total_cards_in_progress: number;
  total_cards_completed: number;
  total_rewards_consumed: number;
  avg_completion_rate: number;
  total_platform_gifts_offered: number;
  total_platform_gifts_distributed: number;
  total_platform_gifts_consumed: number;
  total_alerts_pending: number;
};

/** Stats cadeaux sam.ma */
export type PlatformGiftsStats = {
  total_offered: number;
  total_approved: number;
  total_distributed: number;
  total_consumed: number;
  total_expired: number;
  total_value_distributed: number;
  total_value_consumed: number;
};
