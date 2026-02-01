import { createHmac, randomBytes } from "crypto";
import type { RequestHandler } from "express";

import { renderSambookingEmail, sendSambookingEmail, type SambookingSenderKey } from "../email";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireSuperadmin } from "./admin";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const v = asString(value);
  return v ? v : null;
}

function clampText(value: unknown, max: number): string {
  const v = asString(value);
  return v.length > max ? v.slice(0, max) : v;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getPublicBaseUrl(): string {
  const env = asString(process.env.PUBLIC_BASE_URL);
  return env || "https://sortiraumaroc.ma";
}

function signUnsubToken(args: { email: string; campaignId: string }): string {
  const secret = asString(process.env.EMAIL_UNSUB_SECRET) || asString(process.env.ADMIN_API_KEY) || "dev";
  return createHmac("sha256", secret).update(`${args.email}|${args.campaignId}`).digest("hex");
}

async function logEmailEvent(args: {
  action: "email.queued" | "email.sent" | "email.failed";
  emailId: string;
  payload: Record<string, unknown>;
}) {
  const supabase = getAdminSupabase();
  await supabase.from("system_logs").insert({
    actor_user_id: null,
    actor_role: "system",
    action: args.action,
    entity_type: "email",
    entity_id: args.emailId,
    payload: args.payload,
  });
}

async function sendLoggedEmail(input: {
  emailId: string;
  fromKey: SambookingSenderKey;
  to: string[];
  subject: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  variables?: Record<string, string | number | null | undefined>;
  meta?: Record<string, unknown>;
  tracking?: {
    campaignId?: string;
    recipientId?: string;
    marketingUnsubscribeUrl?: string | null;
    clickUrl?: string | null;
  };
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const meta = {
    email_id: input.emailId,
    from_key: input.fromKey,
    to: input.to,
    subject: input.subject,
    cta_label: input.ctaLabel ?? null,
    cta_url: input.ctaUrl ?? null,
    ...(input.meta ?? {}),
  };

  try {
    const rendered = await renderSambookingEmail({
      emailId: input.emailId,
      fromKey: input.fromKey,
      to: input.to,
      subject: input.subject,
      bodyText: input.bodyText,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.tracking?.clickUrl ?? input.ctaUrl ?? null,
      variables: input.variables,
      tracking: {
        campaignId: input.tracking?.campaignId ?? null,
        recipientId: input.tracking?.recipientId ?? null,
        marketingUnsubscribeUrl: input.tracking?.marketingUnsubscribeUrl ?? null,
      },
    } as any);

    await logEmailEvent({
      action: "email.queued",
      emailId: input.emailId,
      payload: {
        ...meta,
        html: rendered.html.slice(0, 50_000),
        text: rendered.text.slice(0, 20_000),
      },
    });

    const sent = await sendSambookingEmail({
      emailId: input.emailId,
      fromKey: input.fromKey,
      to: input.to,
      subject: input.subject,
      bodyText: input.bodyText,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.tracking?.clickUrl ?? input.ctaUrl ?? null,
      variables: input.variables,
    });

    await logEmailEvent({
      action: "email.sent",
      emailId: input.emailId,
      payload: { ...meta, message_id: sent.messageId || null },
    });

    return { ok: true, messageId: sent.messageId || "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Erreur email");

    await logEmailEvent({
      action: "email.failed",
      emailId: input.emailId,
      payload: { ...meta, error: msg },
    });

    return { ok: false, error: msg };
  }
}

export const listAdminEmailTemplates: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const audience = asNullableString(req.query.audience);

  const supabase = getAdminSupabase();
  let q = supabase
    .from("email_templates")
    .select("id,key,audience,name,subject_fr,subject_en,body_fr,body_en,cta_label_fr,cta_label_en,cta_url,enabled,created_at,updated_at")
    .order("audience", { ascending: true })
    .order("name", { ascending: true })
    .limit(500);

  if (audience) q = q.eq("audience", audience);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, items: data ?? [] });
};

export const upsertAdminEmailTemplate: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const id = asNullableString(req.body.id);

  const key = clampText(req.body.key, 80);
  const audience = clampText(req.body.audience, 30);
  const name = clampText(req.body.name, 160);

  const subject_fr = clampText(req.body.subject_fr, 180);
  const subject_en = clampText(req.body.subject_en, 180);

  const body_fr = clampText(req.body.body_fr, 12000);
  const body_en = clampText(req.body.body_en, 12000);

  const cta_label_fr = asNullableString(req.body.cta_label_fr);
  const cta_label_en = asNullableString(req.body.cta_label_en);
  const cta_url = asNullableString(req.body.cta_url);

  const enabled = req.body.enabled === false ? false : true;

  if (!key || !/^[a-z0-9_\-]+$/i.test(key)) return res.status(400).json({ error: "Invalid key" });
  if (!audience || !["consumer", "pro", "finance", "system", "marketing"].includes(audience)) {
    return res.status(400).json({ error: "Invalid audience" });
  }
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!subject_fr || !subject_en) return res.status(400).json({ error: "subject_fr/subject_en required" });
  if (!body_fr || !body_en) return res.status(400).json({ error: "body_fr/body_en required" });

  const supabase = getAdminSupabase();

  if (id) {
    const { data, error } = await supabase
      .from("email_templates")
      .update({
        key,
        audience,
        name,
        subject_fr,
        subject_en,
        body_fr,
        body_en,
        cta_label_fr,
        cta_label_en,
        cta_url,
        enabled,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, id: (data as any)?.id ?? id });
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      key,
      audience,
      name,
      subject_fr,
      subject_en,
      body_fr,
      body_en,
      cta_label_fr,
      cta_label_en,
      cta_url,
      enabled,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, id: (data as any)?.id ?? null });
};

export const duplicateAdminEmailTemplate: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();
  const { data: tpl, error: tplErr } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (tplErr) return res.status(404).json({ error: tplErr.message });

  const baseKey = String((tpl as any).key ?? "template");
  const newKey = `${baseKey}_copy_${randomBytes(3).toString("hex")}`;

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      key: newKey,
      audience: (tpl as any).audience,
      name: `${String((tpl as any).name ?? "Template")} (copie)`,
      subject_fr: (tpl as any).subject_fr,
      subject_en: (tpl as any).subject_en,
      body_fr: (tpl as any).body_fr,
      body_en: (tpl as any).body_en,
      cta_label_fr: (tpl as any).cta_label_fr,
      cta_label_en: (tpl as any).cta_label_en,
      cta_url: (tpl as any).cta_url,
      enabled: (tpl as any).enabled,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, id: (data as any)?.id ?? null, key: newKey });
};

export const getAdminEmailBranding: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("email_branding_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, item: data });
};

export const updateAdminEmailBranding: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const patch: Record<string, unknown> = {};

  const logo_url = asNullableString(req.body.logo_url);
  if (logo_url != null) patch.logo_url = logo_url;

  const primary_color = asNullableString(req.body.primary_color);
  if (primary_color != null) patch.primary_color = primary_color;

  const secondary_color = asNullableString(req.body.secondary_color);
  if (secondary_color != null) patch.secondary_color = secondary_color;

  const background_color = asNullableString(req.body.background_color);
  if (background_color != null) patch.background_color = background_color;

  const from_name = asNullableString(req.body.from_name);
  if (from_name != null) patch.from_name = from_name;

  const contact_email = asNullableString(req.body.contact_email);
  if (contact_email != null) patch.contact_email = contact_email;

  const signature_fr = asNullableString(req.body.signature_fr);
  if (signature_fr != null) patch.signature_fr = signature_fr;

  const signature_en = asNullableString(req.body.signature_en);
  if (signature_en != null) patch.signature_en = signature_en;

  if (req.body.legal_links && typeof req.body.legal_links === "object") patch.legal_links = req.body.legal_links;

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("email_branding_settings").update(patch).eq("id", 1);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
};

export const listAdminEmailCampaigns: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("email_campaigns")
    .select(
      "id,name,template_id,subject_override,audience,status,scheduled_at,send_started_at,send_finished_at,created_at,updated_at, email_templates(name, key, audience)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, items: data ?? [] });
};

export const createAdminEmailCampaign: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const name = clampText(req.body.name, 160);
  const template_id = clampText(req.body.template_id, 80);
  const audience = clampText(req.body.audience, 20);
  const subject_override = asNullableString(req.body.subject_override);
  const scheduled_at = asNullableString(req.body.scheduled_at);

  if (!name) return res.status(400).json({ error: "name is required" });
  if (!template_id) return res.status(400).json({ error: "template_id is required" });
  if (!audience || !["consumer", "pro"].includes(audience)) return res.status(400).json({ error: "Invalid audience" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      name,
      template_id,
      audience,
      subject_override,
      scheduled_at,
      status: scheduled_at ? "scheduled" : "draft",
      created_by: "superadmin",
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, id: (data as any)?.id ?? null });
};

type RecipientRow = {
  id: string;
  email: string;
  full_name: string | null;
  recipient_type: "consumer" | "pro";
  recipient_id: string | null;
};

async function listConsumerRecipients(limit: number): Promise<RecipientRow[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("admin_consumer_users")
    .select("id,name,email,status")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(Math.min(500, Math.max(1, limit)));

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<any>)
    .map((r) => ({
      id: randomBytes(16).toString("hex"),
      email: String(r.email ?? "").trim(),
      full_name: String(r.name ?? "").trim() || null,
      recipient_type: "consumer" as const,
      recipient_id: r.id ? String(r.id) : null,
    }))
    .filter((r) => r.email && isEmailAddress(r.email));
}

async function fetchAuthEmailsByIds(args: { userIds: string[] }): Promise<Map<string, string>> {
  const supabase = getAdminSupabase();
  const wanted = new Set(args.userIds);
  const byId = new Map<string, string>();

  // Page through auth users and stop early when we found everything.
  // This matches existing patterns in server/routes/admin.ts.
  for (let page = 1; page <= 100; page++) {
    if (byId.size >= wanted.size) break;

    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);

    for (const u of data.users ?? []) {
      const id = String((u as any).id ?? "");
      if (!id || !wanted.has(id)) continue;
      const email = String((u as any).email ?? "").trim();
      if (email) byId.set(id, email);
    }

    if (!data.users?.length) break;
  }

  return byId;
}

async function listProRecipients(limit: number): Promise<RecipientRow[]> {
  const supabase = getAdminSupabase();
  const { data: memberships, error } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .limit(5000);

  if (error) throw new Error(error.message);

  const userIds = Array.from(
    new Set(
      ((memberships ?? []) as Array<any>)
        .map((m) => String(m.user_id ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, Math.max(1, Math.min(5000, limit)));

  const byId = await fetchAuthEmailsByIds({ userIds });

  return userIds
    .map((userId) => ({
      id: randomBytes(16).toString("hex"),
      email: byId.get(userId) ?? "",
      full_name: null,
      recipient_type: "pro" as const,
      recipient_id: userId,
    }))
    .filter((r) => r.email && isEmailAddress(r.email));
}

export const sendAdminEmailCampaignNow: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const limit = Math.min(500, Math.max(1, Number(req.body?.limit ?? 50)));
  const dryRun = req.body?.dry_run === true;

  const supabase = getAdminSupabase();

  const { data: campaign, error: campaignErr } = await supabase
    .from("email_campaigns")
    .select("id,name,template_id,subject_override,audience,status")
    .eq("id", id)
    .single();

  if (campaignErr) return res.status(404).json({ error: campaignErr.message });

  const { data: tpl, error: tplErr } = await supabase
    .from("email_templates")
    .select("id,key,audience,name,subject_fr,subject_en,body_fr,body_en,cta_label_fr,cta_label_en,cta_url")
    .eq("id", (campaign as any).template_id)
    .single();

  if (tplErr) return res.status(404).json({ error: tplErr.message });

  if (String((campaign as any).status) === "sent") {
    return res.status(409).json({ error: "Campaign already sent" });
  }

  const audience = String((campaign as any).audience);
  const recipients =
    audience === "pro" ? await listProRecipients(limit) : await listConsumerRecipients(limit);

  // Preload unsubscribes.
  const emails = recipients.map((r) => r.email);
  const { data: unsubRows } = await supabase
    .from("email_unsubscribes")
    .select("email")
    .eq("scope", "marketing")
    .in("email", emails.slice(0, 1000));

  const unsubSet = new Set(((unsubRows ?? []) as Array<any>).map((r) => String(r.email ?? "").toLowerCase()));

  const baseUrl = getPublicBaseUrl();

  const sendStartedAt = new Date().toISOString();
  await supabase
    .from("email_campaigns")
    .update({ status: dryRun ? "draft" : "sending", send_started_at: sendStartedAt })
    .eq("id", id);

  let insertedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const r of recipients) {
    const emailLower = r.email.toLowerCase();
    const isUnsub = unsubSet.has(emailLower);

    const { data: recRow, error: recErr } = await supabase
      .from("email_campaign_recipients")
      .insert({
        campaign_id: id,
        recipient_type: r.recipient_type,
        recipient_id: r.recipient_id,
        email: r.email,
        full_name: r.full_name,
        status: isUnsub ? "skipped_unsubscribed" : "pending",
      })
      .select("id")
      .single();

    if (recErr) {
      failedCount++;
      continue;
    }

    insertedCount++;

    if (isUnsub) {
      skippedCount++;
      continue;
    }

    if (dryRun) continue;

    const recipientId = String((recRow as any)?.id ?? "");
    const emailId = `${id}:${recipientId}`;

    const originalCta = String((tpl as any).cta_url ?? "").trim() || null;
    const resolvedCta = !originalCta || originalCta.includes("{{") ? `${baseUrl}/` : originalCta;

    const trackedCta = resolvedCta
      ? `${baseUrl}/api/public/email/click?email_id=${encodeURIComponent(emailId)}&campaign_id=${encodeURIComponent(id)}&recipient_id=${encodeURIComponent(
          recipientId,
        )}&url=${encodeURIComponent(resolvedCta)}`
      : null;

    const unsubToken = signUnsubToken({ email: r.email.toLowerCase(), campaignId: id });
    const unsubUrl = `${baseUrl}/api/public/email/unsubscribe?campaign_id=${encodeURIComponent(id)}&email=${encodeURIComponent(
      r.email.toLowerCase(),
    )}&token=${encodeURIComponent(unsubToken)}`;

    const subject = String((campaign as any).subject_override ?? "").trim() || String((tpl as any).subject_fr);
    const body = String((tpl as any).body_fr);

    const resp = await sendLoggedEmail({
      emailId,
      fromKey: "hello",
      to: [r.email],
      subject,
      bodyText: body,
      ctaLabel: (tpl as any).cta_label_fr ?? null,
      ctaUrl: resolvedCta,
      variables: {
        user_name: r.full_name ?? "",
        date: new Date().toISOString().slice(0, 10),
        line1: "Nouveautés & offres du moment",
        line2: "Idées sorties et expériences à découvrir",
        line3: "Réservez en quelques clics sur Sortir Au Maroc",
        cta_url: resolvedCta,
      },
      meta: {
        campaign_id: id,
        campaign_name: (campaign as any).name,
        template_key: (tpl as any).key,
        recipient_row_id: recipientId,
      },
      tracking: {
        campaignId: id,
        recipientId,
        marketingUnsubscribeUrl: unsubUrl,
        clickUrl: trackedCta,
      },
    });

    if (resp.ok === true) {
      sentCount++;
      await supabase
        .from("email_campaign_recipients")
        .update({
          status: "sent",
          email_id: emailId,
          message_id: resp.messageId || null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", recipientId);
    } else {
      failedCount++;
      const err = resp.ok === false ? resp.error : "Erreur email";
      await supabase
        .from("email_campaign_recipients")
        .update({
          status: "failed",
          email_id: emailId,
          error: err,
        })
        .eq("id", recipientId);
    }
  }

  if (!dryRun) {
    await supabase
      .from("email_campaigns")
      .update({ status: "sent", send_finished_at: new Date().toISOString() })
      .eq("id", id);
  }

  return res.json({
    ok: true,
    dry_run: dryRun,
    inserted: insertedCount,
    sent: sentCount,
    failed: failedCount,
    skipped_unsubscribed: skippedCount,
  });
};

export const listAdminEmailCampaignRecipients: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const status = asNullableString(req.query.status);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));

  const supabase = getAdminSupabase();
  let q = supabase
    .from("email_campaign_recipients")
    .select("id,email,full_name,status,email_id,message_id,error,sent_at,opened_at,clicked_at,created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, items: data ?? [] });
};

export const previewAdminEmail: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const fromKey = clampText(req.body.from, 20) as SambookingSenderKey;
  const subject = clampText(req.body.subject, 180) || "Aperçu";
  const bodyText = clampText(req.body.body, 12000) || "";
  const ctaLabel = asNullableString(req.body.cta_label);
  const ctaUrl = asNullableString(req.body.cta_url);

  const emailId = `preview_${randomBytes(10).toString("hex")}`;

  const rendered = await renderSambookingEmail({
    emailId,
    fromKey: (["hello", "support", "pro", "finance", "no-reply"].includes(fromKey) ? fromKey : "hello") as SambookingSenderKey,
    to: ["preview@sortiraumaroc.ma"],
    subject,
    bodyText,
    ctaLabel,
    ctaUrl,
    variables: isRecord(req.body.variables) ? (req.body.variables as any) : undefined,
  });

  return res.json({ ok: true, html: rendered.html, text: rendered.text });
};

export const listAdminEmailSends: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const qSearch = asNullableString(req.query.q);
  const status = asNullableString(req.query.status);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));

  const supabase = getAdminSupabase();

  let q = supabase
    .from("email_campaign_recipients")
    .select(
      "id,campaign_id,email,full_name,status,email_id,message_id,error,sent_at,opened_at,clicked_at,created_at, email_campaigns(name,audience)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);
  if (qSearch) q = q.ilike("email", `%${qSearch}%`);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, items: data ?? [] });
};
