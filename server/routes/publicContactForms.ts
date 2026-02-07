import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { sendLoggedEmail } from "../emailService";

/**
 * Get public form by slug (for display)
 */
export const getPublicContactForm: RequestHandler = async (req, res) => {
  try {
    const { slug } = req.params;
    const supabase = getAdminSupabase();

    const { data: form, error: formError } = await supabase
      .from("contact_forms")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (formError || !form) {
      return res.status(404).json({ error: "Form not found" });
    }

    const { data: fields, error: fieldsError } = await supabase
      .from("contact_form_fields")
      .select("*")
      .eq("form_id", form.id)
      .order("sort_order", { ascending: true });

    if (fieldsError) throw fieldsError;

    // Don't expose internal fields
    const publicForm = {
      id: form.id,
      name: form.name,
      slug: form.slug,
      hero_image_url: form.hero_image_url,
      hero_title: form.hero_title,
      hero_subtitle: form.hero_subtitle,
      hero_background_color: form.hero_background_color,
      hero_text_color: form.hero_text_color,
      show_hero: form.show_hero,
      logo_url: form.logo_url,
      show_logo: form.show_logo,
      form_title: form.form_title,
      submit_button_text: form.submit_button_text,
      submit_button_color: form.submit_button_color,
      success_message: form.success_message,
      success_redirect_url: form.success_redirect_url,
      layout: form.layout,
      meta_title: form.meta_title,
      meta_description: form.meta_description,
      fields: fields?.map(f => ({
        id: f.id,
        field_type: f.field_type,
        label: f.label,
        placeholder: f.placeholder,
        helper_text: f.helper_text,
        options: f.options,
        is_required: f.is_required,
        min_length: f.min_length,
        max_length: f.max_length,
        min_value: f.min_value,
        max_value: f.max_value,
        pattern: f.pattern,
        default_country_code: f.default_country_code,
        allowed_country_codes: f.allowed_country_codes,
        allowed_file_types: f.allowed_file_types,
        max_file_size_mb: f.max_file_size_mb,
        width: f.width,
        conditional_field_id: f.conditional_field_id,
        conditional_value: f.conditional_value,
      })) ?? [],
    };

    res.json({ form: publicForm });
  } catch (err) {
    console.error("[getPublicContactForm]", err);
    res.status(500).json({ error: "Failed to get form" });
  }
};

/**
 * Submit form response
 */
export const submitPublicContactForm: RequestHandler = async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: formData, utm_source, utm_medium, utm_campaign } = req.body;
    const supabase = getAdminSupabase();

    // Get form
    const { data: form, error: formError } = await supabase
      .from("contact_forms")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (formError || !form) {
      return res.status(404).json({ error: "Form not found" });
    }

    // Get fields for validation
    const { data: fields } = await supabase
      .from("contact_form_fields")
      .select("*")
      .eq("form_id", form.id);

    if (!fields) {
      return res.status(500).json({ error: "Failed to get form fields" });
    }

    // Validate required fields
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const value = formData[field.id];

      if (field.is_required && (!value || (typeof value === "string" && !value.trim()))) {
        errors[field.id] = `${field.label} est requis`;
        continue;
      }

      if (value && typeof value === "string") {
        // Min length
        if (field.min_length && value.length < field.min_length) {
          errors[field.id] = `${field.label} doit contenir au moins ${field.min_length} caractères`;
        }
        // Max length
        if (field.max_length && value.length > field.max_length) {
          errors[field.id] = `${field.label} ne doit pas dépasser ${field.max_length} caractères`;
        }
        // Pattern
        if (field.pattern && !new RegExp(field.pattern).test(value)) {
          errors[field.id] = `${field.label} n'est pas dans un format valide`;
        }
        // Email validation
        if (field.field_type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors[field.id] = "Adresse email invalide";
        }
      }

      if (value && typeof value === "number") {
        if (field.min_value !== null && value < field.min_value) {
          errors[field.id] = `${field.label} doit être supérieur ou égal à ${field.min_value}`;
        }
        if (field.max_value !== null && value > field.max_value) {
          errors[field.id] = `${field.label} doit être inférieur ou égal à ${field.max_value}`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    // Extract contact info for quick search
    let email: string | null = null;
    let phone: string | null = null;
    let fullName: string | null = null;

    for (const field of fields) {
      const value = formData[field.id];
      if (!value) continue;

      if (field.field_type === "email" && !email) {
        email = String(value);
      }
      if (field.field_type === "phone" && !phone) {
        phone = String(value);
      }
      if (field.field_type === "text" && field.label.toLowerCase().includes("nom") && !fullName) {
        fullName = String(value);
      }
    }

    // Get client info
    const ipAddress = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0] || null;
    const userAgent = req.headers["user-agent"] || null;
    const referrer = req.headers["referer"] || null;

    // Create submission
    const { data: submission, error: submitError } = await supabase
      .from("contact_form_submissions")
      .insert({
        form_id: form.id,
        data: formData,
        email,
        phone,
        full_name: fullName,
        status: "new",
        ip_address: ipAddress,
        user_agent: userAgent,
        referrer: referrer,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
      })
      .select()
      .single();

    if (submitError) throw submitError;

    // Send admin notifications
    if (form.notify_on_submission && form.notification_emails?.length > 0) {
      try {
        // Emit admin notification
        await emitAdminNotification({
          type: "contact_form_submission",
          title: `Nouvelle soumission : ${form.name}`,
          body: `De: ${fullName || email || phone || "Anonyme"}`,
          link: `/admin/contact-forms/${form.id}/submissions/${submission.id}`,
        });

        // Store notification records for email sending
        const notifications = form.notification_emails.map((adminEmail: string) => ({
          submission_id: submission.id,
          admin_email: adminEmail,
        }));

        await supabase.from("contact_form_notifications").insert(notifications);

        // Send emails (async, don't wait)
        for (const adminEmail of form.notification_emails) {
          sendNotificationEmail(adminEmail, form, submission, formData, fields).catch(console.error);
        }
      } catch (notifErr) {
        console.error("[submitPublicContactForm] notification error:", notifErr);
      }
    }

    // Send confirmation email to user
    if (form.send_confirmation_email && email && form.confirmation_email_subject && form.confirmation_email_body) {
      try {
        await sendConfirmationEmail(email, fullName || "", form);
      } catch (confirmErr) {
        console.error("[submitPublicContactForm] confirmation email error:", confirmErr);
      }
    }

    res.json({
      success: true,
      message: form.success_message,
      redirect_url: form.success_redirect_url,
      submission_id: submission.id,
    });
  } catch (err) {
    console.error("[submitPublicContactForm]", err);
    res.status(500).json({ error: "Failed to submit form" });
  }
};

/**
 * Send notification email to admin
 */
async function sendNotificationEmail(
  adminEmail: string,
  form: Record<string, unknown>,
  submission: Record<string, unknown>,
  formData: Record<string, unknown>,
  fields: Array<Record<string, unknown>>
) {
  const supabase = getAdminSupabase();

  // Build email content
  const fieldsSummary = fields
    .map((f) => {
      const value = formData[f.id as string];
      if (!value) return null;
      const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
      return `<strong>${f.label}:</strong> ${displayValue}`;
    })
    .filter(Boolean)
    .join("<br>");

  const emailBody = `
    <p>Nouvelle soumission du formulaire <strong>${form.name}</strong></p>
    <hr>
    ${fieldsSummary}
    <hr>
    <p>
      <a href="https://sam.ma/admin/contact-forms/${form.id}/submissions/${submission.id}">
        Voir la soumission
      </a>
    </p>
  `;

  // Send email using existing email service
  try {
    await sendLoggedEmail({
      emailId: `form-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [adminEmail],
      subject: `[Formulaire] Nouvelle soumission : ${form.name}`,
      bodyText: `Nouvelle soumission du formulaire "${form.name}".\n\nConsultez la soumission dans l'interface admin.`,
      ctaLabel: "Voir la soumission",
      ctaUrl: `https://sam.ma/admin/contact-forms/${form.id}/submissions/${submission.id}`,
    });

    // Update notification record
    await supabase
      .from("contact_form_notifications")
      .update({ sent_at: new Date().toISOString() })
      .eq("submission_id", submission.id)
      .eq("admin_email", adminEmail);
  } catch (err) {
    // Update notification with error
    await supabase
      .from("contact_form_notifications")
      .update({ error: String(err) })
      .eq("submission_id", submission.id)
      .eq("admin_email", adminEmail);
    throw err;
  }
}

/**
 * Send confirmation email to user
 */
async function sendConfirmationEmail(
  userEmail: string,
  userName: string,
  form: Record<string, unknown>
) {
  const subject = String(form.confirmation_email_subject).replace("{{name}}", userName);
  const body = String(form.confirmation_email_body).replace("{{name}}", userName);

  await sendLoggedEmail({
    emailId: `form-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromKey: "noreply",
    to: [userEmail],
    subject,
    bodyText: body,
  });
}

/**
 * Get list of countries (for country selector field)
 */
export const getPublicCountriesList: RequestHandler = async (_req, res) => {
  // Common countries list with dial codes
  const countries = [
    { code: "MA", name: "Maroc", dialCode: "+212", flag: "🇲🇦" },
    { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
    { code: "BE", name: "Belgique", dialCode: "+32", flag: "🇧🇪" },
    { code: "CH", name: "Suisse", dialCode: "+41", flag: "🇨🇭" },
    { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
    { code: "US", name: "États-Unis", dialCode: "+1", flag: "🇺🇸" },
    { code: "GB", name: "Royaume-Uni", dialCode: "+44", flag: "🇬🇧" },
    { code: "DE", name: "Allemagne", dialCode: "+49", flag: "🇩🇪" },
    { code: "ES", name: "Espagne", dialCode: "+34", flag: "🇪🇸" },
    { code: "IT", name: "Italie", dialCode: "+39", flag: "🇮🇹" },
    { code: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹" },
    { code: "NL", name: "Pays-Bas", dialCode: "+31", flag: "🇳🇱" },
    { code: "DZ", name: "Algérie", dialCode: "+213", flag: "🇩🇿" },
    { code: "TN", name: "Tunisie", dialCode: "+216", flag: "🇹🇳" },
    { code: "EG", name: "Égypte", dialCode: "+20", flag: "🇪🇬" },
    { code: "SA", name: "Arabie Saoudite", dialCode: "+966", flag: "🇸🇦" },
    { code: "AE", name: "Émirats arabes unis", dialCode: "+971", flag: "🇦🇪" },
    { code: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
    { code: "KW", name: "Koweït", dialCode: "+965", flag: "🇰🇼" },
    { code: "LB", name: "Liban", dialCode: "+961", flag: "🇱🇧" },
    { code: "JO", name: "Jordanie", dialCode: "+962", flag: "🇯🇴" },
    { code: "SN", name: "Sénégal", dialCode: "+221", flag: "🇸🇳" },
    { code: "CI", name: "Côte d'Ivoire", dialCode: "+225", flag: "🇨🇮" },
    { code: "CM", name: "Cameroun", dialCode: "+237", flag: "🇨🇲" },
    { code: "GA", name: "Gabon", dialCode: "+241", flag: "🇬🇦" },
    { code: "ML", name: "Mali", dialCode: "+223", flag: "🇲🇱" },
    { code: "BF", name: "Burkina Faso", dialCode: "+226", flag: "🇧🇫" },
    { code: "NE", name: "Niger", dialCode: "+227", flag: "🇳🇪" },
    { code: "MR", name: "Mauritanie", dialCode: "+222", flag: "🇲🇷" },
    { code: "TR", name: "Turquie", dialCode: "+90", flag: "🇹🇷" },
  ];

  res.json({ countries });
};
