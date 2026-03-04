import type { RequestHandler } from "express";
import type { Express } from "express";

import { renderSambookingEmail } from "../email";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireSuperadmin } from "./admin";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";
import {
  UpsertNewsletterTemplateSchema,
  PreviewNewsletterSchema,
  CreateNewsletterCampaignSchema,
  SendNewsletterCampaignSchema,
  UpdateSubscriberSchema,
  ExportSubscribersSchema,
  CreateAudienceSchema,
  UpdateAudienceSchema,
  PreviewFiltersSchema,
  ListNewsletterTemplatesQuery,
  ListNewsletterCampaignsQuery,
  ListNewsletterSubscribersQuery,
  ListAudienceMembersQuery,
} from "../schemas/adminNewsletter";

// ============================================================================
// HELPERS
// ============================================================================

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const v = asString(value);
  return v ? v : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ============================================================================
// NEWSLETTER TEMPLATES
// ============================================================================

/**
 * GET /api/admin/newsletter/templates
 * List all newsletter templates with optional filtering
 */
export const listNewsletterTemplates: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const category = asNullableString(req.query.category);
  const audience = asNullableString(req.query.audience);
  const featured = req.query.featured === "true" ? true : req.query.featured === "false" ? false : undefined;

  let query = supabase
    .from("newsletter_templates")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("updated_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (audience) query = query.eq("audience", audience);
  if (typeof featured === "boolean") query = query.eq("is_featured", featured);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, items: data ?? [] });
};

/**
 * GET /api/admin/newsletter/templates/:id
 * Get a single newsletter template by ID
 */
export const getNewsletterTemplate: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const { data, error } = await supabase
    .from("newsletter_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return res.status(404).json({ error: "Template non trouvé" });
  }

  return res.json({ ok: true, item: data });
};

/**
 * POST /api/admin/newsletter/templates/upsert
 * Create or update a newsletter template
 */
export const upsertNewsletterTemplate: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const body = isRecord(req.body) ? req.body : {};
  const supabase = getAdminSupabase();

  const id = asNullableString(body.id);
  const name = asString(body.name);
  const description = asNullableString(body.description);
  const category = asString(body.category) || "general";
  const audience = asString(body.audience) || "all";
  const subject_fr = asString(body.subject_fr);
  const subject_en = asString(body.subject_en);
  const preheader_fr = asNullableString(body.preheader_fr);
  const preheader_en = asNullableString(body.preheader_en);
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  const design_settings = isRecord(body.design_settings) ? body.design_settings : {};
  const is_template = typeof body.is_template === "boolean" ? body.is_template : true;
  const is_featured = typeof body.is_featured === "boolean" ? body.is_featured : false;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

  if (!name) {
    return res.status(400).json({ error: "Le nom est requis" });
  }

  const payload = {
    name,
    description,
    category,
    audience,
    subject_fr,
    subject_en,
    preheader_fr,
    preheader_en,
    blocks,
    design_settings,
    is_template,
    is_featured,
    enabled,
  };

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from("newsletter_templates")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true, id: data?.id });
  } else {
    // Create new
    const { data, error } = await supabase
      .from("newsletter_templates")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true, id: data?.id });
  }
};

/**
 * POST /api/admin/newsletter/templates/:id/duplicate
 * Duplicate a newsletter template
 */
export const duplicateNewsletterTemplate: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  // Get original
  const { data: original, error: fetchError } = await supabase
    .from("newsletter_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !original) {
    return res.status(404).json({ error: "Template non trouvé" });
  }

  // Create duplicate
  const newName = `${original.name} (copie)`;
  const { data, error } = await supabase
    .from("newsletter_templates")
    .insert({
      name: newName,
      description: original.description,
      category: original.category,
      audience: original.audience,
      subject_fr: original.subject_fr,
      subject_en: original.subject_en,
      preheader_fr: original.preheader_fr,
      preheader_en: original.preheader_en,
      blocks: original.blocks,
      design_settings: original.design_settings,
      is_template: original.is_template,
      is_featured: false,
      enabled: false,
    })
    .select("id, name")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, id: data?.id, name: data?.name });
};

/**
 * DELETE /api/admin/newsletter/templates/:id
 * Delete a newsletter template
 */
export const deleteNewsletterTemplate: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const { error } = await supabase
    .from("newsletter_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
};

/**
 * POST /api/admin/newsletter/preview
 * Generate an HTML preview of a newsletter
 */
export const previewNewsletter: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const body = isRecord(req.body) ? req.body : {};

  const subject = asString(body.subject) || "Aperçu";
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  const design_settings = isRecord(body.design_settings) ? body.design_settings : {};
  const lang = asString(body.lang) === "en" ? "en" : "fr";
  const variables = isRecord(body.variables) ? body.variables : {};

  // Generate HTML from blocks
  const bodyHtml = renderNewsletterBlocks(blocks, design_settings, lang, variables);

  // Use the existing email renderer
  const result = await renderSambookingEmail({
    emailId: `preview-${Date.now()}`,
    fromKey: "hello",
    to: [],
    subject,
    bodyText: bodyHtml,
    ctaLabel: null,
    ctaUrl: null,
    variables: variables as Record<string, string | number | null | undefined>,
    tracking: { marketingUnsubscribeUrl: null },
  });

  return res.json({ ok: true, html: result.html, text: result.text });
};

// ============================================================================
// NEWSLETTER CAMPAIGNS
// ============================================================================

/**
 * GET /api/admin/newsletter/campaigns
 * List all newsletter campaigns
 */
export const listNewsletterCampaigns: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const status = asNullableString(req.query.status);

  let query = supabase
    .from("newsletter_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, items: data ?? [] });
};

/**
 * POST /api/admin/newsletter/campaigns
 * Create a new newsletter campaign
 */
export const createNewsletterCampaign: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const body = isRecord(req.body) ? req.body : {};
  const supabase = getAdminSupabase();

  const template_id = asNullableString(body.template_id);
  const name = asString(body.name);
  const subject_fr = asString(body.subject_fr);
  const subject_en = asString(body.subject_en);
  const preheader_fr = asNullableString(body.preheader_fr);
  const preheader_en = asNullableString(body.preheader_en);
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  const design_settings = isRecord(body.design_settings) ? body.design_settings : {};
  const audience = asString(body.audience) || "all";
  const target_tags = Array.isArray(body.target_tags) ? body.target_tags : [];
  const target_cities = Array.isArray(body.target_cities) ? body.target_cities : [];
  const scheduled_at = asNullableString(body.scheduled_at);

  if (!name) {
    return res.status(400).json({ error: "Le nom est requis" });
  }

  // If template_id provided, increment usage
  if (template_id) {
    await supabase
      .from("newsletter_templates")
      .update({
        times_used: supabase.rpc("increment_times_used"),
        last_used_at: new Date().toISOString(),
      })
      .eq("id", template_id);
  }

  const { data, error } = await supabase
    .from("newsletter_campaigns")
    .insert({
      template_id,
      name,
      subject_fr,
      subject_en,
      preheader_fr,
      preheader_en,
      blocks,
      design_settings,
      audience,
      target_tags,
      target_cities,
      scheduled_at,
      status: scheduled_at ? "scheduled" : "draft",
    })
    .select("id")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, id: data?.id });
};

/**
 * POST /api/admin/newsletter/campaigns/:id/send
 * Send a newsletter campaign
 */
export const sendNewsletterCampaign: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const body = isRecord(req.body) ? req.body : {};
  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const limit = typeof body.limit === "number" ? Math.min(body.limit, 1000) : 50;
  const dry_run = body.dry_run === true;

  // Get campaign
  const { data: campaign, error: fetchError } = await supabase
    .from("newsletter_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !campaign) {
    return res.status(404).json({ error: "Campagne non trouvée" });
  }

  if (campaign.status === "sent") {
    return res.status(400).json({ error: "Campagne déjà envoyée" });
  }

  // This is a placeholder - actual sending would be implemented
  // with proper queue management and AWS SES integration

  return res.json({
    ok: true,
    dry_run,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  });
};

// ============================================================================
// NEWSLETTER HTML RENDERER
// ============================================================================

interface DesignSettings {
  backgroundColor?: string;
  fontFamily?: string;
  headerColor?: string;
  textColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  borderRadius?: string;
}

interface Block {
  id: string;
  type: string;
  content_fr: Record<string, any>;
  content_en: Record<string, any>;
  settings: Record<string, any>;
}

// Logo and slogan configuration
const NEWSLETTER_BRANDING = {
  logoUrl: "/Logo_SAM_Officiel.png", // Served from public folder
  slogan: {
    fr: "Découvrez et réservez les meilleures activités au Maroc\nRestaurants, loisirs, wellness et bien plus encore",
    en: "Discover and book the best activities in Morocco\nRestaurants, leisure, wellness and much more",
  },
  websiteUrl: "https://sortiaumaroc.com",
};

function renderNewsletterBlocks(
  blocks: unknown[],
  design: unknown,
  lang: "fr" | "en",
  variables: Record<string, unknown>
): string {
  const d = (isRecord(design) ? design : {}) as DesignSettings;
  const bgColor = d.backgroundColor || "#FFFFFF";
  const fontFamily = d.fontFamily || "Arial, sans-serif";
  const textColor = d.textColor || "#333333";
  const headerColor = d.headerColor || "#D4AF37";
  const buttonColor = d.buttonColor || "#D4AF37";
  const buttonTextColor = d.buttonTextColor || "#FFFFFF";
  const borderRadius = d.borderRadius || "8px";

  // Slogan with line break
  const sloganLines = NEWSLETTER_BRANDING.slogan[lang].split("\n");

  let html = `
    <div style="background-color: ${bgColor}; font-family: ${fontFamily}; color: ${textColor}; padding: 20px; max-width: 600px; margin: 0 auto;">
      <!-- Logo & Slogan Header -->
      <div style="text-align: center; padding: 24px 16px 32px; border-bottom: 1px solid #E5E7EB; margin-bottom: 24px;">
        <a href="${NEWSLETTER_BRANDING.websiteUrl}" target="_blank" rel="noopener noreferrer">
          <img src="${NEWSLETTER_BRANDING.logoUrl}" alt="Sortir Au Maroc" style="max-width: 200px; height: auto; margin-bottom: 16px;" />
        </a>
        <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5;">
          ${sloganLines[0]}<br/>
          <span style="color: ${headerColor}; font-weight: 500;">${sloganLines[1] || ""}</span>
        </p>
      </div>
  `;

  for (const rawBlock of blocks) {
    if (!isRecord(rawBlock)) continue;
    const block = rawBlock as unknown as Block;
    const content = lang === "fr" ? block.content_fr : block.content_en;
    const settings = block.settings || {};

    switch (block.type) {
      case "header":
        html += renderHeaderBlock(content, settings, headerColor);
        break;
      case "text":
        html += renderTextBlock(content, variables);
        break;
      case "image":
        html += renderImageBlock(content, settings, borderRadius);
        break;
      case "button":
        html += renderButtonBlock(content, settings, buttonColor, buttonTextColor, borderRadius);
        break;
      case "divider":
        html += renderDividerBlock(settings);
        break;
      case "spacer":
        html += renderSpacerBlock(settings);
        break;
      case "columns":
        html += renderColumnsBlock(content, headerColor, borderRadius);
        break;
      case "list":
        html += renderListBlock(content, settings, headerColor);
        break;
      case "countdown":
        html += renderCountdownBlock(content, settings);
        break;
      case "poll":
        html += renderPollBlock(content, headerColor);
        break;
      case "social":
        html += renderSocialBlock(content);
        break;
      case "video":
        html += renderVideoBlock(content, borderRadius);
        break;
      default:
        // Unknown block type
        break;
    }
  }

  html += `</div>`;

  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    html = html.split(placeholder).join(String(value ?? ""));
  }

  return html;
}

function renderHeaderBlock(content: Record<string, any>, settings: Record<string, any>, defaultColor: string): string {
  const bgColor = settings.backgroundColor || defaultColor;
  const textColor = settings.textColor || "#FFFFFF";
  const title = content.title || "";
  const subtitle = content.subtitle || "";

  return `
    <div style="background-color: ${bgColor}; color: ${textColor}; padding: 32px 24px; text-align: center; border-radius: 8px; margin-bottom: 16px;">
      <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: bold;">${escapeHtml(title)}</h1>
      ${subtitle ? `<p style="margin: 0; font-size: 16px; opacity: 0.9;">${escapeHtml(subtitle)}</p>` : ""}
    </div>
  `;
}

function renderTextBlock(content: Record<string, any>, variables: Record<string, unknown>): string {
  let html = content.html || "";

  // Replace variables in text content
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    html = html.split(placeholder).join(String(value ?? ""));
  }

  return `
    <div style="padding: 16px 0; line-height: 1.6;">
      ${html}
    </div>
  `;
}

function renderImageBlock(content: Record<string, any>, settings: Record<string, any>, defaultRadius: string): string {
  const url = content.url || "";
  const alt = content.alt || "";
  const link = content.link || "";
  const fullWidth = settings.fullWidth === true;
  const borderRadius = settings.borderRadius || defaultRadius;

  if (!url) {
    return `
      <div style="padding: 40px; background-color: #F3F4F6; text-align: center; border-radius: ${borderRadius}; margin-bottom: 16px; color: #9CA3AF;">
        [Image: ${escapeHtml(alt) || "non définie"}]
      </div>
    `;
  }

  const img = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width: ${fullWidth ? "100%" : "80%"}; height: auto; border-radius: ${borderRadius};" />`;

  return `
    <div style="margin-bottom: 16px; text-align: center;">
      ${link ? `<a href="${escapeHtml(link)}">${img}</a>` : img}
    </div>
  `;
}

function renderButtonBlock(
  content: Record<string, any>,
  settings: Record<string, any>,
  defaultBgColor: string,
  defaultTextColor: string,
  defaultRadius: string
): string {
  const text = content.text || "Bouton";
  const url = content.url || "#";
  const bgColor = settings.backgroundColor || defaultBgColor;
  const textColor = settings.textColor || defaultTextColor;
  const align = settings.align || "center";
  const size = settings.size || "medium";

  const padding = size === "large" ? "16px 32px" : size === "small" ? "8px 16px" : "12px 24px";
  const fontSize = size === "large" ? "18px" : size === "small" ? "14px" : "16px";

  return `
    <div style="text-align: ${align}; padding: 16px 0;">
      <a href="${escapeHtml(url)}" style="display: inline-block; background-color: ${bgColor}; color: ${textColor}; padding: ${padding}; border-radius: ${defaultRadius}; text-decoration: none; font-weight: bold; font-size: ${fontSize};">
        ${escapeHtml(text)}
      </a>
    </div>
  `;
}

function renderDividerBlock(settings: Record<string, any>): string {
  const color = settings.color || "#E5E7EB";
  const thickness = settings.thickness || "1px";
  const style = settings.style || "solid";

  return `<hr style="border: none; border-top: ${thickness} ${style} ${color}; margin: 24px 0;" />`;
}

function renderSpacerBlock(settings: Record<string, any>): string {
  const height = settings.height || "24px";
  return `<div style="height: ${height};"></div>`;
}

function renderColumnsBlock(content: Record<string, any>, headerColor: string, borderRadius: string): string {
  const columns = Array.isArray(content.columns) ? content.columns : [];

  if (columns.length === 0) return "";

  const colHtml = columns
    .map((col: any) => {
      const icon = col.icon || "";
      const title = col.title || "";
      const text = col.text || "";
      const image = col.image || "";

      return `
        <td style="width: ${100 / columns.length}%; text-align: center; padding: 16px; background-color: #F9FAFB; border-radius: ${borderRadius}; vertical-align: top;">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="width: 100%; max-width: 120px; height: auto; border-radius: 8px; margin-bottom: 8px;" />` : ""}
          ${icon && !image ? `<div style="font-size: 32px; margin-bottom: 8px;">${icon}</div>` : ""}
          <div style="font-weight: bold; margin-bottom: 4px; color: ${headerColor};">${escapeHtml(title)}</div>
          <div style="font-size: 14px; color: #6B7280;">${escapeHtml(text)}</div>
        </td>
      `;
    })
    .join('<td style="width: 16px;"></td>');

  return `
    <table style="width: 100%; margin-bottom: 16px; border-collapse: collapse;">
      <tr>${colHtml}</tr>
    </table>
  `;
}

function renderListBlock(content: Record<string, any>, settings: Record<string, any>, headerColor: string): string {
  const items = Array.isArray(content.items) ? content.items : [];
  const style = settings.style || "check";

  const markerMap: Record<string, string> = {
    check: "✓",
    bullet: "•",
    arrow: "→",
    star: "★",
    number: "",
    none: "",
  };

  const marker = markerMap[style] ?? "•";

  const listHtml = items
    .map((item: string, i: number) => {
      const displayMarker = style === "number" ? `${i + 1}.` : marker;
      return `
        <li style="padding: 8px 0; display: flex; align-items: flex-start; gap: 12px; list-style: none;">
          ${displayMarker ? `<span style="color: ${headerColor}; font-weight: bold;">${displayMarker}</span>` : ""}
          <span>${escapeHtml(item)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <ul style="padding: 16px 0; margin: 0;">
      ${listHtml}
    </ul>
  `;
}

function renderCountdownBlock(content: Record<string, any>, settings: Record<string, any>): string {
  const text = content.text || "Fin de l'offre dans";
  const bgColor = settings.backgroundColor || "#1a1a1a";
  const textColor = settings.textColor || "#FFFFFF";

  // Static countdown - actual countdown would be handled client-side
  return `
    <div style="padding: 24px; background-color: ${bgColor}; color: ${textColor}; text-align: center; border-radius: 8px; margin-bottom: 16px;">
      <div style="margin-bottom: 12px; font-size: 14px;">${escapeHtml(text)}</div>
      <div style="display: inline-flex; gap: 16px;">
        ${["Jours", "Heures", "Min", "Sec"]
          .map(
            (label) => `
          <div>
            <div style="font-size: 32px; font-weight: bold; background: rgba(255,255,255,0.1); padding: 12px 16px; border-radius: 8px; min-width: 60px;">00</div>
            <div style="font-size: 12px; margin-top: 4px; opacity: 0.7;">${label}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderPollBlock(content: Record<string, any>, headerColor: string): string {
  const question = content.question || "Question ?";
  const options = Array.isArray(content.options) ? content.options : [];

  const optionsHtml = options
    .map(
      (opt: string) => `
      <div style="padding: 12px 16px; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; margin-bottom: 8px;">
        ${escapeHtml(opt)}
      </div>
    `
    )
    .join("");

  return `
    <div style="padding: 16px; background-color: #F9FAFB; border-radius: 8px; margin-bottom: 16px;">
      <div style="font-weight: bold; margin-bottom: 16px; color: ${headerColor};">${escapeHtml(question)}</div>
      ${optionsHtml}
    </div>
  `;
}

function renderSocialBlock(content: Record<string, any>): string {
  const socials = [
    { key: "facebook", icon: "f", color: "#1877F2" },
    { key: "instagram", icon: "📷", color: "#E4405F" },
    { key: "twitter", icon: "𝕏", color: "#000000" },
    { key: "linkedin", icon: "in", color: "#0A66C2" },
    { key: "youtube", icon: "▶", color: "#FF0000" },
    { key: "tiktok", icon: "♪", color: "#000000" },
  ].filter((s) => content[s.key]);

  if (socials.length === 0) return "";

  const linksHtml = socials
    .map(
      (s) => `
      <a href="${escapeHtml(content[s.key])}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background-color: ${s.color}; color: #FFFFFF; border-radius: 50%; text-decoration: none; font-weight: bold; font-size: 16px; margin: 0 6px;">
        ${s.icon}
      </a>
    `
    )
    .join("");

  return `
    <div style="padding: 16px 0; text-align: center;">
      ${linksHtml}
    </div>
  `;
}

function renderVideoBlock(content: Record<string, any>, borderRadius: string): string {
  const url = content.url || "";
  const thumbnail = content.thumbnail || "";

  // Extract YouTube ID
  let videoId: string | null = null;
  if (url) {
    const match = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    videoId = match ? match[1] : null;
  }

  const finalThumbnail = thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : "");

  if (!finalThumbnail) {
    return `
      <div style="padding: 40px; background-color: #F3F4F6; text-align: center; border-radius: ${borderRadius}; margin-bottom: 16px; color: #9CA3AF;">
        [Vidéo: non définie]
      </div>
    `;
  }

  return `
    <div style="padding: 16px 0; text-align: center;">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; position: relative;">
        <img src="${escapeHtml(finalThumbnail)}" alt="Video thumbnail" style="max-width: 100%; border-radius: ${borderRadius};" />
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; background-color: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #FFFFFF; font-size: 24px;">
          ▶
        </div>
      </a>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================================
// NEWSLETTER SUBSCRIBERS
// ============================================================================

/**
 * GET /api/admin/newsletter/subscribers
 * List all newsletter subscribers with filtering
 */
export const listNewsletterSubscribers: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const page = parseInt(asString(req.query.page)) || 1;
  const limit = parseInt(asString(req.query.limit)) || 50;
  const search = asNullableString(req.query.search);
  const status = asNullableString(req.query.status);
  const city = asNullableString(req.query.city);
  const country = asNullableString(req.query.country);

  let query = supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact" });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (city) {
    query = query.eq("city", city);
  }

  if (country) {
    query = query.eq("country", country);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({
    ok: true,
    items: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
};

/**
 * GET /api/admin/newsletter/subscribers/stats
 * Get subscriber statistics
 */
export const getNewsletterSubscribersStats: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();

  const { count: total } = await supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact", head: true });

  const { count: active } = await supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { data: citiesData } = await supabase
    .from("newsletter_subscribers")
    .select("city")
    .not("city", "is", null);

  const { data: countriesData } = await supabase
    .from("newsletter_subscribers")
    .select("country")
    .not("country", "is", null);

  const cities = [...new Set((citiesData ?? []).map((c: any) => c.city).filter(Boolean))];
  const countries = [...new Set((countriesData ?? []).map((c: any) => c.country).filter(Boolean))];

  return res.json({
    ok: true,
    total: total ?? 0,
    active: active ?? 0,
    cities,
    countries,
  });
};

/**
 * PUT /api/admin/newsletter/subscribers/:id
 * Update a subscriber
 */
export const updateNewsletterSubscriber: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);
  const body = isRecord(req.body) ? req.body : {};

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const allowedFields = [
    "first_name", "last_name", "phone", "city", "country",
    "age", "gender", "profession", "csp", "interests", "status"
  ];

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, item: data });
};

/**
 * DELETE /api/admin/newsletter/subscribers/:id
 * Delete a subscriber
 */
export const deleteNewsletterSubscriber: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const { error } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
};

/**
 * POST /api/admin/newsletter/subscribers/export
 * Export subscribers as CSV
 */
export const exportNewsletterSubscribers: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const body = isRecord(req.body) ? req.body : {};

  let query = supabase.from("newsletter_subscribers").select("*");

  if (body.status && body.status !== "all") {
    query = query.eq("status", body.status);
  }
  if (body.city) {
    query = query.eq("city", body.city);
  }
  if (body.country) {
    query = query.eq("country", body.country);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const headers = ["email", "first_name", "last_name", "phone", "city", "country", "age", "gender", "csp", "interests", "status", "created_at"];
  const csvRows = [headers.join(",")];

  for (const row of data ?? []) {
    const values = headers.map(h => {
      const val = (row as Record<string, any>)[h];
      if (val === null || val === undefined) return "";
      if (Array.isArray(val)) return `"${val.join(";")}"`;
      if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvRows.push(values.join(","));
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=newsletter_subscribers.csv");
  return res.send(csvRows.join("\n"));
};

// ============================================================================
// AUDIENCES
// ============================================================================

/**
 * GET /api/admin/newsletter/audiences
 * List all audiences
 */
export const listAudiences: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("audiences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, items: data ?? [] });
};

/**
 * POST /api/admin/newsletter/audiences
 * Create a new audience
 */
export const createAudience: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const body = isRecord(req.body) ? req.body : {};

  const name = asString(body.name);
  const description = asNullableString(body.description);
  const filters = isRecord(body.filters) ? body.filters : {};
  const is_dynamic = body.is_dynamic !== false;

  if (!name) {
    return res.status(400).json({ error: "Le nom est requis" });
  }

  const { data, error } = await supabase
    .from("audiences")
    .insert({
      name,
      description,
      filters,
      is_dynamic,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Update member count
  if (data) {
    await supabase.rpc("update_audience_member_count", { p_audience_id: data.id });
    const { data: updated } = await supabase
      .from("audiences")
      .select("*")
      .eq("id", data.id)
      .single();
    return res.json({ ok: true, item: updated ?? data });
  }

  return res.json({ ok: true, item: data });
};

/**
 * PUT /api/admin/newsletter/audiences/:id
 * Update an audience
 */
export const updateAudience: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);
  const body = isRecord(req.body) ? req.body : {};

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.filters !== undefined) updates.filters = body.filters;
  if (body.is_dynamic !== undefined) updates.is_dynamic = body.is_dynamic;

  const { data, error } = await supabase
    .from("audiences")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Update member count
  await supabase.rpc("update_audience_member_count", { p_audience_id: id });
  const { data: updated } = await supabase
    .from("audiences")
    .select("*")
    .eq("id", id)
    .single();

  return res.json({ ok: true, item: updated ?? data });
};

/**
 * DELETE /api/admin/newsletter/audiences/:id
 * Delete an audience
 */
export const deleteAudience: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const { error } = await supabase
    .from("audiences")
    .delete()
    .eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
};

/**
 * GET /api/admin/newsletter/audiences/:id/members
 * Get audience members
 */
export const getAudienceMembers: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);
  const page = parseInt(asString(req.query.page)) || 1;
  const limit = parseInt(asString(req.query.limit)) || 50;

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const { data, error } = await supabase.rpc("get_audience_members", { p_audience_id: id });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const total = data?.length ?? 0;
  const paginatedData = (data ?? []).slice((page - 1) * limit, page * limit);

  return res.json({
    ok: true,
    items: paginatedData,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
};

/**
 * POST /api/admin/newsletter/audiences/:id/load-to-prospects
 * Load audience members to prospects
 */
export const loadAudienceToProspects: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const id = asString(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const { data, error } = await supabase.rpc("load_audience_to_prospects", { p_audience_id: id });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, count: data });
};

/**
 * POST /api/admin/newsletter/preview-filters
 * Preview filter results without saving
 */
export const previewFilters: RequestHandler = async (req, res) => {
  const ok = await requireSuperadmin(req, res);
  if (!ok) return;

  const supabase = getAdminSupabase();
  const body = isRecord(req.body) ? req.body : {};
  const filters = isRecord(body.filters) ? body.filters : {};

  let query = supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  if (Array.isArray(filters.cities) && filters.cities.length) {
    query = query.in("city", filters.cities);
  }
  if (Array.isArray(filters.countries) && filters.countries.length) {
    query = query.in("country", filters.countries);
  }
  if (Array.isArray(filters.genders) && filters.genders.length) {
    query = query.in("gender", filters.genders);
  }
  if (Array.isArray(filters.csp_list) && filters.csp_list.length) {
    query = query.in("csp", filters.csp_list);
  }
  if (filters.age_min) {
    query = query.gte("age", filters.age_min);
  }
  if (filters.age_max) {
    query = query.lte("age", filters.age_max);
  }
  if (Array.isArray(filters.interests) && filters.interests.length) {
    query = query.overlaps("interests", filters.interests);
  }

  const { count, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, count: count ?? 0 });
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerAdminNewsletterRoutes(app: Express) {
  // Newsletter Templates & Campaigns
  app.get("/api/admin/newsletter/templates", zQuery(ListNewsletterTemplatesQuery), listNewsletterTemplates);
  app.get("/api/admin/newsletter/templates/:id", zParams(zIdParam), getNewsletterTemplate);
  app.post("/api/admin/newsletter/templates/upsert", zBody(UpsertNewsletterTemplateSchema), upsertNewsletterTemplate);
  app.post("/api/admin/newsletter/templates/:id/duplicate", zParams(zIdParam), duplicateNewsletterTemplate);
  app.delete("/api/admin/newsletter/templates/:id", zParams(zIdParam), deleteNewsletterTemplate);
  app.post("/api/admin/newsletter/preview", zBody(PreviewNewsletterSchema), previewNewsletter);
  app.get("/api/admin/newsletter/campaigns", zQuery(ListNewsletterCampaignsQuery), listNewsletterCampaigns);
  app.post("/api/admin/newsletter/campaigns", zBody(CreateNewsletterCampaignSchema), createNewsletterCampaign);
  app.post("/api/admin/newsletter/campaigns/:id/send", zParams(zIdParam), zBody(SendNewsletterCampaignSchema), sendNewsletterCampaign);

  // Newsletter subscribers
  app.get("/api/admin/newsletter/subscribers", zQuery(ListNewsletterSubscribersQuery), listNewsletterSubscribers);
  app.get("/api/admin/newsletter/subscribers/stats", getNewsletterSubscribersStats);
  app.put("/api/admin/newsletter/subscribers/:id", zParams(zIdParam), zBody(UpdateSubscriberSchema), updateNewsletterSubscriber);
  app.delete("/api/admin/newsletter/subscribers/:id", zParams(zIdParam), deleteNewsletterSubscriber);
  app.post("/api/admin/newsletter/subscribers/export", zBody(ExportSubscribersSchema), exportNewsletterSubscribers);

  // Audiences
  app.get("/api/admin/newsletter/audiences", listAudiences);
  app.post("/api/admin/newsletter/audiences", zBody(CreateAudienceSchema), createAudience);
  app.put("/api/admin/newsletter/audiences/:id", zParams(zIdParam), zBody(UpdateAudienceSchema), updateAudience);
  app.delete("/api/admin/newsletter/audiences/:id", zParams(zIdParam), deleteAudience);
  app.get("/api/admin/newsletter/audiences/:id/members", zParams(zIdParam), zQuery(ListAudienceMembersQuery), getAudienceMembers);
  app.post("/api/admin/newsletter/audiences/:id/load-to-prospects", zParams(zIdParam), loadAudienceToProspects);
  app.post("/api/admin/newsletter/preview-filters", zBody(PreviewFiltersSchema), previewFilters);
}
