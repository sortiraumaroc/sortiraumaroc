/**
 * Ambassador Program — Zod Validation Schemas
 *
 * Schemas for ambassador program CRUD, applications, conversions, rewards.
 * Pattern: server/schemas/loyaltyV2Pro.ts
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Params
// =============================================================================

export const AmbassadorProgramIdParams = z.object({
  programId: zUuid,
});

export const AmbassadorApplicationIdParams = z.object({
  applicationId: zUuid,
});

export const AmbassadorConversionIdParams = z.object({
  conversionId: zUuid,
});

export const AmbassadorRewardIdParams = z.object({
  rewardId: zUuid,
});

export const AmbassadorEstablishmentIdParams = z.object({
  establishmentId: zUuid,
});

// =============================================================================
// Pro: Create / Update program
// =============================================================================

export const CreateAmbassadorProgramSchema = z.object({
  establishment_id: z.string().optional(),
  reward_description: z.string().min(1, "Description de la récompense requise").max(2000),
  conversions_required: z.number().int().min(1).max(100),
  validity_days: z.number().int().min(1).max(365),
  max_beneficiaries_per_month: z.number().int().min(1).nullable().optional(),
  confirmation_mode: z.enum(["manual", "qr"]).optional().default("manual"),
  expires_at: z.string().datetime().nullable().optional(),
});

export const UpdateAmbassadorProgramSchema = z.object({
  establishment_id: z.string().optional(),
  reward_description: z.string().min(1).max(2000).optional(),
  conversions_required: z.number().int().min(1).max(100).optional(),
  validity_days: z.number().int().min(1).max(365).optional(),
  max_beneficiaries_per_month: z.number().int().min(1).nullable().optional(),
  confirmation_mode: z.enum(["manual", "qr"]).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

// =============================================================================
// Pro: Review application
// =============================================================================

export const ReviewApplicationSchema = z.object({
  establishment_id: z.string().optional(),
  status: z.enum(["accepted", "rejected"]),
  rejection_reason: z.string().max(1000).optional(),
});

// =============================================================================
// Pro: Confirm/reject conversion
// =============================================================================

export const ConfirmConversionSchema = z.object({
  establishment_id: z.string().optional(),
  status: z.enum(["confirmed", "rejected"]),
  confirmation_mode: z.enum(["manual", "qr"]).optional(),
});

// =============================================================================
// Pro: Claim reward (scan or manual)
// =============================================================================

export const ClaimAmbassadorRewardSchema = z.object({
  establishment_id: z.string().optional(),
  qr_reward_token: zUuid.optional(),
  claim_code: z.string().max(20).optional(),
});

// =============================================================================
// Consumer: Apply to program
// =============================================================================

export const ApplyAmbassadorProgramSchema = z.object({
  motivation: z.string().max(2000).optional(),
});

// =============================================================================
// Consumer: Track click on ambassador post
// =============================================================================

export const TrackPostClickSchema = z.object({
  post_id: zUuid,
  establishment_id: zUuid,
});

// =============================================================================
// Admin: Flag conversion
// =============================================================================

export const FlagConversionSchema = z.object({
  is_suspicious: z.boolean(),
  suspicious_reason: z.string().max(1000).optional(),
});

export const ForceConfirmConversionSchema = z.object({
  confirmation_mode: z.literal("admin_force").optional(),
});

// =============================================================================
// Query schemas (pagination + filters)
// =============================================================================

export const ListApplicationsQuery = z.object({
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const ListConversionsQuery = z.object({
  status: z.enum(["pending", "confirmed", "rejected", "expired"]).optional(),
  ambassador_id: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const ListRewardsQuery = z.object({
  status: z.enum(["active", "claimed", "expired"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const ListAdminProgramsQuery = z.object({
  is_active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const ListAdminConversionsQuery = z.object({
  status: z.enum(["pending", "confirmed", "rejected", "expired"]).optional(),
  is_suspicious: z.enum(["true", "false"]).optional(),
  establishment_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
