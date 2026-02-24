/**
 * Zod Schemas for Push Campaign Admin Routes
 *
 * Validates admin-facing push campaign inputs: create/update campaigns,
 * scheduling, test sends, audience preview, and delivery tracking.
 * Validates admin-facing push campaign inputs.
 */

import { z } from "zod";
import { zNonEmptyString, zUuid } from "../lib/validate";

// =============================================================================
// Param Schemas
// =============================================================================

/** Routes with :deliveryId — e.g. /campaigns/deliveries/:deliveryId/track */
export const DeliveryIdParams = z.object({
  deliveryId: zUuid,
});

// =============================================================================
// Query Schemas
// =============================================================================

/** GET /api/admin/campaigns */
export const ListCampaignsQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/admin/campaigns/:id/deliveries */
export const ListDeliveriesQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// =============================================================================
// Campaigns CRUD
// =============================================================================

/**
 * POST /api/admin/campaigns
 * Handler: createCampaignRoute
 */
export const CreateCampaignSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  audience_type: z.enum(["all", "segment"]).optional(),
  audience_filters: z.any().optional(),
  action_url: z.string().optional(),
  image_url: z.string().optional(),
  icon_url: z.string().optional(),
  data: z.any().optional(),
});

/**
 * PUT /api/admin/campaigns/:id
 * Handler: updateCampaignRoute
 */
export const UpdateCampaignSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  audience_type: z.enum(["all", "segment"]).optional(),
  audience_filters: z.any().optional(),
  action_url: z.string().optional(),
  image_url: z.string().optional(),
  icon_url: z.string().optional(),
  data: z.any().optional(),
});

/**
 * POST /api/admin/campaigns/:id/schedule
 * Handler: scheduleCampaignRoute
 */
export const ScheduleCampaignSchema = z.object({
  scheduled_at: zNonEmptyString,
});

/**
 * POST /api/admin/campaigns/:id/test
 * Handler: sendTestCampaignRoute
 */
export const SendTestCampaignSchema = z.object({
  test_user_id: zUuid,
});

// =============================================================================
// Audience
// =============================================================================

/**
 * POST /api/admin/audience/preview
 * Handler: previewAudience
 */
export const PreviewAudienceSchema = z.object({
  audience_type: z.enum(["all", "segment"]),
  audience_filters: z.any().optional(),
});

// =============================================================================
// Delivery Tracking
// =============================================================================

/**
 * POST /api/admin/campaigns/deliveries/:deliveryId/track
 * Handler: trackDeliveryRoute
 */
export const TrackDeliverySchema = z.object({
  action: z.enum(["opened", "clicked"]),
});
