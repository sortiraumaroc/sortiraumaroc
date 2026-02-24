import type { Request, Response } from "express";
import { createHash } from "crypto";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicMedia");

import { getBillingCompanyProfile } from "../billing/companyProfile";
import {
  generateMediaInvoicePdfBuffer,
  generateMediaQuotePdfBuffer,
} from "../billing/mediaPdf";
import {
  buildLacaissePayCheckoutUrlServer,
  createLacaissePaySessionInternal,
} from "./lacaissepay";

import {
  getAdminSupabase,
  getRequestBaseUrl,
} from "./publicHelpers";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** @internal — exported for testing */
export function isProduction(): boolean {
  const env = String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  return env === "production" || env === "prod";
}

/** @internal — exported for testing */
export function expectedWebhookKey(): string {
  // Prefer a dedicated secret, but keep ADMIN_API_KEY as fallback for dev environments.
  return (
    process.env.PAYMENTS_WEBHOOK_KEY ||
    process.env.ADMIN_API_KEY ||
    ""
  ).trim();
}

// ---------------------------------------------------------------------------
// Public (no account) — SAM Media quote view / accept
// ---------------------------------------------------------------------------

export async function getPublicMediaQuote(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_quote_public_links")
    .select("id,quote_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const quoteId = String((link as any).quote_id ?? "");
  if (!quoteId) return res.status(404).json({ error: "quote_not_found" });

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select(
      "id,quote_number,status,client_type,pro_user_id,establishment_id,issued_at,valid_until,currency,payment_method,notes,payment_terms,delivery_estimate,subtotal_amount,tax_amount,total_amount,sent_at,accepted_at,rejected_at,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city)",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,category_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_subtotal,line_tax,line_total",
    )
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  return res.json({
    ok: true,
    quote: { ...(quote as any), items: items ?? [] },
    link: {
      expires_at: (link as any).expires_at,
      used_at: (link as any).used_at,
    },
  });
}

export async function getPublicMediaQuotePdf(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_quote_public_links")
    .select("id,quote_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const quoteId = String((link as any).quote_id ?? "");
  if (!quoteId) return res.status(404).json({ error: "quote_not_found" });

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select(
      "id,quote_number,status,client_type,pro_user_id,establishment_id,issued_at,valid_until,currency,payment_method,notes,payment_terms,delivery_estimate,subtotal_amount,tax_amount,total_amount,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city)",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_total",
    )
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  try {
    const company = await getBillingCompanyProfile();
    const pdf = await generateMediaQuotePdfBuffer({
      company,
      quote: quote as any,
      items: (items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const filename = `${String((quote as any).quote_number ?? "devis")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );
    return res.status(200).send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
}

export async function acceptPublicMediaQuote(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_quote_public_links")
    .select("id,quote_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const quoteId = String((link as any).quote_id ?? "");
  if (!quoteId) return res.status(404).json({ error: "quote_not_found" });

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const status = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (status === "accepted") {
    return res.json({ ok: true, already_accepted: true });
  }

  if (status !== "sent" && status !== "draft") {
    return res.status(409).json({ error: "quote_not_acceptable" });
  }

  const { error: updErr } = await supabase
    .from("media_quotes")
    .update({ status: "accepted", accepted_at: nowIso, updated_at: nowIso })
    .eq("id", quoteId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  // Best-effort: mark link as used.
  if (!(link as any).used_at) {
    await supabase
      .from("media_quote_public_links")
      .update({ used_at: nowIso })
      .eq("id", (link as any).id);
  }

  return res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Public (no account) — SAM Media invoice view / pdf
// ---------------------------------------------------------------------------

export async function getPublicMediaInvoice(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_invoice_public_links")
    .select("id,invoice_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const invoiceId = String((link as any).invoice_id ?? "");
  if (!invoiceId) return res.status(404).json({ error: "invoice_not_found" });

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,client_type,pro_user_id,establishment_id,issued_at,due_at,currency,payment_method,notes,subtotal_amount,tax_amount,total_amount,paid_amount,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city),media_quotes(quote_number)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,category_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_subtotal,line_tax,line_total",
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  return res.json({
    ok: true,
    invoice: { ...(invoice as any), items: items ?? [] },
    link: {
      expires_at: (link as any).expires_at,
      used_at: (link as any).used_at,
    },
  });
}

export async function getPublicMediaInvoicePdf(req: Request, res: Response) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_invoice_public_links")
    .select("id,invoice_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const invoiceId = String((link as any).invoice_id ?? "");
  if (!invoiceId) return res.status(404).json({ error: "invoice_not_found" });

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,client_type,pro_user_id,establishment_id,issued_at,due_at,currency,payment_method,notes,subtotal_amount,tax_amount,total_amount,paid_amount,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,address,city,ice,notes),establishments(name,city)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select(
      "id,item_type,name_snapshot,description_snapshot,unit_price_snapshot,quantity,tax_rate_snapshot,line_total",
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  try {
    const company = await getBillingCompanyProfile();
    const pdf = await generateMediaInvoicePdfBuffer({
      company,
      invoice: invoice as any,
      items: (items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const filename = `${String((invoice as any).invoice_number ?? "facture")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );
    return res.status(200).send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
}

export async function createPublicMediaInvoicePaymentSession(
  req: Request,
  res: Response,
) {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("media_invoice_public_links")
    .select("id,invoice_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(404).json({ error: "link_not_found" });

  const expiresAt = String((link as any).expires_at ?? "");
  if (expiresAt && expiresAt < nowIso)
    return res.status(410).json({ error: "link_expired" });

  const invoiceId = String((link as any).invoice_id ?? "");
  if (!invoiceId) return res.status(404).json({ error: "invoice_not_found" });

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,client_type,currency,payment_method,total_amount,paid_amount,pro_user_id,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,city),establishments(name,city)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const status = String((invoice as any).status ?? "")
    .trim()
    .toLowerCase();
  if (status === "cancelled")
    return res.status(409).json({ error: "invoice_cancelled" });

  const paymentMethod = String((invoice as any).payment_method ?? "")
    .trim()
    .toLowerCase();
  if (paymentMethod && paymentMethod !== "card") {
    return res.status(409).json({ error: "payment_method_not_card" });
  }

  const total =
    typeof (invoice as any).total_amount === "number"
      ? (invoice as any).total_amount
      : Number((invoice as any).total_amount ?? 0);
  const paid =
    typeof (invoice as any).paid_amount === "number"
      ? (invoice as any).paid_amount
      : Number((invoice as any).paid_amount ?? 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

  if (!remaining || remaining <= 0) {
    return res.json({ ok: true, already_paid: true });
  }

  const baseUrl = getRequestBaseUrl(req);
  if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

  const pageUrl = `${baseUrl}/invoices/${encodeURIComponent(token)}`;
  const acceptUrl = `${pageUrl}?payment_status=success`;
  const declineUrl = `${pageUrl}?payment_status=failed`;

  const key = expectedWebhookKey();
  if (!key)
    return res
      .status(503)
      .json({
        error: "PAYMENTS_WEBHOOK_KEY (or ADMIN_API_KEY fallback) is missing",
      });

  const notificationUrl = `${baseUrl}/api/payments/webhook?webhook_key=${encodeURIComponent(key)}`;

  const pro = isRecord((invoice as any).pro_profiles)
    ? ((invoice as any).pro_profiles as Record<string, unknown>)
    : null;

  const customerEmail =
    pro && typeof pro.email === "string" ? pro.email.trim() : "";
  if (!customerEmail)
    return res.status(400).json({ error: "missing_customer_email" });

  const customerPhoneRaw =
    pro && typeof pro.phone === "string" ? pro.phone.trim() : "";

  const devPhoneOverride = String(
    process.env.LACAISSEPAY_DEV_PHONE ?? "",
  ).trim();
  const phoneToUse =
    !isProduction() && devPhoneOverride
      ? devPhoneOverride
      : customerPhoneRaw || "+212611159538";

  const displayName =
    (pro && typeof pro.contact_name === "string" && pro.contact_name.trim()) ||
    (pro && typeof pro.company_name === "string" && pro.company_name.trim()) ||
    "Client";

  const nameParts = displayName.split(" ").filter(Boolean);
  const customerFirstName = nameParts[0] || "Client";
  const customerLastName = nameParts.slice(1).join(" ") || "SAM";

  const currency =
    typeof (invoice as any).currency === "string"
      ? (invoice as any).currency
      : "MAD";
  if (String(currency).toUpperCase() !== "MAD") {
    return res.status(400).json({ error: "unsupported_currency" });
  }

  try {
    const externalReference = `MEDIA_INVOICE:${invoiceId}`;

    const session = await createLacaissePaySessionInternal({
      orderId: invoiceId,
      externalReference,
      amountMad: remaining,
      customerEmail,
      customerPhone: phoneToUse,
      customerFirstName,
      customerLastName,
      acceptUrl,
      declineUrl,
      notificationUrl,
      companyName: "Sortir Au Maroc",
    });

    const config = {
      customer: {
        email: customerEmail,
        phone: phoneToUse,
        firstName: customerFirstName,
        lastName: customerLastName,
        phoneClient: customerPhoneRaw || phoneToUse,
      },
      urls: {
        accept: acceptUrl,
        decline: declineUrl,
        notification: notificationUrl,
        externalReference,
      },
      frontend: {
        theme: "default",
        companyName: "Sortir Au Maroc",
      },
    };

    const checkoutUrl = buildLacaissePayCheckoutUrlServer({
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      config,
    });

    await supabase.from("admin_audit_log").insert({
      action: "media.invoice.payment_session.create",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: { provider: "lacaissepay", amount: remaining, currency: "MAD" },
    });

    return res.json({ ok: true, checkout_url: checkoutUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
}
