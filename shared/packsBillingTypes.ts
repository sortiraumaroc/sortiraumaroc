/**
 * Packs & Billing System — Shared TypeScript Types
 *
 * Covers:
 *   - Pack V2 catalog (moderation, multi-use, scheduling)
 *   - PackPurchase V2 (multi-use, VosFactures refs)
 *   - PackConsumption (per-use tracking)
 *   - PackPromoCode (dedicated pack promos)
 *   - Commission & EstablishmentCommission
 *   - Transaction (unified ledger)
 *   - BillingPeriod (semi-monthly cycles)
 *   - BillingDispute
 *   - PackRefund
 *   - ModuleActivation
 *   - VosFactures API types
 */

// =============================================================================
// 1. Pack Moderation Status
// =============================================================================

export type PackModerationStatus =
  | "draft"
  | "pending_moderation"
  | "modification_requested"
  | "approved"
  | "active"
  | "suspended"
  | "sold_out"
  | "ended"
  | "rejected";

/** Statuses that allow the pack to be visible to consumers */
export const PACK_VISIBLE_STATUSES: PackModerationStatus[] = ["active"];

/** Statuses that allow the pack to be sold */
export const PACK_PURCHASABLE_STATUSES: PackModerationStatus[] = ["active"];

/** Statuses that allow the pro to edit the pack */
export const PACK_EDITABLE_STATUSES: PackModerationStatus[] = [
  "draft",
  "modification_requested",
  "rejected",
];

/** Valid transitions for pack moderation */
export const PACK_MODERATION_TRANSITIONS: Record<PackModerationStatus, PackModerationStatus[]> = {
  draft: ["pending_moderation"],
  pending_moderation: ["approved", "modification_requested", "rejected"],
  modification_requested: ["pending_moderation"],
  approved: ["active"],
  active: ["suspended", "sold_out", "ended"],
  suspended: ["active", "ended"],
  sold_out: ["active", "ended"], // can restock
  ended: [], // terminal
  rejected: ["draft"], // pro can rework and resubmit
};

// =============================================================================
// 2. Pack V2 (extends existing Pack)
// =============================================================================

export interface PackV2 {
  id: string;
  establishment_id: string;
  // Existing fields
  title: string;
  description: string | null;
  label: string | null;
  price: number; // cents
  original_price: number | null; // cents
  items: PackItem[];
  is_limited: boolean;
  stock: number | null;
  availability: "permanent" | "limited" | "seasonal";
  max_reservations: number | null;
  active: boolean;
  valid_from: string | null; // YYYY-MM-DD
  valid_to: string | null;
  conditions: string | null;
  cover_url: string | null;
  // V2 additions
  short_description: string | null;
  detailed_description: string | null;
  additional_photos: string[];
  category: string | null;
  discount_percentage: number | null; // 0-100
  party_size: number | null;
  inclusions: PackInclusion[];
  exclusions: PackInclusion[] | null;
  valid_days: number[] | null; // 0=Sun..6=Sat
  valid_time_start: string | null; // HH:MM
  valid_time_end: string | null;
  sale_start_date: string | null; // YYYY-MM-DD
  sale_end_date: string | null;
  validity_start_date: string | null;
  validity_end_date: string | null;
  sold_count: number;
  consumed_count: number;
  limit_per_client: number;
  is_multi_use: boolean;
  total_uses: number;
  moderation_status: PackModerationStatus;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
  rejection_reason: string | null;
  scheduled_publish_at: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface PackItem {
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
}

export interface PackInclusion {
  label: string;
  description?: string;
}

// =============================================================================
// 3. PackPurchase V2
// =============================================================================

export type PackPurchasePaymentMethod = "card" | "wallet" | "mobile_payment";

export type PackPurchasePaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type PackPurchaseStatus =
  | "purchased"
  | "partially_consumed"
  | "consumed"
  | "expired"
  | "refunded"
  | "credited";

export interface PackPurchaseV2 {
  id: string;
  pack_id: string;
  user_id: string | null;
  establishment_id: string;
  // Existing
  buyer_name: string;
  buyer_email: string;
  quantity: number;
  unit_price: number; // cents (after promo)
  total_price: number; // cents
  currency: string;
  payment_status: PackPurchasePaymentStatus;
  status: string; // active/used/refunded from V1, now more states
  valid_until: string | null;
  meta: Record<string, unknown>;
  // V2 additions
  promo_code_id: string | null;
  promo_discount_amount: number;
  payment_method: PackPurchasePaymentMethod;
  payment_reference: string | null;
  paid_at: string | null;
  qr_code_token: string | null;
  is_multi_use: boolean;
  uses_remaining: number | null;
  uses_total: number;
  consumed_at: string | null;
  expires_at: string | null;
  receipt_id: string | null; // VosFactures
  invoice_id: string | null; // VosFactures
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 4. PackConsumption
// =============================================================================

export interface PackConsumption {
  id: string;
  pack_purchase_id: string;
  establishment_id: string;
  scanned_by: string | null;
  scanned_at: string;
  use_number: number; // e.g., 3 of 5
  notes: string | null;
  created_at: string;
}

// =============================================================================
// 5. PackPromoCode
// =============================================================================

export type PackPromoDiscountType = "percentage" | "fixed_amount";

export type PackPromoAppliesTo = "all_packs" | "specific_pack" | "all_establishment_packs";

export interface PackPromoCode {
  id: string;
  establishment_id: string | null; // null = platform code
  code: string;
  discount_type: PackPromoDiscountType;
  discount_value: number; // bps for %, cents for fixed
  applies_to: PackPromoAppliesTo;
  specific_pack_id: string | null;
  max_total_uses: number | null;
  current_uses: number;
  max_uses_per_user: number;
  is_cumulative: boolean;
  start_date: string | null;
  end_date: string | null;
  is_platform_code: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 6. Commission
// =============================================================================

export type CommissionType =
  | "pack_sale"
  | "reservation_deposit"
  | "advertising"
  | "visibility"
  | "digital_menu"
  | "booking_link";

export interface Commission {
  id: string;
  type: CommissionType;
  default_rate: number; // percentage, e.g., 15.00
  category_rates: Record<string, number> | null; // { "restaurant": 12, "spa": 18 }
  created_at: string;
  updated_at: string;
}

export interface EstablishmentCommission {
  id: string;
  establishment_id: string;
  commission_id: string;
  custom_rate: number;
  negotiated_by: string | null;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 7. Transaction (Unified Ledger)
// =============================================================================

export type TransactionType =
  | "pack_sale"
  | "reservation_deposit"
  | "deposit_refund"
  | "pack_refund"
  | "advertising_purchase"
  | "visibility_purchase"
  | "digital_menu_purchase"
  | "booking_link_purchase"
  | "wallet_topup"
  | "wallet_payment";

export type TransactionReferenceType =
  | "pack_purchase"
  | "reservation"
  | "ad_order"
  | "visibility_order"
  | "menu_order"
  | "booking_link_order"
  | "wallet";

export type TransactionStatus =
  | "completed"
  | "refunded"
  | "partially_refunded"
  | "disputed";

export type PaymentMethod = "card" | "wallet" | "mobile_payment" | "bank_transfer";

export type PromoAbsorbedBy = "pro" | "platform";

export interface Transaction {
  id: string;
  establishment_id: string | null;
  user_id: string | null;
  type: TransactionType;
  reference_type: TransactionReferenceType;
  reference_id: string;
  gross_amount: number; // cents
  commission_rate: number; // percentage
  commission_amount: number; // cents
  net_amount: number; // cents
  promo_discount_amount: number;
  promo_absorbed_by: PromoAbsorbedBy | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  status: TransactionStatus;
  billing_period: string | null; // '2026-01-A' or '2026-01-B'
  invoice_line_id: string | null;
  receipt_id: string | null;
  created_at: string;
}

// =============================================================================
// 8. BillingPeriod
// =============================================================================

export type BillingPeriodStatus =
  | "open"
  | "closed"
  | "invoice_pending"
  | "invoice_submitted"
  | "invoice_validated"
  | "payment_scheduled"
  | "paid"
  | "disputed"
  | "dispute_resolved"
  | "corrected";

export interface BillingPeriod {
  id: string;
  establishment_id: string;
  period_code: string; // '2026-01-A' or '2026-01-B'
  start_date: string;
  end_date: string;
  total_gross: number;
  total_commission: number;
  total_net: number;
  total_refunds: number;
  transaction_count: number;
  status: BillingPeriodStatus;
  call_to_invoice_deadline: string | null;
  payment_due_date: string | null;
  invoice_submitted_at: string | null;
  invoice_validated_at: string | null;
  payment_executed_at: string | null;
  vosfactures_invoice_id: string | null;
  vosfactures_receipt_ids: string[];
  created_at: string;
  updated_at: string;
}

/** Semi-monthly constants */
export const BILLING_PERIOD = {
  /** Days after period end for pro to submit invoice */
  CALL_TO_INVOICE_DEADLINE_DAYS: 10,
  /** Days after invoice validation for payment */
  PAYMENT_DELAY_DAYS: 7,
} as const;

// =============================================================================
// 9. BillingDispute
// =============================================================================

export type BillingDisputeStatus =
  | "open"
  | "under_review"
  | "resolved_accepted"
  | "resolved_rejected"
  | "escalated"
  | "escalation_resolved";

export interface BillingDispute {
  id: string;
  billing_period_id: string;
  establishment_id: string;
  disputed_transactions: string[] | null;
  reason: string;
  evidence: Array<{ url: string; type: string; description?: string }> | null;
  status: BillingDisputeStatus;
  admin_response: string | null;
  admin_responded_by: string | null;
  admin_responded_at: string | null;
  correction_amount: number | null;
  credit_note_id: string | null;
  escalated_at: string | null;
  escalation_resolved_at: string | null;
  escalation_resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 10. PackRefund
// =============================================================================

export type PackRefundType = "full" | "partial" | "credit";

export type PackRefundStatus = "requested" | "approved" | "processed" | "rejected";

export interface PackRefund {
  id: string;
  pack_purchase_id: string;
  user_id: string;
  refund_type: PackRefundType;
  refund_amount: number; // cents
  credit_amount: number; // cents
  reason: string;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  vosfactures_credit_note_id: string | null;
  status: PackRefundStatus;
  created_at: string;
}

// =============================================================================
// 11. Module Activation
// =============================================================================

export type PlatformModule =
  | "packs"
  | "advertising"
  | "visibility"
  | "digital_menu"
  | "booking_link"
  | "loyalty";

export interface ModuleActivation {
  id: string;
  module: PlatformModule;
  is_globally_active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstablishmentModuleActivation {
  id: string;
  establishment_id: string;
  module: PlatformModule;
  is_active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 12. VosFactures API Types
// =============================================================================

/** VosFactures document kinds */
export type VFDocumentKind = "vat" | "receipt" | "correction" | "proforma";

/** VosFactures payment status */
export type VFPaymentStatus = "paid" | "unpaid" | "partial";

/** Input for creating a VosFactures document */
export interface VFCreateDocumentInput {
  kind: VFDocumentKind;
  number?: string; // auto-generated if omitted
  issue_date: string; // YYYY-MM-DD
  payment_to?: string; // due date YYYY-MM-DD
  seller_name: string;
  seller_tax_no?: string; // ICE
  buyer_name: string;
  buyer_email?: string;
  buyer_tax_no?: string; // ICE
  buyer_city?: string;
  buyer_post_code?: string;
  buyer_street?: string;
  buyer_country?: string;
  currency: string; // MAD
  payment_type?: string; // card, virement, etc.
  status?: VFPaymentStatus;
  positions: VFLineItem[];
  description?: string;
  internal_note?: string;
}

/** Line item for VosFactures document */
export interface VFLineItem {
  name: string;
  description?: string;
  quantity: number;
  quantity_unit?: string;
  total_price_gross: number; // in MAD (not cents)
  tax: string; // e.g., "20", "0", "disabled"
  discount?: string; // percentage
}

/** VosFactures document response */
export interface VFDocument {
  id: number;
  number: string;
  kind: VFDocumentKind;
  issue_date: string;
  payment_to: string | null;
  total_price_gross: number;
  total_price_net: number;
  tax: number;
  status: VFPaymentStatus;
  buyer_name: string;
  buyer_email: string | null;
  seller_name: string;
  token: string; // public access token for PDF
  view_url: string; // URL to view/download PDF
  positions: VFLineItem[];
  created_at: string;
  updated_at: string;
}

/** VosFactures API configuration */
export const VOSFACTURES_CONFIG = {
  BASE_URL: "https://sortir-au-maroc.vosfactures.fr",
  API_PATH: "/invoices.json",
  /** Seller info for all invoices */
  SELLER: {
    name: "SORTIR AU MAROC SARL",
    tax_no: "", // ICE à renseigner
  },
  /** Default currency */
  CURRENCY: "MAD",
  /** Default tax rate for services */
  DEFAULT_TAX_RATE: "20", // 20% TVA
} as const;

// =============================================================================
// 13. Helper: Billing period code calculation
// =============================================================================

/**
 * Calculate the billing period code for a given date.
 * Returns 'YYYY-MM-A' for days 1-15, 'YYYY-MM-B' for days 16-end.
 */
export function getBillingPeriodCode(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = date.getDate();
  const half = day <= 15 ? "A" : "B";
  return `${year}-${month}-${half}`;
}

/**
 * Get start and end dates for a billing period code.
 */
export function getBillingPeriodDates(periodCode: string): { start: Date; end: Date } {
  const [yearStr, monthStr, half] = periodCode.split("-") as [string, string, string];
  const year = Number(yearStr);
  const month = Number(monthStr) - 1; // 0-indexed

  if (half === "A") {
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month, 15, 23, 59, 59, 999),
    };
  } else {
    // Last day of month
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      start: new Date(year, month, 16),
      end: new Date(year, month, lastDay, 23, 59, 59, 999),
    };
  }
}

/**
 * Calculate discount percentage from original and pack price.
 */
export function calculateDiscountPercentage(originalPrice: number, packPrice: number): number {
  if (originalPrice <= 0 || packPrice >= originalPrice) return 0;
  return Math.round(((originalPrice - packPrice) / originalPrice) * 10000) / 100; // 2 decimal places
}
