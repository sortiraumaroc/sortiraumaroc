/**
 * Marketing Email Campaigns — SendGrid (SMTP via Nodemailer)
 * Replaces the former Amazon SES integration.
 */

import { Router, type RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendSAMEmail } from "../email";
import crypto from "crypto";
import { createModuleLogger } from "../lib/logger";
import { zBody } from "../lib/validate";
import {
  sendEmailSchema,
  sendBulkEmailSchema,
  createCampaignSchema,
  updateCampaignSchema,
  previewRecipientsSchema,
} from "../schemas/adminMarketing";

const log = createModuleLogger("adminMarketing");

// ============================================================================
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v) => typeof v === "string");
}

function requireSuperadmin(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
): boolean {
  const adminKey = req.headers["x-admin-key"] as string | undefined;
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: "Non autorisé" });
    return false;
  }
  const role = req.headers["x-admin-role"] as string | undefined;
  if (role !== "superadmin" && role !== "admin") {
    res.status(403).json({ error: "Accès superadmin requis" });
    return false;
  }
  return true;
}

// ============================================================================
// Email Service Status
// ============================================================================

/**
 * Get email service status (SendGrid via SMTP)
 */
export const getEmailServiceStatus: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  try {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const configured = !!(host && user && pass);

    res.json({
      configured,
      provider: "sendgrid",
      smtp_host: host || null,
      sending_enabled: configured,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    log.error({ err: error }, "email service status error");
    res.status(500).json({ error: message });
  }
};

// ============================================================================
// Send Single Email
// ============================================================================

/**
 * Send a single email via SMTP (SendGrid)
 */
export const sendSingleEmail: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const to = asString(body.to);
  const subject = asString(body.subject);
  const htmlBody = asString(body.html_body);
  const textBody = asString(body.text_body);
  const fromEmail = asString(body.from_email) || "contact@sam.ma";
  const fromName = asString(body.from_name) || "Sortir Au Maroc";
  const replyTo = asString(body.reply_to);

  if (!to || !subject || !htmlBody) {
    return res.status(400).json({
      error: "Champs requis: to, subject, html_body",
    });
  }

  try {
    const emailId = crypto.randomUUID();
    const result = await sendSAMEmail({
      emailId,
      fromKey: "noreply",
      to: [to],
      subject,
      bodyText: textBody || htmlBody.replace(/<[^>]*>/g, ""),
    });

    res.json({
      success: true,
      message_id: result.messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    log.error({ err: error }, "email send error");
    res.status(500).json({ error: message });
  }
};

// ============================================================================
// Bulk Email Sending
// ============================================================================

const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 200; // Slightly more conservative for SMTP

/**
 * Send bulk emails via SMTP (for campaigns)
 */
export const sendBulkEmails: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const campaignId = asString(body.campaign_id);

  if (!campaignId) {
    return res.status(400).json({ error: "campaign_id requis" });
  }

  const supabase = getAdminSupabase();

  // Get campaign
  const { data: campaign, error: campaignErr } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignErr || !campaign) {
    return res.status(404).json({ error: "Campagne non trouvée" });
  }

  if (campaign.status !== "draft" && campaign.status !== "paused") {
    return res.status(400).json({
      error: `Impossible de lancer une campagne en statut: ${campaign.status}`,
    });
  }

  // Get prospects based on targeting
  let prospectsQuery = supabase
    .from("marketing_prospects")
    .select("id, email, first_name, last_name")
    .eq("subscribed", true)
    .is("bounce_type", null);

  if (campaign.target_type === "tags" && campaign.target_tags?.length > 0) {
    prospectsQuery = prospectsQuery.overlaps("tags", campaign.target_tags);
  }

  if (campaign.target_type === "cities" && campaign.target_cities?.length > 0) {
    prospectsQuery = prospectsQuery.in("city", campaign.target_cities);
  }

  const { data: prospects, error: prospectsErr } = await prospectsQuery;

  if (prospectsErr) {
    return res.status(500).json({ error: prospectsErr.message });
  }

  if (!prospects || prospects.length === 0) {
    return res.status(400).json({ error: "Aucun prospect correspondant aux critères" });
  }

  // Update campaign status
  await supabase
    .from("marketing_email_campaigns")
    .update({
      status: "sending",
      started_at: new Date().toISOString(),
      total_recipients: prospects.length,
    })
    .eq("id", campaignId);

  // Start sending in background
  sendCampaignEmails(campaignId, campaign, prospects).catch((err) => {
    log.error({ err }, "campaign sending error");
  });

  res.json({
    success: true,
    message: "Campagne lancée",
    total_recipients: prospects.length,
  });
};

/**
 * Background function to send campaign emails via SMTP
 */
async function sendCampaignEmails(
  campaignId: string,
  campaign: Record<string, unknown>,
  prospects: Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>
): Promise<void> {
  const supabase = getAdminSupabase();

  let sentCount = 0;
  let errorCount = 0;

  try {
    const subject = campaign.subject as string;
    const htmlTemplate = campaign.content_html as string;
    const textTemplate = campaign.content_text as string | null;

    // Process in batches
    for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
      const batch = prospects.slice(i, i + BATCH_SIZE);

      // Create send records
      const sendRecords = batch.map((p) => ({
        campaign_id: campaignId,
        prospect_id: p.id,
        status: "pending",
      }));

      await supabase.from("marketing_email_sends").insert(sendRecords);

      // Send each email in the batch via SMTP
      for (const prospect of batch) {
        try {
          const firstName = prospect.first_name || "";
          const lastName = prospect.last_name || "";
          const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Cher client";

          const personalizedText = (textTemplate || htmlTemplate.replace(/<[^>]*>/g, ""))
            .replace(/\{\{first_name\}\}/g, firstName)
            .replace(/\{\{last_name\}\}/g, lastName)
            .replace(/\{\{name\}\}/g, fullName)
            .replace(/\{\{email\}\}/g, prospect.email);

          const emailId = crypto.randomUUID();

          const result = await sendSAMEmail({
            emailId,
            fromKey: "noreply",
            to: [prospect.email],
            subject,
            bodyText: personalizedText,
            variables: {
              first_name: firstName,
              last_name: lastName,
              name: fullName,
              email: prospect.email,
            },
            tracking: {
              campaignId,
              recipientId: prospect.id,
            },
          });

          // Update send record
          await supabase
            .from("marketing_email_sends")
            .update({
              status: "sent",
              ses_message_id: result.messageId,
              sent_at: new Date().toISOString(),
            })
            .eq("campaign_id", campaignId)
            .eq("prospect_id", prospect.id);

          // Update prospect stats
          await supabase
            .from("marketing_prospects")
            .update({
              last_email_sent_at: new Date().toISOString(),
            })
            .eq("id", prospect.id);

          sentCount++;
        } catch (sendErr) {
          errorCount++;
          log.error({ err: sendErr, email: prospect.email }, "failed to send to prospect");

          // Update send record with error
          await supabase
            .from("marketing_email_sends")
            .update({
              status: "bounced",
              bounce_reason: sendErr instanceof Error ? sendErr.message : "Unknown error",
            })
            .eq("campaign_id", campaignId)
            .eq("prospect_id", prospect.id);
        }
      }

      // Update campaign progress
      await supabase
        .from("marketing_email_campaigns")
        .update({
          sent_count: sentCount,
          bounced_count: errorCount,
        })
        .eq("id", campaignId);

      // Rate limiting between batches
      if (i + BATCH_SIZE < prospects.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    // Mark campaign as completed
    await supabase
      .from("marketing_email_campaigns")
      .update({
        status: "sent",
        completed_at: new Date().toISOString(),
        sent_count: sentCount,
        bounced_count: errorCount,
      })
      .eq("id", campaignId);
  } catch (error) {
    log.error({ err: error }, "campaign error");

    // Mark campaign as failed/paused
    await supabase
      .from("marketing_email_campaigns")
      .update({
        status: "paused",
        sent_count: sentCount,
        bounced_count: errorCount,
      })
      .eq("id", campaignId);
  }
}

// ============================================================================
// Campaign Management (unchanged — DB operations only)
// ============================================================================

/**
 * List marketing campaigns
 */
export const listCampaigns: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const status = asString(req.query.status);

  const supabase = getAdminSupabase();

  let query = supabase
    .from("marketing_email_campaigns")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    items: data,
    total: count ?? 0,
    limit,
    offset,
  });
};

/**
 * Get campaign details
 */
export const getCampaign: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return res.status(404).json({ error: "Campagne non trouvée" });
  }

  res.json({ campaign: data });
};

/**
 * Create a new campaign
 */
export const createCampaign: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const name = asString(body.name);
  const subject = asString(body.subject);
  const contentHtml = asString(body.content_html);
  const contentText = asString(body.content_text);
  const fromName = asString(body.from_name) || "Sortir Au Maroc";
  const fromEmail = asString(body.from_email) || "contact@sam.ma";
  const replyTo = asString(body.reply_to);
  const targetType = asString(body.target_type) || "all";
  const targetTags = asStringArray(body.target_tags) ?? [];
  const targetCities = asStringArray(body.target_cities) ?? [];

  if (!name || !subject || !contentHtml) {
    return res.status(400).json({
      error: "Champs requis: name, subject, content_html",
    });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("marketing_email_campaigns")
    .insert({
      name,
      subject,
      content_html: contentHtml,
      content_text: contentText,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      target_type: targetType,
      target_tags: targetTags,
      target_cities: targetCities,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, campaign: data });
};

/**
 * Update campaign
 */
export const updateCampaign: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const supabase = getAdminSupabase();

  // Check campaign status
  const { data: existing } = await supabase
    .from("marketing_email_campaigns")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: "Campagne non trouvée" });
  }

  if (existing.status !== "draft" && existing.status !== "paused") {
    return res.status(400).json({
      error: "Impossible de modifier une campagne en cours ou terminée",
    });
  }

  const body = isRecord(req.body) ? req.body : {};
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = asString(body.name);
  if (body.subject !== undefined) updates.subject = asString(body.subject);
  if (body.content_html !== undefined) updates.content_html = asString(body.content_html);
  if (body.content_text !== undefined) updates.content_text = asString(body.content_text);
  if (body.from_name !== undefined) updates.from_name = asString(body.from_name);
  if (body.from_email !== undefined) updates.from_email = asString(body.from_email);
  if (body.reply_to !== undefined) updates.reply_to = asString(body.reply_to);
  if (body.target_type !== undefined) updates.target_type = asString(body.target_type);
  if (body.target_tags !== undefined) updates.target_tags = asStringArray(body.target_tags);
  if (body.target_cities !== undefined) updates.target_cities = asStringArray(body.target_cities);

  const { data, error } = await supabase
    .from("marketing_email_campaigns")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, campaign: data });
};

/**
 * Delete campaign
 */
export const deleteCampaign: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const supabase = getAdminSupabase();

  // Check campaign status
  const { data: existing } = await supabase
    .from("marketing_email_campaigns")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: "Campagne non trouvée" });
  }

  if (existing.status === "sending") {
    return res.status(400).json({
      error: "Impossible de supprimer une campagne en cours d'envoi",
    });
  }

  const { error } = await supabase.from("marketing_email_campaigns").delete().eq("id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
};

/**
 * Pause a sending campaign
 */
export const pauseCampaign: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("marketing_email_campaigns")
    .update({ status: "paused" })
    .eq("id", id)
    .eq("status", "sending");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
};

/**
 * Get campaign send statistics
 */
export const getCampaignStats: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const supabase = getAdminSupabase();

  // Get campaign
  const { data: campaign } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (!campaign) {
    return res.status(404).json({ error: "Campagne non trouvée" });
  }

  // Get send stats
  const { data: sends } = await supabase
    .from("marketing_email_sends")
    .select("status")
    .eq("campaign_id", id);

  const statusCounts: Record<string, number> = {};
  for (const send of sends ?? []) {
    const status = send.status as string;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  res.json({
    campaign,
    send_stats: statusCounts,
    total_sends: sends?.length ?? 0,
  });
};

/**
 * Preview campaign recipients
 */
export const previewCampaignRecipients: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const targetType = asString(body.target_type) || "all";
  const targetTags = asStringArray(body.target_tags) ?? [];
  const targetCities = asStringArray(body.target_cities) ?? [];

  const supabase = getAdminSupabase();

  let query = supabase
    .from("marketing_prospects")
    .select("id, email, first_name, last_name, city, tags", { count: "exact" })
    .eq("subscribed", true)
    .is("bounce_type", null)
    .limit(100);

  if (targetType === "tags" && targetTags.length > 0) {
    query = query.overlaps("tags", targetTags);
  }

  if (targetType === "cities" && targetCities.length > 0) {
    query = query.in("city", targetCities);
  }

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    total: count ?? 0,
    sample: data,
  });
};

// ============================================================================
// Register Routes
// ============================================================================

export function registerAdminMarketingRoutes(router: Router): void {
  // Email service status
  router.get("/api/admin/ses/status", getEmailServiceStatus);

  // Single email
  router.post("/api/admin/ses/send", zBody(sendEmailSchema), sendSingleEmail);

  // Bulk/campaign emails
  router.post("/api/admin/ses/send-bulk", zBody(sendBulkEmailSchema), sendBulkEmails);

  // Campaigns
  router.get("/api/admin/marketing/campaigns", listCampaigns);
  router.get("/api/admin/marketing/campaigns/:id", getCampaign);
  router.get("/api/admin/marketing/campaigns/:id/stats", getCampaignStats);
  router.post("/api/admin/marketing/campaigns", zBody(createCampaignSchema), createCampaign);
  router.put("/api/admin/marketing/campaigns/:id", zBody(updateCampaignSchema), updateCampaign);
  router.delete("/api/admin/marketing/campaigns/:id", deleteCampaign);
  router.post("/api/admin/marketing/campaigns/:id/pause", pauseCampaign);
  router.post("/api/admin/marketing/campaigns/preview-recipients", zBody(previewRecipientsSchema), previewCampaignRecipients);
}
