/**
 * Zod Schemas for Admin User Management Routes
 */

import { z } from "zod";

// POST /api/admin/security/password
export const SetSecurityPasswordSchema = z.object({
  password: z.string().min(6),
  current_password: z.string().optional(),
});

// POST /api/admin/security/password/verify
export const VerifySecurityPasswordSchema = z.object({
  password: z.string(),
  action: z.string().optional(),
});

// POST /api/admin/users/demo/delete
export const DeleteDemoAccountsSchema = z.object({
  security_password: z.string(),
  account_ids: z.array(z.string()).min(1),
});

// POST /api/admin/marketing/prospects/import
export const ImportProspectsSchema = z.object({
  prospects: z.array(z.any()),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
});

// POST /api/admin/marketing/prospects (add single)
export const AddProspectSchema = z.object({
  email: z.string(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
});

// PUT /api/admin/marketing/prospects/:id
export const UpdateProspectSchema = z.object({
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  subscribed: z.boolean().optional(),
  unsubscribe_reason: z.string().optional(),
});

// POST /api/admin/marketing/prospects/bulk-delete
export const BulkDeleteProspectsSchema = z.object({
  ids: z.array(z.string()).min(1),
  security_password: z.string(),
});

// POST /api/admin/marketing/prospects/export
export const ExportProspectsSchema = z.object({
  security_password: z.string(),
  tag: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  subscribed: z.boolean().optional(),
});
