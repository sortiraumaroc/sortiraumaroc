/**
 * Zod Schemas for Admin Email Routes
 */

import { z } from "zod";

// POST /api/admin/emails/templates/upsert
export const UpsertEmailTemplateSchema = z.object({
  id: z.string().optional().nullable(),
  key: z.string(),
  audience: z.string(),
  name: z.string(),
  subject_fr: z.string(),
  subject_en: z.string(),
  body_fr: z.string(),
  body_en: z.string(),
  cta_label_fr: z.string().optional().nullable(),
  cta_label_en: z.string().optional().nullable(),
  cta_url: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

// POST /api/admin/emails/branding/update
export const UpdateEmailBrandingSchema = z.object({
  logo_url: z.string().optional().nullable(),
  primary_color: z.string().optional().nullable(),
  secondary_color: z.string().optional().nullable(),
  background_color: z.string().optional().nullable(),
  from_name: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  signature_fr: z.string().optional().nullable(),
  signature_en: z.string().optional().nullable(),
  legal_links: z.any().optional(),
});

// POST /api/admin/emails/campaigns
export const CreateEmailCampaignSchema = z.object({
  name: z.string(),
  template_id: z.string(),
  audience: z.string(),
  subject_override: z.string().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
});

// POST /api/admin/emails/campaigns/:id/send
export const SendEmailCampaignSchema = z.object({
  limit: z.number().optional(),
  dry_run: z.boolean().optional(),
});

// POST /api/admin/emails/preview
export const PreviewEmailSchema = z.object({
  from: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  cta_label: z.string().optional().nullable(),
  cta_url: z.string().optional().nullable(),
  variables: z.any().optional(),
});
