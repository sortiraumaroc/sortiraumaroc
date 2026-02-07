// =============================================================================
// SAM LOYALTY SYSTEM - Types TypeScript
// =============================================================================

// Design de la carte
export type CardDesignStyle = "solid" | "gradient" | "pastel" | "neon";

export type CardDesign = {
  style: CardDesignStyle;
  primary_color: string;
  secondary_color?: string;
  stamp_icon: string; // lucide icon name: coffee, pizza, scissors, star, heart, etc.
  logo_url?: string | null;
};

// Règles de bonus
export type BonusRules = {
  birthday_bonus: boolean;
  birthday_multiplier: number;
  happy_hour_bonus: boolean;
  happy_hour_start: string; // "14:00"
  happy_hour_end: string; // "17:00"
  happy_hour_multiplier: number;
  sam_booking_bonus: boolean;
  sam_booking_extra_stamps: number;
};

// Type de récompense
export type RewardType = "free_item" | "discount_percent" | "discount_fixed" | "custom";

// =============================================================================
// PROGRAMME DE FIDÉLITÉ
// =============================================================================

export type LoyaltyProgram = {
  id: string;
  establishment_id: string;
  name: string;
  description: string | null;
  stamps_required: number;
  reward_type: RewardType;
  reward_value: string | null;
  reward_description: string;
  reward_validity_days: number;
  conditions: string | null;
  card_design: CardDesign;
  bonus_rules: BonusRules;
  stamps_expire_after_days: number | null;
  warn_expiration_days: number;
  allow_retroactive_stamps: boolean;
  retroactive_from_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LoyaltyProgramCreate = {
  name: string;
  description?: string | null;
  stamps_required: number;
  reward_type: RewardType;
  reward_value?: string | null;
  reward_description: string;
  reward_validity_days?: number;
  conditions?: string | null;
  card_design?: Partial<CardDesign>;
  bonus_rules?: Partial<BonusRules>;
  stamps_expire_after_days?: number | null;
  warn_expiration_days?: number;
  allow_retroactive_stamps?: boolean;
  retroactive_from_date?: string | null;
};

export type LoyaltyProgramUpdate = Partial<LoyaltyProgramCreate> & {
  is_active?: boolean;
};

// =============================================================================
// CARTE DE FIDÉLITÉ
// =============================================================================

export type LoyaltyCardStatus = "active" | "completed" | "reward_pending" | "reward_used" | "expired";

export type LoyaltyCard = {
  id: string;
  user_id: string;
  program_id: string;
  establishment_id: string;
  stamps_count: number;
  status: LoyaltyCardStatus;
  cycle_number: number;
  completed_at: string | null;
  last_stamp_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations enrichies
  program?: LoyaltyProgram;
  establishment?: {
    id: string;
    name: string;
    slug: string | null;
    cover_url: string | null;
    city: string | null;
  };
  stamps?: LoyaltyStamp[];
  active_reward?: LoyaltyReward | null;
};

// Carte avec infos complètes pour affichage
export type LoyaltyCardFull = LoyaltyCard & {
  program: LoyaltyProgram;
  establishment: {
    id: string;
    name: string;
    slug: string | null;
    cover_url: string | null;
    city: string | null;
  };
  stamps: LoyaltyStamp[];
  active_reward: LoyaltyReward | null;
};

// =============================================================================
// TAMPONS
// =============================================================================

export type StampType = "regular" | "bonus" | "birthday" | "happy_hour" | "sam_booking" | "retroactive" | "manual";
export type StampSource = "scan" | "reservation" | "manual" | "retroactive" | "offline_sync";

export type LoyaltyStamp = {
  id: string;
  card_id: string;
  user_id: string;
  program_id: string;
  establishment_id: string;
  stamp_number: number;
  stamp_type: StampType;
  stamped_by_user_id: string | null;
  stamped_by_name: string | null;
  source: StampSource;
  reservation_id: string | null;
  offline_id: string | null;
  synced_at: string | null;
  notes: string | null;
  created_at: string;
};

export type StampCreate = {
  user_id: string;
  program_id: string;
  stamp_type?: StampType;
  source?: StampSource;
  reservation_id?: string | null;
  offline_id?: string | null;
  notes?: string | null;
};

// =============================================================================
// RÉCOMPENSES
// =============================================================================

export type RewardStatus = "active" | "used" | "expired" | "cancelled";

export type LoyaltyReward = {
  id: string;
  card_id: string;
  user_id: string;
  program_id: string;
  establishment_id: string;
  reward_code: string;
  reward_type: RewardType;
  reward_value: string | null;
  reward_description: string;
  conditions: string | null;
  status: RewardStatus;
  expires_at: string;
  used_at: string | null;
  used_by_pro_user_id: string | null;
  used_by_pro_name: string | null;
  created_at: string;
  // Relations
  program?: LoyaltyProgram;
  establishment?: {
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
  };
};

// =============================================================================
// STATISTIQUES PRO
// =============================================================================

export type LoyaltyProgramStats = {
  program_id: string;
  establishment_id: string;
  program_name: string;
  stamps_required: number;
  active_cards: number;
  completed_cards: number;
  pending_rewards: number;
  used_rewards: number;
  redemption_rate: number;
  unique_members: number;
  avg_stamps_active: number;
  last_activity: string | null;
};

// Stats détaillées pour dashboard
export type LoyaltyDashboardStats = {
  programs: LoyaltyProgramStats[];
  total_active_cards: number;
  total_rewards_pending: number;
  total_rewards_used_this_month: number;
  top_members: {
    user_id: string;
    full_name: string;
    total_stamps: number;
    total_rewards: number;
    last_visit: string;
  }[];
  recent_activity: {
    type: "stamp" | "reward_created" | "reward_used";
    user_name: string;
    program_name: string;
    timestamp: string;
  }[];
};

// =============================================================================
// MEMBRES FIDÈLES (Vue Pro)
// =============================================================================

export type LoyaltyMember = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cards: {
    program_id: string;
    program_name: string;
    stamps_count: number;
    stamps_required: number;
    status: LoyaltyCardStatus;
    last_stamp_at: string | null;
    has_pending_reward: boolean;
  }[];
  total_stamps: number;
  total_rewards_earned: number;
  total_rewards_used: number;
  first_visit: string;
  last_visit: string;
  tier?: "bronze" | "silver" | "gold" | "diamond";
};

// =============================================================================
// DESIGN PRESETS
// =============================================================================

export const CARD_DESIGN_PRESETS = {
  // Pastels
  pastel_blue: { style: "pastel" as const, primary_color: "#93c5fd", secondary_color: "#bfdbfe" },
  pastel_pink: { style: "pastel" as const, primary_color: "#f9a8d4", secondary_color: "#fbcfe8" },
  pastel_green: { style: "pastel" as const, primary_color: "#86efac", secondary_color: "#bbf7d0" },
  pastel_yellow: { style: "pastel" as const, primary_color: "#fde047", secondary_color: "#fef08a" },
  pastel_purple: { style: "pastel" as const, primary_color: "#c4b5fd", secondary_color: "#ddd6fe" },

  // Gradients modernes
  gradient_indigo: { style: "gradient" as const, primary_color: "#6366f1", secondary_color: "#8b5cf6" },
  gradient_cyan: { style: "gradient" as const, primary_color: "#06b6d4", secondary_color: "#0ea5e9" },
  gradient_rose: { style: "gradient" as const, primary_color: "#f43f5e", secondary_color: "#ec4899" },
  gradient_amber: { style: "gradient" as const, primary_color: "#f59e0b", secondary_color: "#ef4444" },
  gradient_emerald: { style: "gradient" as const, primary_color: "#10b981", secondary_color: "#14b8a6" },

  // Néon
  neon_pink: { style: "neon" as const, primary_color: "#ff00ff", secondary_color: "#ff69b4" },
  neon_blue: { style: "neon" as const, primary_color: "#00ffff", secondary_color: "#00bfff" },
  neon_green: { style: "neon" as const, primary_color: "#39ff14", secondary_color: "#00ff00" },
  neon_orange: { style: "neon" as const, primary_color: "#ff6600", secondary_color: "#ff9933" },

  // Solides
  solid_black: { style: "solid" as const, primary_color: "#1f2937", secondary_color: "#1f2937" },
  solid_white: { style: "solid" as const, primary_color: "#ffffff", secondary_color: "#f3f4f6" },
  solid_navy: { style: "solid" as const, primary_color: "#1e3a5f", secondary_color: "#1e3a5f" },
  solid_burgundy: { style: "solid" as const, primary_color: "#722f37", secondary_color: "#722f37" },
};

// Icônes de tampons disponibles
export const STAMP_ICONS = [
  "coffee", "pizza", "utensils", "wine", "beer", "cake", "ice-cream", "cookie",
  "scissors", "sparkles", "star", "heart", "crown", "gem", "gift", "award",
  "zap", "flame", "sun", "moon", "music", "gamepad-2", "dumbbell", "bike",
  "car", "plane", "palmtree", "flower", "leaf", "paw-print", "baby", "shirt",
] as const;

export type StampIconType = typeof STAMP_ICONS[number];

// =============================================================================
// API RESPONSES
// =============================================================================

export type LoyaltyProgramsResponse = {
  ok: true;
  programs: LoyaltyProgram[];
};

export type LoyaltyCardsResponse = {
  ok: true;
  cards: LoyaltyCardFull[];
};

export type LoyaltyStampResponse = {
  ok: true;
  card: LoyaltyCard;
  stamp: LoyaltyStamp;
  reward_unlocked: boolean;
  reward?: LoyaltyReward;
  message: string;
};

export type LoyaltyRewardRedeemResponse = {
  ok: true;
  reward: LoyaltyReward;
  new_card?: LoyaltyCard; // nouvelle carte si cycle suivant
  message: string;
};

export type LoyaltyMembersResponse = {
  ok: true;
  members: LoyaltyMember[];
  total: number;
  page: number;
  per_page: number;
};

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export type LoyaltyNotificationType =
  | "welcome"
  | "stamp_added"
  | "halfway"
  | "almost_complete"
  | "card_complete"
  | "reward_ready"
  | "reward_expiring_soon"
  | "reward_expired"
  | "stamps_expiring_soon"
  | "stamps_expired"
  | "inactive_reminder";

export type LoyaltyNotification = {
  id: string;
  user_id: string;
  card_id: string | null;
  reward_id: string | null;
  notification_type: LoyaltyNotificationType;
  channel: "email" | "push" | "sms";
  status: "pending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};
