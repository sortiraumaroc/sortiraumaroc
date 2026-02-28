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

// =============================================================================
// Body Schemas (POST routes)
// =============================================================================

/** POST /api/admin/ads/campaigns — create campaign by admin (skip moderation) */
export const CreateAdminAdCampaignSchema = z.object({
  establishment_id: z.string().uuid("ID établissement invalide"),
  type: z.enum([
    "sponsored_results",
    "featured_pack",
    "home_takeover",
    "push_notification",
    "email_campaign",
    "display_banner",
  ]),
  title: z.string().min(1, "Titre requis").max(200),
  budget_cents: z.number().int().min(1000, "Budget minimum 10 MAD"),
  bid_amount_cents: z.number().int().min(1).optional(),
  daily_budget_cents: z.number().int().min(1).optional(),
  billing_model: z.enum(["cpc", "cpm", "cpd", "cpu", "flat"]).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  targeting: z.object({
    keywords: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    radius_km: z.number().optional(),
    device_types: z.array(z.enum(["mobile", "desktop", "tablet"])).optional(),
    days_of_week: z.array(z.number().int().min(0).max(6)).optional(),
    hours_of_day: z.array(z.number().int().min(0).max(23)).optional(),
    gender: z.enum(["homme", "femme", "tous"]).optional(),
    age_range: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    placements: z.array(z.string()).optional(),
  }).optional(),
  promoted_entity_type: z.enum(["establishment", "offer", "pack"]).optional(),
  promoted_entity_id: z.string().optional(),
});
