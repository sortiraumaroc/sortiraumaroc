import { randomBytes } from "crypto";

import { getAdminSupabase } from "./supabaseAdmin";
import { renderSambookingEmail, sendSambookingEmail, type SambookingEmailInput, type SambookingSenderKey } from "./email";

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

type TemplateRow = {
  id: string;
  key: string;
  audience: string;
  name: string;
  subject_fr: string;
  subject_en: string;
  body_fr: string;
  body_en: string;
  cta_label_fr: string | null;
  cta_label_en: string | null;
  cta_url: string | null;
  enabled: boolean;
};

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

export async function sendLoggedEmail(input: SambookingEmailInput & { meta?: Record<string, unknown> }): Promise<
  | { ok: true; messageId: string; emailId: string }
  | { ok: false; error: string; emailId: string }
> {
  const emailId = asString(input.emailId) || randomBytes(16).toString("hex");

  const meta = {
    email_id: emailId,
    from_key: input.fromKey,
    to: input.to,
    subject: input.subject,
    cta_label: input.ctaLabel ?? null,
    cta_url: input.ctaUrl ?? null,
    attachments: (input.attachments ?? []).map((a) => a.filename).slice(0, 10),
    ...(input.meta ?? {}),
  };

  try {
    const rendered = await renderSambookingEmail({ ...input, emailId });

    await logEmailEvent({
      action: "email.queued",
      emailId,
      payload: {
        ...meta,
        html: rendered.html.slice(0, 50_000),
        text: rendered.text.slice(0, 20_000),
      },
    });

    const sent = await sendSambookingEmail({ ...input, emailId });

    await logEmailEvent({
      action: "email.sent",
      emailId,
      payload: { ...meta, message_id: sent.messageId || null },
    });

    return { ok: true, messageId: sent.messageId || "", emailId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Erreur email");

    await logEmailEvent({
      action: "email.failed",
      emailId,
      payload: { ...meta, error: msg },
    });

    return { ok: false, error: msg, emailId };
  }
}

export async function getEmailTemplateByKey(args: { key: string }): Promise<TemplateRow | null> {
  const supabase = getAdminSupabase();
  const key = asString(args.key);
  if (!key) return null;

  const { data, error } = await supabase
    .from("email_templates")
    .select("id,key,audience,name,subject_fr,subject_en,body_fr,body_en,cta_label_fr,cta_label_en,cta_url,enabled")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;

  const enabled = row.enabled !== false;
  if (!enabled) return null;

  return {
    id: String(row.id ?? ""),
    key: String(row.key ?? ""),
    audience: String(row.audience ?? ""),
    name: String(row.name ?? ""),
    subject_fr: String(row.subject_fr ?? ""),
    subject_en: String(row.subject_en ?? ""),
    body_fr: String(row.body_fr ?? ""),
    body_en: String(row.body_en ?? ""),
    cta_label_fr: row.cta_label_fr == null ? null : String(row.cta_label_fr),
    cta_label_en: row.cta_label_en == null ? null : String(row.cta_label_en),
    cta_url: row.cta_url == null ? null : String(row.cta_url),
    enabled,
  };
}

export async function sendTemplateEmail(args: {
  templateKey: string;
  lang?: "fr" | "en";
  fromKey: SambookingSenderKey;
  to: string[];
  variables?: Record<string, string | number | null | undefined>;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  emailId?: string;
  meta?: Record<string, unknown>;
  tracking?: SambookingEmailInput["tracking"];
}): Promise<{ ok: true; messageId: string; emailId: string } | { ok: false; error: string; emailId: string }> {
  const template = await getEmailTemplateByKey({ key: args.templateKey });
  if (!template) {
    const emailId = args.emailId || randomBytes(16).toString("hex");
    return { ok: false, error: `Template not found: ${args.templateKey}`, emailId };
  }

  const lang = args.lang === "en" ? "en" : "fr";
  const subject = lang === "en" ? template.subject_en : template.subject_fr;
  const bodyText = lang === "en" ? template.body_en : template.body_fr;

  const ctaLabelDefault = lang === "en" ? template.cta_label_en : template.cta_label_fr;
  const ctaUrlDefault = template.cta_url;

  const emailId = args.emailId || randomBytes(16).toString("hex");

  const res = await sendLoggedEmail({
    emailId,
    fromKey: args.fromKey,
    to: args.to,
    subject,
    bodyText,
    ctaLabel: args.ctaLabel ?? ctaLabelDefault,
    ctaUrl: args.ctaUrl ?? ctaUrlDefault,
    variables: args.variables,
    tracking: args.tracking,
    meta: {
      template_key: template.key,
      template_id: template.id,
      ...(args.meta ?? {}),
    },
  });

  return res.ok === true ? { ok: true, messageId: res.messageId, emailId: res.emailId } : { ok: false, error: res.error, emailId: res.emailId };
}
