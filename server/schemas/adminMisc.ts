/**
 * Zod Schemas for Admin Misc Routes
 *
 * Validates admin-facing miscellaneous inputs: support tickets, test email,
 * platform settings, username moderation, username subscriptions,
 * claim requests, establishment leads, finance discrepancies & payouts.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :requestId — username requests */
export const UsernameRequestParams = z.object({
  requestId: zUuid,
});

/** :key — platform settings, feature flags (string, not UUID) */
export const PlatformSettingKeyParams = z.object({
  key: z.string().min(1, "Clé requise"),
});

/** :key — feature-flag key (string, not UUID) */
export const FeatureFlagKeyParams = z.object({
  key: z.string().min(1, "Clé requise"),
});

// =============================================================================
// Support Tickets
// =============================================================================

/**
 * POST /api/admin/support-tickets/:id/messages
 * Handler: postAdminSupportTicketMessage
 */
export const PostSupportTicketMessageSchema = z.object({
  body: z.string().min(1, "Contenu requis"),
  is_internal: z.boolean().optional(),
});

/**
 * PUT /api/admin/support-tickets/:id
 * Handler: updateAdminSupportTicket
 */
export const UpdateSupportTicketSchema = z.object({
  status: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  assignee_user_id: z.string().optional().nullable(),
});

// =============================================================================
// Test Email
// =============================================================================

/**
 * POST /api/admin/test-email
 * Handler: sendAdminTestEmail
 */
export const SendTestEmailSchema = z.object({
  from: z.enum(["hello", "support", "pro", "finance", "noreply"]),
  to: z.string().min(1, "Email destinataire requis"),
  subject: z.string().max(160).optional(),
  message: z.string().max(4000).optional(),
  cta_label: z.string().max(60).optional().nullable(),
  cta_url: z.string().max(500).optional().nullable(),
});

// =============================================================================
// Platform Settings
// =============================================================================

/**
 * POST /api/admin/settings/platform/:key/update
 * Handler: updatePlatformSettingHandler
 */
export const UpdatePlatformSettingSchema = z.object({
  value: z.string({ required_error: "Valeur requise (string)" }),
});

/**
 * POST /api/admin/settings/platform/set-mode
 * Handler: setPlatformModeHandler
 */
export const SetPlatformModeSchema = z.object({
  mode: z.enum(["test", "commercial", "maintenance"], {
    errorMap: () => ({ message: "Mode invalide. Valeurs acceptées: test, commercial, maintenance" }),
  }),
});

// =============================================================================
// Username Moderation
// =============================================================================

/**
 * POST /api/admin/username-requests/:requestId/reject
 * Handler: rejectUsernameRequest
 */
export const RejectUsernameRequestSchema = z.object({
  reason: z.string().optional().nullable(),
});

// =============================================================================
// Username Subscriptions
// =============================================================================

/**
 * POST /api/admin/username-subscriptions/:id/extend
 * Handler: extendAdminUsernameSubscription
 */
export const ExtendUsernameSubscriptionSchema = z.object({
  days: z.coerce.number().min(1, "Nombre de jours requis"),
});

// =============================================================================
// Claim Requests
// =============================================================================

/**
 * PUT /api/admin/claim-requests/:id
 * Handler: updateAdminClaimRequest
 */
export const UpdateClaimRequestSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "contacted"], {
    errorMap: () => ({ message: "Statut invalide" }),
  }),
  notes: z.string().optional().nullable(),
  sendCredentials: z.boolean().optional(),
});

// =============================================================================
// Establishment Leads
// =============================================================================

/**
 * PUT /api/admin/establishment-leads/:id
 * Handler: updateAdminEstablishmentLead
 */
export const UpdateEstablishmentLeadSchema = z.object({
  status: z.enum(["new", "contacted", "converted", "rejected"], {
    errorMap: () => ({ message: "Statut invalide" }),
  }),
  notes: z.string().optional().nullable(),
});

// =============================================================================
// Finance: Discrepancies
// =============================================================================

/**
 * PUT /api/admin/finance/discrepancies/:id
 * Handler: updateAdminFinanceDiscrepancy
 */
export const UpdateFinanceDiscrepancySchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]).optional(),
  notes: z.string().optional().nullable(),
});

// =============================================================================
// Finance: Payouts
// =============================================================================

/**
 * PUT /api/admin/finance/payouts/:id
 * Handler: updateAdminFinancePayout
 */
export const UpdateFinancePayoutSchema = z.object({
  status: z.enum(["pending", "processing", "sent", "failed", "cancelled"]).optional(),
  provider: z.string().optional().nullable(),
  provider_reference: z.string().optional().nullable(),
  failure_reason: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/support/tickets */
export const ListSupportTicketsQuery = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  role: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** GET /api/admin/impact */
export const AdminImpactReportQuery = z.object({
  after_start: z.string().optional(),
  after_end: z.string().optional(),
  before_start: z.string().optional(),
  before_end: z.string().optional(),
  series_weeks: z.coerce.number().int().min(1).max(52).optional(),
});

/** GET /api/admin/logs */
export const ListAdminLogsQuery = z.object({
  source: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** GET /api/admin/username-requests */
export const ListUsernameRequestsQuery = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** GET /api/admin/username-subscriptions */
export const ListUsernameSubscriptionsQuery = z.object({
  status: z.string().optional(),
  establishmentId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** GET /api/admin/claim-requests */
export const ListClaimRequestsQuery = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** GET /api/admin/establishment-leads */
export const ListEstablishmentLeadsQuery = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** GET /api/admin/finance/discrepancies */
export const ListFinanceDiscrepanciesQuery = z.object({
  status: z.string().optional(),
  severity: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** GET /api/admin/finance/reconcile/run (POST but reads query) */
export const RunFinanceReconciliationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/** GET /api/admin/finance/payouts */
export const ListFinancePayoutsQuery = z.object({
  status: z.string().optional(),
  establishment_id: z.string().optional(),
  currency: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
