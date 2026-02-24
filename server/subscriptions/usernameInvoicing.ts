/**
 * Username Subscription Invoicing
 *
 * Handles invoice generation and email sending for username subscriptions.
 * Uses the finance.invoices system for invoice numbers and the visibility order
 * items for line items.
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { sendLoggedEmail } from "../emailService";
import { getBillingCompanyProfile } from "../billing/companyProfile";
import {
  generateVisibilityInvoicePdfBuffer,
  type VisibilityInvoiceData,
  type VisibilityInvoiceLineItem,
} from "../billing/visibilityInvoicePdf";
import type { FinanceActor } from "../finance/types";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("usernameInvoicing");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisibilityOrderWithItems = {
  id: string;
  establishment_id: string;
  created_by_user_id: string | null;
  payment_status: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_at: string | null;
  created_at: string;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    type: string;
    quantity: number;
    unit_price_cents: number;
    total_price_cents: number;
    tax_rate_bps: number;
    tax_label: string | null;
  }>;
};

type FinanceInvoice = {
  id: string;
  invoice_number: string;
  issued_at: string;
  amount_cents: number;
  currency: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "decimal",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount) + " " + currency;
}

// ---------------------------------------------------------------------------
// Get visibility order with items
// ---------------------------------------------------------------------------

async function getVisibilityOrderWithItems(
  orderId: string,
): Promise<VisibilityOrderWithItems | null> {
  const supabase = getAdminSupabase();

  const { data: order, error: orderErr } = await supabase
    .from("visibility_orders")
    .select(
      "id,establishment_id,created_by_user_id,payment_status,status,currency,subtotal_cents,tax_cents,total_cents,paid_at,created_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw orderErr;
  if (!order) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("visibility_order_items")
    .select(
      "id,title,description,type,quantity,unit_price_cents,total_price_cents,tax_rate_bps,tax_label",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsErr) throw itemsErr;

  return {
    id: asString((order as any).id),
    establishment_id: asString((order as any).establishment_id),
    created_by_user_id: asString((order as any).created_by_user_id) || null,
    payment_status: asString((order as any).payment_status),
    status: asString((order as any).status),
    currency: asString((order as any).currency) || "MAD",
    subtotal_cents: safeInt((order as any).subtotal_cents),
    tax_cents: safeInt((order as any).tax_cents),
    total_cents: safeInt((order as any).total_cents),
    paid_at: (order as any).paid_at ?? null,
    created_at: (order as any).created_at ?? new Date().toISOString(),
    items: (items ?? []).map((it: any) => ({
      id: asString(it.id),
      title: asString(it.title),
      description: asString(it.description) || null,
      type: asString(it.type),
      quantity: safeInt(it.quantity) || 1,
      unit_price_cents: safeInt(it.unit_price_cents),
      total_price_cents: safeInt(it.total_price_cents),
      tax_rate_bps: safeInt(it.tax_rate_bps),
      tax_label: asString(it.tax_label) || null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Get finance invoice for visibility order
// ---------------------------------------------------------------------------

async function getFinanceInvoiceForOrder(
  orderId: string,
): Promise<FinanceInvoice | null> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_invoices")
    .select("id,invoice_number,issued_at,amount_cents,currency")
    .eq("reference_type", "visibility_order")
    .eq("reference_id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: asString((data as any).id),
    invoice_number: asString((data as any).invoice_number),
    issued_at: asString((data as any).issued_at),
    amount_cents: safeInt((data as any).amount_cents),
    currency: asString((data as any).currency) || "MAD",
  };
}

// ---------------------------------------------------------------------------
// Get establishment and owner info
// ---------------------------------------------------------------------------

async function getEstablishmentOwnerEmail(
  establishmentId: string,
): Promise<{
  email: string;
  name: string;
  establishmentName: string;
  city: string | null;
  ice: string | null;
} | null> {
  const supabase = getAdminSupabase();

  // Get establishment info
  const { data: establishment } = await supabase
    .from("establishments")
    .select("name,city")
    .eq("id", establishmentId)
    .maybeSingle();

  // Get owner membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .eq("establishment_id", establishmentId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  // Get user email and pro profile
  const { data: user } = await supabase
    .from("users")
    .select("email,name")
    .eq("id", membership.user_id)
    .single();

  if (!user?.email) return null;

  // Try to get ICE from pro_profiles
  const { data: proProfile } = await supabase
    .from("pro_profiles")
    .select("ice,company_name")
    .eq("user_id", membership.user_id)
    .maybeSingle();

  return {
    email: user.email,
    name: user.name || proProfile?.company_name || "Client",
    establishmentName: establishment?.name || "Etablissement",
    city: establishment?.city || null,
    ice: proProfile?.ice || null,
  };
}

// ---------------------------------------------------------------------------
// Check if order contains username subscription
// ---------------------------------------------------------------------------

export function orderContainsUsernameSubscription(
  items: Array<{ type: string }>,
): boolean {
  return items.some(
    (it) => it.type.toLowerCase() === "username_subscription",
  );
}

// ---------------------------------------------------------------------------
// Generate invoice PDF for visibility order
// ---------------------------------------------------------------------------

export async function generateVisibilityOrderInvoicePdf(
  orderId: string,
): Promise<{ pdf: Buffer; invoiceNumber: string; filename: string } | null> {
  const order = await getVisibilityOrderWithItems(orderId);
  if (!order) return null;

  const invoice = await getFinanceInvoiceForOrder(orderId);
  if (!invoice) return null;

  const ownerInfo = await getEstablishmentOwnerEmail(order.establishment_id);

  const company = await getBillingCompanyProfile();

  const invoiceData: VisibilityInvoiceData = {
    invoice_number: invoice.invoice_number,
    issued_at: invoice.issued_at || order.paid_at || order.created_at,
    due_at: null, // Already paid
    currency: order.currency,
    subtotal_cents: order.subtotal_cents,
    tax_cents: order.tax_cents,
    total_cents: order.total_cents,
    notes: null,
    recipient_name: ownerInfo?.name || ownerInfo?.establishmentName || "Client",
    recipient_city: ownerInfo?.city,
    recipient_ice: ownerInfo?.ice,
    items: order.items.map((it) => ({
      title: it.title,
      description: it.description,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents,
      total_price_cents: it.total_price_cents,
      tax_rate_bps: it.tax_rate_bps,
    })),
  };

  const pdf = await generateVisibilityInvoicePdfBuffer({
    company,
    invoice: invoiceData,
  });

  return {
    pdf,
    invoiceNumber: invoice.invoice_number,
    filename: `${invoice.invoice_number}.pdf`,
  };
}

// ---------------------------------------------------------------------------
// Send invoice email for username subscription
// ---------------------------------------------------------------------------

export async function sendUsernameSubscriptionInvoiceEmail(args: {
  orderId: string;
  actor: FinanceActor;
}): Promise<{ ok: true; emailId: string } | { ok: false; error: string }> {
  const { orderId } = args;

  try {
    const order = await getVisibilityOrderWithItems(orderId);
    if (!order) {
      return { ok: false, error: "Order not found" };
    }

    // Only send for paid orders
    if (order.payment_status.toLowerCase() !== "paid") {
      return { ok: false, error: "Order not paid" };
    }

    // Check if this order contains a username subscription
    if (!orderContainsUsernameSubscription(order.items)) {
      return { ok: false, error: "Order does not contain username subscription" };
    }

    const invoice = await getFinanceInvoiceForOrder(orderId);
    if (!invoice) {
      return { ok: false, error: "Invoice not found" };
    }

    const ownerInfo = await getEstablishmentOwnerEmail(order.establishment_id);
    if (!ownerInfo) {
      return { ok: false, error: "Owner email not found" };
    }

    // Generate PDF
    const pdfResult = await generateVisibilityOrderInvoicePdf(orderId);
    if (!pdfResult) {
      return { ok: false, error: "Failed to generate PDF" };
    }

    // Prepare email content
    const totalFormatted = formatMoney(order.total_cents, order.currency);
    const paidDate = order.paid_at
      ? new Date(order.paid_at).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : new Date().toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

    const subject = `Facture ${invoice.invoice_number} - Abonnement Lien Personnalisé`;

    const bodyText = [
      `Bonjour,`,
      ``,
      `Merci pour votre abonnement au service de lien personnalisé book.sam.ma/@username.`,
      ``,
      `Veuillez trouver ci-joint votre facture ${invoice.invoice_number}.`,
      ``,
      `Détails de la facture :`,
      `- Établissement : ${ownerInfo.establishmentName}`,
      `- Montant TTC : ${totalFormatted}`,
      `- Date de paiement : ${paidDate}`,
      ``,
      `Vous pouvez également télécharger cette facture depuis votre espace PRO :`,
      `${process.env.VITE_APP_URL || "https://sam.ma"}/pro/billing?billingTab=visibility`,
      ``,
      `Cordialement,`,
      `L'équipe Sortir Au Maroc`,
    ].join("\n");

    const emailId = `invoice-${orderId}-${Date.now()}`;

    const sent = await sendLoggedEmail({
      emailId,
      fromKey: "finance",
      to: [ownerInfo.email],
      subject,
      bodyText,
      attachments: [
        {
          filename: pdfResult.filename,
          content: pdfResult.pdf,
          contentType: "application/pdf",
        },
      ],
      variables: {
        invoice_number: invoice.invoice_number,
        total_amount: totalFormatted,
        establishment_name: ownerInfo.establishmentName,
        paid_date: paidDate,
      },
      meta: {
        kind: "username_subscription_invoice",
        order_id: orderId,
        invoice_id: invoice.id,
        establishment_id: order.establishment_id,
      },
    });

    if (sent.ok !== true) {
      return { ok: false, error: sent.error };
    }

    return { ok: true, emailId: sent.emailId };
  } catch (e) {
    log.error({ err: e }, "sendUsernameSubscriptionInvoiceEmail failed");
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
