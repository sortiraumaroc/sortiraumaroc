import { getAdminSupabase } from "../supabaseAdmin";

import { isUniqueViolation } from "./errors";
import type { FinanceActor } from "./types";

export type LedgerEntry = {
  id: string;
  account_id: string;
  amount_cents: number;
  currency: string;
  entry_type: string;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  metadata: unknown;
  created_at: string;
};

export async function insertLedgerEntry(args: {
  accountId: string;
  amountCents: number;
  currency: string;
  entryType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  actor?: FinanceActor | null;
  metadata?: unknown;
}): Promise<LedgerEntry> {
  const supabase = getAdminSupabase();

  const payload = {
    account_id: args.accountId,
    amount_cents: Math.round(args.amountCents),
    currency: args.currency,
    entry_type: args.entryType,
    reference_type: args.referenceType ?? null,
    reference_id: args.referenceId ?? null,
    idempotency_key: args.idempotencyKey ?? null,
    actor_user_id: args.actor?.userId ?? null,
    actor_role: args.actor?.role ?? null,
    metadata: args.metadata ?? null,
  };

  const { data, error } = await supabase
    .from("finance_ledger_entries")
    .insert(payload)
    .select(
      "id,account_id,amount_cents,currency,entry_type,reference_type,reference_id,idempotency_key,actor_user_id,actor_role,metadata,created_at",
    )
    .single();

  if (!error) return data as unknown as LedgerEntry;

  if (isUniqueViolation(error) && args.idempotencyKey) {
    const { data: existing, error: selErr } = await supabase
      .from("finance_ledger_entries")
      .select(
        "id,account_id,amount_cents,currency,entry_type,reference_type,reference_id,idempotency_key,actor_user_id,actor_role,metadata,created_at",
      )
      .eq("idempotency_key", args.idempotencyKey)
      .maybeSingle();

    if (selErr) throw selErr;
    if (existing) return existing as unknown as LedgerEntry;
  }

  throw error;
}

export async function insertLedgerTransfer(args: {
  idempotencyBaseKey: string;
  currency: string;
  entryType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  actor?: FinanceActor | null;
  metadata?: unknown;
}): Promise<{ debit: LedgerEntry; credit: LedgerEntry }> {
  const amt = Math.round(args.amountCents);

  const debit = await insertLedgerEntry({
    accountId: args.fromAccountId,
    amountCents: -Math.abs(amt),
    currency: args.currency,
    entryType: args.entryType,
    referenceType: args.referenceType ?? null,
    referenceId: args.referenceId ?? null,
    idempotencyKey: `${args.idempotencyBaseKey}:debit`,
    actor: args.actor ?? null,
    metadata: args.metadata ?? null,
  });

  const credit = await insertLedgerEntry({
    accountId: args.toAccountId,
    amountCents: Math.abs(amt),
    currency: args.currency,
    entryType: args.entryType,
    referenceType: args.referenceType ?? null,
    referenceId: args.referenceId ?? null,
    idempotencyKey: `${args.idempotencyBaseKey}:credit`,
    actor: args.actor ?? null,
    metadata: args.metadata ?? null,
  });

  return { debit, credit };
}
