/**
 * VosFactures Pending Document Retry
 *
 * Cron-compatible functions to retry failed VosFactures document generation.
 * Spec requirement (2.5): If VosFactures API is unavailable, transactions are
 * still recorded on sam.ma. Documents are marked `pending_generation` and
 * a cron job retries every 15 minutes. Alert admin if pending > 24h.
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { createDocument, createCreditNote, type VFApiResult, type VFApiError } from "./client";
import type { VFCreateDocumentInput, VFDocument } from "../../shared/packsBillingTypes";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("vosfacturesRetry");

/** Extract error body from a failed API result */
function vfErrorBody(result: VFApiResult<any>): string {
  return result.ok ? "" : (result as VFApiError).body;
}

// =============================================================================
// Types
// =============================================================================

export interface PendingVfDocument {
  id: string;
  type: string;
  reference_type: string;
  reference_id: string;
  payload: VFCreateDocumentInput;
  error_message: string;
  retry_count: number;
  status: "pending" | "processing" | "completed" | "failed";
  original_vf_document_id: number | null;
  correction_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Max retries before marking as permanently failed
const MAX_RETRY_COUNT = 20; // ~5 hours at every 15min

// =============================================================================
// Retry logic
// =============================================================================

/**
 * Process all pending VosFactures documents.
 * Called by cron every 15 minutes.
 *
 * @returns Summary of processed documents
 */
export async function retryPendingDocuments(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  permanentlyFailed: number;
}> {
  const supabase = getAdminSupabase();

  // Fetch pending documents, ordered by oldest first
  const { data: pendingDocs, error } = await supabase
    .from("pending_vf_documents")
    .select("*")
    .eq("status", "pending")
    .lt("retry_count", MAX_RETRY_COUNT)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    log.error({ err: error.message }, "failed to fetch pending documents");
    return { processed: 0, succeeded: 0, failed: 0, permanentlyFailed: 0 };
  }

  if (!pendingDocs || pendingDocs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, permanentlyFailed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let permanentlyFailed = 0;

  for (const doc of pendingDocs as PendingVfDocument[]) {
    // Mark as processing
    await supabase
      .from("pending_vf_documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", doc.id);

    let result: VFApiResult<VFDocument>;

    try {
      if (doc.type.includes("credit_note") && doc.original_vf_document_id) {
        // Credit note retry
        result = await createCreditNote(
          doc.original_vf_document_id,
          doc.payload,
          doc.correction_reason || "Correction",
        );
      } else {
        // Standard document retry
        result = await createDocument(doc.payload);
      }

      if (result.ok) {
        // Success — update status and store reference
        await supabase
          .from("pending_vf_documents")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.id);

        // Store VF document ID on the referenced record
        await storeVfReferenceAfterRetry(doc, result.data.id);
        succeeded++;
      } else {
        const newRetryCount = doc.retry_count + 1;
        const isPermanentlyFailed = newRetryCount >= MAX_RETRY_COUNT;

        await supabase
          .from("pending_vf_documents")
          .update({
            status: isPermanentlyFailed ? "failed" : "pending",
            retry_count: newRetryCount,
            error_message: vfErrorBody(result).slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.id);

        if (isPermanentlyFailed) {
          permanentlyFailed++;
        } else {
          failed++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newRetryCount = doc.retry_count + 1;
      const isPermanentlyFailed = newRetryCount >= MAX_RETRY_COUNT;

      await supabase
        .from("pending_vf_documents")
        .update({
          status: isPermanentlyFailed ? "failed" : "pending",
          retry_count: newRetryCount,
          error_message: message.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      if (isPermanentlyFailed) permanentlyFailed++;
      else failed++;
    }
  }

  log.info({ total: pendingDocs.length, succeeded, failed, permanentlyFailed }, "processed pending documents");

  return {
    processed: pendingDocs.length,
    succeeded,
    failed,
    permanentlyFailed,
  };
}

/**
 * Check for documents pending > 24h and alert admin.
 * Called by cron daily.
 */
export async function alertStaleDocuments(): Promise<number> {
  const supabase = getAdminSupabase();

  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: staleDocs, error } = await supabase
    .from("pending_vf_documents")
    .select("id, type, reference_type, reference_id, created_at, retry_count")
    .eq("status", "pending")
    .lt("created_at", twentyFourHoursAgo)
    .limit(100);

  if (error) {
    log.error({ err: error.message }, "failed to check stale documents");
    return 0;
  }

  if (!staleDocs || staleDocs.length === 0) return 0;

  // Emit admin notification
  void (async () => {
    try {
      await emitAdminNotification({
        type: "billing_alert",
        title: `${staleDocs.length} document(s) VosFactures en attente depuis +24h`,
        body: `${staleDocs.length} document(s) n'ont pas pu etre generes via VosFactures depuis plus de 24 heures. Verifiez l'API VosFactures et les logs.`,
        data: {
          pending_count: staleDocs.length,
          oldest_created_at: staleDocs[0]?.created_at,
          document_types: [...new Set(staleDocs.map((d: any) => d.type))],
        },
      });
    } catch (err) {
      log.warn({ err }, "Best-effort: admin alert for stale VosFactures documents");
    }
  })();

  log.warn({ count: staleDocs.length }, "documents pending > 24h");

  return staleDocs.length;
}

/**
 * Get stats on pending VosFactures documents.
 * Useful for admin dashboard.
 */
export async function getPendingDocumentStats(): Promise<{
  pending: number;
  processing: number;
  failed: number;
  completedToday: number;
}> {
  const supabase = getAdminSupabase();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [pendingRes, processingRes, failedRes, completedRes] =
    await Promise.all([
      supabase
        .from("pending_vf_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("pending_vf_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing"),
      supabase
        .from("pending_vf_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("pending_vf_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("updated_at", todayStart.toISOString()),
    ]);

  return {
    pending: pendingRes.count ?? 0,
    processing: processingRes.count ?? 0,
    failed: failedRes.count ?? 0,
    completedToday: completedRes.count ?? 0,
  };
}

// =============================================================================
// Internal: Store VF reference after successful retry
// =============================================================================

async function storeVfReferenceAfterRetry(
  doc: PendingVfDocument,
  vfDocumentId: number,
): Promise<void> {
  const supabase = getAdminSupabase();
  const vfIdStr = String(vfDocumentId);

  try {
    switch (doc.type) {
      case "pack_sale_receipt":
        await supabase
          .from("pack_purchases")
          .update({ receipt_id: vfIdStr, updated_at: new Date().toISOString() })
          .eq("id", doc.reference_id);
        break;

      case "deposit_receipt": {
        const { data } = await supabase
          .from("reservations")
          .select("meta")
          .eq("id", doc.reference_id)
          .maybeSingle();
        const meta = (data as any)?.meta ?? {};
        meta.vf_receipt_id = vfIdStr;
        await supabase
          .from("reservations")
          .update({ meta, updated_at: new Date().toISOString() })
          .eq("id", doc.reference_id);
        break;
      }

      case "wallet_topup_receipt":
      case "pro_service_receipt":
        await supabase
          .from("transactions")
          .update({ receipt_id: vfIdStr })
          .eq("id", doc.reference_id);
        break;

      case "commission_invoice":
        await supabase
          .from("billing_periods")
          .update({
            vosfactures_invoice_id: vfIdStr,
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.reference_id);
        break;

      case "refund_credit_note":
        await supabase
          .from("pack_refunds")
          .update({ vosfactures_credit_note_id: vfIdStr })
          .eq("id", doc.reference_id);
        break;

      case "correction_credit_note":
        await supabase
          .from("billing_disputes")
          .update({
            credit_note_id: vfIdStr,
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.reference_id);
        break;

      default:
        log.warn({ docType: doc.type }, "unknown document type");
    }
  } catch (err) {
    log.error({ err, docType: doc.type, referenceId: doc.reference_id }, "failed to store VF reference");
  }
}
