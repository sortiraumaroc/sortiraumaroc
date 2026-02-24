/**
 * Zod Schemas for Admin Settings Routes
 *
 * Validates admin-facing settings management inputs: billing company profile,
 * cities, neighborhoods, categories, universe commission, finance rules,
 * reservation rules, and feature flags.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

// =============================================================================
// BILLING COMPANY PROFILE
// =============================================================================

export const UpdateBillingCompanyProfileSchema = z.object({
  legal_name: z.string().trim().min(1).max(500).optional(),
  trade_name: z.string().trim().min(1).max(500).optional(),
  legal_form: z.string().trim().min(1).max(200).optional(),
  ice: z.string().trim().min(1).max(100).optional(),
  rc_number: z.string().trim().min(1).max(100).optional(),
  rc_court: z.string().trim().min(1).max(200).optional(),
  address_line1: z.string().trim().min(1).max(500).optional(),
  address_line2: z.string().max(500).optional().nullable(),
  city: z.string().trim().min(1).max(200).optional(),
  country: z.string().trim().min(1).max(200).optional(),
  default_currency: z.string().trim().min(1).max(10).optional(),
  capital_mad: z.coerce.number().optional(),
  bank_name: z.string().max(200).optional().nullable(),
  rib: z.string().max(100).optional().nullable(),
  iban: z.string().max(100).optional().nullable(),
  swift: z.string().max(50).optional().nullable(),
  bank_account_holder: z.string().max(300).optional().nullable(),
  bank_instructions: z.string().max(2000).optional().nullable(),
});

// =============================================================================
// ADMIN CITIES
// =============================================================================

export const CreateAdminCitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  active: z.boolean().optional(),
});

export const UpdateAdminCitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
});

// =============================================================================
// ADMIN NEIGHBORHOODS
// =============================================================================

export const CreateAdminNeighborhoodSchema = z.object({
  city: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
});

// =============================================================================
// ADMIN CATEGORIES
// =============================================================================

export const CreateAdminCategorySchema = z.object({
  universe: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  icon: z.string().max(100).optional(),
  parent_id: z.string().optional().nullable(),
  sort_order: z.coerce.number().optional(),
  active: z.boolean().optional(),
  commission_percent: z.coerce.number().optional().nullable(),
});

export const UpdateAdminCategorySchema = z.object({
  universe: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  icon: z.string().max(100).optional(),
  parent_id: z.string().optional().nullable(),
  sort_order: z.coerce.number().optional(),
  active: z.boolean().optional(),
  commission_percent: z.coerce.number().optional().nullable(),
});

// =============================================================================
// UNIVERSE COMMISSION
// =============================================================================

export const ApplyUniverseCommissionSchema = z.object({
  universe: z.string().trim().min(1).max(200),
  commission_percent: z.coerce.number(),
});

// =============================================================================
// FINANCE RULES
// =============================================================================

export const UpdateFinanceRulesSchema = z.object({
  standard_commission_percent: z.coerce.number().optional(),
  boost_commission_percent_min: z.coerce.number().optional(),
  boost_commission_percent_max: z.coerce.number().optional(),
  guarantee_commission_percent: z.coerce.number().optional(),
  min_deposit_amount_cents: z.coerce.number().optional(),
});

// =============================================================================
// RESERVATION RULES
// =============================================================================

export const UpdateReservationRulesSchema = z.object({
  deposit_required_below_score: z.boolean().optional(),
  deposit_required_score_threshold: z.coerce.number().optional(),
  max_party_size: z.coerce.number().optional(),
  no_show_limit_before_block: z.coerce.number().optional(),
  auto_detect_no_show: z.boolean().optional(),
  max_reservations_per_slot: z.coerce.number().optional(),
});

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export const UpdateFeatureFlagSchema = z.object({
  enabled: z.boolean(),
});
