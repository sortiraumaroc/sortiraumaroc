/**
 * Zod Schemas for Pro Ads Routes
 *
 * Validates pro-facing advertising inputs (wallet, campaigns, takeover).
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zUuid } from "../lib/validate";

// =============================================================================
// Route Params
// =============================================================================

/** :id (establishment id — named :id in proAds routes) */
export const ProAdsIdParams = z.object({ id: zUuid });

/** :id + :campaignId */
export const ProAdsIdCampaignIdParams = z.object({ id: zUuid, campaignId: zUuid });

// =============================================================================
// Wallet
// =============================================================================

export const InitiateWalletRechargeSchema = z.object({
  amount_mad: z.coerce.number().min(1),
  accept_url: z.string().optional(),
  decline_url: z.string().optional(),
});

// =============================================================================
// Campaigns
// =============================================================================

export const CreateAdCampaignSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  budget_cents: z.coerce.number().min(1),
  bid_amount_cents: z.coerce.number().optional(),
  daily_budget_cents: z.coerce.number().optional(),
  billing_model: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  targeting: z.record(z.unknown()).optional(),
  promoted_entity_type: z.string().optional(),
  promoted_entity_id: z.string().optional(),
});

export const UpdateAdCampaignSchema = z.object({
  title: z.string().optional(),
  budget_cents: z.coerce.number().optional(),
  bid_amount_cents: z.coerce.number().optional(),
  daily_budget_cents: z.coerce.number().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  targeting: z.record(z.unknown()).optional(),
  status: z.string().optional(),
});

// =============================================================================
// Home Takeover
// =============================================================================

export const ReserveHomeTakeoverDaySchema = z.object({
  date: z.string().min(1),
  bid_cents: z.coerce.number().min(1),
  title: z.string().optional(),
  banner_desktop_url: z.string().optional(),
  banner_mobile_url: z.string().optional(),
  cta_text: z.string().optional(),
  cta_url: z.string().optional(),
});
