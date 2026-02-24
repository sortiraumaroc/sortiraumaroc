/**
 * Zod Schemas for Admin Ads Routes
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :campaignId — ad campaign */
export const AdCampaignParams = z.object({
  campaignId: zUuid,
});

/** :productType — auction config (string, not UUID) */
export const AuctionConfigParams = z.object({
  productType: z.string().min(1, "Type de produit requis"),
});

/** :date — home takeover calendar date (YYYY-MM-DD) */
export const HomeTakeoverDateParams = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (attendu: YYYY-MM-DD)"),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/ads/campaigns — list all campaigns */
export const ListAdminAdsCampaignsQuery = z.object({
  status: z.string().optional(),
  moderation_status: z.string().optional(),
  type: z.string().optional(),
  establishment_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

/** GET /api/admin/ads/revenue — revenue stats */
export const GetAdminAdsRevenueQuery = z.object({
  period: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

/** GET /api/admin/ads/home-takeover/calendar — admin home takeover calendar */
export const GetAdminHomeTakeoverCalendarQuery = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
