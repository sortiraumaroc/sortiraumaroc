-- =============================================================================
-- Migration: Atomic wallet credit by wallet ID
-- Date: 2026-02-23
-- Purpose: Fix race condition in wallet recharge webhook (read-modify-write)
--          by providing an atomic RPC that credits by wallet_id.
--          The existing credit_ad_wallet(establishment_id) creates the wallet,
--          but the webhook already has a wallet_id and needs atomic increment.
-- =============================================================================

-- Atomic credit by wallet ID — used by the payments webhook for recharges.
-- Returns the updated wallet row (or NULL if wallet not found).
create or replace function public.credit_ad_wallet_by_id(
  p_wallet_id   uuid,
  p_amount_cents int,
  p_description  text default 'Recharge',
  p_reference_type text default 'lacaissepay_payment',
  p_reference_id text default null
) returns public.ad_wallets as $$
declare
  v_wallet public.ad_wallets;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount_cents must be positive';
  end if;

  -- Atomic increment — no read-modify-write race.
  update public.ad_wallets
  set balance_cents       = balance_cents + p_amount_cents,
      total_credited_cents = total_credited_cents + p_amount_cents,
      updated_at           = now()
  where id = p_wallet_id
  returning * into v_wallet;

  if not found then
    return null;
  end if;

  -- Record the credit transaction atomically in the same implicit txn.
  insert into public.ad_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    description, reference_type, reference_id
  ) values (
    p_wallet_id, 'credit', p_amount_cents, v_wallet.balance_cents,
    p_description, p_reference_type, p_reference_id::uuid
  );

  return v_wallet;
end;
$$ language plpgsql security definer;
