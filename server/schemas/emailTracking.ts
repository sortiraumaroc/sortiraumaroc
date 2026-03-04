/**
 * Zod Schemas for Email Tracking Routes (Query Params)
 */

import { z } from "zod";

/** GET /api/public/email/open */
export const TrackEmailOpenQuery = z.object({
  email_id: z.string().optional(),
  campaign_id: z.string().optional(),
  recipient_id: z.string().optional(),
});

/** GET /api/public/email/click */
export const TrackEmailClickQuery = z.object({
  email_id: z.string().optional(),
  campaign_id: z.string().optional(),
  recipient_id: z.string().optional(),
  url: z.string().optional(),
});

/** GET /api/public/email/unsubscribe */
export const TrackEmailUnsubscribeQuery = z.object({
  campaign_id: z.string().optional(),
  email: z.string().optional(),
  token: z.string().optional(),
});
