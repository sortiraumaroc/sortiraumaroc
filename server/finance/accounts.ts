import { getAdminSupabase } from "../supabaseAdmin";

import type { FinanceAccountCode, FinanceCurrency, FinanceOwnerType } from "./types";

export type FinanceAccount = {
  id: string;
  owner_type: FinanceOwnerType;
  owner_id: string | null;
  currency: FinanceCurrency;
  account_code: FinanceAccountCode;
};

export async function getOrCreateAccount(args: {
  ownerType: FinanceOwnerType;
  ownerId: string | null;
  currency: FinanceCurrency;
  accountCode: FinanceAccountCode;
}): Promise<FinanceAccount> {
  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_accounts")
    .select("id,owner_type,owner_id,currency,account_code")
    .eq("owner_type", args.ownerType)
    .eq("currency", args.currency)
    .eq("account_code", args.accountCode)
    .limit(1);

  if (args.ownerId) q = q.eq("owner_id", args.ownerId);
  else q = q.is("owner_id", null);

  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    return {
      id: String((existing as any).id),
      owner_type: args.ownerType,
      owner_id: args.ownerId,
      currency: args.currency,
      account_code: args.accountCode,
    };
  }

  const { data: created, error: insErr } = await supabase
    .from("finance_accounts")
    .insert({
      owner_type: args.ownerType,
      owner_id: args.ownerId,
      currency: args.currency,
      account_code: args.accountCode,
    })
    .select("id,owner_type,owner_id,currency,account_code")
    .single();

  if (insErr) throw insErr;

  return {
    id: String((created as any).id),
    owner_type: args.ownerType,
    owner_id: args.ownerId,
    currency: args.currency,
    account_code: args.accountCode,
  };
}
