// =============================================================================
// RENTAL VEHICLES MODULE — Shared TypeScript Types
// Used by both server and client
// =============================================================================

// =============================================================================
// VEHICLE CATEGORIES & SPECS
// =============================================================================

export const RENTAL_VEHICLE_CATEGORIES = [
  "citadine",
  "compacte",
  "berline",
  "suv",
  "4x4",
  "monospace",
  "utilitaire",
  "luxe",
  "cabriolet",
  "electrique",
  "sport",
  "moto",
] as const;
export type RentalVehicleCategory = (typeof RENTAL_VEHICLE_CATEGORIES)[number];

export const RENTAL_TRANSMISSION_TYPES = ["automatique", "manuelle"] as const;
export type RentalTransmission = (typeof RENTAL_TRANSMISSION_TYPES)[number];

export const RENTAL_FUEL_TYPES = ["essence", "diesel", "electrique", "hybride"] as const;
export type RentalFuelType = (typeof RENTAL_FUEL_TYPES)[number];

export const RENTAL_MILEAGE_POLICIES = ["unlimited", "limited"] as const;
export type RentalMileagePolicy = (typeof RENTAL_MILEAGE_POLICIES)[number];

// =============================================================================
// VEHICLE STATUS
// =============================================================================

export const RENTAL_VEHICLE_STATUSES = ["active", "inactive", "maintenance"] as const;
export type RentalVehicleStatus = (typeof RENTAL_VEHICLE_STATUSES)[number];

// =============================================================================
// VEHICLE SPECS (stored as jsonb)
// =============================================================================

export interface RentalVehicleSpecs {
  seats: number;
  doors: number;
  transmission: RentalTransmission;
  ac: boolean;
  fuel_type: RentalFuelType;
  trunk_volume?: string; // e.g. "400L", "Grand coffre"
}

// =============================================================================
// VEHICLE PRICING (stored as jsonb)
// =============================================================================

export interface RentalVehiclePricing {
  standard: number;         // prix/jour en MAD
  weekend?: number;         // prix/jour ven-dim
  high_season?: number;     // prix/jour haute saison
  long_duration_discount?: {
    min_days: number;       // à partir de X jours
    discount_percent: number; // réduction en %
  };
}

// =============================================================================
// VEHICLE
// =============================================================================

export interface RentalVehicle {
  id: string;
  establishment_id: string;
  category: RentalVehicleCategory;
  brand: string;
  model: string;
  year: number | null;
  photos: string[];
  specs: RentalVehicleSpecs;
  mileage_policy: RentalMileagePolicy;
  mileage_limit_per_day: number | null;   // null if unlimited
  extra_km_cost: number | null;           // MAD per extra km
  pricing: RentalVehiclePricing;
  high_season_dates: Array<{ start: string; end: string }> | null;
  quantity: number;
  similar_vehicle: boolean;
  similar_models: string[] | null;
  status: RentalVehicleStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Enriched by API (from establishment)
  establishment_name?: string;
  establishment_logo?: string | null;
}

// =============================================================================
// VEHICLE DATE BLOCKS
// =============================================================================

export interface RentalVehicleDateBlock {
  id: string;
  vehicle_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

// =============================================================================
// RENTAL OPTIONS (per establishment)
// =============================================================================

export const RENTAL_OPTION_PRICE_TYPES = ["per_day", "fixed"] as const;
export type RentalOptionPriceType = (typeof RENTAL_OPTION_PRICE_TYPES)[number];

export interface RentalOption {
  id: string;
  establishment_id: string;
  name: string;
  description: string | null;
  price: number;
  price_type: RentalOptionPriceType;
  is_mandatory: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// =============================================================================
// INSURANCE PLANS (managed by admin)
// =============================================================================

export interface RentalInsurancePlan {
  id: string;
  name: string;
  description: string;
  coverages: string[];
  price_per_day: number;
  franchise: number;
  partner_name: string | null;
  badge: string | null;        // e.g. "Recommandé"
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// RESERVATION STATUSES
// =============================================================================

export const RENTAL_RESERVATION_STATUSES = [
  "pending_kyc",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "cancelled_user",
  "cancelled_pro",
  "disputed",
  "expired",
] as const;
export type RentalReservationStatus = (typeof RENTAL_RESERVATION_STATUSES)[number];

/** Statuses that occupy vehicle availability */
export const RENTAL_OCCUPYING_STATUSES = [
  "pending_kyc",
  "confirmed",
  "in_progress",
] as const;
export const RENTAL_OCCUPYING_STATUS_SET = new Set<string>(RENTAL_OCCUPYING_STATUSES);

/** Terminal statuses — no further transitions */
export const RENTAL_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "cancelled_user",
  "cancelled_pro",
  "expired",
] as const;
export const RENTAL_TERMINAL_STATUS_SET = new Set<string>(RENTAL_TERMINAL_STATUSES);

/** Cancellable statuses */
export const RENTAL_CANCELLABLE_STATUSES = [
  "pending_kyc",
  "confirmed",
] as const;
export const RENTAL_CANCELLABLE_STATUS_SET = new Set<string>(RENTAL_CANCELLABLE_STATUSES);

// =============================================================================
// DEPOSIT STATUS
// =============================================================================

export const RENTAL_DEPOSIT_STATUSES = ["pending", "held", "released", "forfeited"] as const;
export type RentalDepositStatus = (typeof RENTAL_DEPOSIT_STATUSES)[number];

// =============================================================================
// KYC
// =============================================================================

export const RENTAL_KYC_STATUSES = ["pending", "validated", "refused"] as const;
export type RentalKycStatus = (typeof RENTAL_KYC_STATUSES)[number];

export const RENTAL_KYC_DOCUMENT_TYPES = ["permit", "cin", "passport"] as const;
export type RentalKycDocumentType = (typeof RENTAL_KYC_DOCUMENT_TYPES)[number];

export const RENTAL_KYC_SIDES = ["front", "back"] as const;
export type RentalKycSide = (typeof RENTAL_KYC_SIDES)[number];

export interface RentalKycDocument {
  id: string;
  reservation_id: string;
  user_id: string;
  document_type: RentalKycDocumentType;
  side: RentalKycSide;
  photo_url: string;
  status: RentalKycStatus;
  refusal_reason: string | null;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
}

// =============================================================================
// RESERVATION
// =============================================================================

export interface RentalSelectedOption {
  option_id: string;
  name: string;
  price: number;
  price_type: RentalOptionPriceType;
  quantity: number;
}

export interface RentalReservation {
  id: string;
  booking_reference: string;
  user_id: string;
  establishment_id: string;
  vehicle_id: string;
  // Dates & locations
  pickup_city: string;
  pickup_date: string;
  pickup_time: string;
  dropoff_city: string;
  dropoff_date: string;
  dropoff_time: string;
  // Options & insurance
  selected_options: RentalSelectedOption[];
  insurance_plan_id: string | null;
  // Deposit
  deposit_amount: number;
  deposit_status: RentalDepositStatus;
  // Pricing
  base_price: number;
  options_total: number;
  insurance_total: number;
  total_price: number;
  commission_percent: number;
  commission_amount: number;
  currency: string;
  // KYC
  kyc_status: RentalKycStatus;
  kyc_refusal_reason: string | null;
  // Contract
  contract_pdf_url: string | null;
  // Promo
  promo_code_id: string | null;
  promo_discount: number;
  // Status
  status: RentalReservationStatus;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CONTRACT TEMPLATE
// =============================================================================

export interface RentalContractTemplate {
  id: string;
  establishment_id: string;
  template_content: string;
  custom_clauses: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CANCELLATION POLICIES
// =============================================================================

export const RENTAL_CANCELLATION_POLICIES = ["flexible", "moderate", "strict"] as const;
export type RentalCancellationPolicy = (typeof RENTAL_CANCELLATION_POLICIES)[number];

export const RENTAL_CANCELLATION_POLICY_LABELS: Record<RentalCancellationPolicy, string> = {
  flexible: "Annulation gratuite jusqu'à 24h avant",
  moderate: "Annulation gratuite jusqu'à 48h avant",
  strict: "Annulation gratuite jusqu'à 7 jours avant",
};

// =============================================================================
// STATE MACHINE — Allowed transitions
// =============================================================================

const RENTAL_ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  pending_kyc: new Set(["confirmed", "cancelled", "cancelled_user", "cancelled_pro", "expired"]),
  confirmed: new Set(["in_progress", "cancelled_user", "cancelled_pro", "cancelled", "disputed"]),
  in_progress: new Set(["completed", "disputed"]),
  disputed: new Set(["completed", "cancelled"]),
};

export function canTransitionRentalStatus(from: string, to: string): boolean {
  if (!from || !to) return false;
  if (from === to) return true;
  if (RENTAL_TERMINAL_STATUS_SET.has(from)) return false;
  const allowed = RENTAL_ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

export function isRentalCancelledStatus(status: string): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "cancelled" || s.startsWith("cancelled_");
}

export function isRentalTerminalStatus(status: string): boolean {
  return RENTAL_TERMINAL_STATUS_SET.has(status) || isRentalCancelledStatus(status);
}

// =============================================================================
// SEARCH PARAMS (for API queries)
// =============================================================================

export interface RentalSearchParams {
  establishment_id?: string;
  pickup_city?: string;
  dropoff_city?: string;
  pickup_date?: string;
  pickup_time?: string;
  dropoff_date?: string;
  dropoff_time?: string;
  category?: RentalVehicleCategory;
  transmission?: RentalTransmission;
  fuel_type?: RentalFuelType;
  min_seats?: number;
  max_seats?: number;
  doors?: number;
  ac?: boolean;
  mileage_policy?: RentalMileagePolicy;
  min_price?: number;
  max_price?: number;
  supplier_ids?: string[];
  min_rating?: number;
  free_cancellation?: boolean;
  sort_by?: "price_asc" | "price_desc" | "rating" | "recommended";
  page?: number;
  per_page?: number;
}

// =============================================================================
// PRICE QUOTE (returned by price calculation)
// =============================================================================

export interface RentalPriceQuote {
  vehicle_id: string;
  rental_days: number;
  price_per_day: number;
  base_price: number;
  options_total: number;
  insurance_total: number;
  deposit_amount: number;
  total_price: number;
  currency: string;
  breakdown: {
    standard_days: number;
    standard_rate: number;
    weekend_days: number;
    weekend_rate: number;
    high_season_days: number;
    high_season_rate: number;
    long_duration_discount: number;
  };
}
