/**
 * Routes pour les formulaires de leads/contact - SAM
 *
 * Ces endpoints sont publics mais protégés par rate limiting
 */

import type { Request, Response } from "express";
import { randomBytes } from "crypto";

import { renderSambookingEmail, sendSambookingEmail, type SambookingSenderKey } from "../email";
import { getAdminSupabase } from "../supabaseAdmin";
import { sendSuccess, errors } from "../lib/apiResponse";
import { leadsRateLimiter } from "../middleware/rateLimiter";

// Re-export du rate limiter pour l'utiliser dans le router
export { leadsRateLimiter };

// ============================================
// UTILITAIRES
// ============================================

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const CATEGORIES = new Set(["Food", "Loisirs", "Sports", "Bien-être", "Tourisme"]);

function normalizeForKeywordSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pickLeadRoutingRecipients(args: { message?: string | null }): SambookingSenderKey {
  const raw = (args.message ?? "").trim();
  if (!raw) return "hello";

  const msg = normalizeForKeywordSearch(raw);

  if (/\b(paiement|facture|prix|reversement|virement|remboursement)\b/i.test(msg)) return "finance";
  if (/\b(technique|bug|erreur|probleme|panne|connexion)\b/i.test(msg)) return "support";
  if (/\b(etablissement|pro|hotel|restaurant|partenaire|inscription|devis)\b/i.test(msg)) return "pro";

  return "hello";
}

// ============================================
// EMAIL LOGGING
// ============================================

async function logEmailEvent(args: {
  action: "email.queued" | "email.sent" | "email.failed";
  emailId: string;
  payload: Record<string, unknown>;
}) {
  try {
    const supabase = getAdminSupabase();
    await supabase.from("system_logs").insert({
      actor_user_id: null,
      actor_role: "system",
      action: args.action,
      entity_type: "email",
      entity_id: args.emailId,
      payload: args.payload,
    });
  } catch (err) {
    console.error("[Leads] Failed to log email event:", err);
  }
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
      ctaUrl: input.ctaUrl ?? null,
      variables: input.variables,
    });

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
      ctaUrl: input.ctaUrl ?? null,
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

// ============================================
// HANDLERS
// ============================================

/**
 * Soumet une demande d'ajout d'établissement
 * POST /api/leads/establishment
 *
 * Rate limited: 5 requêtes par 15 minutes
 */
export async function submitEstablishmentLead(req: Request, res: Response) {
  try {
    // Validation du body
    if (!isRecord(req.body)) {
      return errors.badRequest(res, "Corps de requête invalide");
    }

    const body = req.body as Record<string, unknown>;

    // Extraction et sanitization des champs
    const full_name = clamp(asString(body.full_name), 120);
    const establishment_name = clamp(asString(body.establishment_name), 160);
    const city = clamp(asString(body.city), 120);
    const phone = clamp(asString(body.phone), 60);
    const whatsapp = clamp(asString(body.whatsapp), 60);
    const email = clamp(asString(body.email).toLowerCase(), 180);
    const category = asString(body.category);

    // Validation des champs requis
    if (!full_name || full_name.length < 2) {
      return errors.missingField(res, "full_name");
    }
    if (!establishment_name || establishment_name.length < 2) {
      return errors.missingField(res, "establishment_name");
    }
    if (!city || city.length < 2) {
      return errors.missingField(res, "city");
    }
    if (!phone || phone.length < 6) {
      return errors.invalidFormat(res, "phone", "minimum 6 caractères");
    }
    if (!whatsapp || whatsapp.length < 6) {
      return errors.invalidFormat(res, "whatsapp", "minimum 6 caractères");
    }
    if (!email || !isEmail(email)) {
      return errors.invalidFormat(res, "email", "adresse email valide");
    }
    if (!category || !CATEGORIES.has(category)) {
      return errors.badRequest(res, "Catégorie invalide", {
        validCategories: Array.from(CATEGORIES),
      });
    }

    // Extraction des métadonnées de la requête
    const ip = (req.headers["x-forwarded-for"] ?? "") as string;
    const user_agent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
    const referer = typeof req.headers["referer"] === "string" ? req.headers["referer"] : null;

    // Insertion en base de données
    const supabase = getAdminSupabase();
    const { error } = await supabase.from("lead_establishment_requests").insert({
      full_name,
      establishment_name,
      city,
      phone,
      whatsapp,
      email,
      category,
      source: "landing_add_establishment",
      ip: ip ? clamp(ip, 200) : null,
      user_agent: user_agent ? clamp(user_agent, 300) : null,
      referer: referer ? clamp(referer, 400) : null,
    });

    if (error) {
      console.error("[Leads] Database error (establishment):", error);
      return errors.database(res, error);
    }

    // Envoi des emails (best-effort, ne bloque pas la réponse)
    const emailIdBase = randomBytes(16).toString("hex");

    // Email interne à l'équipe
    const internalSubject = `Nouvelle demande établissement — ${establishment_name}`;
    const internalBody = [
      "Nouvelle demande depuis le formulaire d'ajout d'établissement.",
      "",
      `Nom / Prénom: ${full_name}`,
      `Email: ${email}`,
      `Téléphone: ${phone}`,
      `WhatsApp: ${whatsapp}`,
      `Établissement: ${establishment_name}`,
      `Ville: ${city}`,
      `Catégorie: ${category}`,
      "",
      `IP: ${ip || "-"}`,
      `User-Agent: ${user_agent || "-"}`,
      `Referer: ${referer || "-"}`,
    ].join("\n");

    // Envoi asynchrone (ne pas attendre)
    sendLoggedEmail({
      emailId: `${emailIdBase}-pro`,
      fromKey: "pro",
      to: ["pro@sortiraumaroc.ma"],
      subject: internalSubject,
      bodyText: internalBody,
      meta: { source: "lead_establishment_requests" },
    }).catch((err) => console.error("[Leads] Email error (internal):", err));

    // Email d'accusé de réception au demandeur
    const ackSubject = "Merci — Nous avons bien reçu votre demande";
    const ackBody = [
      `Bonjour ${full_name},`,
      "",
      "Merci ! Nous avons bien reçu votre demande d'inscription d'établissement sur Sortir Au Maroc.",
      "Notre équipe Pro revient vers vous dans les plus brefs délais.",
      "",
      "À bientôt,",
      "L'équipe Sortir Au Maroc",
    ].join("\n");

    sendLoggedEmail({
      emailId: `${emailIdBase}-ack`,
      fromKey: "noreply",
      to: [email],
      subject: ackSubject,
      bodyText: ackBody,
      ctaLabel: "Découvrir Sortir Au Maroc",
      ctaUrl: "https://sortiraumaroc.ma/",
      meta: { source: "lead_establishment_requests", kind: "ack" },
    }).catch((err) => console.error("[Leads] Email error (ack):", err));

    return sendSuccess(res, { submitted: true });
  } catch (err) {
    console.error("[Leads] Unexpected error (establishment):", err);
    return errors.internal(res, err);
  }
}

/**
 * Soumet une demande de démo Pro
 * POST /api/leads/pro-demo
 *
 * Rate limited: 5 requêtes par 15 minutes
 */
export async function submitProDemoRequest(req: Request, res: Response) {
  try {
    // Validation du body
    if (!isRecord(req.body)) {
      return errors.badRequest(res, "Corps de requête invalide");
    }

    const body = req.body as Record<string, unknown>;

    // Extraction et sanitization des champs
    const full_name = clamp(asString(body.full_name ?? body.fullName), 120);
    const email = clamp(asString(body.email).toLowerCase(), 180);
    const phone = clamp(asString(body.phone), 60);
    const company = clamp(asString(body.company), 200);
    const city = clamp(asString(body.city), 120);
    const message = clamp(asString(body.message), 1000);

    // Validation des champs requis
    if (!full_name || full_name.length < 2) {
      return errors.missingField(res, "full_name");
    }
    if (!email || !isEmail(email)) {
      return errors.invalidFormat(res, "email", "adresse email valide");
    }
    if (!company || company.length < 2) {
      return errors.missingField(res, "company");
    }

    // Insertion en base de données
    const supabase = getAdminSupabase();
    const { error } = await supabase.from("pro_demo_requests").insert({
      full_name,
      email,
      phone: phone || null,
      company,
      city: city || null,
      message: message || null,
    });

    if (error) {
      console.error("[Leads] Database error (pro-demo):", error);
      return errors.database(res, error);
    }

    // Métadonnées de la requête
    const ip = (req.headers["x-forwarded-for"] ?? "") as string;
    const user_agent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
    const referer = typeof req.headers["referer"] === "string" ? req.headers["referer"] : null;

    const emailIdBase = randomBytes(16).toString("hex");
    const routingKey = pickLeadRoutingRecipients({ message });

    // Email interne
    const internalSubject = `Nouveau message (Pro) — ${company}`;
    const internalBody = [
      "Nouveau message reçu depuis la demande de démo Pro.",
      "",
      `Nom: ${full_name}`,
      `Email: ${email}`,
      `Téléphone: ${phone || "-"}`,
      `Établissement / enseigne: ${company}`,
      `Ville: ${city || "-"}`,
      "",
      "Message:",
      message || "-",
      "",
      `IP: ${ip || "-"}`,
      `User-Agent: ${user_agent || "-"}`,
      `Referer: ${referer || "-"}`,
    ].join("\n");

    // Email à hello@ (front door)
    sendLoggedEmail({
      emailId: `${emailIdBase}-hello`,
      fromKey: "hello",
      to: ["hello@sortiraumaroc.ma"],
      subject: internalSubject,
      bodyText: internalBody,
      meta: { source: "pro_demo_requests", routing: routingKey },
    }).catch((err) => console.error("[Leads] Email error (hello):", err));

    // Redirection intelligente selon le contenu du message
    if (routingKey !== "hello") {
      sendLoggedEmail({
        emailId: `${emailIdBase}-${routingKey}`,
        fromKey: routingKey,
        to: [`${routingKey}@sortiraumaroc.ma`],
        subject: internalSubject,
        bodyText: internalBody,
        meta: { source: "pro_demo_requests", routing: routingKey, kind: "redirect" },
      }).catch((err) => console.error("[Leads] Email error (redirect):", err));
    }

    // Email d'accusé de réception
    const ackSubject = "Merci — Nous avons bien reçu votre message";
    const ackBody = [
      `Bonjour ${full_name},`,
      "",
      "Nous avons bien reçu votre message et nous vous répondrons dès que possible.",
      "",
      "À bientôt,",
      "L'équipe Sortir Au Maroc",
    ].join("\n");

    sendLoggedEmail({
      emailId: `${emailIdBase}-ack`,
      fromKey: "noreply",
      to: [email],
      subject: ackSubject,
      bodyText: ackBody,
      ctaLabel: "Ouvrir Sortir Au Maroc",
      ctaUrl: "https://sortiraumaroc.ma/",
      meta: { source: "pro_demo_requests", kind: "ack" },
    }).catch((err) => console.error("[Leads] Email error (ack):", err));

    return sendSuccess(res, { submitted: true });
  } catch (err) {
    console.error("[Leads] Unexpected error (pro-demo):", err);
    return errors.internal(res, err);
  }
}
