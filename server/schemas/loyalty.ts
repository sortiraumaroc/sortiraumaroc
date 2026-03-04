/**
 * Zod Schemas for Loyalty Routes
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";

// ── Route Params ────────────────────────────────────────────────────────────

/** :establishmentId */
export const LoyaltyEstablishmentIdParams = z.object({ establishmentId: zUuid });

/** :cardId */
export const LoyaltyCardIdParams = z.object({ cardId: zUuid });

/** :establishmentId + :programId */
export const EstablishmentIdProgramIdParams = z.object({ establishmentId: zUuid, programId: zUuid });

/** :establishmentId + :userId */
export const EstablishmentIdUserIdParams = z.object({ establishmentId: zUuid, userId: zUuid });

/** :establishmentId + :rewardId */
export const EstablishmentIdRewardIdParams = z.object({ establishmentId: zUuid, rewardId: zUuid });

// ── Create / Update Loyalty Program ──────────────────────────────────────────

export const CreateLoyaltyProgramSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  reward_type: z.string().optional(),
  reward_value: z.string().optional(),
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
});

export const UpdateLoyaltyProgramSchema = z.object({
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
  is_active: z.boolean().optional(),
});

// ── Add Stamp ────────────────────────────────────────────────────────────────

export const AddLoyaltyStampSchema = z.object({
  user_id: z.string(),
  program_id: z.string().optional(),
  stamp_type: z.string().optional(),
  source: z.string().optional(),
  offline_id: z.string().optional(),
  notes: z.string().optional(),
});
