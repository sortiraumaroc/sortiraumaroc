/**
 * Zod Schemas for Admin Media Quotes Routes
 *
 * Validates admin-facing media module inputs: quotes CRUD, quote items,
 * pro profile updates, and email sending for quotes/invoices.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :id/items/:itemId — media quote item */
export const MediaQuoteItemParams = z.object({
  id: zUuid,
  itemId: zUuid,
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/pro-profiles */
export const ListAdminProProfilesQuery = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** GET /api/admin/media/quotes */
export const ListAdminMediaQuotesQuery = z.object({
  status: z.string().optional(),
  client_type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** GET /api/admin/media/invoices */
export const ListAdminMediaInvoicesQuery = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// =============================================================================
// Media Quotes
// =============================================================================

/**
 * POST /api/admin/media/quotes
 * Handler: createAdminMediaQuote
 */
export const CreateAdminMediaQuoteSchema = z.object({
  pro_user_id: z.string().min(1, "Identifiant Pro requis"),
  establishment_id: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  delivery_estimate: z.string().optional().nullable(),
  payment_method: z.string().optional(),
  paymentMethod: z.string().optional(),
});

/**
 * POST /api/admin/media/quotes/:id/update
 * Handler: updateAdminMediaQuote
 */
export const UpdateAdminMediaQuoteSchema = z.object({
  status: z.string().optional(),
  valid_until: z.string().optional().nullable(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  delivery_estimate: z.string().optional().nullable(),
  payment_method: z.string().optional(),
  paymentMethod: z.string().optional(),
});

// =============================================================================
// Media Quote Items
// =============================================================================

/**
 * POST /api/admin/media/quotes/:id/items
 * Handler: addAdminMediaQuoteItem
 */
export const AddAdminMediaQuoteItemSchema = z.object({
  catalog_item_id: z.string().optional(),
  quantity: z.coerce.number().optional(),
  // Superadmin-only (free lines)
  item_type: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unit_price: z.coerce.number().optional(),
  tax_rate: z.coerce.number().optional(),
});

/**
 * POST /api/admin/media/quotes/:id/items/:itemId/update
 * Handler: updateAdminMediaQuoteItem
 */
export const UpdateAdminMediaQuoteItemSchema = z.object({
  quantity: z.coerce.number().optional(),
});

// =============================================================================
// Pro Profiles
// =============================================================================

/**
 * POST /api/admin/pro-profiles/:id/update
 * Handler: updateAdminProProfile
 */
export const UpdateAdminProProfileSchema = z.object({
  company_name: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  ice: z.string().optional().nullable(),
  rc: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  client_type: z.enum(["A", "B", "a", "b"]).optional(),
});

// =============================================================================
// Email Sending
// =============================================================================

/**
 * POST /api/admin/media/quotes/:id/send-email
 * Handler: sendAdminMediaQuoteEmail
 */
export const SendAdminMediaQuoteEmailSchema = z.object({
  lang: z.string().optional(),
  to_email: z.string().optional(),
});

/**
 * POST /api/admin/media/invoices/:id/send-email
 * Handler: sendAdminMediaInvoiceEmail
 */
export const SendAdminMediaInvoiceEmailSchema = z.object({
  lang: z.string().optional(),
  to_email: z.string().optional(),
  payment_link: z.string().optional().nullable(),
});
