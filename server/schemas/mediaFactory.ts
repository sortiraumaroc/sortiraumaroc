/**
 * Zod Schemas for Media Factory Routes
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";

// ══════════════════════════════════════════════════════════════════════════════
// Route Param Schemas
// ══════════════════════════════════════════════════════════════════════════════

/** :jobId (partner missions, admin jobs, admin communication logs) */
export const JobIdParams = z.object({ jobId: zUuid });

/** :deliverableId (partner deliverable upload) */
export const DeliverableIdParams = z.object({ deliverableId: zUuid });

/** :threadId (messaging threads — partner, admin, pro) */
export const ThreadIdParams = z.object({ threadId: zUuid });

/** :id (generic — admin job, deliverable, partner, notification, quick reply, article, attachment) */
export const MediaIdParams = z.object({ id: zUuid });

/** :token (public media checkin) */
export const MediaCheckinTokenParams = z.object({ token: z.string().min(1) });

/** :messageId (admin read receipts, attachments) */
export const MessageIdParams = z.object({ messageId: zUuid });

/** :establishmentId (pro media) */
export const MediaEstablishmentIdParams = z.object({ establishmentId: zUuid });

/** :establishmentId + :jobId (pro media jobs) */
export const EstablishmentIdJobIdParams = z.object({ establishmentId: zUuid, jobId: zUuid });

/** :establishmentId + :threadId (pro media messaging) */
export const EstablishmentIdThreadIdParams = z.object({ establishmentId: zUuid, threadId: zUuid });

// ══════════════════════════════════════════════════════════════════════════════
// Admin Production
// ══════════════════════════════════════════════════════════════════════════════

export const UpdateAdminMediaFactoryJobSchema = z.object({
  status: z.string().optional(),
  responsible_admin_id: z.string().nullable().optional(),
  scheduled_publish_at: z.string().nullable().optional(),
  published_links: z.any().optional(),
});

export const ApproveAdminMediaBriefSchema = z.object({
  review_note: z.string().nullable().optional(),
});

export const CreateAdminMediaScheduleSlotSchema = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  location_text: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export const AssignAdminDeliverablePartnerSchema = z.object({
  partner_user_id: z.string().nullable().optional(),
});

export const ReviewAdminDeliverableSchema = z.object({
  status: z.enum(["in_review", "approved", "rejected"]),
  review_comment: z.string().nullable().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Pro Media
// ══════════════════════════════════════════════════════════════════════════════

export const SaveProMediaBriefDraftSchema = z.object({
  payload: z.any().optional(),
});

export const SubmitProMediaBriefSchema = z.object({
  payload: z.any().optional(),
});

export const SelectProMediaScheduleSlotSchema = z.object({
  slot_id: z.string(),
});

export const ConfirmProMediaCheckinSchema = z.object({
  token: z.string(),
  note: z.string().nullable().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Partner Profile
// ══════════════════════════════════════════════════════════════════════════════

export const UpdatePartnerProfileSchema = z.object({
  display_name: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  legal_type: z.string().optional(),
  company_name: z.string().optional(),
  rib_iban: z.string().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Partner Invoicing
// ══════════════════════════════════════════════════════════════════════════════

export const RequestPartnerInvoiceSchema = z.object({
  role: z.string(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Admin Invoice Management (Compta)
// ══════════════════════════════════════════════════════════════════════════════

export const UpdateAdminInvoiceRequestSchema = z.object({
  status: z.enum(["requested", "approved", "paid", "rejected"]),
  payment_reference: z.string().nullable().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Public Check-in
// ══════════════════════════════════════════════════════════════════════════════

export const PublicMediaCheckinSchema = z.object({
  token: z.string(),
  note: z.string().nullable().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Admin Partner Management
// ══════════════════════════════════════════════════════════════════════════════

export const CreateAdminPartnerSchema = z.object({
  email: z.string(),
  password: z.string(),
  display_name: z.string(),
  primary_role: z.string(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateAdminPartnerSchema = z.object({
  display_name: z.string().optional(),
  primary_role: z.string().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
  active: z.boolean().optional(),
});

export const UpdateAdminPartnerBillingSchema = z.object({
  status: z.string().optional(),
  legal_name: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  ice: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  rib: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  swift: z.string().nullable().optional(),
  account_holder: z.string().nullable().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Messaging
// ══════════════════════════════════════════════════════════════════════════════

export const SendProMessageSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
});

export const SendPartnerMessageSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
});

export const SendAdminMessageSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
  recipient_role: z.string().optional(),
  is_internal: z.boolean().optional(),
  author_role: z.string().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Messaging with Attachments
// ══════════════════════════════════════════════════════════════════════════════

export const AdminSendMessageWithAttachmentsSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
  is_internal: z.boolean().optional(),
  recipient_role: z.string().nullable().optional(),
  attachments: z.array(z.any()).optional(),
});

export const ProSendMessageWithAttachmentsSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

export const PartnerSendMessageWithAttachmentsSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Communication Logs
// ══════════════════════════════════════════════════════════════════════════════

export const CreateAdminCommunicationLogSchema = z.object({
  channel: z.string(),
  summary: z.string(),
  next_action: z.string().nullable().optional(),
  participants: z.array(z.string()).optional(),
  log_date: z.string().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Quick Reply Templates
// ══════════════════════════════════════════════════════════════════════════════

export const CreateQuickReplyTemplateSchema = z.object({
  code: z.string(),
  label: z.string(),
  body: z.string(),
  category: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

export const UpdateQuickReplyTemplateSchema = z.object({
  code: z.string().optional(),
  label: z.string().optional(),
  body: z.string().optional(),
  category: z.string().optional(),
  variables: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Partner Blogger Articles
// ══════════════════════════════════════════════════════════════════════════════

export const CreatePartnerBloggerArticleSchema = z.object({
  title_fr: z.string(),
  title_en: z.string().optional(),
  excerpt_fr: z.string().optional(),
  excerpt_en: z.string().optional(),
  body_html_fr: z.string().optional(),
  body_html_en: z.string().optional(),
  meta_title_fr: z.string().optional(),
  meta_title_en: z.string().optional(),
  meta_description_fr: z.string().optional(),
  meta_description_en: z.string().optional(),
  img: z.string().optional(),
  miniature: z.string().optional(),
  category: z.string().optional(),
});

export const UpdatePartnerBloggerArticleSchema = z.object({
  title_fr: z.string().optional(),
  title_en: z.string().optional(),
  excerpt_fr: z.string().optional(),
  excerpt_en: z.string().optional(),
  body_html_fr: z.string().optional(),
  body_html_en: z.string().optional(),
  meta_title_fr: z.string().optional(),
  meta_title_en: z.string().optional(),
  meta_description_fr: z.string().optional(),
  meta_description_en: z.string().optional(),
  img: z.string().optional(),
  miniature: z.string().optional(),
  category: z.string().optional(),
});

// ══════════════════════════════════════════════════════════════════════════════
// Query Schemas (GET routes)
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/production/jobs */
export const ListAdminMediaJobsQuery = z.object({
  status: z.string().optional(),
  establishment_id: z.string().optional(),
});

/** GET /api/admin/production/invoice-requests */
export const ListAdminInvoiceRequestsQuery = z.object({
  status: z.string().optional(),
  job_id: z.string().optional(),
});

/** GET /api/admin/production/jobs/:id/brief.pdf */
export const AdminMediaBriefPdfQuery = z.object({
  new_token: z.string().optional(),
});

/** GET /api/pro/establishments/:establishmentId/media/messages/threads */
export const ListProMediaThreadsQuery = z.object({
  job_id: z.string().optional(),
});

/** GET /api/admin/production/messages/threads */
export const ListAdminMediaThreadsQuery = z.object({
  job_id: z.string().optional(),
  status: z.string().optional(),
});

/** GET /api/admin/production/communication-logs */
export const ListAdminCommunicationLogsQuery = z.object({
  job_id: z.string().optional(),
});

/** GET /api/admin/production/quick-replies */
export const ListQuickReplyTemplatesQuery = z.object({
  category: z.string().optional(),
  active_only: z.string().optional(),
});
