/**
 * Types pour le système publicitaire Sortir Au Maroc
 */

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

export const AD_CAMPAIGN_TYPES = [
  'sponsored_results',   // Résultats sponsorisés dans la recherche
  'featured_pack',       // Pack mise en avant (sections aléatoires home)
  'home_takeover',       // Habillage homepage
  'push_notification',   // Push notifications
  'email_campaign',      // Campagnes emailing
] as const;

export type AdCampaignType = typeof AD_CAMPAIGN_TYPES[number];

export const AD_CAMPAIGN_STATUSES = [
  'draft',       // Brouillon, pas encore soumis
  'active',      // En cours de diffusion
  'paused',      // Mis en pause par l'annonceur
  'completed',   // Terminé (dates ou budget)
  'cancelled',   // Annulé
] as const;

export type AdCampaignStatus = typeof AD_CAMPAIGN_STATUSES[number];

export const AD_MODERATION_STATUSES = [
  'draft',              // Pas encore soumis
  'pending_review',     // En attente de modération
  'approved',           // Approuvé par admin
  'rejected',           // Rejeté par admin
  'changes_requested',  // Modifications demandées
] as const;

export type AdModerationStatus = typeof AD_MODERATION_STATUSES[number];

export const AD_BILLING_MODELS = [
  'cpc',  // Coût par clic
  'cpm',  // Coût par 1000 impressions
  'cpd',  // Coût par jour (home takeover)
  'cpu',  // Coût par unité (push, email)
  'flat', // Forfait
] as const;

export type AdBillingModel = typeof AD_BILLING_MODELS[number];

export const AD_CREATIVE_TYPES = [
  'text',
  'image',
  'banner',
  'video',
] as const;

export type AdCreativeType = typeof AD_CREATIVE_TYPES[number];

// =============================================================================
// WALLET
// =============================================================================

export interface AdWallet {
  id: string;
  establishment_id: string;
  balance_cents: number;
  total_credited_cents: number;
  total_spent_cents: number;
  created_at: string;
  updated_at: string;
}

export interface AdWalletTransaction {
  id: string;
  wallet_id: string;
  type: 'credit' | 'debit' | 'refund' | 'adjustment';
  amount_cents: number;
  balance_after_cents: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

// =============================================================================
// CAMPAGNES
// =============================================================================

export interface AdCampaignTargeting {
  keywords?: string[];           // Mots-clés pour sponsored_results
  categories?: string[];         // Catégories ciblées
  cities?: string[];             // Villes ciblées
  radius_km?: number;            // Rayon autour d'un point
  device_types?: ('mobile' | 'desktop' | 'tablet')[];
  days_of_week?: number[];       // 0-6 (dimanche-samedi)
  hours_of_day?: number[];       // 0-23
}

export interface AdCampaign {
  id: string;
  establishment_id: string;
  type: AdCampaignType;
  title: string;

  // Budget & Enchères
  budget: number;              // Budget total en cents
  bid_amount_cents: number | null;
  daily_budget_cents: number | null;
  daily_spent_cents: number;
  spent_cents: number;
  remaining_cents: number;

  // Facturation
  billing_model: AdBillingModel;
  cpc_cents: number | null;
  cpm_cents: number | null;

  // Dates
  starts_at: string | null;
  ends_at: string | null;

  // Statuts
  status: AdCampaignStatus;
  moderation_status: AdModerationStatus;

  // Modération
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;

  // Ciblage
  targeting: AdCampaignTargeting;

  // Qualité
  quality_score: number;
  ctr: number;

  // Entité promue
  promoted_entity_type: 'establishment' | 'offer' | 'pack' | null;
  promoted_entity_id: string | null;

  // Métriques legacy
  impressions: number;
  clicks: number;
  reservations_count: number;
  packs_count: number;
  metrics: Record<string, unknown>;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface AdCampaignWithStats extends AdCampaign {
  wallet_balance_cents: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  calculated_ctr: number;
  establishment_name?: string;
}

// =============================================================================
// CRÉATIVES
// =============================================================================

export interface AdCreativeTextContent {
  headline: string;
  description: string;
  cta_text?: string;
  cta_url?: string;
}

export interface AdCreativeImageContent {
  image_url: string;
  alt_text?: string;
}

export interface AdCreativeBannerContent {
  desktop_url: string;
  mobile_url?: string;
  cta_url: string;
  cta_text?: string;
}

export type AdCreativeContent =
  | AdCreativeTextContent
  | AdCreativeImageContent
  | AdCreativeBannerContent;

export interface AdCreative {
  id: string;
  campaign_id: string;
  type: AdCreativeType;
  name: string | null;
  content: AdCreativeContent;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ANALYTICS
// =============================================================================

export interface AdImpression {
  id: string;
  campaign_id: string;
  creative_id: string | null;
  user_id: string | null;
  session_id: string | null;
  placement: string;
  position: number | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  fingerprint_hash: string | null;
  search_query: string | null;
  page_url: string | null;
  referrer: string | null;
  device_type: 'mobile' | 'desktop' | 'tablet' | null;
  created_at: string;
}

export interface AdClick {
  id: string;
  impression_id: string | null;
  campaign_id: string;
  user_id: string | null;
  session_id: string | null;
  cost_cents: number;
  is_billable: boolean;
  ip_hash: string | null;
  user_agent_hash: string | null;
  is_valid: boolean;
  fraud_reason: string | null;
  destination_url: string | null;
  created_at: string;
}

export interface AdConversion {
  id: string;
  click_id: string | null;
  campaign_id: string;
  conversion_type: 'reservation' | 'pack_purchase' | 'page_view' | 'contact';
  conversion_value_cents: number | null;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  attribution_window_hours: number;
  click_to_conversion_seconds: number | null;
  created_at: string;
}

// =============================================================================
// CONFIGURATION ENCHÈRES
// =============================================================================

export interface AdAuctionConfig {
  id: string;
  product_type: AdCampaignType;
  min_bid_cents: number;
  suggested_bid_cents: number;
  max_bid_cents: number | null;
  demand_multiplier: number;
  min_budget_cents: number;
  min_daily_budget_cents: number | null;
  max_positions: number | null;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

// =============================================================================
// MODÉRATION
// =============================================================================

export interface AdModerationLog {
  id: string;
  campaign_id: string;
  admin_user_id: string;
  action: 'submitted' | 'approved' | 'rejected' | 'changes_requested' | 'resubmitted' | 'paused' | 'resumed' | 'cancelled';
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: string;
}

export interface AdModerationQueueItem {
  id: string;
  establishment_id: string;
  establishment_name: string;
  type: AdCampaignType;
  title: string;
  budget: number;
  bid_amount_cents: number | null;
  targeting: AdCampaignTargeting;
  moderation_status: AdModerationStatus;
  submitted_at: string | null;
  created_at: string;
  creative_count: number;
}

// =============================================================================
// CALENDRIER HOME TAKEOVER
// =============================================================================

export interface AdHomeTakeoverDay {
  id: string;
  date: string;
  campaign_id: string | null;
  price_cents: number;
  status: 'available' | 'reserved' | 'confirmed' | 'blocked';
  winning_bid_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// API REQUESTS/RESPONSES
// =============================================================================

export interface CreateAdCampaignRequest {
  type: AdCampaignType;
  title: string;
  budget_cents: number;
  bid_amount_cents?: number;
  daily_budget_cents?: number;
  billing_model?: AdBillingModel;
  starts_at?: string;
  ends_at?: string;
  targeting?: AdCampaignTargeting;
  promoted_entity_type?: 'establishment' | 'offer' | 'pack';
  promoted_entity_id?: string;
}

export interface UpdateAdCampaignRequest {
  title?: string;
  budget_cents?: number;
  bid_amount_cents?: number;
  daily_budget_cents?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  targeting?: AdCampaignTargeting;
  status?: 'paused' | 'active' | 'cancelled';
}

export interface SubmitAdCampaignForReviewRequest {
  campaign_id: string;
}

export interface ModerateAdCampaignRequest {
  campaign_id: string;
  action: 'approve' | 'reject' | 'request_changes';
  rejection_reason?: string;
  admin_notes?: string;
}

export interface CreateAdCreativeRequest {
  campaign_id: string;
  type: AdCreativeType;
  name?: string;
  content: AdCreativeContent;
}

export interface AdCampaignStats {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_rate: number;
  spent_cents: number;
  remaining_cents: number;
  avg_cpc_cents: number;
  avg_position: number | null;
}

export interface AdRevenueStats {
  period: 'day' | 'week' | 'month';
  total_revenue_cents: number;
  total_clicks: number;
  total_impressions: number;
  by_campaign_type: {
    type: AdCampaignType;
    revenue_cents: number;
    clicks: number;
    impressions: number;
  }[];
  by_day: {
    date: string;
    revenue_cents: number;
    clicks: number;
  }[];
  top_advertisers: {
    establishment_id: string;
    establishment_name: string;
    spent_cents: number;
    campaign_count: number;
  }[];
}

// =============================================================================
// RÉSULTATS SPONSORISÉS
// =============================================================================

export interface SponsoredResult {
  campaign_id: string;
  establishment_id: string;
  bid_amount_cents: number;
  score: number;
  position: number;
  // Données établissement enrichies
  establishment?: {
    id: string;
    name: string;
    slug: string;
    cover_url: string | null;
    category: string | null;
    city: string | null;
    rating: number | null;
    review_count: number;
  };
}

export interface RecordImpressionRequest {
  campaign_id: string;
  placement: string;
  position?: number;
  session_id?: string;
  search_query?: string;
  page_url?: string;
}

export interface RecordClickRequest {
  campaign_id: string;
  impression_id?: string;
  session_id?: string;
  destination_url?: string;
}
