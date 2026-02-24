-- =============================================================================
-- Migration: Security Advisor Fixes
-- Date: 2026-02-24
-- Fixes:
--   1. Enable RLS on public.ce_notifications (ERROR level)
--   2. Set search_path on 5 functions with mutable search_path (WARN level)
-- =============================================================================

-- =============================================================================
-- 1. Enable RLS on ce_notifications
--    - Table is only accessed via service role (backend) — no policies needed
--    - Service role bypasses RLS, so existing code continues working
--    - anon/authenticated roles are now blocked (default-deny without policies)
-- =============================================================================

ALTER TABLE public.ce_notifications ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Fix "Function Search Path Mutable" on 5 functions
--    Set search_path = '' to prevent search-path injection attacks
-- =============================================================================

-- 2a. partnership_set_updated_at() — trigger function
CREATE OR REPLACE FUNCTION public.partnership_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 2b. conciergerie_set_updated_at() — trigger function
CREATE OR REPLACE FUNCTION public.conciergerie_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 2c. adjust_pack_stock() — security definer RPC
CREATE OR REPLACE FUNCTION public.adjust_pack_stock(
  p_pack_id uuid,
  p_delta   int
) RETURNS int AS $$
DECLARE
  v_new_stock int;
BEGIN
  UPDATE public.packs
  SET stock      = greatest(0, coalesce(stock, 0) + p_delta),
      updated_at = now()
  WHERE id = p_pack_id
    AND is_limited = true
    AND stock IS NOT NULL
  RETURNING stock INTO v_new_stock;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN v_new_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2d. credit_ad_wallet_by_id() — security definer RPC
CREATE OR REPLACE FUNCTION public.credit_ad_wallet_by_id(
  p_wallet_id    uuid,
  p_amount_cents int,
  p_description  text DEFAULT 'Recharge',
  p_reference_type text DEFAULT 'lacaissepay_payment',
  p_reference_id text DEFAULT NULL
) RETURNS public.ad_wallets AS $$
DECLARE
  v_wallet public.ad_wallets;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  UPDATE public.ad_wallets
  SET balance_cents        = balance_cents + p_amount_cents,
      total_credited_cents = total_credited_cents + p_amount_cents,
      updated_at           = now()
  WHERE id = p_wallet_id
  RETURNING * INTO v_wallet;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ad_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    description, reference_type, reference_id
  ) VALUES (
    p_wallet_id, 'credit', p_amount_cents, v_wallet.balance_cents,
    p_description, p_reference_type, p_reference_id::uuid
  );

  RETURN v_wallet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2e. close_billing_period() — security definer RPC
CREATE OR REPLACE FUNCTION public.close_billing_period(
  p_period_id            uuid,
  p_deadline_offset_days int DEFAULT 5
) RETURNS jsonb AS $$
DECLARE
  v_period       record;
  v_total_gross  bigint := 0;
  v_total_commission bigint := 0;
  v_total_net    bigint := 0;
  v_tx_count     int := 0;
  v_total_refunds bigint := 0;
  v_deadline     date;
BEGIN
  SELECT * INTO v_period
  FROM public.billing_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_period.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open', 'current_status', v_period.status);
  END IF;

  SELECT
    coalesce(count(*), 0),
    coalesce(sum(gross_amount), 0),
    coalesce(sum(commission_amount), 0),
    coalesce(sum(net_amount), 0)
  INTO v_tx_count, v_total_gross, v_total_commission, v_total_net
  FROM public.transactions
  WHERE establishment_id = v_period.establishment_id
    AND billing_period = v_period.period_code
    AND status = 'completed';

  SELECT coalesce(sum(abs(gross_amount)), 0)
  INTO v_total_refunds
  FROM public.transactions
  WHERE establishment_id = v_period.establishment_id
    AND billing_period = v_period.period_code
    AND type IN ('pack_refund', 'deposit_refund');

  v_deadline := v_period.end_date + p_deadline_offset_days;

  UPDATE public.billing_periods
  SET status = 'closed',
      total_gross = v_total_gross,
      total_commission = v_total_commission,
      total_net = v_total_net,
      total_refunds = v_total_refunds,
      transaction_count = v_tx_count,
      call_to_invoice_deadline = v_deadline::timestamptz,
      updated_at = now()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'ok', true,
    'total_gross', v_total_gross,
    'total_commission', v_total_commission,
    'total_net', v_total_net,
    'total_refunds', v_total_refunds,
    'transaction_count', v_tx_count,
    'deadline', v_deadline
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
