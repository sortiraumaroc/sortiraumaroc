/**
 * VosFactures API Client
 *
 * Low-level HTTP client for the VosFactures (Fakturownia) invoicing API.
 * Handles authentication, request formatting, error handling, and retries.
 *
 * API Docs: https://github.com/vosfactures/API
 * Base URL: https://sortir-au-maroc.vosfactures.fr
 *
 * All prices sent to VosFactures are in MAD (not cents).
 * Internally we store amounts in centimes (MAD x 100), so we convert
 * before sending.
 */

import type {
  VFCreateDocumentInput,
  VFDocument,
  VFDocumentKind,
} from "../../shared/packsBillingTypes";

// =============================================================================
// Configuration
// =============================================================================

const VF_BASE_URL =
  process.env.VOSFACTURES_BASE_URL ||
  "https://sortir-au-maroc.vosfactures.fr";

function getApiToken(): string {
  const token = process.env.VOSFACTURES_API_TOKEN;
  if (!token) {
    throw new Error(
      "VOSFACTURES_API_TOKEN is missing. Set it in your .env file.",
    );
  }
  return token;
}

/** Request timeout in ms */
const REQUEST_TIMEOUT_MS = 30_000;

/** Max retries for transient failures */
const MAX_RETRIES = 2;

/** Delay between retries (ms) */
const RETRY_DELAY_MS = 2_000;

// =============================================================================
// Types
// =============================================================================

export interface VFApiError {
  ok: false;
  status: number;
  statusText: string;
  body: string;
  retryable: boolean;
}

export interface VFApiSuccess<T> {
  ok: true;
  data: T;
}

export type VFApiResult<T> = VFApiSuccess<T> | VFApiError;

/** Parameters for listing/searching documents */
export interface VFListParams {
  page?: number;
  per_page?: number;
  /** Document kind filter */
  kind?: VFDocumentKind;
  /** Date range */
  period?: "this_month" | "last_month" | "this_year" | "all" | "more";
  date_from?: string; // YYYY-MM-DD (use with period=more)
  date_to?: string;
  /** Filter by client ID in VosFactures */
  client_id?: number;
  /** Filter by document number */
  number?: string;
  /** Filter by payment status */
  status?: "paid" | "unpaid" | "partial";
  /** Include line items in response */
  include_positions?: boolean;
  /** Sort order */
  order?: string; // e.g. "issue_date.desc"
}

// =============================================================================
// Internal HTTP helpers
// =============================================================================

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an authenticated request to VosFactures API.
 */
async function vfRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>,
): Promise<VFApiResult<T>> {
  const url = new URL(path, VF_BASE_URL);

  // For GET/DELETE, pass api_token as query param
  if (method === "GET" || method === "DELETE") {
    url.searchParams.set("api_token", getApiToken());
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  let requestBody: string | undefined;
  if (method === "POST" || method === "PUT") {
    headers["Content-Type"] = "application/json";
    const payload = {
      api_token: getApiToken(),
      ...(body ?? {}),
    };
    requestBody = JSON.stringify(payload);
  }

  let lastError: VFApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS * attempt);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url.toString(), {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        const error: VFApiError = {
          ok: false,
          status: res.status,
          statusText: res.statusText,
          body: bodyText.slice(0, 2000),
          retryable: isRetryableStatus(res.status),
        };

        if (error.retryable && attempt < MAX_RETRIES) {
          lastError = error;
          continue;
        }

        return error;
      }

      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = message.includes("abort");
      const isNetwork =
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND") ||
        message.includes("ETIMEDOUT") ||
        message.includes("fetch failed");

      const error: VFApiError = {
        ok: false,
        status: 0,
        statusText: isAbort ? "Request Timeout" : "Network Error",
        body: message.slice(0, 2000),
        retryable: isAbort || isNetwork,
      };

      if (error.retryable && attempt < MAX_RETRIES) {
        lastError = error;
        continue;
      }

      return error;
    }
  }

  // Should never reach here, but just in case
  return (
    lastError ?? {
      ok: false,
      status: 0,
      statusText: "Unknown Error",
      body: "Max retries exceeded",
      retryable: false,
    }
  );
}

// =============================================================================
// Public API: Document CRUD
// =============================================================================

/**
 * Create a document (invoice, receipt, credit note, proforma).
 *
 * @param input - Document creation input (all prices in MAD, not cents!)
 * @returns Created document or API error
 */
export async function createDocument(
  input: VFCreateDocumentInput,
): Promise<VFApiResult<VFDocument>> {
  const invoicePayload: Record<string, unknown> = {
    kind: input.kind,
    issue_date: input.issue_date,
    seller_name: input.seller_name,
    buyer_name: input.buyer_name,
    currency: input.currency,
    positions: input.positions.map((pos) => ({
      name: pos.name,
      description: pos.description ?? undefined,
      quantity: pos.quantity,
      quantity_unit: pos.quantity_unit ?? undefined,
      total_price_gross: pos.total_price_gross,
      tax: pos.tax,
      discount: pos.discount ?? undefined,
    })),
  };

  // Optional fields
  if (input.number) invoicePayload.number = input.number;
  if (input.payment_to) invoicePayload.payment_to = input.payment_to;
  if (input.seller_tax_no) invoicePayload.seller_tax_no = input.seller_tax_no;
  if (input.buyer_email) invoicePayload.buyer_email = input.buyer_email;
  if (input.buyer_tax_no) invoicePayload.buyer_tax_no = input.buyer_tax_no;
  if (input.buyer_city) invoicePayload.buyer_city = input.buyer_city;
  if (input.buyer_post_code)
    invoicePayload.buyer_post_code = input.buyer_post_code;
  if (input.buyer_street) invoicePayload.buyer_street = input.buyer_street;
  if (input.buyer_country) invoicePayload.buyer_country = input.buyer_country;
  if (input.payment_type) invoicePayload.payment_type = input.payment_type;
  if (input.status) invoicePayload.status = input.status;
  if (input.description) invoicePayload.description_long = input.description;
  if (input.internal_note)
    invoicePayload.internal_note = input.internal_note;

  return vfRequest<VFDocument>("POST", "/invoices.json", {
    invoice: invoicePayload,
  });
}

/**
 * Create a credit note (avoir) referencing an original document.
 *
 * @param originalDocumentId - VosFactures ID of the original document
 * @param input - Credit note input (positions should have negative amounts)
 * @param correctionReason - Reason for the credit note
 */
export async function createCreditNote(
  originalDocumentId: number,
  input: VFCreateDocumentInput,
  correctionReason: string,
): Promise<VFApiResult<VFDocument>> {
  const invoicePayload: Record<string, unknown> = {
    kind: "correction",
    from_invoice_id: originalDocumentId,
    correction_reason: correctionReason,
    issue_date: input.issue_date,
    seller_name: input.seller_name,
    buyer_name: input.buyer_name,
    currency: input.currency,
    positions: input.positions.map((pos) => ({
      name: pos.name,
      description: pos.description ?? undefined,
      quantity: pos.quantity,
      quantity_unit: pos.quantity_unit ?? undefined,
      total_price_gross: pos.total_price_gross,
      tax: pos.tax,
    })),
  };

  // Optional fields
  if (input.buyer_email) invoicePayload.buyer_email = input.buyer_email;
  if (input.buyer_tax_no) invoicePayload.buyer_tax_no = input.buyer_tax_no;
  if (input.buyer_city) invoicePayload.buyer_city = input.buyer_city;
  if (input.buyer_street) invoicePayload.buyer_street = input.buyer_street;
  if (input.buyer_country) invoicePayload.buyer_country = input.buyer_country;
  if (input.status) invoicePayload.status = input.status;
  if (input.internal_note)
    invoicePayload.internal_note = input.internal_note;

  return vfRequest<VFDocument>("POST", "/invoices.json", {
    invoice: invoicePayload,
  });
}

/**
 * Get a single document by its VosFactures ID.
 */
export async function getDocument(
  documentId: number,
): Promise<VFApiResult<VFDocument>> {
  return vfRequest<VFDocument>("GET", `/invoices/${documentId}.json`);
}

/**
 * List documents with optional filtering and pagination.
 */
export async function listDocuments(
  params: VFListParams = {},
): Promise<VFApiResult<VFDocument[]>> {
  const queryParams: Record<string, string> = {};

  if (params.page) queryParams.page = String(params.page);
  if (params.per_page) queryParams.per_page = String(params.per_page);
  if (params.kind) queryParams.kind = params.kind;
  if (params.period) queryParams.period = params.period;
  if (params.date_from) queryParams.date_from = params.date_from;
  if (params.date_to) queryParams.date_to = params.date_to;
  if (params.client_id) queryParams.client_id = String(params.client_id);
  if (params.number) queryParams.number = params.number;
  if (params.status) queryParams.status = params.status;
  if (params.include_positions) queryParams.include_positions = "true";
  if (params.order) queryParams.order = params.order;

  return vfRequest<VFDocument[]>("GET", "/invoices.json", undefined, queryParams);
}

/**
 * Send a document by email via VosFactures.
 */
export async function sendDocumentByEmail(
  documentId: number,
  recipientEmail: string,
): Promise<VFApiResult<{ status: string }>> {
  return vfRequest<{ status: string }>(
    "POST",
    `/invoices/${documentId}/send_by_email.json`,
    {
      email_to: recipientEmail,
      email_pdf: true,
    },
  );
}

/**
 * Change the payment status of a document.
 */
export async function changeDocumentStatus(
  documentId: number,
  status: "paid" | "unpaid" | "partial" | "issued" | "sent",
): Promise<VFApiResult<VFDocument>> {
  return vfRequest<VFDocument>(
    "POST",
    `/invoices/${documentId}/change_status.json`,
    undefined,
    { status },
  );
}

/**
 * Get the public PDF URL for a document.
 * Uses the token from the document for unauthenticated access.
 */
export function getDocumentPdfUrl(document: VFDocument): string {
  if (document.view_url) return document.view_url;
  return `${VF_BASE_URL}/invoices/${document.id}.pdf?api_token=${getApiToken()}`;
}

/**
 * Get the PDF download URL (authenticated).
 */
export function getDocumentPdfDownloadUrl(documentId: number): string {
  return `${VF_BASE_URL}/invoices/${documentId}.pdf?api_token=${getApiToken()}`;
}
