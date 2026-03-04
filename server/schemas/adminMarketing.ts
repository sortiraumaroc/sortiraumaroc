/**
 * Admin Marketing Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST /api/admin/ses/send */
export const sendEmailSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  html_body: z.string().min(1),
  text_body: z.string().optional(),
  from_email: z.string().optional(),
  from_name: z.string().optional(),
  reply_to: z.string().optional(),
});

/** POST /api/admin/ses/send-bulk */
export const sendBulkEmailSchema = z.object({
  campaign_id: z.string().min(1),
});

/** POST /api/admin/marketing/campaigns */
export const createCampaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  content_html: z.string().min(1),
  content_text: z.string().optional(),
  from_name: z.string().optional(),
  from_email: z.string().optional(),
  reply_to: z.string().optional(),
  target_type: z.string().optional(),
  target_tags: z.array(z.string()).optional(),
  target_cities: z.array(z.string()).optional(),
});

/** PUT /api/admin/marketing/campaigns/:id */
export const updateCampaignSchema = z.object({
  name: z.string().optional(),
  subject: z.string().optional(),
  content_html: z.string().optional(),
  content_text: z.string().optional(),
  from_name: z.string().optional(),
  from_email: z.string().optional(),
  reply_to: z.string().optional(),
  target_type: z.string().optional(),
  target_tags: z.array(z.string()).optional(),
  target_cities: z.array(z.string()).optional(),
});

/** POST /api/admin/marketing/campaigns/preview-recipients */
export const previewRecipientsSchema = z.object({
  target_type: z.string().optional(),
  target_tags: z.array(z.string()).optional(),
  target_cities: z.array(z.string()).optional(),
});
