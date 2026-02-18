export type ProRole = "owner" | "manager" | "reception" | "accounting" | "marketing" | string;

export type EstablishmentStatus = "pending" | "active" | "suspended" | "rejected" | string;
export type EstablishmentEditStatus = "none" | "pending_modification" | string;

export type Establishment = {
  id: string;
  slug: string | null;
  created_by: string | null;
  name: string | null;
  universe: string | null;
  category: string | null;
  subcategory: string | null;
  specialties: string[] | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description_short: string | null;
  description_long: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  email: string | null;
  social_links: Record<string, unknown> | null;
  hours: Record<string, unknown> | null;
  amenities: string[] | null;
  tags: string[] | null;
  cover_url: string | null;
  logo_url: string | null;
  gallery_urls: string[] | null;
  ambiance_tags: string[] | null;
  mix_experience: Record<string, unknown> | null;
  verified: boolean;
  premium: boolean;
  status: EstablishmentStatus | null;
  edit_status: EstablishmentEditStatus | null;
  booking_enabled: boolean;
  extra: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ProMembership = {
  id: string;
  establishment_id: string;
  user_id: string;
  email?: string | null;
  role: ProRole;
  created_at: string;
  is_banned?: boolean;
};

export type ReservationStatus =
  | "requested"
  | "pending_pro_validation"
  | "confirmed"
  | "refused"
  | "waitlist"
  | "cancelled"
  | "cancelled_user"
  | "cancelled_pro"
  | "noshow"
  | string;
export type ReservationPaymentStatus = "pending" | "paid" | "refunded" | string;

// Booking source for commission tracking
// platform = reservation via sam.ma (commissioned)
// direct_link = reservation via book.sam.ma/:username (NOT commissioned)
export type BookingSource = "platform" | "direct_link";

export type Reservation = {
  id: string;
  booking_reference: string | null;
  kind: string;
  establishment_id: string;
  user_id: string | null;
  status: ReservationStatus;
  starts_at: string;
  ends_at: string | null;
  party_size: number | null;
  amount_total: number | null;
  amount_deposit: number | null;
  currency: string;
  payment_status: ReservationPaymentStatus;
  commission_percent: number;
  commission_amount: number | null;
  checked_in_at: string | null;
  slot_id: string | null;
  guarantee_type?: "prepaid" | "card_fingerprint" | "no_guarantee" | string;
  refusal_reason_code?: string | null;
  refusal_reason_custom?: string | null;
  is_from_waitlist?: boolean;
  // Booking source tracking
  booking_source?: BookingSource;
  referral_slug?: string | null;
  source_url?: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SlotPromoType = "percent" | "amount" | string;

export type ProSlot = {
  id: string;
  establishment_id: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  base_price: number | null;
  promo_type: SlotPromoType | null;
  promo_value: number | null;
  promo_label: string | null;
  service_label: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Pack = {
  id: string;
  establishment_id: string;
  title: string;
  description: string | null;
  label: string | null;
  items: unknown;
  price: number;
  original_price: number | null;
  is_limited: boolean;
  stock: number | null;
  availability: string;
  valid_from: string | null;
  valid_to: string | null;
  conditions: string | null;
  max_reservations: number | null;
  cover_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProInventoryCategory = {
  id: string;
  establishment_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProInventoryVariant = {
  id: string;
  item_id: string;
  title: string | null;
  quantity: number | null;
  unit: string | null;
  price: number;
  currency: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProInventoryItem = {
  id: string;
  establishment_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  labels: string[];
  base_price: number | null;
  currency: string;
  is_active: boolean;
  visible_when_unavailable: boolean;
  scheduled_reactivation_at: string | null;
  popularity: number;
  photos: string[];
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  variants: ProInventoryVariant[];
};

export type InvoiceStatus = "due" | "paid" | string;

export type ProInvoice = {
  id: string;
  establishment_id: string;

  // Optional finance-layer identifier (added server-side).
  invoice_number?: string | null;
  invoice_issued_at?: string | null;

  period_start: string;
  period_end: string;
  currency: string;
  commission_total: number;
  visibility_total: number;
  amount_due: number;
  status: InvoiceStatus;
  due_date: string;
  paid_at: string | null;
  line_items: unknown;
  created_at: string;
  updated_at: string;
};

export type CampaignStatus = "draft" | "active" | "paused" | "ended" | string;
export type CampaignType =
  | "home_feature"
  | "sponsored_results"
  | "featured_pack"
  | "push_notification"
  | "email_marketing"
  | string;

export type ProCampaign = {
  id: string;
  establishment_id: string;
  type: CampaignType;
  title: string;

  // Stored in cents.
  budget: number;

  // Optional billing settings
  billing_model?: "cpc" | "cpm" | string;
  cpc_cents?: number | null;
  cpm_cents?: number | null;

  // Optional counters (server-augmented)
  impressions?: number | null;
  clicks?: number | null;
  reservations_count?: number | null;
  packs_count?: number | null;

  // Optional spend counters (in cents)
  spent_cents?: number | null;
  remaining_cents?: number | null;

  starts_at: string | null;
  ends_at: string | null;
  status: CampaignStatus;
  metrics: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ProNotification = {
  id: string;
  user_id: string;
  establishment_id: string | null;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
};

export type EstablishmentProfileDraft = {
  id: string;
  establishment_id: string;
  created_by: string;
  data: Record<string, unknown>;
  moderation_id: string | null;
  status: "pending" | "approved" | "rejected" | string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
};

// ---------------------------------------------------------------------------
// Username Subscription Types
// ---------------------------------------------------------------------------

export type UsernameSubscriptionStatus =
  | "trial"
  | "pending"
  | "active"
  | "grace_period"
  | "expired"
  | "cancelled";

export type UsernameSubscription = {
  id: string;
  status: UsernameSubscriptionStatus;
  is_trial: boolean;
  trial_ends_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  cancelled_at: string | null;
  price_cents: number;
  currency: string;
  days_remaining?: number;
  can_use_username: boolean;
};

export type UsernameInfo = {
  username: string | null;
  usernameChangedAt: string | null;
  pendingRequest: {
    id: string;
    requested_username: string;
    status: string;
    created_at: string;
    rejection_reason: string | null;
  } | null;
  canChange: boolean;
  nextChangeDate: string | null;
  cooldownDays: number;
  subscription: UsernameSubscription | null;
  canUseUsername: boolean;
};

export type UsernameSubscriptionInfo = {
  subscription: UsernameSubscription | null;
  can_start_trial: boolean;
  has_used_trial: boolean;
};

// ---------------------------------------------------------------------------
// Pro Onboarding Wizard Types
// ---------------------------------------------------------------------------

export type ProWizardData = {
  // Step 1: Identity
  name: string;
  universe: string;
  category: string;
  subcategory: string;
  specialties: string[];
  // Step 2: Location
  city: string;
  region: string;
  neighborhood: string;
  postal_code: string;
  address: string;
  lat: string;
  lng: string;
  // Step 3: Contact
  phone_country: string;
  phone_national: string;
  whatsapp_country: string;
  whatsapp_national: string;
  email: string;
  website: string;
  google_maps_url: string;
  social_instagram: string;
  social_facebook: string;
  social_tiktok: string;
  social_snapchat: string;
  social_youtube: string;
  social_tripadvisor: string;
  // Step 4: Description
  description_short: string;
  description_long: string;
  // Step 5: Media
  cover_url: string;
  logo_url: string;
  gallery_urls: string[];
  // Step 6: Hours
  hours: Record<string, unknown>;
};

export type OnboardingWizardProgress = {
  establishment_id: string;
  current_step: number;
  completed_steps: number[];
  skipped: boolean;
  completed: boolean;
  submitted_at: string | null;
  data: Partial<ProWizardData>;
};
