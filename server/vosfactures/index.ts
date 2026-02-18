/**
 * VosFactures integration — barrel exports
 */

// Low-level API client
export {
  createDocument,
  createCreditNote,
  getDocument,
  listDocuments,
  sendDocumentByEmail,
  changeDocumentStatus,
  getDocumentPdfUrl,
  getDocumentPdfDownloadUrl,
  type VFApiResult,
  type VFApiError,
  type VFApiSuccess,
  type VFListParams,
} from "./client";

// High-level document generation
export {
  generatePackSaleReceipt,
  generateDepositReceipt,
  generateWalletTopupReceipt,
  generateProServiceReceipt,
  generateCommissionInvoice,
  generateRefundCreditNote,
  generateCorrectionCreditNote,
  type PackSaleReceiptInput,
  type DepositReceiptInput,
  type WalletTopupReceiptInput,
  type ProServiceReceiptInput,
  type CommissionInvoiceInput,
  type RefundCreditNoteInput,
  type CorrectionCreditNoteInput,
  type PendingDocumentType,
} from "./documents";

// Retry & monitoring
export {
  retryPendingDocuments,
  alertStaleDocuments,
  getPendingDocumentStats,
  type PendingVfDocument,
} from "./retry";
