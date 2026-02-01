import { getAdminSupabase } from "../supabaseAdmin";
import { getOrCreateAccount } from "./accounts";
import { computePackCommissionSnapshotForEstablishment } from "./commissions";
import { openDiscrepancy } from "./discrepancies";
import { insertLedgerEntry, insertLedgerTransfer } from "./ledger";
import type { FinanceActor } from "./types";

function safeCurrency(v: string | null | undefined): string {
  const c = String(v ?? "").trim().toUpperCase();
  return c || "MAD";
}

function isAmountPositive(amount: number | null | undefined): boolean {
  return typeof amount === "number" && Number.isFinite(amount) && Math.round(amount) > 0;
}

export type PackPurchaseFinancialSnapshot = {
  id: string;
  establishment_id: string;
  buyer_user_id: string | null;
  total_price: number | null;
  currency: string | null;
  payment_status: string | null;
};

async function fetchPackPurchaseSnapshot(purchaseId: string): Promise<PackPurchaseFinancialSnapshot | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("pack_purchases")
    .select("id,establishment_id,meta,total_price,currency,payment_status")
    .eq("id", purchaseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const buyerUserId =
    (data as any).meta && typeof (data as any).meta === "object" && typeof (data as any).meta.buyer_user_id === "string"
      ? (data as any).meta.buyer_user_id
      : null;

  return {
    id: String((data as any).id),
    establishment_id: String((data as any).establishment_id),
    buyer_user_id: buyerUserId,
    total_price: typeof (data as any).total_price === "number" ? (data as any).total_price : null,
    currency: (data as any).currency == null ? null : String((data as any).currency),
    payment_status: (data as any).payment_status == null ? null : String((data as any).payment_status),
  };
}

/**
 * Records a pack purchase as an escrow hold when payment is marked "paid".
 * Creates a ledger transfer from buyer to platform escrow.
 */
export async function ensureEscrowHoldForPackPurchase(args: {
  purchaseId: string;
  actor: FinanceActor;
}): Promise<void> {
  const supabase = getAdminSupabase();

  const snapshot = await fetchPackPurchaseSnapshot(args.purchaseId);
  if (!snapshot) return;

  const amountCents = typeof snapshot.total_price === "number" ? Math.round(snapshot.total_price) : 0;
  if (!isAmountPositive(amountCents)) return;

  if (String(snapshot.payment_status ?? "").toLowerCase() !== "paid") return;

  const { data: existing, error: selErr } = await supabase
    .from("finance_escrow_holds")
    .select("id,status")
    .eq("reference_type", "pack_purchase")
    .eq("reference_id", args.purchaseId)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return;

  const currency = safeCurrency(snapshot.currency);

  if (!snapshot.buyer_user_id) {
    await openDiscrepancy({
      entityType: "pack_purchase",
      entityId: args.purchaseId,
      kind: "escrow_hold_missing_user",
      expectedAmountCents: amountCents,
      actualAmountCents: null,
      currency,
      metadata: { message: "Pack purchase is paid but buyer_user_id is null (cannot debit payer)." },
    });
    return;
  }

  const buyerAccount = await getOrCreateAccount({
    ownerType: "user",
    ownerId: snapshot.buyer_user_id,
    currency,
    accountCode: "main",
  });

  const platformEscrow = await getOrCreateAccount({
    ownerType: "platform",
    ownerId: null,
    currency,
    accountCode: "escrow",
  });

  const transfer = await insertLedgerTransfer({
    idempotencyBaseKey: `pack_escrow_hold:${args.purchaseId}`,
    currency,
    entryType: "pack_escrow_hold",
    referenceType: "pack_purchase",
    referenceId: args.purchaseId,
    fromAccountId: buyerAccount.id,
    toAccountId: platformEscrow.id,
    amountCents,
    actor: args.actor,
    metadata: { purchase_id: args.purchaseId },
  });

  const { error: insErr } = await supabase
    .from("finance_escrow_holds")
    .insert({
      reference_type: "pack_purchase",
      reference_id: args.purchaseId,
      establishment_id: snapshot.establishment_id,
      user_id: snapshot.buyer_user_id,
      amount_cents: amountCents,
      currency,
      status: "held",
      held_at: new Date().toISOString(),
      hold_ledger_entry_id: transfer.credit.id,
      metadata: {
        debit_ledger_entry_id: transfer.debit.id,
        credit_ledger_entry_id: transfer.credit.id,
      },
    });

  if (insErr) {
    console.error("ensureEscrowHoldForPackPurchase insert escrow_holds failed", insErr);
  }
}

/**
 * Settles a pack purchase when refunded.
 * Releases escrow from platform and credits buyer account.
 */
export async function settlePackPurchaseForRefund(args: {
  purchaseId: string;
  actor: FinanceActor;
}): Promise<void> {
  const supabase = getAdminSupabase();

  const snapshot = await fetchPackPurchaseSnapshot(args.purchaseId);
  if (!snapshot) return;

  const currency = safeCurrency(snapshot.currency);

  const { data: hold, error: holdErr } = await supabase
    .from("finance_escrow_holds")
    .select("id,status,amount_cents,currency")
    .eq("reference_type", "pack_purchase")
    .eq("reference_id", args.purchaseId)
    .maybeSingle();

  if (holdErr) throw holdErr;

  if (!hold) {
    // No hold exists, nothing to settle
    return;
  }

  const holdStatus = String((hold as any).status ?? "");
  if (holdStatus !== "held") return;

  const amountCents = typeof (hold as any).amount_cents === "number" ? Math.round((hold as any).amount_cents) : 0;
  if (!amountCents) return;

  if (!snapshot.buyer_user_id) {
    await openDiscrepancy({
      entityType: "pack_purchase",
      entityId: args.purchaseId,
      kind: "refund_missing_user",
      expectedAmountCents: amountCents,
      actualAmountCents: null,
      currency,
      metadata: { message: "Cannot refund pack purchase because buyer_user_id is null." },
    });
    return;
  }

  const platformEscrow = await getOrCreateAccount({
    ownerType: "platform",
    ownerId: null,
    currency,
    accountCode: "escrow",
  });

  const buyerAccount = await getOrCreateAccount({
    ownerType: "user",
    ownerId: snapshot.buyer_user_id,
    currency,
    accountCode: "main",
  });

  const nowIso = new Date().toISOString();

  // Full refund to buyer
  const transfer = await insertLedgerTransfer({
    idempotencyBaseKey: `pack_escrow_refund:${args.purchaseId}`,
    currency,
    entryType: "pack_escrow_refund",
    referenceType: "pack_purchase",
    referenceId: args.purchaseId,
    fromAccountId: platformEscrow.id,
    toAccountId: buyerAccount.id,
    amountCents,
    actor: args.actor,
    metadata: { purchase_id: args.purchaseId },
  });

  await supabase
    .from("finance_escrow_holds")
    .update({
      status: "refunded",
      released_at: nowIso,
      release_ledger_entry_id: transfer.debit.id,
      metadata: {
        ...(typeof (hold as any).metadata === "object" && (hold as any).metadata !== null ? (hold as any).metadata : {}),
        refund_percent: 100,
        refund_cents: amountCents,
        penalty_cents: 0,
        refund_debit_ledger_entry_id: transfer.debit.id,
        refund_credit_ledger_entry_id: transfer.credit.id,
      },
    })
    .eq("id", (hold as any).id);
}

/**
 * Settles a pack purchase for establishment payout.
 * Called when the pack is used or when settlement is needed for financial purposes.
 * Releases escrow, deducts commission, and credits establishment account.
 */
export async function settlePackPurchaseForEstablishment(args: {
  purchaseId: string;
  actor: FinanceActor;
  reason: "used" | "settlement";
}): Promise<void> {
  const supabase = getAdminSupabase();

  const snapshot = await fetchPackPurchaseSnapshot(args.purchaseId);
  if (!snapshot) return;

  const currency = safeCurrency(snapshot.currency);

  const { data: hold, error: holdErr } = await supabase
    .from("finance_escrow_holds")
    .select("id,status,amount_cents,currency")
    .eq("reference_type", "pack_purchase")
    .eq("reference_id", args.purchaseId)
    .maybeSingle();

  if (holdErr) throw holdErr;

  if (!hold) {
    // No hold to settle
    return;
  }

  const holdStatus = String((hold as any).status ?? "");
  if (holdStatus !== "held") return;

  const amountCents = typeof (hold as any).amount_cents === "number" ? Math.round((hold as any).amount_cents) : 0;
  if (!amountCents) return;

  // Calculate pack commission
  const commissionSnapshot = await computePackCommissionSnapshotForEstablishment({
    establishmentId: snapshot.establishment_id,
    amountCents,
  });

  const commissionCents = commissionSnapshot.commission_amount ?? 0;
  const establishmentPayoutCents = Math.max(0, amountCents - commissionCents);

  const platformEscrow = await getOrCreateAccount({
    ownerType: "platform",
    ownerId: null,
    currency,
    accountCode: "escrow",
  });

  const establishmentAccount = await getOrCreateAccount({
    ownerType: "establishment",
    ownerId: snapshot.establishment_id,
    currency,
    accountCode: "main",
  });

  const platformRevenueAccount = await getOrCreateAccount({
    ownerType: "platform",
    ownerId: null,
    currency,
    accountCode: "revenue",
  });

  const nowIso = new Date().toISOString();

  // Debit platform escrow for the full amount
  const escrowDebit = await insertLedgerEntry({
    accountId: platformEscrow.id,
    amountCents: -Math.abs(amountCents),
    currency,
    entryType: "escrow_release",
    referenceType: "pack_purchase",
    referenceId: args.purchaseId,
    idempotencyKey: `pack_escrow_release:${args.purchaseId}:escrow_debit`,
    actor: args.actor,
    metadata: { purchase_id: args.purchaseId, reason: args.reason },
  });

  // Credit establishment account (amount minus commission)
  const establishmentCredit = await insertLedgerEntry({
    accountId: establishmentAccount.id,
    amountCents: Math.abs(establishmentPayoutCents),
    currency,
    entryType: "settlement",
    referenceType: "pack_purchase",
    referenceId: args.purchaseId,
    idempotencyKey: `pack_escrow_release:${args.purchaseId}:establishment_credit`,
    actor: args.actor,
    metadata: { purchase_id: args.purchaseId, reason: args.reason, commission_cents: commissionCents },
  });

  // Credit platform revenue account with commission (if any)
  let commissionCreditEntry: { id: string } | null = null;
  if (commissionCents > 0) {
    commissionCreditEntry = await insertLedgerEntry({
      accountId: platformRevenueAccount.id,
      amountCents: Math.abs(commissionCents),
      currency,
      entryType: "commission",
      referenceType: "pack_purchase",
      referenceId: args.purchaseId,
      idempotencyKey: `pack_escrow_release:${args.purchaseId}:commission_credit`,
      actor: args.actor,
      metadata: {
        purchase_id: args.purchaseId,
        reason: args.reason,
        commission_percent: commissionSnapshot.commission_percent,
        commission_source: commissionSnapshot.source,
      },
    });
  }

  await supabase
    .from("finance_escrow_holds")
    .update({
      status: "released",
      released_at: nowIso,
      release_ledger_entry_id: escrowDebit.id,
      metadata: {
        ...(typeof (hold as any).metadata === "object" && (hold as any).metadata !== null ? (hold as any).metadata : {}),
        settlement_cents: establishmentPayoutCents,
        commission_cents: commissionCents,
        commission_percent: commissionSnapshot.commission_percent,
        commission_source: commissionSnapshot.source,
        escrow_debit_ledger_entry_id: escrowDebit.id,
        establishment_credit_ledger_entry_id: establishmentCredit.id,
        commission_credit_ledger_entry_id: commissionCreditEntry?.id ?? null,
      },
    })
    .eq("id", (hold as any).id);

  // Create/append to a payout batch for the establishment (payout amount = total - commission)
  if (establishmentPayoutCents > 0) {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const idempotencyKey = `pack_payout:${snapshot.establishment_id}:${currency}:${month}`;

    const { data, error } = await supabase.rpc("finance_upsert_payout_batch", {
      p_idempotency_key: idempotencyKey,
      p_establishment_id: snapshot.establishment_id,
      p_currency: currency,
      p_amount_cents: establishmentPayoutCents,
      p_reservation_id: args.purchaseId,
      p_reason: `pack_${args.reason}`,
      p_commission_cents: commissionCents,
    });

    if (error) {
      await openDiscrepancy({
        entityType: "pack_purchase",
        entityId: args.purchaseId,
        kind: "payout_batch_rpc_failed",
        expectedAmountCents: establishmentPayoutCents,
        actualAmountCents: null,
        currency,
        severity: "high",
        metadata: { message: error.message, idempotency_key: idempotencyKey, commission_cents: commissionCents },
      });
    }
  }
}
