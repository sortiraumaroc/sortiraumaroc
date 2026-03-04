/**
 * Pack Refund Logic (Phase 3.8)
 *
 * Refund rules:
 *  - > 14 days before expiry → full refund
 *  - < 14 days before expiry → 50% refund OR 100% credit
 *  - Pack expired → no refund (except admin override)
 *  - Pack consumed → no refund
 *  - Establishment deactivated → automatic full refund
 *
 * Generates credit notes via VosFactures.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { generateRefundCreditNote } from "./vosfactures/documents";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("packRefund");
import { emitConsumerUserEvent } from "./consumerNotifications";
import { getBillingPeriodCode } from "../shared/packsBillingTypes";

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

export interface RefundResult {
  refundId: string;
  refundType: "full" | "partial" | "credit";
  refundAmount: number; // cents
  creditAmount: number; // cents
}

// =============================================================================
// 1. Request refund (client)
// =============================================================================

export async function requestPackRefund(
  purchaseId: string,
  userId: string,
  reason: string,
  preferCredit?: boolean,
): Promise<OpResult<RefundResult>> {
  const supabase = getAdminSupabase();

  // Fetch purchase
  const { data: purchase, error } = await supabase
    .from("pack_purchases")
    .select(`
      id, pack_id, user_id, total_price, payment_status, status,
      expires_at, receipt_id,
      packs (id, title, validity_end_date)
    `)
    .eq("id", purchaseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!purchase) return { ok: false, error: "Achat introuvable.", errorCode: "not_found" };

  const p = purchase as any;
  const pack = p.packs;

  // Check payment status
  if (!["completed", "paid"].includes(p.payment_status)) {
    return { ok: false, error: "Cet achat n'a pas ete paye.", errorCode: "not_paid" };
  }

  // Check not already consumed
  if (["used", "consumed"].includes(p.status)) {
    return { ok: false, error: "Un Pack consomme ne peut pas etre rembourse.", errorCode: "already_consumed" };
  }

  // Check not already refunded
  if (["refunded", "credited"].includes(p.status)) {
    return { ok: false, error: "Cet achat a deja ete rembourse.", errorCode: "already_refunded" };
  }

  // Determine expiry date
  const expiresAt = p.expires_at
    ? new Date(p.expires_at)
    : pack?.validity_end_date
      ? new Date(pack.validity_end_date + "T23:59:59Z")
      : null;

  const now = new Date();

  // Check if expired
  if (expiresAt && expiresAt < now) {
    return { ok: false, error: "Ce Pack a expire. Aucun remboursement possible.", errorCode: "expired" };
  }

  // Determine refund type based on time before expiry
  let refundType: "full" | "partial" | "credit";
  let refundAmount = 0;
  let creditAmount = 0;
  const totalPrice = p.total_price as number;

  if (!expiresAt) {
    // No expiry → full refund
    refundType = "full";
    refundAmount = totalPrice;
  } else {
    const daysBeforeExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysBeforeExpiry > 14) {
      // > 14 days → full refund
      refundType = "full";
      refundAmount = totalPrice;
    } else if (preferCredit) {
      // < 14 days + client prefers credit → 100% credit
      refundType = "credit";
      creditAmount = totalPrice;
    } else {
      // < 14 days → 50% refund
      refundType = "partial";
      refundAmount = Math.round(totalPrice / 2);
    }
  }

  // Create refund record
  const { data: refund, error: refundErr } = await supabase
    .from("pack_refunds")
    .insert({
      pack_purchase_id: purchaseId,
      user_id: userId,
      refund_type: refundType,
      refund_amount: refundAmount,
      credit_amount: creditAmount,
      reason,
      status: "requested",
    })
    .select("id")
    .single();

  if (refundErr) return { ok: false, error: refundErr.message };

  // Auto-approve full refunds and credits
  if (refundType === "full" || refundType === "credit") {
    await processRefund((refund as any).id);
  }

  return {
    ok: true,
    data: {
      refundId: (refund as any).id,
      refundType,
      refundAmount,
      creditAmount,
    },
  };
}

// =============================================================================
// 2. Process refund (internal / admin)
// =============================================================================

export async function processRefund(
  refundId: string,
  adminUserId?: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: refund, error } = await supabase
    .from("pack_refunds")
    .select(`
      id, pack_purchase_id, user_id, refund_type, refund_amount, credit_amount, reason, status,
      pack_purchases (id, total_price, receipt_id, pack_id, establishment_id, packs (title))
    `)
    .eq("id", refundId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!refund) return { ok: false, error: "Remboursement introuvable.", errorCode: "not_found" };

  const r = refund as any;
  if (!["requested", "approved"].includes(r.status)) {
    return { ok: false, error: "Ce remboursement a deja ete traite.", errorCode: "already_processed" };
  }

  const now = new Date();
  const purchase = r.pack_purchases;

  // Update refund status
  await supabase
    .from("pack_refunds")
    .update({
      status: "processed",
      processed_at: now.toISOString(),
      processed_by: adminUserId ?? null,
    })
    .eq("id", refundId);

  // Update purchase status
  const newStatus = r.refund_type === "credit" ? "credited" : "refunded";
  await supabase
    .from("pack_purchases")
    .update({
      status: newStatus,
      payment_status: r.refund_type === "credit" ? "completed" : "refunded",
      updated_at: now.toISOString(),
    })
    .eq("id", r.pack_purchase_id);

  // Create refund transaction in unified ledger
  if (r.refund_amount > 0) {
    const billingPeriod = getBillingPeriodCode(now);

    void supabase.from("transactions").insert({
      establishment_id: purchase?.establishment_id ?? null,
      user_id: r.user_id,
      type: "pack_refund",
      reference_type: "pack_purchase",
      reference_id: r.pack_purchase_id,
      gross_amount: -r.refund_amount,
      commission_rate: 0,
      commission_amount: 0,
      net_amount: -r.refund_amount,
      payment_method: "card",
      status: "completed",
      billing_period: billingPeriod,
    }).then(
      () => {},
      (err: any) => log.error({ err }, "Transaction insert failed"),
    );
  }

  // Generate VosFactures credit note
  if (r.refund_amount > 0 && purchase?.receipt_id) {
    void (async () => {
      try {
        await generateRefundCreditNote({
          refundId,
          originalVfDocumentId: Number(purchase.receipt_id),
          buyerName: "Client sam.ma",
          buyerEmail: "",
          refundAmountCents: r.refund_amount,
          itemDescription: purchase?.packs?.title || "Pack",
          reason: r.reason,
          referenceType: "pack_purchase",
          referenceId: r.pack_purchase_id,
        });
      } catch (err) {
        log.error({ err }, "VosFactures credit note failed");
      }
    })();
  }

  // Notify client
  void (async () => {
    try {
      const amountStr = r.refund_type === "credit"
        ? `${(r.credit_amount / 100).toFixed(2)} MAD en credit sam.ma`
        : `${(r.refund_amount / 100).toFixed(2)} MAD`;

      await emitConsumerUserEvent({
        supabase,
        userId: r.user_id,
        eventType: "pack_refund",
        metadata: {
          title: "Remboursement traite",
          body: `Votre remboursement de ${amountStr} pour le Pack "${purchase?.packs?.title || ""}" a ete traite.`,
          refund_id: refundId,
          purchase_id: r.pack_purchase_id,
        },
      });
    } catch (err) { log.warn({ err }, "Best-effort: pack refund consumer notification failed"); }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 3. Bulk refund (establishment deactivation)
// =============================================================================

export async function refundAllActivePacksForEstablishment(
  establishmentId: string,
  reason: string,
): Promise<{ refunded: number; errors: number }> {
  const supabase = getAdminSupabase();

  const { data: purchases, error } = await supabase
    .from("pack_purchases")
    .select("id, user_id, total_price, payment_status, status")
    .eq("establishment_id", establishmentId)
    .in("payment_status", ["completed", "paid"])
    .in("status", ["active", "purchased", "partially_consumed"])
    .limit(1000);

  if (error || !purchases) return { refunded: 0, errors: 0 };

  let refunded = 0;
  let errors = 0;

  for (const purchase of purchases) {
    const p = purchase as any;
    try {
      const result = await requestPackRefund(p.id, p.user_id, reason);
      if (result.ok) {
        refunded++;
      } else {
        errors++;
      }
    } catch (err) {
      log.warn({ err, purchaseId: p.id }, "Bulk refund: single pack refund failed");
      errors++;
    }
  }

  log.info({ establishmentId, refunded, errors }, "Bulk refund completed");

  return { refunded, errors };
}
