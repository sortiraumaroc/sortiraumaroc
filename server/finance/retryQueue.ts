/**
 * Finance Operation Retry Queue
 *
 * When escrow, invoice, or commission operations fail during a payment webhook,
 * they are enqueued here for automatic retry. The cron runs every 5 minutes.
 *
 * Pattern follows server/vosfactures/retry.ts (pending_vf_documents).
 *
 * Supported operation types:
 *   - escrow_hold_reservation
 *   - escrow_settle_reservation
 *   - escrow_hold_pack_purchase
 *   - settle_pack_purchase_refund
 *   - invoice_reservation
 *   - invoice_pack_purchase
 *   - invoice_visibility_order
 *   - commission_snapshot
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("finance-retry");
import {
  ensureEscrowHoldForReservation,
  settleEscrowForReservation,
  ensureEscrowHoldForPackPurchase,
  settlePackPurchaseForRefund,
  ensureInvoiceForPackPurchase,
  ensureInvoiceForReservation,
  ensureInvoiceForVisibilityOrder,
  computeCommissionSnapshotForEstablishment,
} from "./index";
import type { FinanceActor } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface PendingFinanceOperation {
  id: string;
  operation_type: string;
  reference_type: string;
  reference_id: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  retry_count: number;
  error_message: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  created_at: string;
  updated_at: string;
}

// Max retries before permanently failing (~2.5 hours at every 5 min)
const MAX_RETRY_COUNT = 30;

// =============================================================================
// Enqueue
// =============================================================================

/**
 * Enqueue a failed finance operation for retry.
 * Uses UPSERT with dedup index — safe to call multiple times for the same operation.
 */
export async function enqueueFinanceOperation(args: {
  operationType: string;
  referenceType: string;
  referenceId: string;
  payload?: Record<string, unknown>;
  actor?: FinanceActor;
  errorMessage?: string;
}): Promise<void> {
  const supabase = getAdminSupabase();

  try {
    const { error } = await supabase.from("pending_finance_operations").upsert(
      {
        operation_type: args.operationType,
        reference_type: args.referenceType,
        reference_id: args.referenceId,
        payload: args.payload ?? {},
        actor_user_id: args.actor?.userId ?? null,
        actor_role: args.actor?.role ?? null,
        error_message: args.errorMessage?.slice(0, 2000) ?? null,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "operation_type,reference_type,reference_id",
        ignoreDuplicates: true,
      },
    );

    if (error) {
      // Dedup index violation is expected when operation is already enqueued.
      // Other errors are logged but not thrown — enqueue is best-effort.
      if (!error.message?.includes("duplicate") && !error.code?.includes("23505")) {
        log.error({ err: error }, "Enqueue failed: %s", error.message);
      }
    }
  } catch (err) {
    log.error({ err }, "Enqueue exception");
  }
}

// =============================================================================
// Retry logic
// =============================================================================

/**
 * Process all pending finance operations.
 * Called by cron every 5 minutes.
 */
export async function retryPendingFinanceOperations(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  permanentlyFailed: number;
}> {
  const supabase = getAdminSupabase();

  // Fetch pending operations, oldest first
  const { data: pendingOps, error } = await supabase
    .from("pending_finance_operations")
    .select("*")
    .eq("status", "pending")
    .lt("retry_count", MAX_RETRY_COUNT)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    log.error({ err: error }, "Failed to fetch pending operations");
    return { processed: 0, succeeded: 0, failed: 0, permanentlyFailed: 0 };
  }

  if (!pendingOps || pendingOps.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, permanentlyFailed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let permanentlyFailed = 0;

  for (const op of pendingOps as PendingFinanceOperation[]) {
    // Mark as processing
    await supabase
      .from("pending_finance_operations")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", op.id);

    try {
      await executeOperation(op);

      // Success
      await supabase
        .from("pending_finance_operations")
        .update({
          status: "completed",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", op.id);

      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newRetryCount = op.retry_count + 1;
      const isPermanent = newRetryCount >= MAX_RETRY_COUNT;

      await supabase
        .from("pending_finance_operations")
        .update({
          status: isPermanent ? "failed" : "pending",
          retry_count: newRetryCount,
          error_message: message.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", op.id);

      if (isPermanent) {
        permanentlyFailed++;
      } else {
        failed++;
      }
    }
  }

  if (pendingOps.length > 0) {
    log.info(
      { processed: pendingOps.length, succeeded, failed, permanentlyFailed },
      "Retry batch completed",
    );
  }

  // Alert admin if any permanently failed
  if (permanentlyFailed > 0) {
    void (async () => {
      try {
        await emitAdminNotification({
          type: "billing_alert",
          title: `${permanentlyFailed} opération(s) finance définitivement échouée(s)`,
          body: `${permanentlyFailed} opération(s) finance n'ont pas pu être complétées après ${MAX_RETRY_COUNT} tentatives. Intervention manuelle requise.`,
          data: {
            permanently_failed_count: permanentlyFailed,
          },
        });
      } catch (err) {
        log.warn({ err }, "Best-effort: admin notification for permanently failed finance ops");
      }
    })();
  }

  return {
    processed: pendingOps.length,
    succeeded,
    failed,
    permanentlyFailed,
  };
}

// =============================================================================
// Stuck refund detection (Tâche 4)
// =============================================================================

/**
 * Detect reservations with payment_status='refunded' but escrow still held.
 * Enqueues settle operations for stuck refunds.
 * Called by cron daily.
 */
export async function detectStuckRefunds(): Promise<number> {
  const supabase = getAdminSupabase();

  // Find reservations that are refunded but still have held escrow (>30 min old)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stuckRefunds, error } = await supabase
    .from("finance_escrow_holds")
    .select("id, reservation_id, status, created_at")
    .eq("status", "held")
    .lt("created_at", thirtyMinAgo)
    .limit(100);

  if (error) {
    log.error({ err: error }, "detectStuckRefunds query failed");
    return 0;
  }

  if (!stuckRefunds || stuckRefunds.length === 0) return 0;

  // Check which of these reservations are actually refunded
  const reservationIds = stuckRefunds.map((h: any) => h.reservation_id).filter(Boolean);
  if (reservationIds.length === 0) return 0;

  const { data: refundedReservations, error: resErr } = await supabase
    .from("reservations")
    .select("id")
    .in("id", reservationIds)
    .eq("payment_status", "refunded");

  if (resErr || !refundedReservations) {
    log.error({ err: resErr }, "detectStuckRefunds reservations query failed");
    return 0;
  }

  const refundedIds = new Set(refundedReservations.map((r: any) => String(r.id)));

  let enqueued = 0;
  for (const hold of stuckRefunds as any[]) {
    if (!refundedIds.has(String(hold.reservation_id))) continue;

    await enqueueFinanceOperation({
      operationType: "escrow_settle_reservation",
      referenceType: "reservation",
      referenceId: String(hold.reservation_id),
      payload: { reason: "cancel" },
      actor: { userId: null, role: "system:stuck_refund_detector" },
      errorMessage: "Stuck refund detected: escrow held but reservation refunded",
    });
    enqueued++;
  }

  if (enqueued > 0) {
    log.warn({ stuckCount: enqueued }, "Detected stuck refund(s), enqueued for settlement");

    void (async () => {
      try {
        await emitAdminNotification({
          type: "billing_alert",
          title: `${enqueued} remboursement(s) bloqué(s) détecté(s)`,
          body: `${enqueued} réservation(s) sont marquées comme remboursées mais l'escrow est toujours retenu. Un retry automatique a été enfilé.`,
          data: { stuck_count: enqueued },
        });
      } catch (err) {
        log.warn({ err }, "Best-effort: admin notification for stuck refunds");
      }
    })();
  }

  return enqueued;
}

// =============================================================================
// Internal: execute a single operation by type
// =============================================================================

async function executeOperation(op: PendingFinanceOperation): Promise<void> {
  const actor: FinanceActor = {
    userId: op.actor_user_id,
    role: op.actor_role ?? "system:retry",
  };

  switch (op.operation_type) {
    case "escrow_hold_reservation":
      await ensureEscrowHoldForReservation({
        reservationId: op.reference_id,
        actor,
      });
      break;

    case "escrow_settle_reservation": {
      const reason = (op.payload as any)?.reason ?? "cancel";
      const refundPercent = (op.payload as any)?.refundPercent ?? undefined;
      await settleEscrowForReservation({
        reservationId: op.reference_id,
        actor,
        reason,
        refundPercent,
      });
      break;
    }

    case "escrow_hold_pack_purchase":
      await ensureEscrowHoldForPackPurchase({
        purchaseId: op.reference_id,
        actor,
      });
      break;

    case "settle_pack_purchase_refund":
      await settlePackPurchaseForRefund({
        purchaseId: op.reference_id,
        actor,
      });
      break;

    case "invoice_reservation": {
      const invKey = (op.payload as any)?.idempotencyKey ?? null;
      const issuedAt = (op.payload as any)?.issuedAtIso ?? null;
      await ensureInvoiceForReservation({
        reservationId: op.reference_id,
        actor,
        idempotencyKey: invKey,
        issuedAtIso: issuedAt,
      });
      break;
    }

    case "invoice_pack_purchase": {
      const invKey = (op.payload as any)?.idempotencyKey ?? null;
      const issuedAt = (op.payload as any)?.issuedAtIso ?? null;
      await ensureInvoiceForPackPurchase({
        purchaseId: op.reference_id,
        actor,
        idempotencyKey: invKey,
        issuedAtIso: issuedAt,
      });
      break;
    }

    case "invoice_visibility_order": {
      const invKey = (op.payload as any)?.idempotencyKey ?? null;
      const issuedAt = (op.payload as any)?.issuedAtIso ?? null;
      await ensureInvoiceForVisibilityOrder({
        orderId: op.reference_id,
        actor,
        idempotencyKey: invKey,
        issuedAtIso: issuedAt,
      });
      break;
    }

    case "commission_snapshot": {
      const establishmentId = (op.payload as any)?.establishmentId ?? op.reference_id;
      await computeCommissionSnapshotForEstablishment({
        establishmentId,
        purchaseId: op.reference_id,
      });
      break;
    }

    default:
      log.warn({ operationType: op.operation_type }, "Unknown operation type — marking as completed");
      // Mark as completed to prevent infinite retries on unknown types
      break;
  }
}
