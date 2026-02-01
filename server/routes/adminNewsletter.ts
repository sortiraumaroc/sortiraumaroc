import type { RequestHandler } from "express";

import { renderSambookingEmail } from "../email";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireSuperadmin } from "./admin";

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
  const result = renderSambookingEmail({
    subject,
    bodyText: bodyHtml,
    ctaLabel: null,
    ctaUrl: null,
    variables: variables as Record<string, string | number | null | undefined>,
    marketingUnsubscribeUrl: null,
    bodyIsHtml: true,
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
