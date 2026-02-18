/**
 * Banner Form Logic — Form validation, sanitization, notification
 *
 * Handles:
 *   - Validation of form responses against field definitions
 *   - Sanitization of form data (XSS prevention)
 *   - Storage of form responses
 *   - Notification to admin when form_notify_email is set
 *   - CSV export of form responses
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { sendTemplateEmail } from "./emailService";
import type { BannerFormField } from "../shared/notificationsBannersWheelTypes";

// =============================================================================
// Types
// =============================================================================

export interface FormValidationResult {
  ok: boolean;
  errors?: Record<string, string>;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate form responses against defined fields.
 */
export function validateFormResponse(
  fields: BannerFormField[],
  responses: Record<string, unknown>,
): FormValidationResult {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = responses[field.label];

    // Required check
    if (field.required && (value === undefined || value === null || value === "")) {
      errors[field.label] = "Ce champ est obligatoire";
      continue;
    }

    // Skip validation for empty optional fields
    if (value === undefined || value === null || value === "") continue;

    const strValue = String(value);

    // Type-specific validation
    switch (field.type) {
      case "email":
        if (!isValidEmail(strValue)) {
          errors[field.label] = "Email invalide";
        }
        break;

      case "phone":
        if (!isValidPhone(strValue)) {
          errors[field.label] = "Numéro de téléphone invalide";
        }
        break;

      case "text":
      case "textarea":
        if (strValue.length > 2000) {
          errors[field.label] = "Le texte ne peut pas dépasser 2000 caractères";
        }
        break;

      case "select":
        // Select must match one of the allowed options (if defined)
        if (field.options && field.options.length > 0) {
          if (!field.options.includes(strValue)) {
            errors[field.label] = "Valeur non autorisée";
          }
        }
        break;

      case "checkbox":
        if (typeof value !== "boolean" && value !== "true" && value !== "false") {
          errors[field.label] = "Valeur booléenne attendue";
        }
        break;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

// =============================================================================
// Sanitization
// =============================================================================

/**
 * Sanitize form responses to prevent XSS and dangerous content.
 */
export function sanitizeFormResponses(responses: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(responses)) {
    const cleanKey = sanitizeString(key);

    if (typeof value === "string") {
      sanitized[cleanKey] = sanitizeString(value);
    } else if (typeof value === "boolean" || typeof value === "number") {
      sanitized[cleanKey] = value;
    } else if (value === null || value === undefined) {
      sanitized[cleanKey] = null;
    } else {
      // Unknown type — convert to string and sanitize
      sanitized[cleanKey] = sanitizeString(String(value));
    }
  }

  return sanitized;
}

/**
 * Sanitize a string (XSS prevention).
 */
function sanitizeString(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    // Remove dangerous patterns
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .replace(/data:text\/html/gi, "")
    .trim()
    .substring(0, 5000); // Max field length
}

// =============================================================================
// Submit & Storage
// =============================================================================

/**
 * Submit a form response: validate, sanitize, store, notify.
 */
export async function submitFormResponse(
  bannerId: string,
  userId: string | null,
  responses: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  // Fetch banner with form config
  const { data: banner, error: fetchErr } = await supabase
    .from("banners")
    .select("type, form_fields, form_confirmation_message, form_notify_email, internal_name")
    .eq("id", bannerId)
    .single();

  if (fetchErr || !banner) return { ok: false, error: "Bannière introuvable" };
  if (banner.type !== "form") return { ok: false, error: "Cette bannière n'est pas un formulaire" };

  const fields = (banner.form_fields ?? []) as BannerFormField[];

  // Validate
  const validation = validateFormResponse(fields, responses);
  if (!validation.ok) {
    return { ok: false, error: `Validation: ${Object.values(validation.errors!).join(", ")}` };
  }

  // Sanitize
  const sanitizedResponses = sanitizeFormResponses(responses);

  // Store
  const { error: insertErr } = await supabase.from("banner_form_responses").insert({
    banner_id: bannerId,
    user_id: userId,
    responses: sanitizedResponses,
  });

  if (insertErr) {
    console.error("[BannerForm] Insert error:", insertErr.message);
    return { ok: false, error: "Erreur lors de la sauvegarde" };
  }

  // Increment form_submissions stat
  const { data: statData } = await supabase
    .from("banners")
    .select("stats_form_submissions")
    .eq("id", bannerId)
    .single();

  if (statData) {
    const current = (statData as { stats_form_submissions: number }).stats_form_submissions ?? 0;
    await supabase
      .from("banners")
      .update({ stats_form_submissions: current + 1 })
      .eq("id", bannerId);
  }

  // Notify admin via email (best-effort)
  if (banner.form_notify_email) {
    void sendFormNotificationEmail(
      banner.form_notify_email as string,
      banner.internal_name as string,
      sanitizedResponses,
    );
  }

  return { ok: true };
}

// =============================================================================
// CSV Export
// =============================================================================

/**
 * Export all form responses for a banner as CSV.
 */
export async function exportFormResponses(bannerId: string): Promise<{ ok: boolean; csv?: string; error?: string }> {
  const supabase = getAdminSupabase();

  // Get banner form fields (for column headers)
  const { data: banner } = await supabase
    .from("banners")
    .select("form_fields, internal_name")
    .eq("id", bannerId)
    .single();

  if (!banner) return { ok: false, error: "Bannière introuvable" };

  const fields = (banner.form_fields ?? []) as BannerFormField[];
  const headers = ["Date", "User ID", ...fields.map((f) => f.label)];

  // Get all responses
  const { data: responses, error } = await supabase
    .from("banner_form_responses")
    .select("*")
    .eq("banner_id", bannerId)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) return { ok: false, error: error.message };

  const rows = (responses ?? []) as { created_at: string; user_id: string | null; responses: Record<string, unknown> }[];

  // Build CSV
  const csvLines: string[] = [];

  // Header
  csvLines.push(headers.map(escapeCSV).join(","));

  // Data rows
  for (const row of rows) {
    const values = [
      row.created_at,
      row.user_id ?? "anonyme",
      ...fields.map((f) => String(row.responses?.[f.label] ?? "")),
    ];
    csvLines.push(values.map(escapeCSV).join(","));
  }

  return { ok: true, csv: csvLines.join("\n") };
}

// =============================================================================
// Helpers
// =============================================================================

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  // Allow international format
  return /^[+]?[\d\s()-]{6,20}$/.test(phone);
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function sendFormNotificationEmail(
  notifyEmail: string,
  bannerName: string,
  responses: Record<string, unknown>,
): Promise<void> {
  try {
    // Build a text summary of responses
    const responseSummary = Object.entries(responses)
      .map(([key, value]) => `${key}: ${value ?? "—"}`)
      .join("\n");

    await sendTemplateEmail({
      templateKey: "banner_form_response",
      lang: "fr",
      fromKey: "noreply",
      to: [notifyEmail],
      variables: {
        banner_name: bannerName,
        responses: responseSummary,
        submitted_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[BannerForm] Notification email error:", err);
  }
}
