import { getAdminSupabase } from "../supabaseAdmin";

import { DEFAULT_TIME_ZONE, getTimeZoneParts } from "../../shared/datetime";

import { getOrCreateAccount } from "./accounts";
import { openDiscrepancy } from "./discrepancies";
import { insertLedgerEntry, insertLedgerTransfer } from "./ledger";
import type { FinanceActor, ReservationFinancialSnapshot } from "./types";

function safeCurrency(v: string | null | undefined): string {
  const c = String(v ?? "").trim().toUpperCase();
  return c || "MAD";
}

function isDepositPositive(amount: number | null | undefined): boolean {
  return typeof amount === "number" && Number.isFinite(amount) && Math.round(amount) > 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function batchWeekStartYmd(now: Date = new Date()): string {
  const parts = getTimeZoneParts(now, { timeZone: DEFAULT_TIME_ZONE, locale: "en-US", includeSeconds: false });

  // Compute the day-of-week for the local calendar date.
  const localDateAsUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dow = localDateAsUtc.getUTCDay(); // 0=Sun..6=Sat

  // Monday-start week: Monday => 0 days back.
  const daysBackToMonday = (dow + 6) % 7;
  const mondayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysBackToMonday));

  const y = mondayUtc.getUTCFullYear();
  const m = mondayUtc.getUTCMonth() + 1;
  const d = mondayUtc.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function batchMonthYyyyMm(now: Date = new Date()): string {
  const parts = getTimeZoneParts(now, { timeZone: DEFAULT_TIME_ZONE, locale: "en-US", includeSeconds: false });
  return `${parts.year}-${pad2(parts.month)}`;
}

function payoutBatchIdempotencyKey(args: { establishmentId: string; currency: string; now?: Date }): string {
  const month = batchMonthYyyyMm(args.now);
  const currency = String(args.currency ?? "MAD").trim().toUpperCase() || "MAD";
  return `payout_batch_month:${args.establishmentId}:${currency}:${month}`;
}

function computeCommissionCents(snapshot: ReservationFinancialSnapshot, depositCents: number): number {
  const explicit = snapshot.commission_amount;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.max(0, Math.round(explicit));

  const pct = snapshot.commission_percent;
  if (typeof pct === "number" && Number.isFinite(pct) && pct > 0) return Math.max(0, Math.round((depositCents * pct) / 100));

  // Default safety: 0 if missing (we prefer under-charging vs over-charging).
  return 0;
}

async function fetchReservationSnapshot(reservationId: string): Promise<ReservationFinancialSnapshot | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id,establishment_id,user_id,status,payment_status,checked_in_at,amount_deposit,currency,commission_percent,commission_amount",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String((data as any).id),
    establishment_id: String((data as any).establishment_id),
    user_id: (data as any).user_id == null ? null : String((data as any).user_id),
    status: (data as any).status == null ? null : String((data as any).status),
    payment_status: (data as any).payment_status == null ? null : String((data as any).payment_status),
    checked_in_at: (data as any).checked_in_at == null ? null : String((data as any).checked_in_at),
    amount_deposit: typeof (data as any).amount_deposit === "number" ? (data as any).amount_deposit : null,
    currency: (data as any).currency == null ? null : String((data as any).currency),
    commission_percent: typeof (data as any).commission_percent === "number" ? (data as any).commission_percent : null,
    commission_amount: typeof (data as any).commission_amount === "number" ? (data as any).commission_amount : null,
  };
}

export async function ensureEscrowHoldForReservation(args: {
  reservationId: string;
  actor: FinanceActor;
}): Promise<void> {
  const supabase = getAdminSupabase();

  const snapshot = await fetchReservationSnapshot(args.reservationId);
  if (!snapshot) return;

  const depositCents = typeof snapshot.amount_deposit === "number" ? Math.round(snapshot.amount_deposit) : 0;
  if (!isDepositPositive(depositCents)) return;

  if (String(snapshot.payment_status ?? "").toLowerCase() !== "paid") return;

  const { data: existing, error: selErr } = await supabase
    .from("finance_escrow_holds")
    .select("id,status")
    .eq("reservation_id", args.reservationId)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return;

  const currency = safeCurrency(snapshot.currency);

  if (!snapshot.user_id) {
    await openDiscrepancy({
      entityType: "reservation",
      entityId: args.reservationId,
      kind: "escrow_hold_missing_user",
      expectedAmountCents: depositCents,
      actualAmountCents: null,
      currency,
      metadata: { message: "Deposit is paid but reservation has no user_id (cannot debit payer)." },
    });
    return;
  }

  const userAccount = await getOrCreateAccount({
    ownerType: "user",
    ownerId: snapshot.user_id,
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
    idempotencyBaseKey: `escrow_hold:${args.reservationId}`,
    currency,
    entryType: "escrow_hold",
    referenceType: "reservation",
    referenceId: args.reservationId,
    fromAccountId: userAccount.id,
    toAccountId: platformEscrow.id,
    amountCents: depositCents,
    actor: args.actor,
    metadata: { reservation_id: args.reservationId },
  });

  const { error: insErr } = await supabase.from("finance_escrow_holds").insert({
    reservation_id: args.reservationId,
    establishment_id: snapshot.establishment_id,
    user_id: snapshot.user_id,
    amount_cents: depositCents,
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
    // The unique index on reservation_id gives us concurrency safety.
    console.error("ensureEscrowHoldForReservation insert escrow_holds failed", insErr);
  }
}

export async function settleEscrowForReservation(args: {
  reservationId: string;
  actor: FinanceActor;
  reason: "checkin" | "noshow" | "cancel";
  /**
   * For reason="cancel" or "noshow", optionally refund only a percentage of the deposit to the user.
   * - 100 (or undefined) => full refund (backward compatible)
   * - 0..99 => partial refund; the remaining amount is settled (commission + payout) like a no-show/check-in.
   */
  refundPercent?: number | null;
}): Promise<void> {
  const supabase = getAdminSupabase();

  const snapshot = await fetchReservationSnapshot(args.reservationId);
  if (!snapshot) return;

  const currency = safeCurrency(snapshot.currency);

  const { data: hold, error: holdErr } = await supabase
    .from("finance_escrow_holds")
    .select("id,status,amount_cents,currency")
    .eq("reservation_id", args.reservationId)
    .maybeSingle();

  if (holdErr) throw holdErr;

  if (!hold) {
    await openDiscrepancy({
      entityType: "reservation",
      entityId: args.reservationId,
      kind: "missing_escrow_hold",
      expectedAmountCents: typeof snapshot.amount_deposit === "number" ? Math.round(snapshot.amount_deposit) : null,
      actualAmountCents: null,
      currency,
      metadata: { reason: args.reason },
    });
    return;
  }

  const holdStatus = String((hold as any).status ?? "");
  if (holdStatus !== "held") return;

  const depositCents = typeof (hold as any).amount_cents === "number" ? Math.round((hold as any).amount_cents) : 0;
  if (!depositCents) return;

  const platformEscrow = await getOrCreateAccount({ ownerType: "platform", ownerId: null, currency, accountCode: "escrow" });

  const nowIso = new Date().toISOString();

  if (args.reason === "cancel" || args.reason === "noshow") {
    const refundPercentRaw = typeof args.refundPercent === "number" && Number.isFinite(args.refundPercent) ? Math.round(args.refundPercent) : null;
    const refundPercent = refundPercentRaw == null ? 100 : Math.min(100, Math.max(0, refundPercentRaw));

    if (!snapshot.user_id) {
      await openDiscrepancy({
        entityType: "reservation",
        entityId: args.reservationId,
        kind: "refund_missing_user",
        expectedAmountCents: depositCents,
        actualAmountCents: null,
        currency,
        metadata: { message: "Cannot refund/settle escrow because reservation.user_id is null", refundPercent },
      });
      return;
    }

    // Full refund (backward compatible)
    if (refundPercent >= 100) {
      const userAccount = await getOrCreateAccount({ ownerType: "user", ownerId: snapshot.user_id, currency, accountCode: "main" });

      const transfer = await insertLedgerTransfer({
        idempotencyBaseKey: `escrow_refund:${args.reservationId}`,
        currency,
        entryType: "escrow_refund",
        referenceType: "reservation",
        referenceId: args.reservationId,
        fromAccountId: platformEscrow.id,
        toAccountId: userAccount.id,
        amountCents: depositCents,
        actor: args.actor,
        metadata: { reservation_id: args.reservationId, reason: args.reason, refundPercent },
      });

      await supabase
        .from("finance_escrow_holds")
        .update({
          status: "refunded",
          released_at: nowIso,
          release_ledger_entry_id: transfer.debit.id,
          metadata: {
            ...(typeof (hold as any).metadata === "object" && (hold as any).metadata !== null ? (hold as any).metadata : {}),
            refund_percent: refundPercent,
            refund_cents: depositCents,
            penalty_cents: 0,
            refund_debit_ledger_entry_id: transfer.debit.id,
            refund_credit_ledger_entry_id: transfer.credit.id,
          },
        })
        .eq("id", (hold as any).id);

      return;
    }

    const penaltyReason = args.reason === "cancel" ? "cancel_penalty" : "noshow_penalty";

    // Partial refund: refund X% to user, settle the remaining amount (commission + payout).
    const refundCents = Math.max(0, Math.min(depositCents, Math.round((depositCents * refundPercent) / 100)));
    const penaltyCents = Math.max(0, depositCents - refundCents);

    const userAccount = await getOrCreateAccount({ ownerType: "user", ownerId: snapshot.user_id, currency, accountCode: "main" });
    const platformRevenue = await getOrCreateAccount({ ownerType: "platform", ownerId: null, currency, accountCode: "revenue" });
    const establishmentAccount = await getOrCreateAccount({ ownerType: "establishment", ownerId: snapshot.establishment_id, currency, accountCode: "main" });

    // Debit platform escrow for the full amount (refund + penalty)
    const escrowDebit = await insertLedgerEntry({
      accountId: platformEscrow.id,
      amountCents: -Math.abs(depositCents),
      currency,
      entryType: "escrow_release",
      referenceType: "reservation",
      referenceId: args.reservationId,
      idempotencyKey: `escrow_release:${args.reservationId}:escrow_debit`,
      actor: args.actor,
      metadata: { reservation_id: args.reservationId, reason: args.reason, refundPercent },
    });

    let refundCredit: { id: string } | null = null;
    if (refundCents > 0) {
      refundCredit = await insertLedgerEntry({
        accountId: userAccount.id,
        amountCents: Math.abs(refundCents),
        currency,
        entryType: "escrow_refund",
        referenceType: "reservation",
        referenceId: args.reservationId,
        idempotencyKey: `escrow_release:${args.reservationId}:refund_credit`,
        actor: args.actor,
        metadata: { reservation_id: args.reservationId, reason: args.reason, refundPercent },
      });
    }

    const commissionCents = computeCommissionCents(snapshot, penaltyCents);
    const toEstablishmentCents = Math.max(0, penaltyCents - commissionCents);

    let commissionCredit: { id: string } | null = null;
    if (commissionCents > 0) {
      commissionCredit = await insertLedgerEntry({
        accountId: platformRevenue.id,
        amountCents: Math.abs(commissionCents),
        currency,
        entryType: "commission",
        referenceType: "reservation",
        referenceId: args.reservationId,
        idempotencyKey: `escrow_release:${args.reservationId}:commission_credit`,
        actor: args.actor,
        metadata: { reservation_id: args.reservationId, reason: penaltyReason, refundPercent },
      });
    }

    let establishmentCredit: { id: string } | null = null;
    if (toEstablishmentCents > 0) {
      establishmentCredit = await insertLedgerEntry({
        accountId: establishmentAccount.id,
        amountCents: Math.abs(toEstablishmentCents),
        currency,
        entryType: "settlement",
        referenceType: "reservation",
        referenceId: args.reservationId,
        idempotencyKey: `escrow_release:${args.reservationId}:establishment_credit`,
        actor: args.actor,
        metadata: { reservation_id: args.reservationId, reason: penaltyReason, refundPercent },
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
          refund_percent: refundPercent,
          refund_cents: refundCents,
          penalty_cents: penaltyCents,
          escrow_debit_ledger_entry_id: escrowDebit.id,
          refund_credit_ledger_entry_id: refundCredit?.id ?? null,
          commission_credit_ledger_entry_id: commissionCredit?.id ?? null,
          establishment_credit_ledger_entry_id: establishmentCredit?.id ?? null,
          commission_cents: commissionCents,
          settlement_cents: toEstablishmentCents,
        },
      })
      .eq("id", (hold as any).id);

    // Create/append to a payout batch for the establishment (weekly/monthly depending on RPC).
    if (toEstablishmentCents > 0) {
      const idempotencyKey = payoutBatchIdempotencyKey({ establishmentId: snapshot.establishment_id, currency });

      const { data, error } = await supabase.rpc("finance_upsert_payout_batch", {
        p_idempotency_key: idempotencyKey,
        p_establishment_id: snapshot.establishment_id,
        p_currency: currency,
        p_amount_cents: toEstablishmentCents,
        p_reservation_id: args.reservationId,
        p_reason: penaltyReason,
        p_commission_cents: commissionCents,
      });

      if (error) {
        await openDiscrepancy({
          entityType: "reservation",
          entityId: args.reservationId,
          kind: "payout_batch_rpc_failed",
          expectedAmountCents: toEstablishmentCents,
          actualAmountCents: null,
          currency,
          severity: "high",
          metadata: { message: error.message, idempotency_key: idempotencyKey },
        });
      } else {
        const row = Array.isArray(data) ? (data[0] as any) : (data as any);
        const payoutId = row?.payout_id ? String(row.payout_id) : null;
        const applied = Boolean(row?.applied);
        const status = row?.current_status ? String(row.current_status) : null;

        if (payoutId && applied === false && status && !["pending", "processing"].includes(status)) {
          await openDiscrepancy({
            entityType: "finance.payout",
            entityId: payoutId,
            kind: "payout_batch_closed",
            expectedAmountCents: toEstablishmentCents,
            actualAmountCents: 0,
            currency,
            severity: "medium",
            metadata: {
              message: "Settlement attempted to append to a closed payout batch. Consider creating a new payout batch manually.",
              status,
              idempotency_key: idempotencyKey,
              reservation_id: args.reservationId,
            },
          });
        }
      }
    }

    return;
  }

  // checkin / noshow => settle: commission + payout to establishment
  const commissionCents = computeCommissionCents(snapshot, depositCents);
  const toEstablishmentCents = depositCents - commissionCents;

  if (toEstablishmentCents < 0) {
    await openDiscrepancy({
      entityType: "reservation",
      entityId: args.reservationId,
      kind: "negative_settlement",
      expectedAmountCents: depositCents,
      actualAmountCents: toEstablishmentCents,
      currency,
      metadata: { commissionCents, depositCents },
    });
    return;
  }

  const platformRevenue = await getOrCreateAccount({ ownerType: "platform", ownerId: null, currency, accountCode: "revenue" });
  const establishmentAccount = await getOrCreateAccount({
    ownerType: "establishment",
    ownerId: snapshot.establishment_id,
    currency,
    accountCode: "main",
  });

  // Debit platform escrow for the full amount
  const escrowDebit = await insertLedgerEntry({
    accountId: platformEscrow.id,
    amountCents: -Math.abs(depositCents),
    currency,
    entryType: "escrow_release",
    referenceType: "reservation",
    referenceId: args.reservationId,
    idempotencyKey: `escrow_release:${args.reservationId}:escrow_debit`,
    actor: args.actor,
    metadata: { reservation_id: args.reservationId, reason: args.reason },
  });

  let commissionCredit: { id: string } | null = null;
  if (commissionCents > 0) {
    commissionCredit = await insertLedgerEntry({
      accountId: platformRevenue.id,
      amountCents: Math.abs(commissionCents),
      currency,
      entryType: "commission",
      referenceType: "reservation",
      referenceId: args.reservationId,
      idempotencyKey: `escrow_release:${args.reservationId}:commission_credit`,
      actor: args.actor,
      metadata: { reservation_id: args.reservationId, reason: args.reason },
    });
  }

  let establishmentCredit: { id: string } | null = null;
  if (toEstablishmentCents > 0) {
    establishmentCredit = await insertLedgerEntry({
      accountId: establishmentAccount.id,
      amountCents: Math.abs(toEstablishmentCents),
      currency,
      entryType: "settlement",
      referenceType: "reservation",
      referenceId: args.reservationId,
      idempotencyKey: `escrow_release:${args.reservationId}:establishment_credit`,
      actor: args.actor,
      metadata: { reservation_id: args.reservationId, reason: args.reason },
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
        escrow_debit_ledger_entry_id: escrowDebit.id,
        commission_credit_ledger_entry_id: commissionCredit?.id ?? null,
        establishment_credit_ledger_entry_id: establishmentCredit?.id ?? null,
        commission_cents: commissionCents,
        settlement_cents: toEstablishmentCents,
      },
    })
    .eq("id", (hold as any).id);

  // Create/append to a weekly payout batch per establishment/currency.
  if (toEstablishmentCents > 0) {
    const idempotencyKey = payoutBatchIdempotencyKey({ establishmentId: snapshot.establishment_id, currency });

    const { data, error } = await supabase.rpc("finance_upsert_payout_batch", {
      p_idempotency_key: idempotencyKey,
      p_establishment_id: snapshot.establishment_id,
      p_currency: currency,
      p_amount_cents: toEstablishmentCents,
      p_reservation_id: args.reservationId,
      p_reason: args.reason,
      p_commission_cents: commissionCents,
    });

    if (error) {
      await openDiscrepancy({
        entityType: "reservation",
        entityId: args.reservationId,
        kind: "payout_batch_rpc_failed",
        expectedAmountCents: toEstablishmentCents,
        actualAmountCents: null,
        currency,
        severity: "high",
        metadata: { message: error.message, idempotency_key: idempotencyKey },
      });
    } else {
      const row = Array.isArray(data) ? (data[0] as any) : (data as any);
      const payoutId = row?.payout_id ? String(row.payout_id) : null;
      const applied = Boolean(row?.applied);
      const status = row?.current_status ? String(row.current_status) : null;

      // If the payout batch is already closed (sent/failed/cancelled), we record a discrepancy.
      if (payoutId && applied === false && status && !["pending", "processing"].includes(status)) {
        await openDiscrepancy({
          entityType: "finance.payout",
          entityId: payoutId,
          kind: "payout_batch_closed",
          expectedAmountCents: toEstablishmentCents,
          actualAmountCents: 0,
          currency,
          severity: "medium",
          metadata: {
            message: "Settlement attempted to append to a closed payout batch. Consider creating a new payout batch manually.",
            status,
            idempotency_key: idempotencyKey,
            reservation_id: args.reservationId,
          },
        });
      }
    }
  }
}
