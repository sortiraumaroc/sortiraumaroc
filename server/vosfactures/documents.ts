/**
 * VosFactures Document Generation Service
 *
 * Maps platform events (pack sales, wallet recharges, pro invoices, refunds)
 * to VosFactures documents (receipts, invoices, credit notes).
 *
 * Handles:
 *  - Receipt generation for each payment (client or pro)
 *  - Commission invoice generation for pro billing periods
 *  - Credit note generation for refunds
 *  - Resilient generation with pending_generation fallback
 *  - DB reference storage (receipt_id, invoice_id, credit_note_id)
 *
 * All internal amounts are in centimes (MAD x 100).
 * VosFactures expects amounts in MAD, so we convert: cents / 100.
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { getBillingCompanyProfile } from "../billing/companyProfile";
import type { BillingCompanyProfile } from "../billing/companyProfile";
import {
  createDocument,
  createCreditNote,
  getDocumentPdfUrl,
  sendDocumentByEmail,
  type VFApiResult,
  type VFApiError,
} from "./client";
import type {
  VFCreateDocumentInput,
  VFDocument,
  VFLineItem,
  VFPaymentStatus,
} from "../../shared/packsBillingTypes";
import { VOSFACTURES_CONFIG } from "../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

/** Extract error body from a failed API result */
function getErrorBody(result: VFApiResult<any>): string {
  return result.ok ? "" : (result as VFApiError).body;
}

/** Convert centimes to MAD (2 decimal places) */
function centsToMad(cents: number): number {
  return Math.round(cents) / 100;
}

/** Format date as YYYY-MM-DD */
function formatDate(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

/** Safe string extraction */
function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Map platform payment method to VosFactures payment type */
function mapPaymentType(
  method: string | null | undefined,
): string {
  switch (method) {
    case "card":
      return "card";
    case "wallet":
      return "virement";
    case "mobile_payment":
      return "mobile";
    case "bank_transfer":
      return "transfer";
    default:
      return "card";
  }
}

/** Map payment status to VosFactures status */
function mapPaymentStatus(
  status: string | null | undefined,
): VFPaymentStatus {
  switch (status) {
    case "completed":
    case "paid":
      return "paid";
    case "pending":
      return "unpaid";
    case "partial":
      return "partial";
    default:
      return "paid";
  }
}

/** Build seller info from billing company profile */
function buildSellerInfo(company: BillingCompanyProfile): {
  seller_name: string;
  seller_tax_no: string;
} {
  return {
    seller_name: company.legal_name || VOSFACTURES_CONFIG.SELLER.name,
    seller_tax_no: company.ice || VOSFACTURES_CONFIG.SELLER.tax_no,
  };
}

// =============================================================================
// Pending document tracking
// =============================================================================

export type PendingDocumentType =
  | "pack_sale_receipt"
  | "deposit_receipt"
  | "wallet_topup_receipt"
  | "pro_service_receipt"
  | "commission_invoice"
  | "refund_credit_note"
  | "correction_credit_note";

/**
 * Record a failed document generation for later retry.
 * Best-effort DB write (won't throw on failure).
 */
async function recordPendingDocument(args: {
  type: PendingDocumentType;
  reference_type: string;
  reference_id: string;
  payload: VFCreateDocumentInput;
  error_message: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase.from("pending_vf_documents").insert({
      type: args.type,
      reference_type: args.reference_type,
      reference_id: args.reference_id,
      payload: args.payload as unknown,
      error_message: args.error_message,
      retry_count: 0,
      status: "pending",
    });
  } catch {
    // Best-effort — log and continue
    console.error(
      `[VF] Failed to record pending document: ${args.type} for ${args.reference_type}/${args.reference_id}`,
    );
  }
}

// =============================================================================
// 1. RECEIPT: Pack Sale → Client
// =============================================================================

export interface PackSaleReceiptInput {
  purchaseId: string;
  packTitle: string;
  establishmentName: string;
  buyerName: string;
  buyerEmail: string;
  /** Total paid in centimes */
  totalPriceCents: number;
  /** Promo discount in centimes (0 if none) */
  promoDiscountCents?: number;
  quantity: number;
  paymentMethod: string;
  paymentReference?: string;
}

/**
 * Generate a receipt for a pack sale and store the VosFactures ID.
 * If the API is unavailable, records a pending document for retry.
 */
export async function generatePackSaleReceipt(
  input: PackSaleReceiptInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const unitPriceMad = centsToMad(
    Math.round(input.totalPriceCents / Math.max(input.quantity, 1)),
  );

  const positions: VFLineItem[] = [
    {
      name: `Pack: ${input.packTitle}`,
      description: `${input.establishmentName}`,
      quantity: input.quantity,
      quantity_unit: "unit",
      total_price_gross: centsToMad(input.totalPriceCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    },
  ];

  if (input.promoDiscountCents && input.promoDiscountCents > 0) {
    positions.push({
      name: "Remise code promo",
      quantity: 1,
      total_price_gross: -centsToMad(input.promoDiscountCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    });
  }

  const docInput: VFCreateDocumentInput = {
    kind: "receipt",
    issue_date: formatDate(),
    ...seller,
    buyer_name: input.buyerName,
    buyer_email: input.buyerEmail,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    payment_type: mapPaymentType(input.paymentMethod),
    status: "paid",
    positions,
    description: `Achat de Pack sur sam.ma`,
    internal_note: `purchase_id=${input.purchaseId}`,
  };

  const result = await createDocument(docInput);

  if (result.ok) {
    // Store receipt ID in pack_purchases
    void storeReceiptId("pack_purchases", input.purchaseId, result.data.id);

    // Best-effort: send receipt by email
    if (input.buyerEmail) {
      void sendDocumentByEmail(result.data.id, input.buyerEmail).catch(() => {});
    }
  } else {
    // Record for retry
    await recordPendingDocument({
      type: "pack_sale_receipt",
      reference_type: "pack_purchase",
      reference_id: input.purchaseId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// 2. RECEIPT: Reservation Deposit → Client
// =============================================================================

export interface DepositReceiptInput {
  reservationId: string;
  bookingReference: string;
  establishmentName: string;
  buyerName: string;
  buyerEmail: string;
  /** Deposit in centimes */
  depositCents: number;
  partySize: number;
  dateStr: string; // e.g. "2026-03-15"
  paymentMethod: string;
}

/**
 * Generate a receipt for a reservation deposit payment.
 */
export async function generateDepositReceipt(
  input: DepositReceiptInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const positions: VFLineItem[] = [
    {
      name: `Acompte de reservation`,
      description: `${input.establishmentName} | ${input.dateStr} | ${input.partySize} pers. | Ref: ${input.bookingReference}`,
      quantity: 1,
      total_price_gross: centsToMad(input.depositCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    },
  ];

  const docInput: VFCreateDocumentInput = {
    kind: "receipt",
    issue_date: formatDate(),
    ...seller,
    buyer_name: input.buyerName,
    buyer_email: input.buyerEmail,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    payment_type: mapPaymentType(input.paymentMethod),
    status: "paid",
    positions,
    description: `Acompte de reservation sur sam.ma`,
    internal_note: `reservation_id=${input.reservationId}`,
  };

  const result = await createDocument(docInput);

  if (result.ok) {
    void storeReceiptIdOnReservation(input.reservationId, result.data.id);
    if (input.buyerEmail) {
      void sendDocumentByEmail(result.data.id, input.buyerEmail).catch(() => {});
    }
  } else {
    await recordPendingDocument({
      type: "deposit_receipt",
      reference_type: "reservation",
      reference_id: input.reservationId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// 3. RECEIPT: Pro Wallet Recharge → Pro
// =============================================================================

export interface WalletTopupReceiptInput {
  walletTransactionId: string;
  proUserName: string;
  proEmail: string;
  proIce?: string;
  /** Amount in centimes */
  amountCents: number;
  paymentMethod: string;
}

/**
 * Generate a receipt for a pro wallet recharge.
 */
export async function generateWalletTopupReceipt(
  input: WalletTopupReceiptInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const positions: VFLineItem[] = [
    {
      name: "Rechargement wallet sam.ma",
      quantity: 1,
      total_price_gross: centsToMad(input.amountCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    },
  ];

  const docInput: VFCreateDocumentInput = {
    kind: "receipt",
    issue_date: formatDate(),
    ...seller,
    buyer_name: input.proUserName,
    buyer_email: input.proEmail,
    buyer_tax_no: input.proIce || undefined,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    payment_type: mapPaymentType(input.paymentMethod),
    status: "paid",
    positions,
    description: `Rechargement de wallet professionnel sam.ma`,
    internal_note: `wallet_transaction_id=${input.walletTransactionId}`,
  };

  const result = await createDocument(docInput);

  if (result.ok) {
    void storeVfRefOnTransaction(
      input.walletTransactionId,
      "receipt_id",
      String(result.data.id),
    );
    if (input.proEmail) {
      void sendDocumentByEmail(result.data.id, input.proEmail).catch(() => {});
    }
  } else {
    await recordPendingDocument({
      type: "wallet_topup_receipt",
      reference_type: "wallet_transaction",
      reference_id: input.walletTransactionId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// 4. RECEIPT: Pro Service Purchase (advertising, visibility, menu, booking link)
// =============================================================================

export interface ProServiceReceiptInput {
  orderId: string;
  orderType: string; // e.g. "visibility_order", "ad_order"
  proUserName: string;
  proEmail: string;
  proIce?: string;
  establishmentName?: string;
  /** Total in centimes */
  totalCents: number;
  /** Tax in centimes */
  taxCents?: number;
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    totalPriceCents: number;
  }>;
  paymentMethod: string;
}

/**
 * Generate a receipt for a pro service purchase (ads, visibility, menu, etc.).
 */
export async function generateProServiceReceipt(
  input: ProServiceReceiptInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const positions: VFLineItem[] = input.items.map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    total_price_gross: centsToMad(item.totalPriceCents),
    tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
  }));

  const docInput: VFCreateDocumentInput = {
    kind: "receipt",
    issue_date: formatDate(),
    ...seller,
    buyer_name: input.proUserName,
    buyer_email: input.proEmail,
    buyer_tax_no: input.proIce || undefined,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    payment_type: mapPaymentType(input.paymentMethod),
    status: "paid",
    positions,
    description: `Achat de service professionnel sam.ma`,
    internal_note: `order_type=${input.orderType} order_id=${input.orderId}`,
  };

  const result = await createDocument(docInput);

  if (result.ok) {
    void storeVfRefOnTransaction(
      input.orderId,
      "receipt_id",
      String(result.data.id),
    );
    if (input.proEmail) {
      void sendDocumentByEmail(result.data.id, input.proEmail).catch(() => {});
    }
  } else {
    await recordPendingDocument({
      type: "pro_service_receipt",
      reference_type: input.orderType,
      reference_id: input.orderId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// 5. INVOICE: Commission Invoice (sam.ma → Pro) for a billing period
// =============================================================================

export interface CommissionInvoiceInput {
  billingPeriodId: string;
  periodCode: string; // e.g. "2026-01-A"
  establishmentId: string;
  establishmentName: string;
  proUserName: string;
  proEmail: string;
  proIce?: string;
  proAddress?: string;
  proCity?: string;
  /** Gross total in centimes */
  totalGrossCents: number;
  /** Total commission in centimes */
  totalCommissionCents: number;
  /** Total net (to be paid to pro) in centimes */
  totalNetCents: number;
  /** Total refunds in centimes */
  totalRefundsCents: number;
  /** Transaction count */
  transactionCount: number;
  /** Line items by type */
  lineItems: Array<{
    description: string;
    quantity: number;
    grossCents: number;
    commissionRate: number; // percentage
    commissionCents: number;
  }>;
  /** Due date for payment */
  paymentDueDate?: string; // YYYY-MM-DD
}

/**
 * Generate a commission invoice for a pro billing period.
 * The invoice shows commission deducted by sam.ma from the pro's earnings.
 */
export async function generateCommissionInvoice(
  input: CommissionInvoiceInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const positions: VFLineItem[] = input.lineItems.map((item) => ({
    name: `Commission sam.ma: ${item.description}`,
    description: `Taux: ${item.commissionRate}% | ${item.quantity} transactions | Brut: ${centsToMad(item.grossCents).toFixed(2)} MAD`,
    quantity: 1,
    total_price_gross: centsToMad(item.commissionCents),
    tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
  }));

  // Add refunds line if any
  if (input.totalRefundsCents > 0) {
    positions.push({
      name: "Remboursements de la periode",
      quantity: 1,
      total_price_gross: -centsToMad(input.totalRefundsCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    });
  }

  const docInput: VFCreateDocumentInput = {
    kind: "vat",
    issue_date: formatDate(),
    payment_to: input.paymentDueDate || undefined,
    ...seller,
    buyer_name: input.proUserName,
    buyer_email: input.proEmail,
    buyer_tax_no: input.proIce || undefined,
    buyer_city: input.proCity || undefined,
    buyer_street: input.proAddress || undefined,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    payment_type: "transfer",
    status: "unpaid",
    positions,
    description: `Facture de commission sam.ma | Periode: ${input.periodCode} | ${input.establishmentName} | ${input.transactionCount} transactions`,
    internal_note: `billing_period_id=${input.billingPeriodId} establishment_id=${input.establishmentId}`,
  };

  const result = await createDocument(docInput);

  if (result.ok) {
    void storeBillingPeriodInvoiceId(input.billingPeriodId, result.data.id);
    if (input.proEmail) {
      void sendDocumentByEmail(result.data.id, input.proEmail).catch(() => {});
    }
  } else {
    await recordPendingDocument({
      type: "commission_invoice",
      reference_type: "billing_period",
      reference_id: input.billingPeriodId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// 6. CREDIT NOTE: Client Refund (Pack or Deposit)
// =============================================================================

export interface RefundCreditNoteInput {
  refundId: string;
  /** VosFactures ID of the original receipt */
  originalVfDocumentId: number;
  buyerName: string;
  buyerEmail: string;
  /** Refund amount in centimes */
  refundAmountCents: number;
  /** Description */
  itemDescription: string;
  reason: string;
  referenceType: "pack_purchase" | "reservation";
  referenceId: string;
}

/**
 * Generate a credit note for a client refund.
 */
export async function generateRefundCreditNote(
  input: RefundCreditNoteInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const positions: VFLineItem[] = [
    {
      name: `Remboursement: ${input.itemDescription}`,
      description: input.reason,
      quantity: 1,
      total_price_gross: -centsToMad(input.refundAmountCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    },
  ];

  const docInput: VFCreateDocumentInput = {
    kind: "correction",
    issue_date: formatDate(),
    ...seller,
    buyer_name: input.buyerName,
    buyer_email: input.buyerEmail,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    status: "paid",
    positions,
    description: `Avoir - Remboursement sur sam.ma`,
    internal_note: `refund_id=${input.refundId} ${input.referenceType}=${input.referenceId}`,
  };

  const result = await createCreditNote(
    input.originalVfDocumentId,
    docInput,
    input.reason,
  );

  if (result.ok) {
    void storeCreditNoteId(input.refundId, result.data.id);
    if (input.buyerEmail) {
      void sendDocumentByEmail(result.data.id, input.buyerEmail).catch(() => {});
    }
  } else {
    await recordPendingDocument({
      type: "refund_credit_note",
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// 7. CREDIT NOTE: Billing Correction (Pro invoice correction)
// =============================================================================

export interface CorrectionCreditNoteInput {
  disputeId: string;
  billingPeriodId: string;
  /** VosFactures ID of the original commission invoice */
  originalVfDocumentId: number;
  proUserName: string;
  proEmail: string;
  proIce?: string;
  /** Correction amount in centimes */
  correctionAmountCents: number;
  reason: string;
}

/**
 * Generate a correction credit note for a billing dispute resolution.
 */
export async function generateCorrectionCreditNote(
  input: CorrectionCreditNoteInput,
): Promise<VFApiResult<VFDocument>> {
  const company = await getBillingCompanyProfile();
  const seller = buildSellerInfo(company);

  const positions: VFLineItem[] = [
    {
      name: "Avoir correctif - Commission",
      description: input.reason,
      quantity: 1,
      total_price_gross: -centsToMad(input.correctionAmountCents),
      tax: VOSFACTURES_CONFIG.DEFAULT_TAX_RATE,
    },
  ];

  const docInput: VFCreateDocumentInput = {
    kind: "correction",
    issue_date: formatDate(),
    ...seller,
    buyer_name: input.proUserName,
    buyer_email: input.proEmail,
    buyer_tax_no: input.proIce || undefined,
    buyer_country: "MA",
    currency: VOSFACTURES_CONFIG.CURRENCY,
    status: "paid",
    positions,
    description: `Avoir correctif sam.ma`,
    internal_note: `dispute_id=${input.disputeId} billing_period_id=${input.billingPeriodId}`,
  };

  const result = await createCreditNote(
    input.originalVfDocumentId,
    docInput,
    input.reason,
  );

  if (result.ok) {
    void storeDisputeCreditNoteId(input.disputeId, result.data.id);
    if (input.proEmail) {
      void sendDocumentByEmail(result.data.id, input.proEmail).catch(() => {});
    }
  } else {
    await recordPendingDocument({
      type: "correction_credit_note",
      reference_type: "billing_dispute",
      reference_id: input.disputeId,
      payload: docInput,
      error_message: getErrorBody(result),
    });
  }

  return result;
}

// =============================================================================
// DB reference storage helpers (best-effort)
// =============================================================================

async function storeReceiptId(
  table: string,
  recordId: string,
  vfDocumentId: number,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase
      .from(table)
      .update({ receipt_id: String(vfDocumentId), updated_at: new Date().toISOString() })
      .eq("id", recordId);
  } catch (err) {
    console.error(`[VF] Failed to store receipt_id on ${table}/${recordId}:`, err);
  }
}

async function storeReceiptIdOnReservation(
  reservationId: string,
  vfDocumentId: number,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    // Store in meta JSON field since reservations may not have receipt_id column yet
    const { data } = await supabase
      .from("reservations")
      .select("meta")
      .eq("id", reservationId)
      .maybeSingle();

    const meta = (data as any)?.meta ?? {};
    meta.vf_receipt_id = String(vfDocumentId);

    await supabase
      .from("reservations")
      .update({ meta, updated_at: new Date().toISOString() })
      .eq("id", reservationId);
  } catch (err) {
    console.error(
      `[VF] Failed to store receipt_id on reservation/${reservationId}:`,
      err,
    );
  }
}

async function storeVfRefOnTransaction(
  transactionId: string,
  field: "receipt_id" | "invoice_line_id",
  value: string,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase
      .from("transactions")
      .update({ [field]: value })
      .eq("id", transactionId);
  } catch (err) {
    console.error(
      `[VF] Failed to store ${field} on transaction/${transactionId}:`,
      err,
    );
  }
}

async function storeBillingPeriodInvoiceId(
  billingPeriodId: string,
  vfDocumentId: number,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase
      .from("billing_periods")
      .update({
        vosfactures_invoice_id: String(vfDocumentId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", billingPeriodId);
  } catch (err) {
    console.error(
      `[VF] Failed to store invoice_id on billing_period/${billingPeriodId}:`,
      err,
    );
  }
}

async function storeCreditNoteId(
  refundId: string,
  vfDocumentId: number,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase
      .from("pack_refunds")
      .update({ vosfactures_credit_note_id: String(vfDocumentId) })
      .eq("id", refundId);
  } catch (err) {
    console.error(
      `[VF] Failed to store credit_note_id on pack_refund/${refundId}:`,
      err,
    );
  }
}

async function storeDisputeCreditNoteId(
  disputeId: string,
  vfDocumentId: number,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase
      .from("billing_disputes")
      .update({
        credit_note_id: String(vfDocumentId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", disputeId);
  } catch (err) {
    console.error(
      `[VF] Failed to store credit_note_id on billing_dispute/${disputeId}:`,
      err,
    );
  }
}
