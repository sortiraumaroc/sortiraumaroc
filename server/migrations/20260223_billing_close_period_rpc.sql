-- =============================================================================
-- Migration: Atomic billing period closure RPC
-- Date: 2026-02-23
-- Purpose: Replace multi-query closeBillingPeriods() logic with a single
--          atomic PostgreSQL function. Prevents inconsistent state if the
--          Node.js process crashes mid-operation.
-- =============================================================================

create or replace function public.close_billing_period(
  p_period_id     uuid,
  p_deadline_offset_days int default 5
) returns jsonb as $$
declare
  v_period       record;
  v_total_gross  bigint := 0;
  v_total_commission bigint := 0;
  v_total_net    bigint := 0;
  v_tx_count     int := 0;
  v_total_refunds bigint := 0;
  v_deadline     date;
begin
  -- Lock the row to prevent concurrent closure
  select * into v_period
  from public.billing_periods
  where id = p_period_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_period.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'current_status', v_period.status);
  end if;

  -- Sum completed transactions for this period
  select
    coalesce(count(*), 0),
    coalesce(sum(gross_amount), 0),
    coalesce(sum(commission_amount), 0),
    coalesce(sum(net_amount), 0)
  into v_tx_count, v_total_gross, v_total_commission, v_total_net
  from public.transactions
  where establishment_id = v_period.establishment_id
    and billing_period = v_period.period_code
    and status = 'completed';

  -- Sum refunds
  select coalesce(sum(abs(gross_amount)), 0)
  into v_total_refunds
  from public.transactions
  where establishment_id = v_period.establishment_id
    and billing_period = v_period.period_code
    and type in ('pack_refund', 'deposit_refund');

  -- Calculate deadline: end_date + offset days
  v_deadline := v_period.end_date + p_deadline_offset_days;

  -- Update the period atomically
  update public.billing_periods
  set status = 'closed',
      total_gross = v_total_gross,
      total_commission = v_total_commission,
      total_net = v_total_net,
      total_refunds = v_total_refunds,
      transaction_count = v_tx_count,
      call_to_invoice_deadline = v_deadline::timestamptz,
      updated_at = now()
  where id = p_period_id;

  return jsonb_build_object(
    'ok', true,
    'total_gross', v_total_gross,
    'total_commission', v_total_commission,
    'total_net', v_total_net,
    'total_refunds', v_total_refunds,
    'transaction_count', v_tx_count,
    'deadline', v_deadline
  );
end;
$$ language plpgsql security definer;
