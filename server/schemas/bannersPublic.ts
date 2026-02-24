/**
 * Banners Public — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// POST /api/banners/:id/view
export const BannerViewSchema = z.object({
  session_id: z.string().optional(),
});

// POST /api/banners/:id/click
export const BannerClickSchema = z.object({
  session_id: z.string().optional(),
});

// POST /api/banners/:id/form-submit
// Body is a freeform object — validated downstream by submitFormResponse
export const BannerFormSubmitSchema = z.object({});

// =============================================================================
// Query Schemas
// =============================================================================

/** GET /api/banners/eligible */
export const EligibleBannerQuery = z.object({
  platform: z.enum(["web", "mobile"]).optional(),
  trigger: z.string().optional(),
  page: z.string().optional(),
  session_id: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for banners (UUID) */
export const BannerIdParams = z.object({ id: zUuid });
