/**
 * Zod Schemas for Admin Contact Forms Routes
 *
 * Validates admin-facing contact form inputs: form CRUD, field management,
 * submission handling, and bulk operations.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zNonEmptyString, zUuid } from "../lib/validate";

// =============================================================================
// Param Schemas
// =============================================================================

/** Routes with :formId — e.g. /contact-forms/:formId/fields */
export const FormIdParams = z.object({
  formId: zUuid,
});

/** Routes with :fieldId — e.g. /contact-forms/fields/:fieldId */
export const FieldIdParams = z.object({
  fieldId: zUuid,
});

/** Routes with :submissionId — e.g. /contact-forms/submissions/:submissionId */
export const SubmissionIdParams = z.object({
  submissionId: zUuid,
});

// =============================================================================
// Forms CRUD
// =============================================================================

/**
 * POST /api/admin/contact-forms
 * Handler: createAdminContactForm
 */
export const CreateContactFormSchema = z.object({
  name: zNonEmptyString,
  slug: zNonEmptyString,
  description: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  hero_title: z.string().optional(),
  hero_subtitle: z.string().nullable().optional(),
  hero_background_color: z.string().optional(),
  hero_text_color: z.string().optional(),
  show_hero: z.boolean().optional(),
  logo_url: z.string().nullable().optional(),
  show_logo: z.boolean().optional(),
  form_title: z.string().nullable().optional(),
  submit_button_text: z.string().optional(),
  submit_button_color: z.string().optional(),
  success_message: z.string().optional(),
  success_redirect_url: z.string().nullable().optional(),
  layout: z.enum(["split", "centered", "full-width"]).optional(),
  is_active: z.boolean().optional(),
  require_all_fields: z.boolean().optional(),
  send_confirmation_email: z.boolean().optional(),
  confirmation_email_subject: z.string().nullable().optional(),
  confirmation_email_body: z.string().nullable().optional(),
  notify_on_submission: z.boolean().optional(),
  notification_emails: z.array(z.string()).nullable().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
});

/**
 * POST /api/admin/contact-forms/:id/update
 * Handler: updateAdminContactForm
 */
export const UpdateContactFormSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  hero_title: z.string().optional(),
  hero_subtitle: z.string().nullable().optional(),
  hero_background_color: z.string().optional(),
  hero_text_color: z.string().optional(),
  show_hero: z.boolean().optional(),
  logo_url: z.string().nullable().optional(),
  show_logo: z.boolean().optional(),
  form_title: z.string().nullable().optional(),
  submit_button_text: z.string().optional(),
  submit_button_color: z.string().optional(),
  success_message: z.string().optional(),
  success_redirect_url: z.string().nullable().optional(),
  layout: z.enum(["split", "centered", "full-width"]).optional(),
  is_active: z.boolean().optional(),
  require_all_fields: z.boolean().optional(),
  send_confirmation_email: z.boolean().optional(),
  confirmation_email_subject: z.string().nullable().optional(),
  confirmation_email_body: z.string().nullable().optional(),
  notify_on_submission: z.boolean().optional(),
  notification_emails: z.array(z.string()).nullable().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
});

// =============================================================================
// Fields CRUD
// =============================================================================

/**
 * POST /api/admin/contact-forms/:formId/fields
 * Handler: addAdminContactFormField
 */
export const AddContactFormFieldSchema = z.object({
  field_type: zNonEmptyString,
  label: zNonEmptyString,
  placeholder: z.string().nullable().optional(),
  helper_text: z.string().nullable().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable().optional(),
  is_required: z.boolean().optional(),
  min_length: z.number().nullable().optional(),
  max_length: z.number().nullable().optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  pattern: z.string().nullable().optional(),
  default_country_code: z.string().nullable().optional(),
  allowed_country_codes: z.array(z.string()).nullable().optional(),
  allowed_file_types: z.array(z.string()).nullable().optional(),
  max_file_size_mb: z.number().nullable().optional(),
  width: z.enum(["full", "half", "third"]).optional(),
  conditional_field_id: z.string().nullable().optional(),
  conditional_value: z.string().nullable().optional(),
});

/**
 * POST /api/admin/contact-forms/fields/:fieldId/update
 * Handler: updateAdminContactFormField
 */
export const UpdateContactFormFieldSchema = z.object({
  field_type: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().nullable().optional(),
  helper_text: z.string().nullable().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable().optional(),
  is_required: z.boolean().optional(),
  min_length: z.number().nullable().optional(),
  max_length: z.number().nullable().optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  pattern: z.string().nullable().optional(),
  default_country_code: z.string().nullable().optional(),
  allowed_country_codes: z.array(z.string()).nullable().optional(),
  allowed_file_types: z.array(z.string()).nullable().optional(),
  max_file_size_mb: z.number().nullable().optional(),
  width: z.enum(["full", "half", "third"]).optional(),
  sort_order: z.number().optional(),
  conditional_field_id: z.string().nullable().optional(),
  conditional_value: z.string().nullable().optional(),
});

/**
 * POST /api/admin/contact-forms/:formId/fields/reorder
 * Handler: reorderAdminContactFormFields
 */
export const ReorderContactFormFieldsSchema = z.object({
  fieldIds: z.array(z.string()),
});

// =============================================================================
// Submissions
// =============================================================================

/**
 * POST /api/admin/contact-forms/submissions/:submissionId/update
 * Handler: updateAdminContactFormSubmission
 */
export const UpdateContactFormSubmissionSchema = z.object({
  status: z.enum(["new", "read", "replied", "archived", "spam"]).optional(),
  admin_notes: z.string().nullable().optional(),
  handled_by: z.string().optional(),
});

/**
 * POST /api/admin/contact-forms/submissions/bulk-update
 * Handler: bulkUpdateAdminContactFormSubmissions
 */
export const BulkUpdateContactFormSubmissionsSchema = z.object({
  submissionIds: z.array(z.string()),
  status: z.enum(["new", "read", "replied", "archived", "spam"]),
});
