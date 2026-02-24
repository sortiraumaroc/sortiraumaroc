/**
 * Public Ads — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// =============================================================================
// Query Schemas
// =============================================================================

/** GET /api/public/ads/sponsored */
export const SponsoredAdsQuery = z.object({
  city: z.string().optional(),
  universe: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5).optional(),
});

/** GET /api/public/ads/featured-pack */
export const FeaturedPackQuery = z.object({
  section: z.string().optional(),
  universe: z.string().optional(),
  exclude: z.string().optional(),
});

// =============================================================================
// Body Schemas
// =============================================================================

// POST /api/public/ads/impression
export const TrackImpressionSchema = z.object({
  campaign_id: z.string().min(1),
  position: z.number().optional(),
  search_query: z.string().optional(),
  user_id: z.string().optional(),
});

// POST /api/public/ads/click
export const TrackClickSchema = z.object({
  campaign_id: z.string().min(1),
  impression_id: z.string().optional(),
  user_id: z.string().optional(),
  destination_url: z.string().optional(),
});

// POST /api/public/ads/conversion
export const TrackConversionSchema = z.object({
  user_id: z.string().min(1),
  conversion_type: z.enum(["reservation", "pack_purchase", "page_view", "contact"]),
  conversion_value_cents: z.number().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  establishment_id: z.string().min(1),
});
