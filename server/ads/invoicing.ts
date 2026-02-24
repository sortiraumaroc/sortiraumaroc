/**
 * Invoicing Module for Ad System
 *
 * Génère automatiquement des factures pour les commandes publicitaires:
 * - Recharges de wallet
 * - Campagnes (sponsored results, featured pack, home takeover)
 * - Push notifications
 * - Campagnes email
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adsInvoicing");

// Types de factures publicitaires
export type AdInvoiceType =
  | "wallet_recharge"
  | "sponsored_result"
  | "featured_pack"
  | "home_takeover"
  | "push_notification"
  | "email_campaign";

// Descriptions par type
const INVOICE_DESCRIPTIONS: Record<AdInvoiceType, string> = {
  wallet_recharge: "Recharge du wallet publicitaire",
  sponsored_result: "Campagne Résultats Sponsorisés",
  featured_pack: "Pack Mise en Avant",
  home_takeover: "Habillage Homepage",
  push_notification: "Campagne Push Notifications",
  email_campaign: "Campagne Emailing",
};

export interface CreateAdInvoiceParams {
  establishmentId: string;
  invoiceType: AdInvoiceType;
  subtotalCents: number;
  referenceType?: string;
  referenceId?: string;
  paymentMethod?: string;
  paymentReference?: string;
  customDescription?: string;
  additionalLineItems?: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
  }>;
}

export interface AdInvoice {
  id: string;
  invoice_number: string;
  establishment_id: string;
  invoice_type: AdInvoiceType;
  subtotal_cents: number;
  vat_rate: number;
  vat_amount_cents: number;
  total_cents: number;
  status: "draft" | "issued" | "paid" | "cancelled";
  issued_at: string | null;
  client_info: Record<string, any>;
  issuer_info: Record<string, any>;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }>;
}

/**
 * Crée une facture publicitaire
 */
export async function createAdInvoice(params: CreateAdInvoiceParams): Promise<AdInvoice | null> {
  const supabase = getAdminSupabase();

  const description = params.customDescription || INVOICE_DESCRIPTIONS[params.invoiceType];

  try {
    // Utiliser la fonction SQL pour créer la facture
    const { data, error } = await supabase.rpc("create_ad_invoice", {
      p_establishment_id: params.establishmentId,
      p_invoice_type: params.invoiceType,
      p_subtotal_cents: params.subtotalCents,
      p_description: description,
      p_reference_type: params.referenceType ?? null,
      p_reference_id: params.referenceId ?? null,
      p_payment_method: params.paymentMethod ?? null,
      p_payment_reference: params.paymentReference ?? null,
    });

    if (error) {
      log.error({ err: error }, "Error creating invoice");
      return null;
    }

    log.info({ invoiceNumber: (data as any)?.invoice_number }, "Invoice created");
    return data as AdInvoice;
  } catch (err) {
    log.error({ err }, "Unexpected error creating invoice");
    return null;
  }
}

/**
 * Crée une facture pour une recharge de wallet
 */
export async function createWalletRechargeInvoice(params: {
  establishmentId: string;
  amountCents: number;
  paymentReference: string;
}): Promise<AdInvoice | null> {
  return createAdInvoice({
    establishmentId: params.establishmentId,
    invoiceType: "wallet_recharge",
    subtotalCents: params.amountCents,
    referenceType: "wallet_transaction",
    paymentMethod: "card",
    paymentReference: params.paymentReference,
    customDescription: `Recharge wallet publicitaire - ${(params.amountCents / 100).toFixed(2)} MAD`,
  });
}

/**
 * Crée une facture pour une campagne
 */
export async function createCampaignInvoice(params: {
  establishmentId: string;
  campaignId: string;
  campaignType: AdInvoiceType;
  amountCents: number;
  campaignTitle?: string;
}): Promise<AdInvoice | null> {
  const description = params.campaignTitle
    ? `${INVOICE_DESCRIPTIONS[params.campaignType]} - ${params.campaignTitle}`
    : INVOICE_DESCRIPTIONS[params.campaignType];

  return createAdInvoice({
    establishmentId: params.establishmentId,
    invoiceType: params.campaignType,
    subtotalCents: params.amountCents,
    referenceType: "campaign",
    referenceId: params.campaignId,
    customDescription: description,
  });
}

/**
 * Crée une facture pour une campagne push notification
 */
export async function createPushNotificationInvoice(params: {
  establishmentId: string;
  notificationId: string;
  sentCount: number;
  costPerUnitCents: number;
}): Promise<AdInvoice | null> {
  const totalCents = params.sentCount * params.costPerUnitCents;

  return createAdInvoice({
    establishmentId: params.establishmentId,
    invoiceType: "push_notification",
    subtotalCents: totalCents,
    referenceType: "sponsored_notification",
    referenceId: params.notificationId,
    customDescription: `Campagne Push Notifications - ${params.sentCount} envois`,
  });
}

/**
 * Récupère les factures d'un établissement
 */
export async function getEstablishmentInvoices(establishmentId: string): Promise<AdInvoice[]> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("ad_invoices")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("issued_at", { ascending: false });

  if (error) {
    log.error({ err: error }, "Error fetching invoices");
    return [];
  }

  return (data ?? []) as AdInvoice[];
}

/**
 * Récupère une facture par ID
 */
export async function getInvoiceById(invoiceId: string): Promise<AdInvoice | null> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("ad_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    log.error({ err: error }, "Error fetching invoice by ID");
    return null;
  }

  return data as AdInvoice | null;
}

/**
 * Récupère une facture par numéro
 */
export async function getInvoiceByNumber(invoiceNumber: string): Promise<AdInvoice | null> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("ad_invoices")
    .select("*")
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (error) {
    log.error({ err: error }, "Error fetching invoice by number");
    return null;
  }

  return data as AdInvoice | null;
}

/**
 * Marque une facture comme payée
 */
export async function markInvoicePaid(
  invoiceId: string,
  paymentReference?: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  const updates: Record<string, any> = {
    status: "paid",
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (paymentReference) {
    updates.payment_reference = paymentReference;
  }

  const { error } = await supabase
    .from("ad_invoices")
    .update(updates)
    .eq("id", invoiceId);

  if (error) {
    log.error({ err: error }, "Error marking invoice paid");
    return false;
  }

  return true;
}

/**
 * Annule une facture
 */
export async function cancelInvoice(invoiceId: string): Promise<boolean> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("ad_invoices")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (error) {
    log.error({ err: error }, "Error cancelling invoice");
    return false;
  }

  return true;
}
