/**
 * Zod Schemas for Loyalty V2 Pro Routes
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Param Schemas
// =============================================================================

/** :programId */
export const ProgramIdParams = z.object({ programId: zUuid });

/** :cardId */
export const CardIdParams = z.object({ cardId: zUuid });

/** :distributionId */
export const DistributionIdParams = z.object({ distributionId: zUuid });

/** :userId (loyalty client detail) */
export const UserIdParams = z.object({ userId: zUuid });

// ── Shared establishment_id body ─────────────────────────────────────────────

export const LoyaltyEstablishmentOnlySchema = z.object({
  establishment_id: z.string().optional(),
});

// ── Create / Update program ──────────────────────────────────────────────────

export const CreateProLoyaltyProgramSchema = z.object({
  establishment_id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  reward_type: z.string().optional(),
  reward_value: z.string().optional(),
  reward_description: z.string().optional(),
  stamps_required: z.number().optional(),
  reward_validity_days: z.number().optional(),
  conditions: z.string().optional(),
  card_design: z.any().optional(),
  bonus_rules: z.any().optional(),
  stamps_expire_after_days: z.number().optional(),
  warn_expiration_days: z.number().optional(),
  allow_retroactive_stamps: z.boolean().optional(),
  retroactive_from_date: z.string().nullable().optional(),
  // V2 fields
  stamp_frequency: z.string().optional(),
  stamp_requires_reservation: z.boolean().optional(),
  stamp_conditional: z.boolean().optional(),
  stamp_minimum_amount: z.number().optional(),
  stamp_minimum_currency: z.string().optional(),
  card_validity_days: z.number().nullable().optional(),
  is_renewable: z.boolean().optional(),
});

export const UpdateProLoyaltyProgramSchema = z.object({
  establishment_id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  reward_type: z.string().optional(),
  reward_value: z.string().nullable().optional(),
  reward_description: z.string().optional(),
  stamps_required: z.number().optional(),
  reward_validity_days: z.number().optional(),
  conditions: z.string().nullable().optional(),
  card_design: z.any().optional(),
  bonus_rules: z.any().optional(),
  stamps_expire_after_days: z.number().optional(),
  warn_expiration_days: z.number().optional(),
  allow_retroactive_stamps: z.boolean().optional(),
  retroactive_from_date: z.string().nullable().optional(),
  // V2 fields
  stamp_frequency: z.string().optional(),
  stamp_requires_reservation: z.boolean().optional(),
  stamp_conditional: z.boolean().optional(),
  stamp_minimum_amount: z.number().optional(),
  stamp_minimum_currency: z.string().optional(),
  card_validity_days: z.number().nullable().optional(),
  is_renewable: z.boolean().optional(),
});

// ── Scan loyalty ─────────────────────────────────────────────────────────────

export const ScanLoyaltySchema = z.object({
  establishment_id: z.string().optional(),
  user_id: z.string(),
});

// ── Conditional stamp ────────────────────────────────────────────────────────

export const ConfirmConditionalStampSchema = z.object({
  establishment_id: z.string().optional(),
  amount_spent: z.number(),
  user_id: z.string(),
  program_id: z.string(),
});

// ── Offer gift ───────────────────────────────────────────────────────────────

export const OfferGiftSchema = z.object({
  establishment_id: z.string().optional(),
  gift_type: z.string(),
  description: z.string(),
  value: z.number(),
  total_quantity: z.number().optional(),
  conditions: z.string().nullable().optional(),
  validity_start: z.string(),
  validity_end: z.string(),
});
