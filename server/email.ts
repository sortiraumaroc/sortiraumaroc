import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { getBillingCompanyProfile } from "./billing/companyProfile";
import { getAdminSupabase } from "./supabaseAdmin";

export type SAMSenderKey = "hello" | "support" | "pro" | "finance" | "noreply";
/** @deprecated Use SAMSenderKey instead */
export type SambookingSenderKey = SAMSenderKey;

export type SAMEmailInput = {
  emailId: string;
  fromKey: SambookingSenderKey;
  to: string[];
  subject: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  variables?: Record<string, string | number | null | undefined>;
  tracking?: {
    campaignId?: string | null;
    recipientId?: string | null;
    marketingUnsubscribeUrl?: string | null;
  };
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
};
/** @deprecated Use SAMEmailInput instead */
export type SambookingEmailInput = SAMEmailInput;

type ResolvedSender = {
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  smtpUser?: string;
  smtpPass?: string;
};

const DEFAULT_BRAND_COLOR = "#a3001d";
// Logo URL for emails - white logo on red header background
const DEFAULT_LOGO_URL = "https://sam.ma/api/public/assets/email-logo.png";

type EmailBrandingSettings = {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  from_name: string;
  contact_email: string;
  legal_links: unknown;
  signature_fr: string;
  signature_en: string;
};

let brandingCache: { at: number; value: EmailBrandingSettings } | null = null;

function getPublicBaseUrl(): string {
  const v = asString(process.env.PUBLIC_BASE_URL);
  return v || "https://sam.ma";
}

async function getEmailBrandingSettings(): Promise<EmailBrandingSettings> {
  const now = Date.now();
  if (brandingCache && now - brandingCache.at < 5 * 60_000) return brandingCache.value;

  const fallback: EmailBrandingSettings = {
    logo_url: DEFAULT_LOGO_URL,
    primary_color: DEFAULT_BRAND_COLOR,
    secondary_color: "#000000",
    background_color: "#FFFFFF",
    from_name: asString(process.env.EMAIL_FROM_NAME) || "Sortir Au Maroc",
    contact_email: `hello@${asString(process.env.EMAIL_DOMAIN) || "sortiraumaroc.ma"}`,
    legal_links: {
      legal: "https://sam.ma/mentions-legales",
      terms: "https://sam.ma/cgu",
      privacy: "https://sam.ma/politique-de-confidentialite",
    },
    signature_fr: "L'équipe Sortir Au Maroc",
    signature_en: "The Sortir Au Maroc team",
  };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("email_branding_settings")
      .select("logo_url,primary_color,secondary_color,background_color,from_name,contact_email,legal_links,signature_fr,signature_en")
      .eq("id", 1)
      .single();

    if (error || !data) {
      brandingCache = { at: now, value: fallback };
      return fallback;
    }

    const v: EmailBrandingSettings = {
      logo_url: (data as any).logo_url ?? fallback.logo_url,
      primary_color: asString((data as any).primary_color) || fallback.primary_color,
      secondary_color: asString((data as any).secondary_color) || fallback.secondary_color,
      background_color: asString((data as any).background_color) || fallback.background_color,
      from_name: asString((data as any).from_name) || fallback.from_name,
      contact_email: asString((data as any).contact_email) || fallback.contact_email,
      legal_links: (data as any).legal_links ?? fallback.legal_links,
      signature_fr: asString((data as any).signature_fr) || fallback.signature_fr,
      signature_en: asString((data as any).signature_en) || fallback.signature_en,
    };

    brandingCache = { at: now, value: v };
    return v;
  } catch {
    brandingCache = { at: now, value: fallback };
    return fallback;
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function applyTemplateVars(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, keyRaw) => {
    const key = String(keyRaw || "").trim();
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });
}

function normalizeEmailAddressList(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const v = asString(raw);
    if (!v) continue;
    out.push(v);
  }
  return Array.from(new Set(out));
}

function resolveSender(fromKey: SAMSenderKey): ResolvedSender {
  const domain = asString(process.env.EMAIL_DOMAIN) || "sortiraumaroc.ma";

  const name = asString(process.env.EMAIL_FROM_NAME) || "Sortir Au Maroc";

  const fromEmail = (() => {
    switch (fromKey) {
      case "hello":
        return `hello@${domain}`;
      case "support":
        return `support@${domain}`;
      case "pro":
        return `pro@${domain}`;
      case "finance":
        return `finance@${domain}`;
      case "noreply":
        return `noreply@${domain}`;
      default:
        return `hello@${domain}`;
    }
  })();

  const replyTo = fromKey === "noreply" ? `support@${domain}` : undefined;

  const smtpUser = asString(process.env[`SMTP_USER_${fromKey.toUpperCase().replace(/-/g, "_")}`]) || asString(process.env.SMTP_USER);
  const smtpPass = asString(process.env[`SMTP_PASS_${fromKey.toUpperCase().replace(/-/g, "_")}`]) || asString(process.env.SMTP_PASS);

  return { fromEmail, fromName: name, replyTo, smtpUser: smtpUser || undefined, smtpPass: smtpPass || undefined };
}

type TransportKey = string;

let transporterCache: Map<TransportKey, Transporter> | null = null;

function getTransporter(sender: ResolvedSender): Transporter {
  const host = asString(process.env.SMTP_HOST);
  const portRaw = asString(process.env.SMTP_PORT) || "587";
  const secureRaw = asString(process.env.SMTP_SECURE);

  const port = Number(portRaw);
  const secure = secureRaw ? secureRaw === "1" || secureRaw.toLowerCase() === "true" : port === 465;

  const user = sender.smtpUser;
  const pass = sender.smtpPass;

  if (!host) throw new Error("SMTP_HOST is missing");
  if (!Number.isFinite(port) || port < 1) throw new Error("SMTP_PORT is invalid");
  if (!user) throw new Error(`SMTP_USER (or SMTP_USER_${String(sender.fromEmail).toUpperCase()}) is missing`);
  if (!pass) throw new Error(`SMTP_PASS (or SMTP_PASS_${String(sender.fromEmail).toUpperCase()}) is missing`);

  const key: TransportKey = `${host}|${port}|${secure ? "1" : "0"}|${user}`;
  if (!transporterCache) transporterCache = new Map();
  const existing = transporterCache.get(key);
  if (existing) return existing;

  const t = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  transporterCache.set(key, t);
  return t;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToHtml(text: string): string {
  // First, convert literal \n sequences to actual newlines
  const normalized = text.replace(/\\n/g, "\n");
  const safe = escapeHtml(normalized);
  return safe
    .split(/\r?\n\r?\n/g)
    .map((block) => `<p style=\"margin:0 0 12px 0;\">${block.replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
}

export async function renderSAMEmail(
  input: SAMEmailInput,
): Promise<{ html: string; text: string; from: ResolvedSender; subject: string }> {
  const sender = resolveSender(input.fromKey);

  const vars: Record<string, string | number | null | undefined> = {
    ...input.variables,
    lien: input.ctaUrl ?? input.variables?.lien,
  };

  const subject = applyTemplateVars(input.subject, vars);
  const bodyText = applyTemplateVars(input.bodyText, vars);
  const ctaLabel = input.ctaLabel ? applyTemplateVars(input.ctaLabel, vars) : null;
  const ctaUrl = input.ctaUrl ? applyTemplateVars(input.ctaUrl, vars) : null;

  const profile = await getBillingCompanyProfile();
  const branding = await getEmailBrandingSettings();

  const address = [profile.address_line1, profile.address_line2, `${profile.city}, ${profile.country}`].filter(Boolean).join(" — ");

  const preheader = "Sortir Au Maroc";

  const htmlBody = textToHtml(bodyText);

  const baseUrl = getPublicBaseUrl();
  const openPixelUrl = `${baseUrl}/api/public/email/open?email_id=${encodeURIComponent(input.emailId)}${input.tracking?.campaignId ? `&campaign_id=${encodeURIComponent(String(input.tracking.campaignId))}` : ""}${input.tracking?.recipientId ? `&recipient_id=${encodeURIComponent(String(input.tracking.recipientId))}` : ""}`;

  const legalLinks = (branding.legal_links ?? {}) as any;
  const legalUrl = asString(legalLinks.legal) || "https://sam.ma/mentions-legales";
  const termsUrl = asString(legalLinks.terms) || "https://sam.ma/cgu";
  const privacyUrl = asString(legalLinks.privacy) || "https://sam.ma/politique-de-confidentialite";

  const footerLines = [
    `Sortir Au Maroc (SAM)`,
    // Only show RC if it's not N/A or empty
    ...(profile.rc_number && profile.rc_number !== "N/A" ? [`RC : ${profile.rc_number} (${profile.rc_court})`] : []),
    // Only show ICE if it's not N/A or empty
    ...(profile.ice && profile.ice !== "N/A" ? [`ICE : ${profile.ice}`] : []),
    `Adresse : ${address}`,
    `Email : ${branding.contact_email || "hello@sortiraumaroc.ma"}`,
  ];

  const html = `<!doctype html>
<html lang=\"fr\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <meta name=\"x-apple-disable-message-reformatting\" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style=\"margin:0;padding:0;background:#f6f6f7;\">
    <div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;\">${escapeHtml(preheader)}</div>

    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background:#f6f6f7;\">
      <tr>
        <td align=\"center\" style=\"padding:24px 12px;\">
          <table role=\"presentation\" width=\"600\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;max-width:600px;background:${escapeHtml(branding.background_color)};border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;\">
            <tr>
              <td style=\"padding:0;\">
                <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background:${escapeHtml(branding.primary_color || DEFAULT_BRAND_COLOR)};border-radius:16px 16px 0 0;\">
                  <tr>
                    <td align=\"center\" style=\"padding:28px 20px;\">
                      <img src=\"${escapeHtml(branding.logo_url || DEFAULT_LOGO_URL)}\" width=\"160\" alt=\"Sortir Au Maroc\" style=\"display:block;border:0;outline:none;text-decoration:none;max-width:160px;height:auto;\" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style=\"padding:22px 20px;font-family:Arial,Helvetica,sans-serif;color:#111827;\">
                <h1 style=\"margin:0 0 12px 0;font-size:18px;line-height:1.25;\">${escapeHtml(subject)}</h1>
                <div style=\"font-size:14px;line-height:1.6;color:#111827;\">${htmlBody}</div>

                ${ctaLabel && ctaUrl ? `
                <div style=\"margin-top:18px;\">
                  <a href=\"${escapeHtml(ctaUrl)}\" style=\"display:inline-block;background:${escapeHtml(branding.primary_color || DEFAULT_BRAND_COLOR)};color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 16px;font-weight:700;font-size:14px;\" target=\"_blank\" rel=\"noreferrer\">${escapeHtml(ctaLabel)}</a>
                </div>
                ` : ""}

                <div style=\"margin-top:22px;border-top:1px solid #f1f5f9;padding-top:14px;color:#6b7280;font-size:12px;line-height:1.5;\">
                  <div style=\"color:#111827;font-weight:700;margin-bottom:6px;\">${escapeHtml(branding.signature_fr || "L'équipe Sortir Au Maroc")}</div>
                  ${footerLines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
                  <div style=\"margin-top:10px;\">
                    <a href=\"${escapeHtml(legalUrl)}\" style=\"color:#6b7280;text-decoration:underline;\" target=\"_blank\" rel=\"noreferrer\">Mentions légales</a>
                    <span style=\"margin:0 6px;\">|</span>
                    <a href=\"${escapeHtml(termsUrl)}\" style=\"color:#6b7280;text-decoration:underline;\" target=\"_blank\" rel=\"noreferrer\">CGU</a>
                    <span style=\"margin:0 6px;\">|</span>
                    <a href=\"${escapeHtml(privacyUrl)}\" style=\"color:#6b7280;text-decoration:underline;\" target=\"_blank\" rel=\"noreferrer\">Politique de confidentialité</a>
                  </div>
                  ${input.tracking?.marketingUnsubscribeUrl ? `<div style=\"margin-top:10px;\"><a href=\"${escapeHtml(String(input.tracking.marketingUnsubscribeUrl))}\" style=\"color:#6b7280;text-decoration:underline;\" target=\"_blank\" rel=\"noreferrer\">Se désinscrire</a></div>` : ""}
                </div>

                ${input.tracking ? `<img src=\"${escapeHtml(openPixelUrl)}\" width=\"1\" height=\"1\" alt=\"\" style=\"display:block;border:0;outline:none;text-decoration:none;\" />` : ""}
              </td>
            </tr>
          </table>

          <div style=\"max-width:600px;font-family:Arial,Helvetica,sans-serif;color:#9ca3af;font-size:11px;line-height:1.4;margin-top:10px;\">
            Cet email est envoyé automatiquement. Merci de ne pas répondre si l'expéditeur est "noreply".
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textFooter = footerLines.join("\n");
  const textCta = ctaLabel && ctaUrl ? `\n\n${ctaLabel}: ${ctaUrl}` : "";
  const text = `${subject}\n\n${bodyText}${textCta}\n\n${textFooter}`;

  return { html, text, from: sender, subject };
}

export async function sendSAMEmail(input: SAMEmailInput): Promise<{ messageId: string }> {
  const sender = resolveSender(input.fromKey);
  const { html, text, subject } = await renderSAMEmail(input);

  const transporter = getTransporter(sender);

  const to = normalizeEmailAddressList(input.to);
  if (!to.length) throw new Error("Recipient is missing");

  const info = await transporter.sendMail({
    from: `${sender.fromName} <${sender.fromEmail}>`,
    to,
    replyTo: sender.replyTo,
    subject,
    html,
    text,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
    headers: {
      "X-SAM-Email-Id": input.emailId,
    },
  });

  return { messageId: String((info as any)?.messageId ?? "") };
}

// Backward compatibility aliases (deprecated)
/** @deprecated Use renderSAMEmail instead */
export const renderSambookingEmail = renderSAMEmail;
/** @deprecated Use sendSAMEmail instead */
export const sendSambookingEmail = sendSAMEmail;
