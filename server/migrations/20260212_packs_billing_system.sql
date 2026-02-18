-- =============================================================================
-- Migration: Packs & Billing System
-- Date: 2026-02-12
-- Description: Extends existing packs table + creates billing/invoicing tables
--   - Extends packs with V2 fields (moderation, multi-use, scheduling, gallery)
--   - Extends pack_purchases with V2 fields (multi-use, VosFactures refs)
--   - Creates pack_consumptions (per-use tracking)
--   - Creates pack_promo_codes (dedicated pack promos, extends consumer_promo_codes)
--   - Creates commissions (default commission rates)
--   - Creates establishment_commissions (per-establishment overrides)
--   - Creates transactions (unified transaction ledger)
--   - Creates billing_periods (semi-monthly billing cycles)
--   - Creates billing_disputes (invoice contestations)
--   - Creates pack_refunds (refund tracking)
--   - Creates module_activations (global feature toggles)
--   - Creates establishment_module_activations (per-establishment toggles)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. EXTEND: packs table — Add V2 columns
-- =============================================================================

-- Short description for listings
ALTER TABLE public.packs
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS detailed_description TEXT,
  ADD COLUMN IF NOT EXISTS additional_photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS party_size INTEGER,
  ADD COLUMN IF NOT EXISTS inclusions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS exclusions JSONB,
  ADD COLUMN IF NOT EXISTS valid_days INTEGER[], -- 0=Sun..6=Sat, null=all days
  ADD COLUMN IF NOT EXISTS valid_time_start TIME,
  ADD COLUMN IF NOT EXISTS valid_time_end TIME,
  ADD COLUMN IF NOT EXISTS sale_start_date DATE,
  ADD COLUMN IF NOT EXISTS sale_end_date DATE,
  ADD COLUMN IF NOT EXISTS validity_start_date DATE,
  ADD COLUMN IF NOT EXISTS validity_end_date DATE,
  ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limit_per_client INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_multi_use BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_uses INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS moderated_by UUID,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_note TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- Add CHECK constraint for moderation_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packs_moderation_status_check'
  ) THEN
    ALTER TABLE public.packs ADD CONSTRAINT packs_moderation_status_check
      CHECK (moderation_status IN (
        'draft', 'pending_moderation', 'modification_requested', 'approved',
        'active', 'suspended', 'sold_out', 'ended', 'rejected'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.packs.short_description IS 'Short text for listing cards (max 150 chars)';
COMMENT ON COLUMN public.packs.discount_percentage IS 'Auto-calculated: (original_price - price) / original_price * 100';
COMMENT ON COLUMN public.packs.valid_days IS 'Days of week pack can be consumed. 0=Sun, 6=Sat. NULL = all days';
COMMENT ON COLUMN public.packs.is_multi_use IS 'If true, pack can be used multiple times (e.g., 5 sessions)';
COMMENT ON COLUMN public.packs.total_uses IS 'Number of uses for multi-use packs (e.g., 5 sessions)';
COMMENT ON COLUMN public.packs.is_featured IS 'Admin-set: featured on homepage "Nos meilleures offres"';

-- Index for featured packs (homepage query)
CREATE INDEX IF NOT EXISTS idx_packs_featured
  ON public.packs (is_featured, moderation_status)
  WHERE is_featured = true AND moderation_status = 'active';

-- Index for sale period
CREATE INDEX IF NOT EXISTS idx_packs_sale_period
  ON public.packs (sale_start_date, sale_end_date)
  WHERE moderation_status = 'active';

-- =============================================================================
-- 2. EXTEND: pack_purchases table — Add V2 columns
-- =============================================================================

ALTER TABLE public.pack_purchases
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS promo_code_id UUID,
  ADD COLUMN IF NOT EXISTS promo_discount_amount INTEGER DEFAULT 0, -- cents
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qr_code_token TEXT,
  ADD COLUMN IF NOT EXISTS is_multi_use BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_remaining INTEGER,
  ADD COLUMN IF NOT EXISTS uses_total INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_id TEXT, -- VosFactures receipt ID
  ADD COLUMN IF NOT EXISTS invoice_id TEXT; -- VosFactures invoice ID

-- Add CHECK constraint for payment_method
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pack_purchases_payment_method_check'
  ) THEN
    ALTER TABLE public.pack_purchases ADD CONSTRAINT pack_purchases_payment_method_check
      CHECK (payment_method IN ('card', 'wallet', 'mobile_payment'));
  END IF;
END $$;

-- Add FK from pack_purchases.pack_id → packs.id (required for Supabase joins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pack_purchases_pack_id_fkey'
  ) THEN
    ALTER TABLE public.pack_purchases
      ADD CONSTRAINT pack_purchases_pack_id_fkey
      FOREIGN KEY (pack_id) REFERENCES public.packs(id);
  END IF;
END $$;

-- Index for user's purchases
CREATE INDEX IF NOT EXISTS idx_pack_purchases_user_id
  ON public.pack_purchases (user_id)
  WHERE user_id IS NOT NULL;

-- =============================================================================
-- 3. CREATE: pack_consumptions — Per-use consumption tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pack_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_purchase_id UUID NOT NULL REFERENCES public.pack_purchases(id),
  establishment_id UUID NOT NULL,
  scanned_by UUID, -- user_id of staff/pro who scanned
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  use_number INTEGER NOT NULL, -- e.g., 3 of 5
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pack_consumptions_purchase
  ON public.pack_consumptions (pack_purchase_id, scanned_at DESC);

COMMENT ON TABLE public.pack_consumptions IS 'Tracks each individual use/scan of a pack purchase (especially multi-use packs)';

-- =============================================================================
-- 4. CREATE: pack_promo_codes — Dedicated pack promotional codes
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pack_promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID, -- NULL = platform-level (sam.ma) code
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value INTEGER NOT NULL, -- basis points for % (e.g., 1000 = 10%) or cents for fixed
  applies_to TEXT NOT NULL DEFAULT 'all_packs' CHECK (applies_to IN ('all_packs', 'specific_pack', 'all_establishment_packs')),
  specific_pack_id UUID, -- if applies_to = 'specific_pack'
  max_total_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  max_uses_per_user INTEGER DEFAULT 1,
  is_cumulative BOOLEAN NOT NULL DEFAULT false, -- can be combined with pack discount
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_platform_code BOOLEAN NOT NULL DEFAULT false, -- true = discount absorbed by sam.ma
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pack_promo_codes_code
  ON public.pack_promo_codes (UPPER(code))
  WHERE is_active = true;

COMMENT ON TABLE public.pack_promo_codes IS 'Pack-specific promo codes. Platform codes (is_platform_code=true) have discount absorbed by sam.ma, not the pro';

-- =============================================================================
-- 5. CREATE: commissions — Default commission rates
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL UNIQUE CHECK (type IN (
    'pack_sale', 'reservation_deposit', 'advertising',
    'visibility', 'digital_menu', 'booking_link'
  )),
  default_rate NUMERIC(5,2) NOT NULL, -- percentage (e.g., 15.00 = 15%)
  category_rates JSONB, -- optional per-category overrides: { "restaurant": 12, "spa": 18 }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commissions IS 'Default commission rates per revenue type. Category overrides in JSON field.';

-- Seed default commission rates
INSERT INTO public.commissions (type, default_rate) VALUES
  ('pack_sale', 15.00),
  ('reservation_deposit', 15.00),
  ('advertising', 0.00),
  ('visibility', 0.00),
  ('digital_menu', 0.00),
  ('booking_link', 0.00)
ON CONFLICT (type) DO NOTHING;

-- =============================================================================
-- 6. CREATE: establishment_commissions — Per-establishment overrides
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL,
  commission_id UUID NOT NULL REFERENCES public.commissions(id),
  custom_rate NUMERIC(5,2) NOT NULL, -- overridden percentage
  negotiated_by UUID, -- admin user who negotiated
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ, -- NULL = indefinite
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, commission_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_establishment_commissions_lookup
  ON public.establishment_commissions (establishment_id, commission_id, valid_from DESC);

COMMENT ON TABLE public.establishment_commissions IS 'Negotiated commission rates per establishment. Most recent valid_from takes precedence.';

-- =============================================================================
-- 7. CREATE: transactions — Unified transaction ledger
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID,
  user_id UUID, -- client user, NULL for pro-only transactions
  type TEXT NOT NULL CHECK (type IN (
    'pack_sale', 'reservation_deposit', 'deposit_refund', 'pack_refund',
    'advertising_purchase', 'visibility_purchase', 'digital_menu_purchase',
    'booking_link_purchase', 'wallet_topup', 'wallet_payment'
  )),
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'pack_purchase', 'reservation', 'ad_order', 'visibility_order',
    'menu_order', 'booking_link_order', 'wallet'
  )),
  reference_id UUID NOT NULL,
  gross_amount INTEGER NOT NULL, -- cents
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0, -- cents
  net_amount INTEGER NOT NULL, -- cents (gross - commission)
  promo_discount_amount INTEGER DEFAULT 0, -- cents
  promo_absorbed_by TEXT CHECK (promo_absorbed_by IN ('pro', 'platform')),
  payment_method TEXT CHECK (payment_method IN ('card', 'wallet', 'mobile_payment', 'bank_transfer')),
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN (
    'completed', 'refunded', 'partially_refunded', 'disputed'
  )),
  billing_period TEXT, -- format: '2026-01-A' or '2026-01-B'
  invoice_line_id TEXT, -- VosFactures line reference
  receipt_id TEXT, -- VosFactures receipt reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for billing period queries
CREATE INDEX IF NOT EXISTS idx_transactions_billing_period
  ON public.transactions (establishment_id, billing_period, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_reference
  ON public.transactions (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user
  ON public.transactions (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.transactions IS 'Unified transaction ledger for all revenue types. All amounts in centimes MAD.';
COMMENT ON COLUMN public.transactions.billing_period IS 'Semi-monthly: YYYY-MM-A (1st-15th) or YYYY-MM-B (16th-end)';
COMMENT ON COLUMN public.transactions.net_amount IS 'Amount due to establishment = gross - commission';

-- =============================================================================
-- 8. CREATE: billing_periods — Semi-monthly billing cycles
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL,
  period_code TEXT NOT NULL, -- format: '2026-01-A' or '2026-01-B'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_gross INTEGER NOT NULL DEFAULT 0, -- cents
  total_commission INTEGER NOT NULL DEFAULT 0,
  total_net INTEGER NOT NULL DEFAULT 0,
  total_refunds INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'closed', 'invoice_pending', 'invoice_submitted',
    'invoice_validated', 'payment_scheduled', 'paid',
    'disputed', 'dispute_resolved', 'corrected'
  )),
  call_to_invoice_deadline TIMESTAMPTZ, -- deadline for pro to submit invoice
  payment_due_date TIMESTAMPTZ, -- scheduled payment date
  invoice_submitted_at TIMESTAMPTZ,
  invoice_validated_at TIMESTAMPTZ,
  payment_executed_at TIMESTAMPTZ,
  vosfactures_invoice_id TEXT,
  vosfactures_receipt_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, period_code)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_status
  ON public.billing_periods (status, payment_due_date)
  WHERE status NOT IN ('paid', 'corrected');

COMMENT ON TABLE public.billing_periods IS 'Semi-monthly billing cycles. Period A = 1-15, Period B = 16-end of month.';

-- =============================================================================
-- 9. CREATE: billing_disputes — Invoice contestations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id UUID NOT NULL REFERENCES public.billing_periods(id),
  establishment_id UUID NOT NULL,
  disputed_transactions UUID[], -- specific transaction IDs, NULL = global dispute
  reason TEXT NOT NULL,
  evidence JSONB, -- array of { url, type, description }
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'under_review', 'resolved_accepted', 'resolved_rejected',
    'escalated', 'escalation_resolved'
  )),
  admin_response TEXT,
  admin_responded_by UUID,
  admin_responded_at TIMESTAMPTZ,
  correction_amount INTEGER, -- cents, if accepted
  credit_note_id TEXT, -- VosFactures credit note ID
  escalated_at TIMESTAMPTZ,
  escalation_resolved_at TIMESTAMPTZ,
  escalation_resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_disputes_period
  ON public.billing_disputes (billing_period_id, status);

COMMENT ON TABLE public.billing_disputes IS 'Pro can contest a billing period. Admin reviews and resolves.';

-- =============================================================================
-- 10. CREATE: pack_refunds — Refund tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pack_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_purchase_id UUID NOT NULL REFERENCES public.pack_purchases(id),
  user_id UUID NOT NULL,
  refund_type TEXT NOT NULL CHECK (refund_type IN ('full', 'partial', 'credit')),
  refund_amount INTEGER NOT NULL, -- cents
  credit_amount INTEGER DEFAULT 0, -- cents, if converted to sam.ma credit
  reason TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID, -- admin user, NULL if automatic
  vosfactures_credit_note_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'approved', 'processed', 'rejected'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pack_refunds_purchase
  ON public.pack_refunds (pack_purchase_id, status);

COMMENT ON TABLE public.pack_refunds IS 'Pack purchase refund requests and processing. Credit option converts to platform credit.';

-- =============================================================================
-- 11. CREATE: module_activations — Global feature toggles
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.module_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL UNIQUE CHECK (module IN (
    'packs', 'advertising', 'visibility', 'digital_menu', 'booking_link', 'loyalty'
  )),
  is_globally_active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed defaults (all active)
INSERT INTO public.module_activations (module, is_globally_active, activated_at) VALUES
  ('packs', true, now()),
  ('advertising', true, now()),
  ('visibility', true, now()),
  ('digital_menu', true, now()),
  ('booking_link', true, now()),
  ('loyalty', true, now())
ON CONFLICT (module) DO NOTHING;

COMMENT ON TABLE public.module_activations IS 'Global feature flags. Admin can disable entire modules platform-wide.';

-- =============================================================================
-- 12. CREATE: establishment_module_activations — Per-establishment toggles
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_module_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL,
  module TEXT NOT NULL CHECK (module IN (
    'packs', 'advertising', 'visibility', 'digital_menu', 'booking_link', 'loyalty'
  )),
  is_active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, module)
);

CREATE INDEX IF NOT EXISTS idx_est_module_activations_lookup
  ON public.establishment_module_activations (establishment_id, module);

COMMENT ON TABLE public.establishment_module_activations IS 'Per-establishment module toggles. Checked after global toggle.';

-- =============================================================================
-- 13. RLS Policies
-- =============================================================================

ALTER TABLE public.pack_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_module_activations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 14. Helper function: Calculate billing period code for a date
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_billing_period_code(d DATE)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF EXTRACT(DAY FROM d) <= 15 THEN
    RETURN TO_CHAR(d, 'YYYY-MM') || '-A';
  ELSE
    RETURN TO_CHAR(d, 'YYYY-MM') || '-B';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_billing_period_code IS 'Returns billing period code: YYYY-MM-A (1-15) or YYYY-MM-B (16-end)';

-- =============================================================================
-- 15. Helper function: Get applicable commission rate
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_commission_rate(
  p_establishment_id UUID,
  p_commission_type TEXT,
  p_category TEXT DEFAULT NULL
)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_custom_rate NUMERIC(5,2);
  v_default_rate NUMERIC(5,2);
  v_category_rate NUMERIC(5,2);
  v_commission_id UUID;
BEGIN
  -- 1. Check for establishment-specific override (most recent valid)
  SELECT ec.custom_rate INTO v_custom_rate
  FROM public.establishment_commissions ec
  JOIN public.commissions c ON c.id = ec.commission_id
  WHERE ec.establishment_id = p_establishment_id
    AND c.type = p_commission_type
    AND ec.valid_from <= now()
    AND (ec.valid_until IS NULL OR ec.valid_until > now())
  ORDER BY ec.valid_from DESC
  LIMIT 1;

  IF v_custom_rate IS NOT NULL THEN
    RETURN v_custom_rate;
  END IF;

  -- 2. Check for category-specific default
  SELECT c.id, c.default_rate, (c.category_rates->>p_category)::NUMERIC(5,2)
  INTO v_commission_id, v_default_rate, v_category_rate
  FROM public.commissions c
  WHERE c.type = p_commission_type;

  IF v_category_rate IS NOT NULL AND p_category IS NOT NULL THEN
    RETURN v_category_rate;
  END IF;

  -- 3. Return global default
  RETURN COALESCE(v_default_rate, 0);
END;
$$;

COMMENT ON FUNCTION public.get_commission_rate IS 'Returns applicable commission rate: custom > category > default';

-- =============================================================================
-- 16. CREATE: pending_vf_documents — VosFactures retry queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pending_vf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- pack_sale_receipt, deposit_receipt, wallet_topup_receipt, etc.
  reference_type TEXT NOT NULL, -- pack_purchase, reservation, wallet_transaction, etc.
  reference_id TEXT NOT NULL,
  payload JSONB NOT NULL, -- VFCreateDocumentInput to retry
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  original_vf_document_id INTEGER, -- for credit notes: ID of original document
  correction_reason TEXT, -- for credit notes: reason
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_vf_documents_status
  ON public.pending_vf_documents (status, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.pending_vf_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pending_vf_documents IS 'Queue for VosFactures documents that failed to generate. Cron retries every 15min.';

COMMIT;
