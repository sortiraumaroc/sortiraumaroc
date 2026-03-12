-- =============================================================================
-- CONSUMER WALLET SYSTEM — Portefeuille in-app pour consommateurs SAM.ma
-- Tables : consumer_wallets, consumer_wallet_transactions, consumer_wallet_cards
-- RPC atomiques : credit, debit, transfer P2P
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CONSUMER WALLETS — Un par utilisateur
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumer_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MAD',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'frozen', 'closed')),
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_consumer_wallets_user UNIQUE (user_id),
  CONSTRAINT chk_consumer_wallets_balance_non_negative CHECK (balance_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_consumer_wallets_user
  ON public.consumer_wallets (user_id);

-- Trigger updated_at (si la fonction existe déjà)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'set_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_consumer_wallets_updated_at') THEN
      CREATE TRIGGER trg_consumer_wallets_updated_at
        BEFORE UPDATE ON public.consumer_wallets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- RLS
ALTER TABLE public.consumer_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY consumer_wallets_service_role ON public.consumer_wallets
  FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. WALLET TRANSACTIONS — Tous les mouvements (double-entrée pour transferts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumer_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.consumer_wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'recharge', 'payment', 'cashback', 'refund',
    'sent', 'received', 'link'
  )),
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  counterpart_wallet_id UUID REFERENCES public.consumer_wallets(id),
  counterpart_user_id TEXT,
  label TEXT NOT NULL,
  description TEXT,
  establishment_id UUID,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'pending', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cwt_wallet_created
  ON public.consumer_wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwt_wallet_type
  ON public.consumer_wallet_transactions (wallet_id, type);
CREATE INDEX IF NOT EXISTS idx_cwt_counterpart
  ON public.consumer_wallet_transactions (counterpart_wallet_id);
CREATE INDEX IF NOT EXISTS idx_cwt_status
  ON public.consumer_wallet_transactions (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cwt_reference
  ON public.consumer_wallet_transactions (reference) WHERE reference IS NOT NULL;

ALTER TABLE public.consumer_wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cwt_service_role ON public.consumer_wallet_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. WALLET CARDS — Cartes de paiement sauvegardées (tokenisées)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumer_wallet_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.consumer_wallets(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  last4 TEXT NOT NULL CHECK (length(last4) = 4),
  network TEXT NOT NULL CHECK (network IN ('visa', 'mastercard', 'other')),
  expiry TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cwc_wallet
  ON public.consumer_wallet_cards (wallet_id);

ALTER TABLE public.consumer_wallet_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY cwc_service_role ON public.consumer_wallet_cards
  FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. RPC: Crédit atomique (recharges, cashback, refunds)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_consumer_wallet(
  p_wallet_id UUID,
  p_amount_cents INTEGER,
  p_label TEXT DEFAULT 'Recharge',
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'recharge',
  p_metadata JSONB DEFAULT '{}'
) RETURNS public.consumer_wallets AS $$
DECLARE
  v_wallet public.consumer_wallets;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  UPDATE public.consumer_wallets
  SET balance_cents = balance_cents + p_amount_cents,
      updated_at = now()
  WHERE id = p_wallet_id AND status = 'active'
  RETURNING * INTO v_wallet;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.consumer_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    label, description, reference, status, metadata
  ) VALUES (
    p_wallet_id, p_type, p_amount_cents, v_wallet.balance_cents,
    p_label, p_description, p_reference, 'completed', p_metadata
  );

  RETURN v_wallet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5. RPC: Débit atomique (paiements)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_consumer_wallet(
  p_wallet_id UUID,
  p_amount_cents INTEGER,
  p_label TEXT,
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'sent',
  p_counterpart_wallet_id UUID DEFAULT NULL,
  p_counterpart_user_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS public.consumer_wallets AS $$
DECLARE
  v_wallet public.consumer_wallets;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  UPDATE public.consumer_wallets
  SET balance_cents = balance_cents - p_amount_cents,
      updated_at = now()
  WHERE id = p_wallet_id
    AND status = 'active'
    AND balance_cents >= p_amount_cents
  RETURNING * INTO v_wallet;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.consumer_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    counterpart_wallet_id, counterpart_user_id,
    label, description, reference, status, metadata
  ) VALUES (
    p_wallet_id, p_type, -p_amount_cents, v_wallet.balance_cents,
    p_counterpart_wallet_id, p_counterpart_user_id,
    p_label, p_description, p_reference, 'completed', p_metadata
  );

  RETURN v_wallet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. RPC: Transfert P2P atomique (double-entrée)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_consumer_wallet(
  p_sender_wallet_id UUID,
  p_receiver_wallet_id UUID,
  p_amount_cents INTEGER,
  p_sender_label TEXT,
  p_receiver_label TEXT,
  p_description TEXT DEFAULT NULL,
  p_sender_user_id TEXT DEFAULT NULL,
  p_receiver_user_id TEXT DEFAULT NULL
) RETURNS TABLE(
  sender_balance_after INTEGER,
  receiver_balance_after INTEGER,
  sender_tx_id UUID,
  receiver_tx_id UUID
) AS $$
DECLARE
  v_sender public.consumer_wallets;
  v_receiver public.consumer_wallets;
  v_sender_tx_id UUID;
  v_receiver_tx_id UUID;
  v_reference TEXT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  IF p_sender_wallet_id = p_receiver_wallet_id THEN
    RAISE EXCEPTION 'cannot transfer to self';
  END IF;

  v_reference := 'TRF-' || gen_random_uuid()::text;

  -- Verrouillage dans l'ordre UUID pour éviter les deadlocks
  IF p_sender_wallet_id < p_receiver_wallet_id THEN
    SELECT * INTO v_sender FROM public.consumer_wallets
      WHERE id = p_sender_wallet_id AND status = 'active' FOR UPDATE;
    SELECT * INTO v_receiver FROM public.consumer_wallets
      WHERE id = p_receiver_wallet_id AND status = 'active' FOR UPDATE;
  ELSE
    SELECT * INTO v_receiver FROM public.consumer_wallets
      WHERE id = p_receiver_wallet_id AND status = 'active' FOR UPDATE;
    SELECT * INTO v_sender FROM public.consumer_wallets
      WHERE id = p_sender_wallet_id AND status = 'active' FOR UPDATE;
  END IF;

  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'sender_wallet_not_found_or_frozen';
  END IF;
  IF v_receiver IS NULL THEN
    RAISE EXCEPTION 'receiver_wallet_not_found_or_frozen';
  END IF;
  IF v_sender.balance_cents < p_amount_cents THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  -- Débiter l'expéditeur
  UPDATE public.consumer_wallets
  SET balance_cents = balance_cents - p_amount_cents, updated_at = now()
  WHERE id = p_sender_wallet_id
  RETURNING * INTO v_sender;

  -- Créditer le destinataire
  UPDATE public.consumer_wallets
  SET balance_cents = balance_cents + p_amount_cents, updated_at = now()
  WHERE id = p_receiver_wallet_id
  RETURNING * INTO v_receiver;

  -- Transaction expéditeur (montant négatif)
  INSERT INTO public.consumer_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    counterpart_wallet_id, counterpart_user_id,
    label, description, reference, status
  ) VALUES (
    p_sender_wallet_id, 'sent', -p_amount_cents, v_sender.balance_cents,
    p_receiver_wallet_id, p_receiver_user_id,
    p_sender_label, p_description, v_reference, 'completed'
  ) RETURNING id INTO v_sender_tx_id;

  -- Transaction destinataire (montant positif)
  INSERT INTO public.consumer_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    counterpart_wallet_id, counterpart_user_id,
    label, description, reference, status
  ) VALUES (
    p_receiver_wallet_id, 'received', p_amount_cents, v_receiver.balance_cents,
    p_sender_wallet_id, p_sender_user_id,
    p_receiver_label, p_description, v_reference, 'completed'
  ) RETURNING id INTO v_receiver_tx_id;

  RETURN QUERY SELECT
    v_sender.balance_cents,
    v_receiver.balance_cents,
    v_sender_tx_id,
    v_receiver_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
