import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";

// Types
export type ContactFormField = {
  id: string;
  form_id: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  helper_text: string | null;
  options: { value: string; label: string }[] | null;
  is_required: boolean;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  default_country_code: string | null;
  allowed_country_codes: string[] | null;
  allowed_file_types: string[] | null;
  max_file_size_mb: number | null;
  width: "full" | "half" | "third";
  sort_order: number;
  conditional_field_id: string | null;
  conditional_value: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactForm = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_background_color: string;
  hero_text_color: string;
  show_hero: boolean;
  logo_url: string | null;
  show_logo: boolean;
  form_title: string | null;
  submit_button_text: string;
  submit_button_color: string;
  success_message: string;
  success_redirect_url: string | null;
  layout: "split" | "centered" | "full-width";
  is_active: boolean;
  require_all_fields: boolean;
  send_confirmation_email: boolean;
  confirmation_email_subject: string | null;
  confirmation_email_body: string | null;
  notify_on_submission: boolean;
  notification_emails: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  fields?: ContactFormField[];
};

export type ContactFormSubmission = {
  id: string;
  form_id: string;
  data: Record<string, unknown>;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  status: "new" | "read" | "replied" | "archived" | "spam";
  admin_notes: string | null;
  handled_by: string | null;
  handled_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
  form?: ContactForm;
};

export type ContactFormStats = {
  form_id: string;
  form_name: string;
  slug: string;
  is_active: boolean;
  total_submissions: number;
  new_submissions: number;
  read_submissions: number;
  replied_submissions: number;
  archived_submissions: number;
  spam_submissions: number;
  last_submission_at: string | null;
};

// ============================================================================
// ADMIN ROUTES - Forms CRUD
// ============================================================================

/**
 * List all contact forms with stats
 */
export const listAdminContactForms: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("contact_form_stats")
      .select("*")
      .order("form_name", { ascending: true });

    if (error) throw error;

    res.json({ forms: data ?? [] });
  } catch (err) {
    console.error("[listAdminContactForms]", err);
    res.status(500).json({ error: "Failed to list contact forms" });
  }
};

/**
 * Get single contact form with fields
 */
export const getAdminContactForm: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();

    const { data: form, error: formError } = await supabase
      .from("contact_forms")
      .select("*")
      .eq("id", id)
      .single();

    if (formError) throw formError;
    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    const { data: fields, error: fieldsError } = await supabase
      .from("contact_form_fields")
      .select("*")
      .eq("form_id", id)
      .order("sort_order", { ascending: true });

    if (fieldsError) throw fieldsError;

    res.json({ form: { ...form, fields: fields ?? [] } });
  } catch (err) {
    console.error("[getAdminContactForm]", err);
    res.status(500).json({ error: "Failed to get contact form" });
  }
};

/**
 * Create new contact form
 */
export const createAdminContactForm: RequestHandler = async (req, res) => {
  try {
    const supabase = getAdminSupabase();
    const { name, slug, ...rest } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: "Name and slug are required" });
    }

    // Check slug uniqueness
    const { data: existing } = await supabase
      .from("contact_forms")
      .select("id")
      .eq("slug", slug)
      .single();

    if (existing) {
      return res.status(400).json({ error: "Slug already exists" });
    }

    const { data: form, error } = await supabase
      .from("contact_forms")
      .insert({ name, slug, ...rest })
      .select()
      .single();

    if (error) throw error;

    res.json({ form });
  } catch (err) {
    console.error("[createAdminContactForm]", err);
    res.status(500).json({ error: "Failed to create contact form" });
  }
};

/**
 * Update contact form
 */
export const updateAdminContactForm: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();
    const updates = req.body;

    // If slug is being changed, check uniqueness
    if (updates.slug) {
      const { data: existing } = await supabase
        .from("contact_forms")
        .select("id")
        .eq("slug", updates.slug)
        .neq("id", id)
        .single();

      if (existing) {
        return res.status(400).json({ error: "Slug already exists" });
      }
    }

    const { data: form, error } = await supabase
      .from("contact_forms")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ form });
  } catch (err) {
    console.error("[updateAdminContactForm]", err);
    res.status(500).json({ error: "Failed to update contact form" });
  }
};

/**
 * Delete contact form
 */
export const deleteAdminContactForm: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("contact_forms")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("[deleteAdminContactForm]", err);
    res.status(500).json({ error: "Failed to delete contact form" });
  }
};

/**
 * Duplicate contact form
 */
export const duplicateAdminContactForm: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();

    // Get original form
    const { data: original, error: getError } = await supabase
      .from("contact_forms")
      .select("*")
      .eq("id", id)
      .single();

    if (getError || !original) {
      return res.status(404).json({ error: "Form not found" });
    }

    // Get original fields
    const { data: originalFields } = await supabase
      .from("contact_form_fields")
      .select("*")
      .eq("form_id", id)
      .order("sort_order", { ascending: true });

    // Create new form with copy suffix
    const newSlug = `${original.slug}-copy-${Date.now()}`;
    const { id: _id, created_at, updated_at, ...formData } = original;

    const { data: newForm, error: createError } = await supabase
      .from("contact_forms")
      .insert({
        ...formData,
        name: `${original.name} (copie)`,
        slug: newSlug,
        is_active: false,
      })
      .select()
      .single();

    if (createError) throw createError;

    // Copy fields if any
    if (originalFields && originalFields.length > 0) {
      const newFields = originalFields.map((field) => {
        const { id: _fieldId, form_id, created_at: _fc, updated_at: _fu, ...fieldData } = field;
        return { ...fieldData, form_id: newForm.id };
      });

      await supabase.from("contact_form_fields").insert(newFields);
    }

    res.json({ form: newForm });
  } catch (err) {
    console.error("[duplicateAdminContactForm]", err);
    res.status(500).json({ error: "Failed to duplicate contact form" });
  }
};

// ============================================================================
// ADMIN ROUTES - Fields CRUD
// ============================================================================

/**
 * Add field to form
 */
export const addAdminContactFormField: RequestHandler = async (req, res) => {
  try {
    const { formId } = req.params;
    const supabase = getAdminSupabase();
    const fieldData = req.body;

    // Get max sort_order
    const { data: maxOrder } = await supabase
      .from("contact_form_fields")
      .select("sort_order")
      .eq("form_id", formId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const { data: field, error } = await supabase
      .from("contact_form_fields")
      .insert({
        ...fieldData,
        form_id: formId,
        sort_order: (maxOrder?.sort_order ?? -1) + 1,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ field });
  } catch (err) {
    console.error("[addAdminContactFormField]", err);
    res.status(500).json({ error: "Failed to add field" });
  }
};

/**
 * Update field
 */
export const updateAdminContactFormField: RequestHandler = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const supabase = getAdminSupabase();
    const updates = req.body;

    const { data: field, error } = await supabase
      .from("contact_form_fields")
      .update(updates)
      .eq("id", fieldId)
      .select()
      .single();

    if (error) throw error;

    res.json({ field });
  } catch (err) {
    console.error("[updateAdminContactFormField]", err);
    res.status(500).json({ error: "Failed to update field" });
  }
};

/**
 * Delete field
 */
export const deleteAdminContactFormField: RequestHandler = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("contact_form_fields")
      .delete()
      .eq("id", fieldId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("[deleteAdminContactFormField]", err);
    res.status(500).json({ error: "Failed to delete field" });
  }
};

/**
 * Reorder fields
 */
export const reorderAdminContactFormFields: RequestHandler = async (req, res) => {
  try {
    const { formId } = req.params;
    const { fieldIds } = req.body; // Array of field IDs in new order
    const supabase = getAdminSupabase();

    // Update sort_order for each field
    const updates = fieldIds.map((id: string, index: number) =>
      supabase
        .from("contact_form_fields")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("form_id", formId)
    );

    await Promise.all(updates);

    res.json({ success: true });
  } catch (err) {
    console.error("[reorderAdminContactFormFields]", err);
    res.status(500).json({ error: "Failed to reorder fields" });
  }
};

// ============================================================================
// ADMIN ROUTES - Submissions
// ============================================================================

/**
 * List submissions for a form
 */
export const listAdminContactFormSubmissions: RequestHandler = async (req, res) => {
  try {
    const { formId } = req.params;
    const { status, search, limit = 50, offset = 0 } = req.query;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("contact_form_submissions")
      .select("*, contact_forms(name, slug)", { count: "exact" })
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ submissions: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[listAdminContactFormSubmissions]", err);
    res.status(500).json({ error: "Failed to list submissions" });
  }
};

/**
 * List all submissions (across all forms)
 */
export const listAllAdminContactFormSubmissions: RequestHandler = async (req, res) => {
  try {
    const { status, search, formId, limit = 50, offset = 0 } = req.query;
    const supabase = getAdminSupabase();

    let query = supabase
      .from("contact_form_submissions")
      .select("*, contact_forms(name, slug)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (formId) {
      query = query.eq("form_id", formId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ submissions: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[listAllAdminContactFormSubmissions]", err);
    res.status(500).json({ error: "Failed to list submissions" });
  }
};

/**
 * Get single submission with form details
 */
export const getAdminContactFormSubmission: RequestHandler = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const supabase = getAdminSupabase();

    const { data: submission, error } = await supabase
      .from("contact_form_submissions")
      .select("*, contact_forms(*)")
      .eq("id", submissionId)
      .single();

    if (error) throw error;
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Get form fields for display
    const { data: fields } = await supabase
      .from("contact_form_fields")
      .select("*")
      .eq("form_id", submission.form_id)
      .order("sort_order", { ascending: true });

    // Get uploaded files
    const { data: files } = await supabase
      .from("contact_form_files")
      .select("*")
      .eq("submission_id", submissionId);

    res.json({ submission, fields: fields ?? [], files: files ?? [] });
  } catch (err) {
    console.error("[getAdminContactFormSubmission]", err);
    res.status(500).json({ error: "Failed to get submission" });
  }
};

/**
 * Update submission status
 */
export const updateAdminContactFormSubmission: RequestHandler = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { status, admin_notes, handled_by } = req.body;
    const supabase = getAdminSupabase();

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (handled_by) {
      updates.handled_by = handled_by;
      updates.handled_at = new Date().toISOString();
    }

    const { data: submission, error } = await supabase
      .from("contact_form_submissions")
      .update(updates)
      .eq("id", submissionId)
      .select()
      .single();

    if (error) throw error;

    res.json({ submission });
  } catch (err) {
    console.error("[updateAdminContactFormSubmission]", err);
    res.status(500).json({ error: "Failed to update submission" });
  }
};

/**
 * Bulk update submissions
 */
export const bulkUpdateAdminContactFormSubmissions: RequestHandler = async (req, res) => {
  try {
    const { submissionIds, status } = req.body;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("contact_form_submissions")
      .update({ status })
      .in("id", submissionIds);

    if (error) throw error;

    res.json({ success: true, updated: submissionIds.length });
  } catch (err) {
    console.error("[bulkUpdateAdminContactFormSubmissions]", err);
    res.status(500).json({ error: "Failed to bulk update submissions" });
  }
};

/**
 * Delete submission
 */
export const deleteAdminContactFormSubmission: RequestHandler = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("contact_form_submissions")
      .delete()
      .eq("id", submissionId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("[deleteAdminContactFormSubmission]", err);
    res.status(500).json({ error: "Failed to delete submission" });
  }
};

/**
 * Export submissions to CSV
 */
export const exportAdminContactFormSubmissions: RequestHandler = async (req, res) => {
  try {
    const { formId } = req.params;
    const { status } = req.query;
    const supabase = getAdminSupabase();

    // Get form and fields
    const { data: form } = await supabase
      .from("contact_forms")
      .select("*")
      .eq("id", formId)
      .single();

    const { data: fields } = await supabase
      .from("contact_form_fields")
      .select("*")
      .eq("form_id", formId)
      .order("sort_order", { ascending: true });

    // Get submissions
    let query = supabase
      .from("contact_form_submissions")
      .select("*")
      .eq("form_id", formId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: submissions } = await query;

    if (!submissions || !fields) {
      return res.status(404).json({ error: "Form or submissions not found" });
    }

    // Build CSV
    const headers = ["ID", "Date", "Status", "Email", "Téléphone", "Nom", ...fields.map(f => f.label)];
    const rows = submissions.map(sub => {
      const data = sub.data as Record<string, unknown>;
      return [
        sub.id,
        new Date(sub.created_at).toLocaleString("fr-FR"),
        sub.status,
        sub.email || "",
        sub.phone || "",
        sub.full_name || "",
        ...fields.map(f => String(data[f.id] ?? ""))
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${form?.slug || 'submissions'}-export.csv"`);
    res.send("\uFEFF" + csv); // BOM for Excel
  } catch (err) {
    console.error("[exportAdminContactFormSubmissions]", err);
    res.status(500).json({ error: "Failed to export submissions" });
  }
};

/**
 * Get unread submissions count (for notifications badge)
 */
export const getAdminContactFormsUnreadCount: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    const { count, error } = await supabase
      .from("contact_form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");

    if (error) throw error;

    res.json({ count: count ?? 0 });
  } catch (err) {
    console.error("[getAdminContactFormsUnreadCount]", err);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};
