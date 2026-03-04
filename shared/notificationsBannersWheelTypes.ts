// =============================================================================
// Notifications, Bannières, Push Marketing & Roue de la Chance — Types Partagés
// sam.ma — Février 2026
// =============================================================================

// =============================================================================
// MODULE A — NOTIFICATION ENGINE
// =============================================================================

/** Canal de notification */
export type NotificationChannel = "email" | "sms" | "push" | "in_app";

/** Statut de notification */
export type NotificationStatus = "pending" | "sent" | "delivered" | "failed" | "read";

/** Module source de la notification */
export type NotificationModule =
  | "reservation"
  | "loyalty"
  | "packs"
  | "reviews"
  | "account"
  | "system"
  | "marketing"
  | "wheel";

/** Type de destinataire */
export type RecipientType = "consumer" | "pro" | "admin";

/** Template de notification */
export interface NotificationTemplate {
  id: string;
  event_type: string;
  channel: NotificationChannel;
  lang: string;
  subject: string | null;
  body: string;
  cta_url: string | null;
  cta_label: string | null;
  variables_schema: NotificationVariableSchema[];
  is_critical: boolean;
  module: NotificationModule;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationVariableSchema {
  name: string;
  description?: string;
  required?: boolean;
}

/** Préférences de notification utilisateur */
export interface NotificationPreferences {
  user_id: string;
  user_type: "consumer" | "pro";
  email_transactional: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  reservation_reminders: boolean;
  loyalty_reminders: boolean;
  marketing_push: boolean;
  preferred_lang: string;
  /** Pro-only: enable/disable popup toast notifications in dashboard */
  pro_popups_enabled?: boolean;
  /** Pro-only: enable/disable notification sound in dashboard */
  pro_sound_enabled?: boolean;
  updated_at: string;
}

/** Catégories de préférences (pour le mapping event_type → préférence) */
export const NOTIFICATION_PREFERENCE_MAP: Record<string, keyof NotificationPreferences> = {
  // Réservation
  "reservation.created": "reservation_reminders",
  "reservation.reminder_j1": "reservation_reminders",
  "reservation.reminder_h3": "reservation_reminders",
  "reservation.cancelled": "reservation_reminders",
  "reservation.modified": "reservation_reminders",
  // Fidélité
  "loyalty.stamp_validated": "loyalty_reminders",
  "loyalty.card_completed": "loyalty_reminders",
  "loyalty.reward_expiring": "loyalty_reminders",
  "loyalty.card_expiring": "loyalty_reminders",
  "loyalty.gift_received": "loyalty_reminders",
  // Marketing
  "marketing.push_campaign": "marketing_push",
  "marketing.banner": "marketing_push",
  "wheel.daily_reminder": "marketing_push",
};

/** Événements critiques (non désactivables) */
export const CRITICAL_EVENT_TYPES: string[] = [
  "reservation.created",
  "reservation.cancelled_by_pro",
  "loyalty.card_completed",
  "loyalty.gift_received",
  "account.email_verification",
  "account.password_reset",
  "account.welcome",
  "wheel.prize_won",
];

/** Log de notification */
export interface NotificationLog {
  id: string;
  event_type: string;
  channel: NotificationChannel;
  recipient_id: string;
  recipient_type: RecipientType;
  template_id: string | null;
  subject: string | null;
  body_preview: string | null;
  status: NotificationStatus;
  provider_message_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  campaign_id: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

/** Événement de notification (input du moteur) */
export interface NotificationEvent {
  event_type: string;
  recipient_id: string;
  recipient_type: RecipientType;
  channels: NotificationChannel[];
  data: Record<string, string | number | null | undefined>;
  is_critical?: boolean;
  campaign_id?: string;
}

/** Résultat d'envoi de notification */
export interface NotificationResult {
  ok: boolean;
  channel: NotificationChannel;
  log_id?: string;
  provider_message_id?: string;
  error?: string;
}

// =============================================================================
// MODULE B — PUSH MARKETING
// =============================================================================

/** Type de campagne push */
export type PushCampaignType =
  | "nouveau_restaurant"
  | "offre"
  | "blog"
  | "video"
  | "evenement"
  | "selection"
  | "saison"
  | "update"
  | "custom";

/** Statut de campagne push */
export type PushCampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";

/** Priorité de campagne */
export type PushCampaignPriority = "normal" | "high";

/** Labels des types de campagne */
export const PUSH_CAMPAIGN_TYPES: { value: PushCampaignType; label: string; icon: string }[] = [
  { value: "nouveau_restaurant", label: "Nouveau restaurant", icon: "🍽️" },
  { value: "offre", label: "Nouvelle offre / Deal", icon: "🔥" },
  { value: "blog", label: "Nouvel article blog", icon: "📝" },
  { value: "video", label: "Nouvelle vidéo", icon: "🎬" },
  { value: "evenement", label: "Événement spécial", icon: "🎉" },
  { value: "selection", label: "Sélection / Top", icon: "⭐" },
  { value: "saison", label: "Promotion saisonnière", icon: "🌙" },
  { value: "update", label: "Mise à jour plateforme", icon: "✨" },
  { value: "custom", label: "Personnalisé", icon: "📢" },
];

/** Campagne push marketing */
export interface PushCampaign {
  id: string;
  title: string;
  message: string;
  type: PushCampaignType;
  image_url: string | null;
  cta_url: string;
  channels: string[];
  audience_type: "all" | "segment";
  audience_filters: AudienceFilters;
  audience_count: number;
  priority: PushCampaignPriority;
  status: PushCampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  stats_sent: number;
  stats_delivered: number;
  stats_opened: number;
  stats_clicked: number;
  stats_failed: number;
  stats_unsubscribed: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Livraison individuelle */
export interface PushCampaignDelivery {
  id: string;
  campaign_id: string;
  user_id: string;
  channel: string;
  status: "pending" | "sent" | "delivered" | "failed";
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  error_message: string | null;
  created_at: string;
}

// =============================================================================
// AUDIENCE & SEGMENTATION (partagé : Push, Bannières, Roue)
// =============================================================================

/** Ancienneté de l'utilisateur */
export type SeniorityTier = "new" | "regular" | "old";

/** Activité récente */
export type ActivityTier = "active" | "dormant" | "inactive";

/** Niveau de fiabilité */
export type ReliabilityTier = "high" | "medium" | "low";

/** Filtres d'audience (combinables en AND) */
export interface AudienceFilters {
  cities?: string[];
  activity_interests?: string[];
  seniority?: SeniorityTier;
  recent_activity?: ActivityTier;
  min_reservations?: number;
  max_reservations?: number;
  reliability_tier?: ReliabilityTier;
  has_loyalty_card?: boolean;
  has_purchased_pack?: boolean;
}

/** Seuils pour les tiers */
export const AUDIENCE_SENIORITY_DAYS: Record<SeniorityTier, { min: number; max: number }> = {
  new: { min: 0, max: 30 },
  regular: { min: 30, max: 180 },
  old: { min: 180, max: Infinity },
};

export const AUDIENCE_ACTIVITY_DAYS: Record<ActivityTier, { min: number; max: number }> = {
  active: { min: 0, max: 30 },
  dormant: { min: 30, max: 90 },
  inactive: { min: 90, max: Infinity },
};

/** Score de fiabilité : 0-100 en interne, affiché en 0-5 étoiles (score/20) */
export const AUDIENCE_RELIABILITY_SCORE: Record<ReliabilityTier, { min: number; max: number }> = {
  high: { min: 80, max: 100 },    // > 4.0 étoiles
  medium: { min: 60, max: 80 },   // 3.0 - 4.0 étoiles
  low: { min: 0, max: 60 },       // < 3.0 étoiles
};

// =============================================================================
// MODULE C — BANNIÈRES & POP-UPS
// =============================================================================

/** Type de bannière */
export type BannerType =
  | "image_simple"
  | "image_text"
  | "video"
  | "form"
  | "carousel"
  | "countdown";

/** Format d'affichage */
export type BannerDisplayFormat = "modal" | "bottom_sheet" | "top_banner" | "floating";

/** Animation d'entrée */
export type BannerAnimation = "fade" | "slide_up" | "slide_down" | "zoom" | "none";

/** Comportement de fermeture */
export type BannerCloseBehavior = "always_visible" | "after_delay" | "require_interaction";

/** Type de délai d'apparition */
export type BannerAppearDelayType = "immediate" | "after_seconds" | "after_scroll";

/** Déclencheur d'affichage */
export type BannerTrigger = "on_login" | "on_app_open" | "on_page" | "after_inactivity";

/** Fréquence d'affichage */
export type BannerFrequency = "once" | "daily" | "weekly" | "every_session";

/** Plateforme cible */
export type BannerPlatform = "web" | "mobile" | "both";

/** Statut de bannière */
export type BannerStatus = "draft" | "active" | "paused" | "expired" | "disabled";

/** Action de tracking bannière */
export type BannerAction = "view" | "click" | "close" | "form_submit";

/** Cible du CTA */
export type BannerCtaTarget = "same_tab" | "new_tab" | "external";

/** Labels des types de bannières */
export const BANNER_TYPES: { value: BannerType; label: string; description: string }[] = [
  { value: "image_simple", label: "Image simple", description: "Image plein écran avec bouton CTA" },
  { value: "image_text", label: "Image + texte", description: "Image avec titre et sous-titre superposés" },
  { value: "video", label: "Vidéo", description: "Vidéo courte (max 30s) en autoplay silencieux" },
  { value: "form", label: "Formulaire", description: "Formulaire intégré au pop-up" },
  { value: "carousel", label: "Carrousel", description: "Plusieurs slides dans un seul pop-up" },
  { value: "countdown", label: "Compte à rebours", description: "Timer vers un événement ou une promo" },
];

/** Slide de carrousel */
export interface CarouselSlide {
  image_url: string;
  title?: string;
  subtitle?: string;
}

/** Champ de formulaire */
export interface BannerFormField {
  label: string;
  type: "text" | "email" | "phone" | "select" | "textarea" | "checkbox";
  required: boolean;
  options?: string[];  // Pour type select
}

/** Bannière complète */
export interface Banner {
  id: string;
  internal_name: string;
  type: BannerType;
  title: string | null;
  subtitle: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_target: BannerCtaTarget;
  secondary_cta_text: string | null;
  secondary_cta_url: string | null;
  carousel_slides: CarouselSlide[] | null;
  countdown_target: string | null;
  form_fields: BannerFormField[] | null;
  form_confirmation_message: string | null;
  form_notify_email: string | null;
  display_format: BannerDisplayFormat;
  animation: BannerAnimation;
  overlay_color: string;
  overlay_opacity: number;
  close_behavior: BannerCloseBehavior;
  close_delay_seconds: number;
  appear_delay_type: BannerAppearDelayType;
  appear_delay_value: number;
  audience_type: "all" | "segment";
  audience_filters: AudienceFilters;
  trigger: BannerTrigger;
  trigger_page: string | null;
  frequency: BannerFrequency;
  start_date: string;
  end_date: string;
  priority: number;
  platform: BannerPlatform;
  status: BannerStatus;
  stats_impressions: number;
  stats_clicks: number;
  stats_closes: number;
  stats_form_submissions: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Vue/action sur une bannière */
export interface BannerView {
  id: string;
  banner_id: string;
  user_id: string | null;
  session_id: string | null;
  action: BannerAction;
  created_at: string;
}

/** Réponse formulaire bannière */
export interface BannerFormResponse {
  id: string;
  banner_id: string;
  user_id: string | null;
  responses: Record<string, unknown>;
  created_at: string;
}

/** Stats d'une bannière */
export interface BannerStats {
  impressions: number;
  clicks: number;
  closes: number;
  form_submissions: number;
  ctr: number;  // clicks / impressions
}

// =============================================================================
// MODULE D — ROUE DE LA CHANCE
// =============================================================================

/** Statut de l'événement Roue */
export type WheelEventStatus = "draft" | "active" | "paused" | "ended";

/** Type de lot */
export type WheelPrizeType =
  | "physical_gift"
  | "percentage_discount"
  | "fixed_discount"
  | "free_service"
  | "external_code"
  | "points"
  | "retry"
  | "nothing";

/** Résultat de spin */
export type SpinResult = "won" | "lost";

/** Source de distribution platform_gift */
export type PlatformGiftSource =
  | "admin_manual"
  | "criteria_based"
  | "first_come"
  | "wheel_of_fortune";

/** Labels des types de lots */
export const WHEEL_PRIZE_TYPES: { value: WheelPrizeType; label: string; isWin: boolean }[] = [
  { value: "physical_gift", label: "Cadeau physique", isWin: true },
  { value: "percentage_discount", label: "Réduction %", isWin: true },
  { value: "fixed_discount", label: "Réduction fixe", isWin: true },
  { value: "free_service", label: "Service offert", isWin: true },
  { value: "external_code", label: "Code externe", isWin: true },
  { value: "points", label: "Points", isWin: true },
  { value: "retry", label: "Réessayez demain", isWin: false },
  { value: "nothing", label: "Pas de chance", isWin: false },
];

/** Thème visuel de la roue */
export interface WheelTheme {
  background_image?: string;
  primary_color?: string;
  secondary_color?: string;
  particle_type?: "confetti" | "lanterns" | "stars" | "none";
  sound_enabled?: boolean;
}

/** Événement Roue de la Chance */
export interface WheelEvent {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  spins_per_day: number;
  eligibility: "all" | "segment";
  eligibility_filters: AudienceFilters;
  welcome_message: string;
  already_played_message: string;
  theme: WheelTheme;
  status: WheelEventStatus;
  stats_total_spins: number;
  stats_total_wins: number;
  stats_total_losses: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Lot/segment de la roue */
export interface WheelPrize {
  id: string;
  wheel_event_id: string;
  name: string;
  description: string | null;
  type: WheelPrizeType;
  establishment_id: string | null;
  value: number | null;
  value_currency: string;
  total_quantity: number;
  remaining_quantity: number;
  probability: number;
  substitute_prize_id: string | null;
  segment_color: string;
  segment_icon: string | null;
  gift_validity_days: number;
  conditions: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Code externe partenaire */
export interface WheelExternalCode {
  id: string;
  prize_id: string;
  code: string;
  partner_name: string;
  partner_url: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  created_at: string;
}

/** Spin (tentative de jeu) */
export interface WheelSpin {
  id: string;
  wheel_event_id: string;
  user_id: string;
  spin_token: string;
  result: SpinResult;
  prize_id: string | null;
  prize_name: string | null;
  prize_type: string | null;
  gift_distribution_id: string | null;
  external_code_id: string | null;
  segment_index: number;
  device_id: string | null;
  ip_address: string | null;
  created_at: string;
}

/** Résultat d'un spin côté client (ce que le serveur renvoie) */
export interface SpinResponse {
  ok: boolean;
  result: SpinResult;
  segment_index: number;
  prize?: {
    name: string;
    type: WheelPrizeType;
    description: string | null;
    establishment_name?: string;
    value?: number;
    expires_at?: string;
    external_code?: string;
    partner_name?: string;
    partner_url?: string;
  };
  gift_distribution_id?: string;
  next_spin_at?: string;  // ISO date du prochain spin autorisé
  error?: string;
}

/** Stats de la roue pour le dashboard admin */
export interface WheelStats {
  total_spins: number;
  total_spins_today: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  participation_rate: number;
  prizes: {
    id: string;
    name: string;
    type: WheelPrizeType;
    total_quantity: number;
    remaining_quantity: number;
    wins_count: number;
    consumed_count: number;
    consumption_rate: number;
  }[];
}

/** Récap quotidien pour email admin */
export interface WheelDailyRecap {
  date: string;
  spins_count: number;
  wins_count: number;
  losses_count: number;
  prizes_awarded: { name: string; type: string; count: number }[];
  depleted_prizes: string[];
  low_stock_prizes: { name: string; remaining: number }[];
}

// =============================================================================
// CONSTANTES & LIMITES
// =============================================================================

/** Limites de caractères */
export const LIMITS = {
  // Push campaigns
  CAMPAIGN_TITLE_MAX: 60,
  CAMPAIGN_MESSAGE_MAX_PUSH: 200,
  CAMPAIGN_IMAGE_MAX_MB: 2,

  // Banners
  BANNER_TITLE_MAX: 80,
  BANNER_SUBTITLE_MAX: 150,
  BANNER_CTA_TEXT_MAX: 50,
  BANNER_INTERNAL_NAME_MAX: 200,
  BANNER_VIDEO_MAX_SECONDS: 30,
  BANNER_PRIORITY_MIN: 1,
  BANNER_PRIORITY_MAX: 10,

  // Wheel
  WHEEL_PRIZE_NAME_MAX: 100,
  WHEEL_EVENT_NAME_MAX: 200,
  WHEEL_MAX_SPINS_PER_DAY: 10,

  // Quiet hours (Morocco GMT+1)
  PUSH_QUIET_HOUR_START: 21,  // 21h00
  PUSH_QUIET_HOUR_END: 9,     // 09h00
  MAX_PUSH_PER_DAY_PER_USER: 1,
} as const;
