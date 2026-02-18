-- ============================================================================
-- BATCH 4: Migrations 20260212-20260214_*
-- 11 fichiers: footer, loyalty v2, packs, auto-reply, FAQ, notifications, messaging, roles, SAM AI, support, trusted devices
-- ============================================================================


-- ============================================================
-- FILE: 20260212_footer_social_links.sql
-- ============================================================

-- ============================================================================
-- FOOTER SOCIAL LINKS - Social media URLs managed via admin
-- ============================================================================
-- Adds 6 social media URL settings to platform_settings with category 'footer'.
-- These are read by the public platform-settings endpoint and displayed in the footer.
-- ============================================================================

INSERT INTO public.platform_settings (key, value, value_type, label, description, category)
VALUES
  ('FOOTER_SOCIAL_INSTAGRAM', '', 'string', 'Instagram', 'URL du compte Instagram officiel', 'footer'),
  ('FOOTER_SOCIAL_TIKTOK', '', 'string', 'TikTok', 'URL du compte TikTok officiel', 'footer'),
  ('FOOTER_SOCIAL_FACEBOOK', '', 'string', 'Facebook', 'URL de la page Facebook officielle', 'footer'),
  ('FOOTER_SOCIAL_YOUTUBE', '', 'string', 'YouTube', 'URL de la chaîne YouTube officielle', 'footer'),
  ('FOOTER_SOCIAL_SNAPCHAT', '', 'string', 'Snapchat', 'URL du compte Snapchat officiel', 'footer'),
  ('FOOTER_SOCIAL_LINKEDIN', '', 'string', 'LinkedIn', 'URL de la page LinkedIn officielle', 'footer')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- FILE: 20260212_loyalty_v2_extension.sql
-- ============================================================

-- Migration: SAM Loyalty System V2 Extension
-- Date: 2026-02-12
-- Description: Étend le système de fidélité existant avec :
--   - Tampons conditionnels (montant minimum)
--   - Fréquence de tamponnage configurable
--   - Cadeaux sam.ma (PlatformGift + Distribution)
--   - Alertes anti-fraude (LoyaltyAlert)
--   - Champs de personnalisation visuelle étendus
--   - Gel/dégel des cartes
--   - Statut programme (active/inactive/suspended)

BEGIN;

-- =============================================================================
-- 1. EXTENSION DE loyalty_programs
-- =============================================================================

-- Fréquence de tamponnage
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS stamp_frequency TEXT DEFAULT 'once_per_day'
    CHECK (stamp_frequency IN ('once_per_day', 'once_per_week', 'unlimited'));

-- Tampon lié à une réservation
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS stamp_requires_reservation BOOLEAN DEFAULT false;

-- Tampon conditionnel (montant minimum)
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS stamp_conditional BOOLEAN DEFAULT false;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS stamp_minimum_amount NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS stamp_minimum_currency TEXT DEFAULT 'MAD';

-- Durée de validité de la carte (en jours à partir du premier tampon)
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_validity_days INT DEFAULT 365
    CHECK (card_validity_days IS NULL OR (card_validity_days >= 30 AND card_validity_days <= 730));

-- Durée pour consommer le cadeau après complétion
-- (reward_validity_days existe déjà, on garde)

-- Carte renouvelable après consommation du cadeau
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS is_renewable BOOLEAN DEFAULT true;

-- Personnalisation visuelle étendue (en plus du card_design JSONB existant)
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_background_image TEXT DEFAULT NULL;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_background_opacity NUMERIC(2,1) DEFAULT 0.3
    CHECK (card_background_opacity >= 0.1 AND card_background_opacity <= 1.0);
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_logo TEXT DEFAULT NULL;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_text_color TEXT DEFAULT 'auto'
    CHECK (card_text_color IN ('light', 'dark', 'auto'));
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_stamp_filled_color TEXT DEFAULT NULL;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_stamp_empty_color TEXT DEFAULT '#d1d5db';
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS card_stamp_custom_icon TEXT DEFAULT NULL;

-- Statut programme (remplace is_active par un enum plus riche)
-- On garde is_active pour compatibilité et on ajoute un status séparé
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended'));
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS suspended_by TEXT DEFAULT NULL;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT DEFAULT NULL;
ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ DEFAULT NULL;

-- Synchroniser is_active avec status pour les données existantes
UPDATE loyalty_programs SET status = 'active' WHERE is_active = true AND status IS NULL;
UPDATE loyalty_programs SET status = 'inactive' WHERE is_active = false AND status IS NULL;

-- Index pour la recherche par statut
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_status
  ON loyalty_programs(establishment_id, status) WHERE status = 'active';

-- =============================================================================
-- 2. EXTENSION DE loyalty_cards
-- =============================================================================

-- Copie des infos récompense au moment de la complétion
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS reward_description TEXT DEFAULT NULL;
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS reward_type TEXT DEFAULT NULL;
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS reward_value TEXT DEFAULT NULL;

-- Date d'expiration du cadeau
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS reward_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Date de consommation du cadeau
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS reward_claimed_at TIMESTAMPTZ DEFAULT NULL;

-- Token QR pour le cadeau débloqué
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS qr_reward_token UUID DEFAULT NULL;

-- Lien vers la carte précédente (si renouvelée)
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS previous_card_id UUID DEFAULT NULL
    REFERENCES loyalty_cards(id) ON DELETE SET NULL;

-- Date du premier tampon
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL;

-- Copie du stamps_required du programme au moment de la création
ALTER TABLE loyalty_cards
  ADD COLUMN IF NOT EXISTS stamps_required INT DEFAULT NULL;

-- Ajouter le statut 'frozen' pour gel/dégel
-- On doit supprimer et recréer la contrainte CHECK
ALTER TABLE loyalty_cards DROP CONSTRAINT IF EXISTS loyalty_cards_status_check;
ALTER TABLE loyalty_cards ADD CONSTRAINT loyalty_cards_status_check
  CHECK (status IN ('active', 'completed', 'reward_pending', 'reward_used', 'expired', 'frozen'));

-- Index pour le token QR
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_qr_reward_token
  ON loyalty_cards(qr_reward_token) WHERE qr_reward_token IS NOT NULL;

-- Index pour les cartes gelées
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_frozen
  ON loyalty_cards(program_id, status) WHERE status = 'frozen';

-- =============================================================================
-- 3. EXTENSION DE loyalty_stamps
-- =============================================================================

-- Montant consommé (pour tampon conditionnel)
ALTER TABLE loyalty_stamps
  ADD COLUMN IF NOT EXISTS amount_spent NUMERIC(10,2) DEFAULT NULL;

-- Ajouter 'conditional_validated' au type de tampon
ALTER TABLE loyalty_stamps DROP CONSTRAINT IF EXISTS loyalty_stamps_stamp_type_check;
ALTER TABLE loyalty_stamps ADD CONSTRAINT loyalty_stamps_stamp_type_check
  CHECK (stamp_type IN ('regular', 'bonus', 'birthday', 'happy_hour', 'sam_booking', 'retroactive', 'manual', 'conditional_validated'));

-- =============================================================================
-- 4. NOUVELLE TABLE : platform_gifts (Cadeaux offerts par les pros à sam.ma)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  offered_by TEXT NOT NULL, -- user_id du pro

  -- Type et détails du cadeau
  gift_type TEXT NOT NULL CHECK (gift_type IN ('free_meal', 'free_service', 'percentage_discount', 'fixed_discount')),
  description TEXT NOT NULL,
  value NUMERIC(10,2) NOT NULL, -- montant ou pourcentage
  value_currency TEXT DEFAULT 'MAD',

  -- Stock
  total_quantity INT NOT NULL CHECK (total_quantity >= 1 AND total_quantity <= 1000),
  distributed_count INT DEFAULT 0 CHECK (distributed_count >= 0),
  consumed_count INT DEFAULT 0 CHECK (consumed_count >= 0),

  -- Conditions
  conditions TEXT,

  -- Validité
  validity_start TIMESTAMPTZ NOT NULL,
  validity_end TIMESTAMPTZ NOT NULL,

  -- Statut & modération
  status TEXT DEFAULT 'offered' CHECK (status IN (
    'offered',               -- soumis par le pro, en attente d'approbation
    'approved',              -- approuvé par l'admin, prêt à distribuer
    'partially_distributed', -- distribution en cours
    'fully_distributed',     -- tout distribué
    'expired',               -- expiré sans distribution complète
    'rejected'               -- rejeté par l'admin
  )),
  approved_by TEXT DEFAULT NULL,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_gift_dates CHECK (validity_end > validity_start)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_platform_gifts_establishment ON platform_gifts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_platform_gifts_status ON platform_gifts(status);
CREATE INDEX IF NOT EXISTS idx_platform_gifts_offered_by ON platform_gifts(offered_by);
CREATE INDEX IF NOT EXISTS idx_platform_gifts_validity ON platform_gifts(validity_end) WHERE status IN ('approved', 'partially_distributed');

-- Trigger updated_at
DROP TRIGGER IF EXISTS platform_gifts_updated_at ON platform_gifts;
CREATE TRIGGER platform_gifts_updated_at
  BEFORE UPDATE ON platform_gifts
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();

-- =============================================================================
-- 5. NOUVELLE TABLE : platform_gift_distributions (Attribution d'un cadeau à un client)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_gift_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_gift_id UUID NOT NULL REFERENCES platform_gifts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- consumer_users.id

  -- Mode de distribution
  distribution_method TEXT NOT NULL CHECK (distribution_method IN ('manual', 'criteria_based', 'first_come')),
  distributed_by TEXT DEFAULT NULL, -- admin user_id, NULL si automatique

  -- Token QR pour consommation
  qr_gift_token UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Statut
  status TEXT DEFAULT 'distributed' CHECK (status IN ('distributed', 'consumed', 'expired')),

  -- Timestamps
  distributed_at TIMESTAMPTZ DEFAULT now(),
  consumed_at TIMESTAMPTZ DEFAULT NULL,
  consumed_scanned_by TEXT DEFAULT NULL, -- user_id du pro/staff qui a scanné
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  -- Un client ne peut recevoir qu'une seule distribution par cadeau
  CONSTRAINT unique_gift_per_user UNIQUE (platform_gift_id, user_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_user ON platform_gift_distributions(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_gift ON platform_gift_distributions(platform_gift_id);
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_status ON platform_gift_distributions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_qr ON platform_gift_distributions(qr_gift_token);
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_expires ON platform_gift_distributions(expires_at) WHERE status = 'distributed';

-- =============================================================================
-- 6. NOUVELLE TABLE : loyalty_alerts (Alertes anti-fraude)
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type d'alerte
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'suspicious_stamping',       -- client reçoit trop de tampons en peu de temps
    'high_value_reward',         -- programme avec cadeau > 1000 Dhs
    'abnormal_frequency',        -- pro tamponne massivement sans résas
    'program_created',           -- nouveau programme créé (info)
    'suspicious_amount_pattern'  -- pro saisit systématiquement le montant minimum exact
  )),

  -- Contexte
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  user_id TEXT DEFAULT NULL, -- client concerné, nullable
  program_id UUID DEFAULT NULL REFERENCES loyalty_programs(id) ON DELETE SET NULL,

  -- Détails
  details TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- données supplémentaires (ex: liste des tampons suspects)

  -- Statut de revue
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  reviewed_by TEXT DEFAULT NULL, -- admin user_id
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  review_notes TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_loyalty_alerts_status ON loyalty_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_alerts_establishment ON loyalty_alerts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_alerts_type ON loyalty_alerts(alert_type, status);

-- =============================================================================
-- 7. RLS sur les nouvelles tables
-- =============================================================================

ALTER TABLE platform_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_gift_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_alerts ENABLE ROW LEVEL SECURITY;

-- Policies (filtrage côté API via service_role)
DROP POLICY IF EXISTS platform_gifts_read ON platform_gifts;
CREATE POLICY platform_gifts_read ON platform_gifts FOR SELECT USING (true);
DROP POLICY IF EXISTS platform_gift_distributions_read ON platform_gift_distributions;
CREATE POLICY platform_gift_distributions_read ON platform_gift_distributions FOR SELECT USING (true);
DROP POLICY IF EXISTS loyalty_alerts_read ON loyalty_alerts;
CREATE POLICY loyalty_alerts_read ON loyalty_alerts FOR SELECT USING (true);

-- =============================================================================
-- 8. FONCTION : Calcul du stock restant d'un cadeau sam.ma
-- =============================================================================

CREATE OR REPLACE FUNCTION get_platform_gift_remaining(gift_id UUID)
RETURNS INT AS $$
DECLARE
  total INT;
  distributed INT;
BEGIN
  SELECT total_quantity, distributed_count
  INTO total, distributed
  FROM platform_gifts WHERE id = gift_id;

  RETURN COALESCE(total - distributed, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 9. EXTENSION de check_loyalty_expirations() pour V2
-- =============================================================================

CREATE OR REPLACE FUNCTION check_loyalty_expirations()
RETURNS void AS $$
BEGIN
  -- Expirer les cartes inactives (existant)
  UPDATE loyalty_cards
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Expirer les récompenses fidélité (existant)
  UPDATE loyalty_rewards
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < now();

  -- V2: Expirer les cartes avec reward_expires_at dépassé
  UPDATE loyalty_cards
  SET status = 'expired', updated_at = now()
  WHERE status IN ('completed', 'reward_pending')
    AND reward_expires_at IS NOT NULL
    AND reward_expires_at < now();

  -- V2: Expirer les distributions de cadeaux sam.ma
  UPDATE platform_gift_distributions
  SET status = 'expired'
  WHERE status = 'distributed'
    AND expires_at < now();

  -- V2: Mettre à jour le statut des platform_gifts expirés
  UPDATE platform_gifts
  SET status = 'expired', updated_at = now()
  WHERE status IN ('approved', 'partially_distributed')
    AND validity_end < now();
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 10. COMMENTAIRES
-- =============================================================================

COMMENT ON COLUMN loyalty_programs.stamp_frequency IS 'Fréquence max de tamponnage: once_per_day, once_per_week, unlimited';
COMMENT ON COLUMN loyalty_programs.stamp_conditional IS 'Si true, le tampon exige un montant minimum de consommation';
COMMENT ON COLUMN loyalty_programs.stamp_minimum_amount IS 'Montant minimum en Dhs pour obtenir un tampon conditionnel';
COMMENT ON COLUMN loyalty_programs.card_validity_days IS 'Durée de validité de la carte en jours depuis le premier tampon';
COMMENT ON COLUMN loyalty_programs.is_renewable IS 'Si true, une nouvelle carte est créée après consommation du cadeau';
COMMENT ON COLUMN loyalty_programs.status IS 'Statut du programme: active, inactive, suspended';
COMMENT ON COLUMN loyalty_cards.qr_reward_token IS 'Token UUID chargé dans le QR quand le cadeau est débloqué';
COMMENT ON COLUMN loyalty_cards.previous_card_id IS 'Lien vers la carte précédente si la carte a été renouvelée';
COMMENT ON COLUMN loyalty_cards.stamps_required IS 'Copie du stamps_required du programme au moment de la création';
COMMENT ON COLUMN loyalty_stamps.amount_spent IS 'Montant consommé par le client (renseigné par le pro pour tampon conditionnel)';
COMMENT ON TABLE platform_gifts IS 'Cadeaux offerts par les pros à sam.ma pour redistribution aux utilisateurs';
COMMENT ON TABLE platform_gift_distributions IS 'Attribution individuelle d un cadeau sam.ma à un client';
COMMENT ON TABLE loyalty_alerts IS 'Alertes anti-fraude détectées par le système ou les crons';

COMMIT;


-- ============================================================
-- FILE: 20260212_packs_billing_system.sql
-- ============================================================

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

COMMENT ON FUNCTION public.get_billing_period_code(DATE) IS 'Returns billing period code: YYYY-MM-A (1-15) or YYYY-MM-B (16-end)';

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

COMMENT ON FUNCTION public.get_commission_rate(UUID, TEXT, TEXT) IS 'Returns applicable commission rate: custom > category > default';

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


-- ============================================================
-- FILE: 20260213_catchup_pro_auto_reply_settings.sql
-- ============================================================

-- =============================================================================
-- CATCH-UP MIGRATION: Create pro_auto_reply_settings table
-- This table was missing from the partial execution of 20260213_pro_messaging_tables.sql
-- Safe to run multiple times (IF NOT EXISTS)
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: pro_auto_reply_settings
-- Auto-reply configuration per establishment (schedule + vacation mode)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_auto_reply_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL DEFAULT 'Bonjour, merci pour votre message. Nous sommes actuellement indisponibles mais nous vous répondrons dès que possible.',
  start_time TEXT, -- HH:MM format (e.g., '18:00')
  end_time TEXT,   -- HH:MM format (e.g., '09:00')
  days_of_week INTEGER[] DEFAULT '{}', -- 0=Sunday, 6=Saturday
  is_on_vacation BOOLEAN NOT NULL DEFAULT false,
  vacation_start TIMESTAMPTZ,
  vacation_end TIMESTAMPTZ,
  vacation_message TEXT NOT NULL DEFAULT 'Nous sommes actuellement en congés. Nous traiterons votre message à notre retour.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id)
);

-- Enable RLS
ALTER TABLE public.pro_auto_reply_settings ENABLE ROW LEVEL SECURITY;

COMMIT;


-- ============================================================
-- FILE: 20260213_faq_articles_seed.sql
-- ============================================================

-- =============================================================================
-- FAQ Articles Seed — Mise à jour pour toutes les nouvelles fonctionnalités
-- Date: 2026-02-13
-- Catégories: reservations, paiements, annulations, comptes_utilisateurs,
--             comptes_pro, packs_offres, support_general
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- CATÉGORIE : reservations
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment faire une réservation ?',
  '<p>Pour réserver, recherchez un établissement, choisissez un créneau disponible, indiquez le nombre de personnes et confirmez.</p>',
  'Comment faire une réservation ?',
  'How do I make a reservation?',
  '<p>Pour réserver sur sam.ma :</p><ol><li>Recherchez un établissement (restaurant, hôtel, spa, etc.)</li><li>Consultez les créneaux disponibles sur la fiche</li><li>Sélectionnez la date, l''heure et le nombre de personnes</li><li>Confirmez votre réservation</li></ol><p>Vous recevrez une confirmation par email et notification. Certains établissements peuvent demander un acompte.</p>',
  '<p>To book on sam.ma:</p><ol><li>Search for an establishment (restaurant, hotel, spa, etc.)</li><li>Check available time slots on the listing page</li><li>Select the date, time and number of guests</li><li>Confirm your reservation</li></ol><p>You will receive a confirmation by email and notification. Some establishments may require a deposit.</p>',
  'reservations', 1, true, ARRAY['booking', 'how-to', 'reservation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce qu''un no-show et que se passe-t-il si je ne me présente pas ?',
  '<p>Un no-show signifie que vous ne vous êtes pas présenté à votre réservation sans l''annuler au préalable.</p>',
  'Qu''est-ce qu''un no-show et que se passe-t-il si je ne me présente pas ?',
  'What is a no-show and what happens if I don''t show up?',
  '<p>Un <strong>no-show</strong> signifie que vous ne vous êtes pas présenté à votre réservation sans l''avoir annulée.</p><p><strong>Conséquences :</strong></p><ul><li>Votre score de fiabilité diminue de <strong>-15 points</strong></li><li>Après <strong>3 no-shows consécutifs</strong>, votre compte est suspendu 7 jours</li><li>Après <strong>5 no-shows cumulés</strong>, suspension de 30 jours</li></ul><p><strong>Vous pouvez contester :</strong> Si le professionnel déclare un no-show par erreur, vous avez <strong>48 heures</strong> pour contester en fournissant des preuves. Un arbitrage sera effectué par l''équipe sam.ma.</p>',
  '<p>A <strong>no-show</strong> means you did not show up for your reservation without canceling it.</p><p><strong>Consequences:</strong></p><ul><li>Your reliability score decreases by <strong>-15 points</strong></li><li>After <strong>3 consecutive no-shows</strong>, your account is suspended for 7 days</li><li>After <strong>5 cumulative no-shows</strong>, 30-day suspension</li></ul><p><strong>You can dispute:</strong> If the professional declares a no-show by mistake, you have <strong>48 hours</strong> to dispute with evidence. Arbitration will be handled by the sam.ma team.</p>',
  'reservations', 2, true, ARRAY['no-show', 'dispute', 'scoring', 'suspension']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne le QR code de réservation ?',
  '<p>Chaque réservation confirmée génère un QR code unique pour le check-in sur place.</p>',
  'Comment fonctionne le QR code de réservation ?',
  'How does the reservation QR code work?',
  '<p>Chaque réservation confirmée génère un <strong>QR code unique</strong> :</p><ul><li>Retrouvez-le dans <strong>"Mes Réservations"</strong> → détail de la réservation</li><li>Présentez-le à l''établissement à votre arrivée</li><li>Le professionnel scanne le code pour valider votre présence</li><li>Le check-in est instantané et confirme votre venue</li></ul><p>Le QR code est à usage unique et ne peut pas être partagé.</p>',
  '<p>Each confirmed reservation generates a <strong>unique QR code</strong>:</p><ul><li>Find it in <strong>"My Reservations"</strong> → reservation details</li><li>Show it at the establishment upon arrival</li><li>The professional scans the code to validate your presence</li><li>Check-in is instant and confirms your attendance</li></ul><p>The QR code is single-use and cannot be shared.</p>',
  'reservations', 3, true, ARRAY['qr-code', 'check-in', 'scan']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce que le score de fiabilité ?',
  '<p>Le score de fiabilité évalue votre comportement en tant que client sur sam.ma.</p>',
  'Qu''est-ce que le score de fiabilité ?',
  'What is the reliability score?',
  '<p>Le <strong>score de fiabilité</strong> (0-100) reflète votre comportement sur sam.ma :</p><ul><li><strong>Base :</strong> 60 points (tout nouveau compte)</li><li><strong>+5 pts</strong> par réservation honorée</li><li><strong>+2 pts</strong> si vous passez d''une réservation gratuite à payante</li><li><strong>+1 pt</strong> par avis déposé</li><li><strong>-5 à -10 pts</strong> par annulation tardive</li><li><strong>-15 pts</strong> par no-show</li></ul><p>Un score élevé vous donne accès à plus de créneaux et à des avantages exclusifs. Le score est affiché sous forme d''étoiles (score ÷ 20).</p>',
  '<p>The <strong>reliability score</strong> (0-100) reflects your behavior on sam.ma:</p><ul><li><strong>Base:</strong> 60 points (every new account)</li><li><strong>+5 pts</strong> per honored reservation</li><li><strong>+2 pts</strong> if you upgrade from free to paid reservation</li><li><strong>+1 pt</strong> per review posted</li><li><strong>-5 to -10 pts</strong> per late cancellation</li><li><strong>-15 pts</strong> per no-show</li></ul><p>A high score gives you access to more time slots and exclusive benefits. The score is displayed as stars (score ÷ 20).</p>',
  'reservations', 4, true, ARRAY['scoring', 'reliability', 'points', 'stars']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Puis-je passer d''une réservation gratuite à payante ?',
  '<p>Oui, vous pouvez upgrader une réservation gratuite vers une réservation payante.</p>',
  'Puis-je passer d''une réservation gratuite à payante ?',
  'Can I upgrade from a free to a paid reservation?',
  '<p>Oui ! Si votre réservation est actuellement <strong>gratuite</strong>, vous pouvez la passer en <strong>réservation payante</strong> (avec acompte) :</p><ul><li>Allez dans <strong>"Mes Réservations"</strong></li><li>Cliquez sur le bouton <strong>"Passer en payant"</strong></li><li>Réglez l''acompte demandé</li></ul><p><strong>Avantage :</strong> Vous gagnez <strong>+2 points</strong> de fiabilité et votre créneau est garanti avec priorité.</p>',
  '<p>Yes! If your reservation is currently <strong>free</strong>, you can upgrade it to a <strong>paid reservation</strong> (with deposit):</p><ul><li>Go to <strong>"My Reservations"</strong></li><li>Click the <strong>"Upgrade to paid"</strong> button</li><li>Pay the required deposit</li></ul><p><strong>Benefit:</strong> You earn <strong>+2 reliability points</strong> and your slot is guaranteed with priority.</p>',
  'reservations', 5, true, ARRAY['upgrade', 'free', 'paid', 'deposit']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Je n''ai pas reçu ma confirmation de réservation, que faire ?',
  '<p>Si vous n''avez pas reçu de confirmation, vérifiez vos spams ou contactez le support.</p>',
  'Je n''ai pas reçu ma confirmation de réservation, que faire ?',
  'I didn''t receive my reservation confirmation, what should I do?',
  '<p>Si vous n''avez pas reçu de confirmation :</p><ol><li>Vérifiez votre dossier <strong>spam / courrier indésirable</strong></li><li>Consultez <strong>"Mes Réservations"</strong> dans votre espace client — la réservation y est peut-être déjà</li><li>Vérifiez que votre adresse email est correcte dans votre profil</li><li>Si le problème persiste, contactez-nous via le <strong>chat support</strong> ou créez un <strong>ticket</strong></li></ol>',
  '<p>If you didn''t receive a confirmation:</p><ol><li>Check your <strong>spam / junk folder</strong></li><li>Check <strong>"My Reservations"</strong> in your account — the booking may already be there</li><li>Verify your email address is correct in your profile</li><li>If the issue persists, contact us via <strong>support chat</strong> or create a <strong>ticket</strong></li></ol>',
  'reservations', 6, true, ARRAY['confirmation', 'email', 'notification']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : annulations
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment annuler une réservation ?',
  '<p>Vous pouvez annuler depuis votre espace "Mes Réservations".</p>',
  'Comment annuler une réservation ?',
  'How do I cancel a reservation?',
  '<p>Pour annuler une réservation :</p><ol><li>Allez dans <strong>"Mes Réservations"</strong></li><li>Sélectionnez la réservation à annuler</li><li>Cliquez sur <strong>"Annuler"</strong></li></ol><p><strong>Important :</strong></p><ul><li>L''annulation est <strong>gratuite</strong> si elle est faite plus de <strong>3 heures avant</strong> le créneau</li><li>Une annulation tardive (moins de 3h) impacte votre <strong>score de fiabilité</strong> (-5 à -10 pts)</li><li>L''annulation d''une réservation avec acompte peut entraîner des frais selon la politique de l''établissement</li></ul>',
  '<p>To cancel a reservation:</p><ol><li>Go to <strong>"My Reservations"</strong></li><li>Select the reservation to cancel</li><li>Click <strong>"Cancel"</strong></li></ol><p><strong>Important:</strong></p><ul><li>Cancellation is <strong>free</strong> if done more than <strong>3 hours before</strong> the time slot</li><li>A late cancellation (less than 3h) impacts your <strong>reliability score</strong> (-5 to -10 pts)</li><li>Canceling a reservation with deposit may incur fees depending on the establishment''s policy</li></ul>',
  'annulations', 1, true, ARRAY['cancel', 'annulation', 'policy']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce que la fenêtre de protection de 3 heures ?',
  '<p>La fenêtre de 3 heures est le délai minimum avant lequel une annulation gratuite est possible.</p>',
  'Qu''est-ce que la fenêtre de protection de 3 heures ?',
  'What is the 3-hour protection window?',
  '<p>La <strong>fenêtre de protection de 3 heures</strong> (H-3) fonctionne ainsi :</p><ul><li><strong>Plus de 3h avant :</strong> Annulation gratuite, sans impact sur votre score</li><li><strong>Moins de 3h avant :</strong> L''annulation est considérée comme <strong>tardive</strong> et impacte votre score (-5 pts)</li><li><strong>Moins de 1h avant :</strong> Annulation <strong>très tardive</strong> (-10 pts)</li></ul><p>Les réservations gratuites faites moins de 3 heures avant le créneau ne sont plus possibles pour protéger les établissements.</p>',
  '<p>The <strong>3-hour protection window</strong> (H-3) works as follows:</p><ul><li><strong>More than 3h before:</strong> Free cancellation, no impact on your score</li><li><strong>Less than 3h before:</strong> Cancellation is considered <strong>late</strong> and impacts your score (-5 pts)</li><li><strong>Less than 1h before:</strong> <strong>Very late</strong> cancellation (-10 pts)</li></ul><p>Free reservations made less than 3 hours before the time slot are no longer possible to protect establishments.</p>',
  'annulations', 2, true, ARRAY['3-hours', 'protection', 'late-cancel', 'scoring']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : paiements
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Pourquoi un dépôt (acompte) est demandé sur certaines réservations ?',
  '<p>Certains établissements demandent un acompte pour garantir votre réservation.</p>',
  'Pourquoi un dépôt (acompte) est demandé sur certaines réservations ?',
  'Why is a deposit required for some reservations?',
  '<p>L''acompte est un mécanisme de <strong>garantie</strong> :</p><ul><li>L''établissement fixe le montant (souvent un pourcentage du menu)</li><li>Il est <strong>déduit de l''addition finale</strong> lors de votre visite</li><li>En cas de no-show, l''acompte peut être conservé par l''établissement</li><li>En cas d''annulation dans les délais, l''acompte est remboursé</li></ul><p>Le paiement est sécurisé via <strong>LacaissePay</strong>, notre partenaire de paiement certifié.</p>',
  '<p>The deposit is a <strong>guarantee</strong> mechanism:</p><ul><li>The establishment sets the amount (often a percentage of the menu)</li><li>It is <strong>deducted from the final bill</strong> during your visit</li><li>In case of no-show, the deposit may be kept by the establishment</li><li>If canceled on time, the deposit is refunded</li></ul><p>Payment is secured via <strong>LacaissePay</strong>, our certified payment partner.</p>',
  'paiements', 1, true, ARRAY['deposit', 'acompte', 'payment', 'guarantee']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne la facturation pour les professionnels ?',
  '<p>La facturation est bimensuelle avec un système d''appel à facture.</p>',
  'Comment fonctionne la facturation pour les professionnels ?',
  'How does billing work for professionals?',
  '<p>Le système de facturation sam.ma fonctionne par <strong>périodes bimensuelles</strong> :</p><ol><li><strong>1er au 15</strong> et <strong>16 au dernier jour</strong> de chaque mois</li><li>À la clôture de chaque période, un récapitulatif des commissions est généré</li><li>Le professionnel soumet un <strong>appel à facture</strong> depuis son espace</li><li>L''équipe sam.ma valide la facture</li><li>Le virement est exécuté dans les délais convenus</li></ol><p>Les factures sont générées automatiquement via <strong>VosFactures</strong> et téléchargeables en PDF.</p>',
  '<p>The sam.ma billing system works in <strong>semi-monthly periods</strong>:</p><ol><li><strong>1st to 15th</strong> and <strong>16th to last day</strong> of each month</li><li>At the close of each period, a commission summary is generated</li><li>The professional submits an <strong>invoice request</strong> from their dashboard</li><li>The sam.ma team validates the invoice</li><li>Payment is executed within the agreed timeframe</li></ol><p>Invoices are automatically generated via <strong>VosFactures</strong> and downloadable as PDF.</p>',
  'paiements', 2, true, ARRAY['billing', 'facturation', 'commission', 'invoice', 'pro']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Quel est le taux de commission sur les réservations et les packs ?',
  '<p>La commission par défaut est de 15% sur les acomptes de réservation et les ventes de packs.</p>',
  'Quel est le taux de commission sur les réservations et les packs ?',
  'What is the commission rate on reservations and packs?',
  '<p>Les taux de commission sam.ma :</p><ul><li><strong>Réservations (acompte) :</strong> 15% par défaut</li><li><strong>Ventes de Packs :</strong> 15% par défaut</li><li><strong>Autres services :</strong> varient selon le type</li></ul><p>Des taux <strong>personnalisés</strong> peuvent être négociés avec l''équipe commerciale sam.ma. Les commissions sont calculées sur le montant HT et détaillées dans chaque facture.</p>',
  '<p>sam.ma commission rates:</p><ul><li><strong>Reservations (deposit):</strong> 15% by default</li><li><strong>Pack sales:</strong> 15% by default</li><li><strong>Other services:</strong> vary by type</li></ul><p><strong>Custom</strong> rates can be negotiated with the sam.ma sales team. Commissions are calculated on the pre-tax amount and detailed in each invoice.</p>',
  'paiements', 3, true, ARRAY['commission', 'rate', 'percentage', 'pro']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : comptes_utilisateurs
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment créer un compte et me connecter ?',
  '<p>Créez un compte avec votre email ou connectez-vous avec Google/Apple.</p>',
  'Comment créer un compte et me connecter ?',
  'How do I create an account and log in?',
  '<p>Pour créer un compte :</p><ol><li>Cliquez sur <strong>"Se connecter"</strong> en haut de la page</li><li>Choisissez entre : <strong>Email + mot de passe</strong>, <strong>Google</strong>, ou <strong>Apple</strong></li><li>Confirmez votre adresse email (un lien de vérification vous sera envoyé)</li></ol><p><strong>Important :</strong> La vérification email est nécessaire pour effectuer des réservations et accéder à toutes les fonctionnalités.</p>',
  '<p>To create an account:</p><ol><li>Click <strong>"Sign in"</strong> at the top of the page</li><li>Choose between: <strong>Email + password</strong>, <strong>Google</strong>, or <strong>Apple</strong></li><li>Confirm your email address (a verification link will be sent)</li></ol><p><strong>Important:</strong> Email verification is required to make reservations and access all features.</p>',
  'comptes_utilisateurs', 1, true, ARRAY['account', 'login', 'signup', 'register']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment laisser un avis sur un établissement ?',
  '<p>Vous pouvez laisser un avis après avoir visité un établissement via une réservation confirmée.</p>',
  'Comment laisser un avis sur un établissement ?',
  'How do I leave a review for an establishment?',
  '<p>Pour laisser un avis :</p><ol><li>Vous devez avoir une <strong>réservation honorée</strong> (check-in effectué)</li><li>Après votre visite, vous recevrez une <strong>invitation à donner votre avis</strong></li><li>Vous pouvez aussi aller dans <strong>"Mes Réservations"</strong> → réservations passées → <strong>"Donner un avis"</strong></li><li>Notez l''établissement et rédigez votre commentaire</li></ol><p>Les avis sont <strong>modérés</strong> par l''équipe sam.ma avant publication. Laisser un avis vous rapporte <strong>+1 point</strong> de fiabilité.</p>',
  '<p>To leave a review:</p><ol><li>You must have an <strong>honored reservation</strong> (check-in completed)</li><li>After your visit, you''ll receive a <strong>review invitation</strong></li><li>You can also go to <strong>"My Reservations"</strong> → past reservations → <strong>"Leave a review"</strong></li><li>Rate the establishment and write your comment</li></ol><p>Reviews are <strong>moderated</strong> by the sam.ma team before publication. Leaving a review earns you <strong>+1 reliability point</strong>.</p>',
  'comptes_utilisateurs', 2, true, ARRAY['review', 'avis', 'rating', 'moderation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment utiliser Sam, l''assistant IA ?',
  '<p>Sam est le concierge intelligent de sam.ma qui vous aide à trouver et réserver.</p>',
  'Comment utiliser Sam, l''assistant IA ?',
  'How do I use Sam, the AI assistant?',
  '<p><strong>Sam</strong> est le premier concierge IA de réservation au Maroc :</p><ul><li>Cliquez sur le <strong>bouton flottant</strong> en bas à droite de l''écran</li><li>Sélectionnez <strong>"Sam AI"</strong></li><li>Posez votre question en <strong>français, anglais ou darija</strong></li></ul><p><strong>Sam peut :</strong></p><ul><li>Chercher des restaurants, hôtels, spas, activités...</li><li>Consulter les menus, horaires, adresses et avis</li><li>Vérifier la disponibilité en temps réel</li><li>Vous guider dans la réservation</li><li>Vous surprendre avec des recommandations personnalisées</li></ul><p>Sam utilise uniquement les données de sam.ma et ne recommande que des établissements vérifiés.</p>',
  '<p><strong>Sam</strong> is Morocco''s first AI booking concierge:</p><ul><li>Click the <strong>floating button</strong> at the bottom right of the screen</li><li>Select <strong>"Sam AI"</strong></li><li>Ask your question in <strong>French, English, or Darija</strong></li></ul><p><strong>Sam can:</strong></p><ul><li>Search for restaurants, hotels, spas, activities...</li><li>Check menus, hours, addresses, and reviews</li><li>Verify real-time availability</li><li>Guide you through the booking process</li><li>Surprise you with personalized recommendations</li></ul><p>Sam only uses sam.ma data and only recommends verified establishments.</p>',
  'comptes_utilisateurs', 3, true, ARRAY['sam', 'ai', 'assistant', 'concierge', 'chatbot']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : comptes_pro
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Je suis un établissement : comment créer un compte PRO ?',
  '<p>Créez votre compte pro pour gérer vos réservations, menus et visibilité.</p>',
  'Je suis un établissement : comment créer un compte PRO ?',
  'I''m an establishment: how do I create a PRO account?',
  '<p>Pour créer un compte PRO :</p><ol><li>Rendez-vous sur <strong>sam.ma/pro</strong></li><li>Cliquez sur <strong>"Créer un compte professionnel"</strong></li><li>Renseignez les informations de votre établissement</li><li>Votre compte sera vérifié par notre équipe sous 24-48h</li></ol><p>Une fois validé, vous aurez accès à votre <strong>tableau de bord</strong> complet : réservations, menu digital, avis, statistiques, messagerie, et plus.</p>',
  '<p>To create a PRO account:</p><ol><li>Go to <strong>sam.ma/pro</strong></li><li>Click <strong>"Create a professional account"</strong></li><li>Fill in your establishment information</li><li>Your account will be verified by our team within 24-48h</li></ol><p>Once validated, you''ll have access to your full <strong>dashboard</strong>: reservations, digital menu, reviews, statistics, messaging, and more.</p>',
  'comptes_pro', 1, true, ARRAY['pro', 'account', 'create', 'establishment']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne la messagerie avec les clients ?',
  '<p>La messagerie pro permet de communiquer directement avec vos clients ayant une réservation.</p>',
  'Comment fonctionne la messagerie avec les clients ?',
  'How does messaging with clients work?',
  '<p>La <strong>messagerie pro</strong> (onglet "Messages") vous permet de :</p><ul><li>Voir toutes les <strong>conversations liées à vos réservations</strong></li><li>Répondre aux messages des clients en <strong>temps réel</strong></li><li>Envoyer des <strong>pièces jointes</strong> (images, PDF)</li><li>Configurer des <strong>réponses automatiques</strong> (horaires, vacances)</li><li>Marquer les conversations comme lues/non lues</li></ul><p><strong>Réponses automatiques :</strong> Allez dans Paramètres → Réponses auto pour configurer un message automatique en dehors de vos heures de disponibilité ou pendant vos congés.</p>',
  '<p>The <strong>pro messaging</strong> ("Messages" tab) allows you to:</p><ul><li>See all <strong>conversations linked to your reservations</strong></li><li>Reply to client messages in <strong>real-time</strong></li><li>Send <strong>attachments</strong> (images, PDF)</li><li>Set up <strong>auto-replies</strong> (schedule, vacation mode)</li><li>Mark conversations as read/unread</li></ul><p><strong>Auto-replies:</strong> Go to Settings → Auto-replies to configure an automatic message outside your availability hours or during your holidays.</p>',
  'comptes_pro', 2, true, ARRAY['messaging', 'chat', 'auto-reply', 'communication']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment gérer les rôles et permissions de mon équipe ?',
  '<p>Attribuez des rôles et personnalisez les permissions de chaque membre de votre équipe.</p>',
  'Comment gérer les rôles et permissions de mon équipe ?',
  'How do I manage my team''s roles and permissions?',
  '<p>Le système de <strong>permissions par rôle</strong> (onglet "Équipe") :</p><p><strong>5 rôles disponibles :</strong></p><ul><li><strong>Propriétaire :</strong> tous les accès (non modifiable)</li><li><strong>Manager :</strong> gestion complète sauf équipe</li><li><strong>Réception :</strong> réservations et scanner QR</li><li><strong>Comptabilité :</strong> facturation et finances</li><li><strong>Marketing :</strong> offres, packs et visibilité</li></ul><p><strong>6 catégories de permissions :</strong> profil, équipe (propriétaire uniquement), réservations, facturation, inventaire, offres.</p><p>Le propriétaire peut <strong>personnaliser</strong> les permissions de chaque rôle depuis la matrice de permissions dans l''onglet Équipe.</p>',
  '<p>The <strong>role-based permissions</strong> system ("Team" tab):</p><p><strong>5 available roles:</strong></p><ul><li><strong>Owner:</strong> full access (not modifiable)</li><li><strong>Manager:</strong> full management except team</li><li><strong>Reception:</strong> reservations and QR scanner</li><li><strong>Accounting:</strong> billing and finances</li><li><strong>Marketing:</strong> offers, packs and visibility</li></ul><p><strong>6 permission categories:</strong> profile, team (owner only), reservations, billing, inventory, offers.</p><p>The owner can <strong>customize</strong> permissions for each role from the permissions matrix in the Team tab.</p>',
  'comptes_pro', 3, true, ARRAY['team', 'roles', 'permissions', 'owner', 'manager']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment utiliser le scanner QR pour valider les réservations ?',
  '<p>Scannez le QR code des clients pour confirmer leur présence.</p>',
  'Comment utiliser le scanner QR pour valider les réservations ?',
  'How do I use the QR scanner to validate reservations?',
  '<p>Pour valider une réservation par QR code :</p><ol><li>Allez dans l''onglet <strong>"Scanner QR"</strong> de votre espace pro</li><li>Autorisez l''accès à la <strong>caméra</strong> de votre appareil</li><li>Scannez le <strong>QR code</strong> présenté par le client</li><li>La réservation est automatiquement validée (<strong>check-in</strong>)</li></ol><p>Le scan déclenche automatiquement :</p><ul><li>La confirmation de présence du client</li><li>La mise à jour du statut de la réservation</li><li>Le calcul des points de fiabilité du client (+5 pts)</li></ul>',
  '<p>To validate a reservation via QR code:</p><ol><li>Go to the <strong>"QR Scanner"</strong> tab in your pro dashboard</li><li>Allow <strong>camera</strong> access on your device</li><li>Scan the <strong>QR code</strong> presented by the client</li><li>The reservation is automatically validated (<strong>check-in</strong>)</li></ol><p>Scanning automatically triggers:</p><ul><li>Client presence confirmation</li><li>Reservation status update</li><li>Client reliability points calculation (+5 pts)</li></ul>',
  'comptes_pro', 4, true, ARRAY['qr', 'scanner', 'check-in', 'validation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment gérer mes capacités et créneaux ?',
  '<p>Configurez la capacité de votre établissement et les créneaux disponibles.</p>',
  'Comment gérer mes capacités et créneaux ?',
  'How do I manage my capacity and time slots?',
  '<p>Dans l''onglet <strong>"Réservations"</strong> → <strong>"Capacité"</strong> :</p><ul><li>Définissez le <strong>nombre de places total</strong> par créneau</li><li>Configurez les <strong>horaires d''ouverture</strong> par jour</li><li>Créez des <strong>créneaux spéciaux</strong> (brunch du dimanche, soirées thématiques)</li><li>Activez les <strong>remises sur créneau</strong> pour les heures creuses</li></ul><p>Le système gère automatiquement un <strong>buffer</strong> entre réservations gratuites et payantes pour optimiser votre taux de remplissage.</p>',
  '<p>In the <strong>"Reservations"</strong> tab → <strong>"Capacity"</strong>:</p><ul><li>Set the <strong>total number of seats</strong> per time slot</li><li>Configure <strong>opening hours</strong> by day</li><li>Create <strong>special slots</strong> (Sunday brunch, themed evenings)</li><li>Enable <strong>slot discounts</strong> for off-peak hours</li></ul><p>The system automatically manages a <strong>buffer</strong> between free and paid reservations to optimize your occupancy rate.</p>',
  'comptes_pro', 5, true, ARRAY['capacity', 'slots', 'availability', 'schedule']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : packs_offres
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'À quoi servent les packs et offres ?',
  '<p>Les packs sont des offres spéciales proposées par les établissements.</p>',
  'À quoi servent les packs et offres ?',
  'What are packs and offers for?',
  '<p>Les <strong>Packs</strong> sont des offres spéciales créées par les établissements :</p><ul><li><strong>Réductions</strong> sur des menus, soins, activités</li><li><strong>Multi-usage</strong> : certains packs permettent plusieurs utilisations (ex: 5 entrées spa)</li><li><strong>Durée limitée</strong> : les packs ont des dates de validité</li><li><strong>Stock limité</strong> : nombre de places disponibles affiché</li></ul><p>Chaque pack acheté génère un <strong>QR code</strong> que vous présentez à l''établissement pour utilisation.</p>',
  '<p><strong>Packs</strong> are special offers created by establishments:</p><ul><li><strong>Discounts</strong> on menus, treatments, activities</li><li><strong>Multi-use</strong>: some packs allow multiple uses (e.g., 5 spa entries)</li><li><strong>Limited time</strong>: packs have validity dates</li><li><strong>Limited stock</strong>: number of available spots displayed</li></ul><p>Each purchased pack generates a <strong>QR code</strong> that you present at the establishment for use.</p>',
  'packs_offres', 1, true, ARRAY['packs', 'offers', 'deals', 'promotions']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment acheter et utiliser un Pack ?',
  '<p>Achetez un pack en ligne et utilisez-le via QR code sur place.</p>',
  'Comment acheter et utiliser un Pack ?',
  'How do I buy and use a Pack?',
  '<p><strong>Acheter un Pack :</strong></p><ol><li>Parcourez les packs sur la page <strong>/packs</strong> ou sur la fiche d''un établissement</li><li>Sélectionnez le pack souhaité</li><li>Appliquez un <strong>code promo</strong> si vous en avez un</li><li>Procédez au paiement</li></ol><p><strong>Utiliser un Pack :</strong></p><ol><li>Allez dans <strong>"Mes Packs"</strong> dans votre profil</li><li>Présentez le <strong>QR code</strong> à l''établissement</li><li>Le professionnel scanne le code pour valider l''utilisation</li><li>Pour les packs multi-usage, le compteur d''utilisations se met à jour automatiquement</li></ol>',
  '<p><strong>Buying a Pack:</strong></p><ol><li>Browse packs on the <strong>/packs</strong> page or on an establishment''s listing</li><li>Select the desired pack</li><li>Apply a <strong>promo code</strong> if you have one</li><li>Proceed to payment</li></ol><p><strong>Using a Pack:</strong></p><ol><li>Go to <strong>"My Packs"</strong> in your profile</li><li>Show the <strong>QR code</strong> at the establishment</li><li>The professional scans the code to validate usage</li><li>For multi-use packs, the usage counter updates automatically</li></ol>',
  'packs_offres', 2, true, ARRAY['buy', 'purchase', 'use', 'qr-code', 'scan']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment obtenir un remboursement sur un Pack ?',
  '<p>Les packs peuvent être remboursés sous certaines conditions.</p>',
  'Comment obtenir un remboursement sur un Pack ?',
  'How do I get a refund on a Pack?',
  '<p>La politique de remboursement des Packs :</p><ul><li><strong>Plus de 14 jours avant expiration :</strong> Remboursement intégral</li><li><strong>Moins de 14 jours + crédit préféré :</strong> 100% en crédit sam.ma</li><li><strong>Moins de 14 jours :</strong> Remboursement à 50%</li><li><strong>Pack expiré ou entièrement consommé :</strong> Pas de remboursement</li></ul><p>Pour demander un remboursement :</p><ol><li>Allez dans <strong>"Mes Packs"</strong></li><li>Sélectionnez le pack concerné</li><li>Cliquez sur <strong>"Demander un remboursement"</strong></li></ol>',
  '<p>Pack refund policy:</p><ul><li><strong>More than 14 days before expiry:</strong> Full refund</li><li><strong>Less than 14 days + credit preferred:</strong> 100% as sam.ma credit</li><li><strong>Less than 14 days:</strong> 50% refund</li><li><strong>Expired or fully consumed pack:</strong> No refund</li></ul><p>To request a refund:</p><ol><li>Go to <strong>"My Packs"</strong></li><li>Select the concerned pack</li><li>Click <strong>"Request a refund"</strong></li></ol>',
  'packs_offres', 3, true, ARRAY['refund', 'remboursement', 'policy', 'credit']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment utiliser un code promo ?',
  '<p>Appliquez un code promo lors de l''achat d''un pack ou d''une réservation.</p>',
  'Comment utiliser un code promo ?',
  'How do I use a promo code?',
  '<p>Pour utiliser un code promo :</p><ol><li>Lors de l''achat d''un <strong>Pack</strong>, cliquez sur <strong>"J''ai un code promo"</strong></li><li>Saisissez votre code et cliquez sur <strong>"Appliquer"</strong></li><li>La réduction s''affiche immédiatement sur le prix</li></ol><p><strong>Types de codes promo :</strong></p><ul><li><strong>Codes établissement :</strong> créés par les professionnels pour leurs packs</li><li><strong>Codes plateforme :</strong> créés par sam.ma pour des opérations spéciales</li></ul><p>Certains codes sont limités (premier achat, date de validité, nombre d''utilisations max).</p>',
  '<p>To use a promo code:</p><ol><li>When buying a <strong>Pack</strong>, click <strong>"I have a promo code"</strong></li><li>Enter your code and click <strong>"Apply"</strong></li><li>The discount is immediately shown on the price</li></ol><p><strong>Types of promo codes:</strong></p><ul><li><strong>Establishment codes:</strong> created by professionals for their packs</li><li><strong>Platform codes:</strong> created by sam.ma for special operations</li></ul><p>Some codes are limited (first purchase, validity date, max usage count).</p>',
  'packs_offres', 4, true, ARRAY['promo', 'code', 'discount', 'coupon']::text[], NOW(), NOW()
);

-- ---------------------------------------------------------------------------
-- CATÉGORIE : support_general
-- ---------------------------------------------------------------------------

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment contacter le support ?',
  '<p>Contactez-nous par chat, ticket ou email.</p>',
  'Comment contacter le support ?',
  'How do I contact support?',
  '<p>Plusieurs moyens de nous contacter :</p><ul><li><strong>Chat en direct :</strong> Disponible de 9h à 19h dans l''onglet Assistance. Cliquez sur le champ de chat et écrivez votre message.</li><li><strong>Tickets support :</strong> Créez un ticket pour les demandes complexes. Vous recevrez une réponse sous 24h (2h pour les urgences).</li><li><strong>Email :</strong> support@sortiraumaroc.com</li></ul><p>Pour les professionnels, le support est accessible directement depuis votre <strong>espace pro → Assistance</strong>.</p>',
  '<p>Several ways to contact us:</p><ul><li><strong>Live chat:</strong> Available 9am-7pm in the Assistance tab. Click the chat field and type your message.</li><li><strong>Support tickets:</strong> Create a ticket for complex requests. You''ll receive a response within 24h (2h for urgent issues).</li><li><strong>Email:</strong> support@sortiraumaroc.com</li></ul><p>For professionals, support is accessible directly from your <strong>pro dashboard → Assistance</strong>.</p>',
  'support_general', 1, true, ARRAY['contact', 'support', 'help', 'chat', 'ticket']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment fonctionne le programme de fidélité ?',
  '<p>Gagnez des points à chaque réservation honorée et débloquez des avantages.</p>',
  'Comment fonctionne le programme de fidélité ?',
  'How does the loyalty program work?',
  '<p>Le <strong>programme de fidélité</strong> sam.ma vous récompense pour votre activité :</p><ul><li><strong>Gagnez des points</strong> à chaque réservation honorée, avis déposé, et participation aux événements</li><li><strong>Montez de niveau</strong> : Bronze → Argent → Or → Platine</li><li><strong>Débloquez des avantages</strong> : réductions exclusives, accès prioritaire, offres VIP</li></ul><p>Consultez votre solde de points et votre niveau dans votre <strong>profil</strong> → section <strong>"Fidélité"</strong>.</p>',
  '<p>The sam.ma <strong>loyalty program</strong> rewards your activity:</p><ul><li><strong>Earn points</strong> with each honored reservation, review posted, and event participation</li><li><strong>Level up</strong>: Bronze → Silver → Gold → Platinum</li><li><strong>Unlock benefits</strong>: exclusive discounts, priority access, VIP offers</li></ul><p>Check your points balance and level in your <strong>profile</strong> → <strong>"Loyalty"</strong> section.</p>',
  'support_general', 2, true, ARRAY['loyalty', 'fidelite', 'points', 'rewards', 'levels']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Qu''est-ce que la politique anti no-show de sam.ma ?',
  '<p>sam.ma applique une politique stricte contre les no-shows pour protéger les établissements.</p>',
  'Qu''est-ce que la politique anti no-show de sam.ma ?',
  'What is sam.ma''s anti no-show policy?',
  '<p>Pour protéger nos partenaires établissements, sam.ma applique une <strong>politique anti no-show</strong> progressive :</p><ul><li><strong>1er no-show :</strong> Avertissement + pénalité scoring (-15 pts)</li><li><strong>3 no-shows consécutifs :</strong> Suspension temporaire de 7 jours</li><li><strong>5 no-shows cumulés :</strong> Suspension de 30 jours</li></ul><p><strong>Processus de litige :</strong></p><ol><li>Le professionnel déclare un no-show</li><li>Vous avez <strong>48 heures</strong> pour contester</li><li>Si vous contestez, un arbitrage est réalisé par l''équipe sam.ma</li><li>Si vous ne répondez pas dans les 48h, le no-show est confirmé automatiquement</li></ol><p>Les suspensions sont <strong>levées automatiquement</strong> à leur expiration.</p>',
  '<p>To protect our partner establishments, sam.ma applies a <strong>progressive anti no-show policy</strong>:</p><ul><li><strong>1st no-show:</strong> Warning + scoring penalty (-15 pts)</li><li><strong>3 consecutive no-shows:</strong> 7-day temporary suspension</li><li><strong>5 cumulative no-shows:</strong> 30-day suspension</li></ul><p><strong>Dispute process:</strong></p><ol><li>The professional declares a no-show</li><li>You have <strong>48 hours</strong> to dispute</li><li>If you dispute, arbitration is handled by the sam.ma team</li><li>If you don''t respond within 48h, the no-show is automatically confirmed</li></ol><p>Suspensions are <strong>automatically lifted</strong> upon expiry.</p>',
  'support_general', 3, true, ARRAY['no-show', 'policy', 'suspension', 'dispute', 'anti-fraud']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment créer et gérer des Packs en tant que professionnel ?',
  '<p>Les professionnels peuvent créer des packs spéciaux pour attirer des clients.</p>',
  'Comment créer et gérer des Packs en tant que professionnel ?',
  'How do I create and manage Packs as a professional?',
  '<p>Pour créer un Pack depuis votre espace pro :</p><ol><li>Allez dans <strong>"Packs & Promotions"</strong></li><li>Cliquez sur <strong>"Nouveau Pack"</strong></li><li>Renseignez : titre, description, prix, réduction, photos, conditions</li><li>Configurez : stock disponible, dates de validité, jours/horaires valides</li><li>Soumettez le pack pour <strong>modération</strong></li></ol><p>Après validation par l''équipe sam.ma, votre pack sera publié. Vous pouvez ensuite :</p><ul><li><strong>Suspendre/reprendre</strong> les ventes temporairement</li><li><strong>Dupliquer</strong> un pack existant pour en créer un nouveau</li><li><strong>Consulter les statistiques</strong> de ventes</li><li><strong>Scanner les QR codes</strong> des clients pour valider l''utilisation</li></ul>',
  '<p>To create a Pack from your pro dashboard:</p><ol><li>Go to <strong>"Packs & Promotions"</strong></li><li>Click <strong>"New Pack"</strong></li><li>Fill in: title, description, price, discount, photos, conditions</li><li>Configure: available stock, validity dates, valid days/hours</li><li>Submit the pack for <strong>moderation</strong></li></ol><p>After validation by the sam.ma team, your pack will be published. You can then:</p><ul><li><strong>Suspend/resume</strong> sales temporarily</li><li><strong>Duplicate</strong> an existing pack to create a new one</li><li><strong>Check sales statistics</strong></li><li><strong>Scan QR codes</strong> from clients to validate usage</li></ul>',
  'comptes_pro', 6, true, ARRAY['packs', 'create', 'manage', 'pro', 'moderation']::text[], NOW(), NOW()
);

INSERT INTO faq_articles (title, body, question_fr, question_en, answer_html_fr, answer_html_en, category, display_order, is_published, tags, created_at, updated_at)
VALUES (
  'Comment contester une facture de commission ?',
  '<p>Si vous n''êtes pas d''accord avec une facture, vous pouvez la contester.</p>',
  'Comment contester une facture de commission ?',
  'How do I dispute a commission invoice?',
  '<p>Pour contester une facture de commission :</p><ol><li>Allez dans <strong>"Finances"</strong> → <strong>"Périodes"</strong></li><li>Sélectionnez la période concernée</li><li>Cliquez sur <strong>"Contester"</strong></li><li>Décrivez le motif de votre contestation</li></ol><p><strong>Processus :</strong></p><ul><li>L''équipe sam.ma examine votre contestation sous <strong>5 jours</strong></li><li>Si acceptée : un avoir est généré et le montant corrigé</li><li>Si rejetée : vous pouvez <strong>escalader</strong> la contestation pour un second examen</li></ul>',
  '<p>To dispute a commission invoice:</p><ol><li>Go to <strong>"Finances"</strong> → <strong>"Periods"</strong></li><li>Select the concerned period</li><li>Click <strong>"Dispute"</strong></li><li>Describe the reason for your dispute</li></ol><p><strong>Process:</strong></p><ul><li>The sam.ma team reviews your dispute within <strong>5 days</strong></li><li>If accepted: a credit note is generated and the amount corrected</li><li>If rejected: you can <strong>escalate</strong> the dispute for a second review</li></ul>',
  'comptes_pro', 7, true, ARRAY['dispute', 'invoice', 'billing', 'contest', 'commission']::text[], NOW(), NOW()
);

COMMIT;


-- ============================================================
-- FILE: 20260213_notifications_banners_wheel.sql
-- ============================================================

-- =============================================================================
-- Notifications, Bannières, Push Marketing & Roue de la Chance
-- Migration SQL — sam.ma — 13 Février 2026
--
-- Tables créées :
--   MODULE A (Notification Engine) :
--     1. notification_templates       — Templates par événement × canal × langue
--     2. notification_preferences     — Préférences notification par utilisateur
--     3. notification_logs            — Log centralisé de toutes les notifications
--   MODULE B (Push Marketing) :
--     4. push_campaigns               — Campagnes push marketing
--     5. push_campaign_deliveries     — Suivi livraison par destinataire
--   MODULE C (Bannières) :
--     6. banners                      — Configuration des bannières/pop-ups
--     7. banner_views                 — Tracking vues/clics/fermetures
--     8. banner_form_responses        — Réponses formulaires bannières
--   MODULE D (Roue de la Chance) :
--     9. wheel_events                 — Événements Roue de la Chance
--    10. wheel_prizes                 — Lots/segments de la roue
--    11. wheel_external_codes         — Pool de codes externes partenaires
--    12. wheel_spins                  — Historique des spins
--   Extension :
--    13. ALTER platform_gift_distributions — Ajout colonne source
-- =============================================================================

BEGIN;

-- =============================================================================
-- MODULE A — NOTIFICATION ENGINE
-- =============================================================================

-- 1. notification_templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  lang VARCHAR(5) NOT NULL DEFAULT 'fr',

  -- Contenu
  subject TEXT DEFAULT NULL,       -- Sujet (email/push)
  body TEXT NOT NULL,              -- Corps du message
  cta_url TEXT DEFAULT NULL,       -- Lien d'action
  cta_label TEXT DEFAULT NULL,     -- Libellé du bouton

  -- Métadonnées
  variables_schema JSONB DEFAULT '[]'::jsonb,  -- [{name, description, required}]
  is_critical BOOLEAN DEFAULT false,            -- Non désactivable par l'utilisateur
  module VARCHAR(30) NOT NULL CHECK (module IN (
    'reservation', 'loyalty', 'packs', 'reviews', 'account', 'system', 'marketing', 'wheel'
  )),
  enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_notification_template UNIQUE (event_type, channel, lang)
);

CREATE INDEX IF NOT EXISTS idx_notif_tpl_event ON notification_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_tpl_module ON notification_templates(module);

-- 2. notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('consumer', 'pro')),

  -- Préférences par canal
  email_transactional BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,

  -- Préférences par catégorie
  reservation_reminders BOOLEAN DEFAULT true,
  loyalty_reminders BOOLEAN DEFAULT true,
  marketing_push BOOLEAN DEFAULT true,

  -- Langue
  preferred_lang VARCHAR(5) DEFAULT 'fr',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),

  -- Destinataire
  recipient_id TEXT NOT NULL,
  recipient_type VARCHAR(10) NOT NULL CHECK (recipient_type IN ('consumer', 'pro', 'admin')),

  -- Template utilisé
  template_id UUID DEFAULT NULL REFERENCES notification_templates(id) ON DELETE SET NULL,
  subject TEXT DEFAULT NULL,
  body_preview VARCHAR(200) DEFAULT NULL,

  -- Statut
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'failed', 'read'
  )),
  provider_message_id TEXT DEFAULT NULL,  -- SES Message ID, Twilio SID, FCM message ID
  error_message TEXT DEFAULT NULL,

  -- Métadonnées
  metadata JSONB DEFAULT '{}'::jsonb,
  campaign_id UUID DEFAULT NULL,  -- FK vers push_campaigns si marketing

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  read_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_log_recipient ON notification_logs(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_event ON notification_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_log_campaign ON notification_logs(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_log_status ON notification_logs(status) WHERE status IN ('pending', 'failed');

-- =============================================================================
-- MODULE B — PUSH MARKETING
-- =============================================================================

-- 4. push_campaigns
CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contenu
  title VARCHAR(60) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'nouveau_restaurant', 'offre', 'blog', 'video', 'evenement',
    'selection', 'saison', 'update', 'custom'
  )),
  image_url TEXT DEFAULT NULL,
  cta_url TEXT NOT NULL,

  -- Canaux (push, in_app, email)
  channels TEXT[] NOT NULL DEFAULT '{push}',

  -- Audience
  audience_type VARCHAR(10) NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all', 'segment')),
  audience_filters JSONB DEFAULT '{}'::jsonb,
  audience_count INTEGER DEFAULT 0,

  -- Priorité & statut
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status VARCHAR(15) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'sending', 'sent', 'cancelled'
  )),

  -- Programmation
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  cancelled_at TIMESTAMPTZ DEFAULT NULL,

  -- Statistiques
  stats_sent INTEGER DEFAULT 0,
  stats_delivered INTEGER DEFAULT 0,
  stats_opened INTEGER DEFAULT 0,
  stats_clicked INTEGER DEFAULT 0,
  stats_failed INTEGER DEFAULT 0,
  stats_unsubscribed INTEGER DEFAULT 0,

  -- Audit
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_status ON push_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_push_campaign_scheduled ON push_campaigns(scheduled_at)
  WHERE status = 'scheduled';

-- 5. push_campaign_deliveries
CREATE TABLE IF NOT EXISTS push_campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL,

  -- Statut
  status VARCHAR(15) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'failed'
  )),

  -- Tracking
  sent_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  opened_at TIMESTAMPTZ DEFAULT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NULL,
  error_message TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_campaign_delivery UNIQUE (campaign_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_campaign ON push_campaign_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user ON push_campaign_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user_today ON push_campaign_deliveries(user_id, created_at)
  WHERE status IN ('sent', 'delivered');

-- =============================================================================
-- MODULE C — BANNIÈRES & POP-UPS
-- =============================================================================

-- 6. banners
CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name VARCHAR(200) NOT NULL,

  -- Type
  type VARCHAR(20) NOT NULL CHECK (type IN (
    'image_simple', 'image_text', 'video', 'form', 'carousel', 'countdown'
  )),

  -- Contenu principal
  title VARCHAR(80) DEFAULT NULL,
  subtitle VARCHAR(150) DEFAULT NULL,
  media_url TEXT DEFAULT NULL,
  media_type VARCHAR(10) DEFAULT NULL CHECK (media_type IS NULL OR media_type IN ('image', 'video')),

  -- CTA principal
  cta_text VARCHAR(50) DEFAULT NULL,
  cta_url TEXT DEFAULT NULL,
  cta_target VARCHAR(10) DEFAULT 'same_tab' CHECK (cta_target IN ('same_tab', 'new_tab', 'external')),

  -- CTA secondaire
  secondary_cta_text VARCHAR(50) DEFAULT NULL,
  secondary_cta_url TEXT DEFAULT NULL,

  -- Contenu spécifique par type
  carousel_slides JSONB DEFAULT NULL,       -- [{image_url, title, subtitle}]
  countdown_target TIMESTAMPTZ DEFAULT NULL, -- Pour type countdown

  -- Formulaire (si type = form)
  form_fields JSONB DEFAULT NULL,            -- [{label, type, required, options?}]
  form_confirmation_message TEXT DEFAULT NULL,
  form_notify_email TEXT DEFAULT NULL,        -- Email admin notifié à chaque soumission

  -- Affichage
  display_format VARCHAR(15) NOT NULL DEFAULT 'modal' CHECK (display_format IN (
    'modal', 'bottom_sheet', 'top_banner', 'floating'
  )),
  animation VARCHAR(12) DEFAULT 'fade' CHECK (animation IN (
    'fade', 'slide_up', 'slide_down', 'zoom', 'none'
  )),
  overlay_color VARCHAR(20) DEFAULT '#000000',
  overlay_opacity SMALLINT DEFAULT 50 CHECK (overlay_opacity >= 0 AND overlay_opacity <= 100),
  close_behavior VARCHAR(20) DEFAULT 'always_visible' CHECK (close_behavior IN (
    'always_visible', 'after_delay', 'require_interaction'
  )),
  close_delay_seconds SMALLINT DEFAULT 0,
  appear_delay_type VARCHAR(15) DEFAULT 'immediate' CHECK (appear_delay_type IN (
    'immediate', 'after_seconds', 'after_scroll'
  )),
  appear_delay_value INTEGER DEFAULT 0,

  -- Ciblage
  audience_type VARCHAR(10) DEFAULT 'all' CHECK (audience_type IN ('all', 'segment')),
  audience_filters JSONB DEFAULT '{}'::jsonb,
  trigger VARCHAR(20) DEFAULT 'on_app_open' CHECK (trigger IN (
    'on_login', 'on_app_open', 'on_page', 'after_inactivity'
  )),
  trigger_page TEXT DEFAULT NULL,             -- URL/path pour trigger on_page
  frequency VARCHAR(15) DEFAULT 'once' CHECK (frequency IN (
    'once', 'daily', 'weekly', 'every_session'
  )),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  priority SMALLINT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  platform VARCHAR(10) DEFAULT 'both' CHECK (platform IN ('web', 'mobile', 'both')),

  -- Statut
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'paused', 'expired', 'disabled'
  )),

  -- Statistiques (compteurs dénormalisés)
  stats_impressions INTEGER DEFAULT 0,
  stats_clicks INTEGER DEFAULT 0,
  stats_closes INTEGER DEFAULT 0,
  stats_form_submissions INTEGER DEFAULT 0,

  -- Audit
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banners_status ON banners(status);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(priority DESC, start_date, end_date)
  WHERE status = 'active';

-- 7. banner_views
CREATE TABLE IF NOT EXISTS banner_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  user_id TEXT DEFAULT NULL,
  session_id TEXT DEFAULT NULL,
  action VARCHAR(15) NOT NULL CHECK (action IN ('view', 'click', 'close', 'form_submit')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_views_banner ON banner_views(banner_id, action);
CREATE INDEX IF NOT EXISTS idx_banner_views_user ON banner_views(user_id, banner_id, action)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_banner_views_date ON banner_views(created_at);

-- 8. banner_form_responses
CREATE TABLE IF NOT EXISTS banner_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  user_id TEXT DEFAULT NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_form_banner ON banner_form_responses(banner_id);

-- =============================================================================
-- MODULE D — ROUE DE LA CHANCE
-- =============================================================================

-- 9. wheel_events
CREATE TABLE IF NOT EXISTS wheel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,

  -- Période
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,

  -- Règles
  spins_per_day SMALLINT DEFAULT 1 CHECK (spins_per_day >= 1 AND spins_per_day <= 10),
  eligibility VARCHAR(10) DEFAULT 'all' CHECK (eligibility IN ('all', 'segment')),
  eligibility_filters JSONB DEFAULT '{}'::jsonb,

  -- Messages
  welcome_message TEXT DEFAULT 'Tentez votre chance et gagnez des cadeaux !',
  already_played_message TEXT DEFAULT 'Revenez demain pour une nouvelle chance !',

  -- Thème visuel
  theme JSONB DEFAULT '{}'::jsonb,
  -- Exemple : {background_image, primary_color, secondary_color, particle_type}

  -- Statut
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'paused', 'ended'
  )),

  -- Statistiques dénormalisées
  stats_total_spins INTEGER DEFAULT 0,
  stats_total_wins INTEGER DEFAULT 0,
  stats_total_losses INTEGER DEFAULT 0,

  -- Audit
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_events_status ON wheel_events(status);
CREATE INDEX IF NOT EXISTS idx_wheel_events_active ON wheel_events(start_date, end_date)
  WHERE status = 'active';

-- 10. wheel_prizes
CREATE TABLE IF NOT EXISTS wheel_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_event_id UUID NOT NULL REFERENCES wheel_events(id) ON DELETE CASCADE,

  -- Description du lot
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  type VARCHAR(25) NOT NULL CHECK (type IN (
    'physical_gift', 'percentage_discount', 'fixed_discount', 'free_service',
    'external_code', 'points', 'retry', 'nothing'
  )),

  -- Établissement partenaire (nullable pour retry/nothing/external_code)
  establishment_id UUID DEFAULT NULL,

  -- Valeur (en centimes ou pourcentage selon le type)
  value INTEGER DEFAULT NULL,
  value_currency VARCHAR(5) DEFAULT 'MAD',

  -- Stock
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),

  -- Probabilité (en %, la somme doit = 100 pour un wheel_event)
  probability DECIMAL(5, 2) NOT NULL CHECK (probability >= 0 AND probability <= 100),

  -- Lot de substitution quand stock épuisé
  substitute_prize_id UUID DEFAULT NULL REFERENCES wheel_prizes(id) ON DELETE SET NULL,

  -- Visuel
  segment_color VARCHAR(20) DEFAULT '#FF6B6B',
  segment_icon VARCHAR(50) DEFAULT NULL,

  -- Validité du cadeau gagné
  gift_validity_days INTEGER DEFAULT 7 CHECK (gift_validity_days >= 1),

  -- Conditions
  conditions TEXT DEFAULT NULL,

  -- Position sur la roue
  sort_order SMALLINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_prizes_event ON wheel_prizes(wheel_event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wheel_prizes_stock ON wheel_prizes(wheel_event_id, remaining_quantity)
  WHERE remaining_quantity > 0;

-- 11. wheel_external_codes
CREATE TABLE IF NOT EXISTS wheel_external_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID NOT NULL REFERENCES wheel_prizes(id) ON DELETE CASCADE,

  -- Code
  code TEXT NOT NULL,
  partner_name VARCHAR(200) NOT NULL,
  partner_url TEXT DEFAULT NULL,

  -- Attribution
  assigned_to TEXT DEFAULT NULL,               -- user_id du gagnant
  assigned_at TIMESTAMPTZ DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_external_code UNIQUE (prize_id, code)
);

CREATE INDEX IF NOT EXISTS idx_wheel_codes_prize ON wheel_external_codes(prize_id)
  WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_wheel_codes_user ON wheel_external_codes(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 12. wheel_spins
CREATE TABLE IF NOT EXISTS wheel_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_event_id UUID NOT NULL REFERENCES wheel_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Anti-replay
  spin_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  -- Résultat
  result VARCHAR(5) NOT NULL CHECK (result IN ('won', 'lost')),
  prize_id UUID DEFAULT NULL REFERENCES wheel_prizes(id) ON DELETE SET NULL,
  prize_name VARCHAR(100) DEFAULT NULL,        -- Snapshot du nom du lot
  prize_type VARCHAR(25) DEFAULT NULL,         -- Snapshot du type

  -- Liens vers cadeaux distribués
  gift_distribution_id UUID DEFAULT NULL,      -- FK platform_gift_distributions si cadeau physique
  external_code_id UUID DEFAULT NULL REFERENCES wheel_external_codes(id) ON DELETE SET NULL,

  -- Position sur la roue (pour animation côté client)
  segment_index SMALLINT DEFAULT 0,

  -- Anti-triche
  device_id TEXT DEFAULT NULL,
  ip_address INET DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_user ON wheel_spins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_event ON wheel_spins(wheel_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_user_day ON wheel_spins(user_id, wheel_event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_fraud ON wheel_spins(device_id, created_at)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wheel_spins_ip_fraud ON wheel_spins(ip_address, created_at)
  WHERE ip_address IS NOT NULL;

-- =============================================================================
-- EXTENSION TABLE EXISTANTE : platform_gift_distributions
-- =============================================================================

-- Ajout colonne source pour distinguer l'origine de la distribution
ALTER TABLE platform_gift_distributions
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'admin_manual';

-- Migrer les données existantes : source = distribution_method
UPDATE platform_gift_distributions
  SET source = distribution_method
  WHERE source = 'admin_manual' AND distribution_method != 'manual';

-- Index sur source pour filtrer les cadeaux roue
CREATE INDEX IF NOT EXISTS idx_platform_gift_dist_source
  ON platform_gift_distributions(source)
  WHERE source = 'wheel_of_fortune';

-- Rendre platform_gift_id nullable pour les cadeaux roue
-- (les cadeaux roue n'ont pas de platform_gift parent)
ALTER TABLE platform_gift_distributions
  ALTER COLUMN platform_gift_id DROP NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_external_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_spins ENABLE ROW LEVEL SECURITY;

-- Policies (accès via service_role, pas besoin de filtrage fin côté RLS)
DROP POLICY IF EXISTS notif_tpl_read ON notification_templates;
CREATE POLICY notif_tpl_read ON notification_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS notif_prefs_read ON notification_preferences;
CREATE POLICY notif_prefs_read ON notification_preferences FOR SELECT USING (true);
DROP POLICY IF EXISTS notif_logs_read ON notification_logs;
CREATE POLICY notif_logs_read ON notification_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS push_campaigns_read ON push_campaigns;
CREATE POLICY push_campaigns_read ON push_campaigns FOR SELECT USING (true);
DROP POLICY IF EXISTS push_deliveries_read ON push_campaign_deliveries;
CREATE POLICY push_deliveries_read ON push_campaign_deliveries FOR SELECT USING (true);
DROP POLICY IF EXISTS banners_read ON banners;
CREATE POLICY banners_read ON banners FOR SELECT USING (true);
DROP POLICY IF EXISTS banner_views_read ON banner_views;
CREATE POLICY banner_views_read ON banner_views FOR SELECT USING (true);
DROP POLICY IF EXISTS banner_form_resp_read ON banner_form_responses;
CREATE POLICY banner_form_resp_read ON banner_form_responses FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_events_read ON wheel_events;
CREATE POLICY wheel_events_read ON wheel_events FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_prizes_read ON wheel_prizes;
CREATE POLICY wheel_prizes_read ON wheel_prizes FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_ext_codes_read ON wheel_external_codes;
CREATE POLICY wheel_ext_codes_read ON wheel_external_codes FOR SELECT USING (true);
DROP POLICY IF EXISTS wheel_spins_read ON wheel_spins;
CREATE POLICY wheel_spins_read ON wheel_spins FOR SELECT USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE notification_templates IS 'Templates de notifications par événement, canal et langue';
COMMENT ON TABLE notification_preferences IS 'Préférences de notification par utilisateur (consumer ou pro)';
COMMENT ON TABLE notification_logs IS 'Log centralisé de toutes les notifications envoyées (email, SMS, push, in-app)';
COMMENT ON TABLE push_campaigns IS 'Campagnes push marketing créées par l admin';
COMMENT ON TABLE push_campaign_deliveries IS 'Suivi de livraison par destinataire pour chaque campagne';
COMMENT ON TABLE banners IS 'Bannières publicitaires et pop-ups configurables par l admin';
COMMENT ON TABLE banner_views IS 'Tracking des impressions, clics, fermetures et soumissions de bannières';
COMMENT ON TABLE banner_form_responses IS 'Réponses aux formulaires intégrés dans les bannières';
COMMENT ON TABLE wheel_events IS 'Événements Roue de la Chance (Ramadan, anniversaire, etc.)';
COMMENT ON TABLE wheel_prizes IS 'Lots/segments configurés pour chaque roue';
COMMENT ON TABLE wheel_external_codes IS 'Pool de codes externes partenaires pour les lots external_code';
COMMENT ON TABLE wheel_spins IS 'Historique de tous les spins avec résultats et données anti-triche';

COMMENT ON COLUMN platform_gift_distributions.source IS 'Origine de la distribution : admin_manual, criteria_based, first_come, wheel_of_fortune';

COMMIT;


-- ============================================================
-- FILE: 20260213_pro_messaging_tables.sql
-- ============================================================

-- =============================================================================
-- Migration: Pro Messaging Tables
-- Date: 2026-02-13
-- Description: Version-controlled schema for pro_conversations, pro_messages,
--              pro_auto_reply_settings, and message-attachments bucket.
--              These tables may already exist (created manually).
--              Using IF NOT EXISTS to be safe.
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: pro_conversations
-- One conversation per reservation, linking pro <-> client messaging
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing conversations by establishment
CREATE INDEX IF NOT EXISTS idx_pro_conversations_establishment
  ON public.pro_conversations(establishment_id, updated_at DESC);

-- Index for finding conversation by reservation
CREATE INDEX IF NOT EXISTS idx_pro_conversations_reservation
  ON public.pro_conversations(establishment_id, reservation_id);

-- Enable RLS
ALTER TABLE public.pro_conversations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABLE: pro_messages
-- Individual messages within a conversation
-- from_role: 'pro' (establishment), 'client' (consumer), 'auto' (auto-reply)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.pro_conversations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL CHECK (from_role IN ('pro', 'client', 'user', 'auto')),
  body TEXT NOT NULL DEFAULT '',
  sender_user_id UUID,
  read_by_pro_at TIMESTAMPTZ,
  read_by_client_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing messages in a conversation
CREATE INDEX IF NOT EXISTS idx_pro_messages_conversation
  ON public.pro_messages(establishment_id, conversation_id, created_at ASC);

-- Index for realtime: filter by establishment_id (used by Supabase Realtime)
CREATE INDEX IF NOT EXISTS idx_pro_messages_establishment
  ON public.pro_messages(establishment_id, created_at DESC);

-- Ensure read_by_pro_at/read_by_client_at columns exist (may be missing if table was created earlier)
ALTER TABLE public.pro_messages ADD COLUMN IF NOT EXISTS read_by_pro_at TIMESTAMPTZ;
ALTER TABLE public.pro_messages ADD COLUMN IF NOT EXISTS read_by_client_at TIMESTAMPTZ;
ALTER TABLE public.pro_messages ADD COLUMN IF NOT EXISTS sender_user_id UUID;
ALTER TABLE public.pro_messages ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

-- Index for mark-read: find unread non-pro messages
CREATE INDEX IF NOT EXISTS idx_pro_messages_unread
  ON public.pro_messages(establishment_id, conversation_id, from_role)
  WHERE read_by_pro_at IS NULL;

-- Enable RLS
ALTER TABLE public.pro_messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABLE: pro_auto_reply_settings
-- Auto-reply configuration per establishment (schedule + vacation mode)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_auto_reply_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL DEFAULT 'Bonjour, merci pour votre message. Nous sommes actuellement indisponibles mais nous vous répondrons dès que possible.',
  start_time TEXT, -- HH:MM format (e.g., '18:00')
  end_time TEXT,   -- HH:MM format (e.g., '09:00')
  days_of_week INTEGER[] DEFAULT '{}', -- 0=Sunday, 6=Saturday
  is_on_vacation BOOLEAN NOT NULL DEFAULT false,
  vacation_start TIMESTAMPTZ,
  vacation_end TIMESTAMPTZ,
  vacation_message TEXT NOT NULL DEFAULT 'Nous sommes actuellement en congés. Nous traiterons votre message à notre retour.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id)
);

-- Enable RLS
ALTER TABLE public.pro_auto_reply_settings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Enable Realtime on pro_messages for live message updates
-- =============================================================================

-- Add pro_messages to the Supabase Realtime publication
-- (safe to run even if already added — will just warn)
DO $$
BEGIN
  -- Check if table is already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'pro_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pro_messages;
  END IF;
END $$;

-- =============================================================================
-- Storage bucket for message attachments
-- =============================================================================

-- Note: Supabase Storage buckets are created via the dashboard or API,
-- not via SQL. The bucket 'message-attachments' should be created in
-- Supabase Dashboard > Storage with the following settings:
--   - Name: message-attachments
--   - Public: true (so URLs can be shared in messages)
--   - File size limit: 5MB
--   - Allowed MIME types: image/*, application/pdf, application/msword,
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document

-- Create the bucket via SQL (Supabase extension)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated uploads
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-attachments');

-- Storage policy: allow public reads
DROP POLICY IF EXISTS "Allow public reads message-attachments" ON storage.objects;
CREATE POLICY "Allow public reads message-attachments" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'message-attachments');

COMMIT;


-- ============================================================
-- FILE: 20260213_pro_role_permissions.sql
-- ============================================================

-- =============================================================================
-- Pro Role Permissions — Customizable role-based permissions per establishment
-- =============================================================================
-- Allows the Owner to customize which permissions each role has.
-- If no row exists for a given (establishment_id, role), the defaults apply
-- (matching the previously hard-coded values).
-- Owner always has ALL permissions — no row is ever created for "owner".
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pro_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'reception', 'accounting', 'marketing')),

  -- Permission flags (6 categories)
  manage_profile BOOLEAN NOT NULL DEFAULT false,
  manage_team BOOLEAN NOT NULL DEFAULT false,        -- Always false, owner-only, non-customizable
  manage_reservations BOOLEAN NOT NULL DEFAULT false,
  view_billing BOOLEAN NOT NULL DEFAULT false,
  manage_inventory BOOLEAN NOT NULL DEFAULT false,
  manage_offers BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (establishment_id, role)
);

-- Index for fast lookups by establishment
CREATE INDEX IF NOT EXISTS idx_pro_role_permissions_establishment
  ON public.pro_role_permissions(establishment_id);

-- RLS
ALTER TABLE public.pro_role_permissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pro_role_permissions IS
  'Custom permission overrides per establishment+role. If no row exists, defaults apply.';
COMMENT ON COLUMN public.pro_role_permissions.manage_team IS
  'Always false. Team management is owner-only and not customizable.';

COMMIT;


-- ============================================================
-- FILE: 20260213_sam_ai_assistant.sql
-- ============================================================

-- ============================================================================
-- Sam AI Assistant — Tables conversations et messages
-- ============================================================================
-- À exécuter dans Supabase SQL Editor (Dashboard > SQL > New query)
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. sam_conversations — une conversation par session utilisateur
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sam_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  language TEXT DEFAULT 'fr',
  started_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  message_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sam_conversations IS 'Conversations de l''assistant IA Sam';
COMMENT ON COLUMN sam_conversations.session_id IS 'ID session anonyme côté client (localStorage)';
COMMENT ON COLUMN sam_conversations.language IS 'Langue détectée : fr, en, ar (darija)';
COMMENT ON COLUMN sam_conversations.metadata IS 'Contexte: ville détectée, univers, préférences inférées';

-- --------------------------------------------------------------------------
-- 2. sam_messages — chaque message de la conversation
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sam_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES sam_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  tool_calls JSONB,
  tool_call_id TEXT,
  tool_name TEXT,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sam_messages IS 'Messages individuels des conversations Sam';
COMMENT ON COLUMN sam_messages.tool_calls IS 'Si role=assistant et GPT appelle des tools: [{id, type, function: {name, arguments}}]';
COMMENT ON COLUMN sam_messages.tool_call_id IS 'Si role=tool: ID du tool call auquel ce message répond';
COMMENT ON COLUMN sam_messages.tool_name IS 'Nom du tool appelé (pour analytics)';

-- --------------------------------------------------------------------------
-- 3. Index
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sam_conversations_user
  ON sam_conversations(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sam_conversations_session
  ON sam_conversations(session_id);

CREATE INDEX IF NOT EXISTS idx_sam_conversations_last_message
  ON sam_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_sam_messages_conversation
  ON sam_messages(conversation_id, created_at);

-- --------------------------------------------------------------------------
-- 4. RLS (service_role bypass, pas de politique publique)
-- --------------------------------------------------------------------------
ALTER TABLE sam_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sam_messages ENABLE ROW LEVEL SECURITY;

COMMIT;


-- ============================================================
-- FILE: 20260213_support_system_enhancements.sql
-- ============================================================

-- Support System Enhancements
-- Adds: ticket_number, internal_notes, agent status, Realtime publication, timer columns

BEGIN;

-- ============================================================================
-- 1. TICKET NUMBER (TK-YYYY-XXXX format)
-- ============================================================================

-- Sequence for ticket numbers (starting at 1000 to get 4-digit numbers)
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq START WITH 1000;

-- Add ticket_number column
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT UNIQUE;

-- Function to auto-generate TK-YYYY-XXXX
CREATE OR REPLACE FUNCTION generate_support_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INTEGER;
  year_str TEXT;
BEGIN
  IF NEW.ticket_number IS NULL THEN
    seq_val := nextval('support_ticket_number_seq');
    year_str := EXTRACT(YEAR FROM NOW())::TEXT;
    NEW.ticket_number := 'TK-' || year_str || '-' || LPAD(seq_val::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_ticket_number ON support_tickets;
CREATE TRIGGER trigger_support_ticket_number
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION generate_support_ticket_number();

-- Backfill existing tickets that don't have a number
DO $$
DECLARE
  r RECORD;
  seq_val INTEGER;
  year_str TEXT;
BEGIN
  FOR r IN SELECT id, created_at FROM support_tickets WHERE ticket_number IS NULL ORDER BY created_at ASC
  LOOP
    seq_val := nextval('support_ticket_number_seq');
    year_str := EXTRACT(YEAR FROM r.created_at)::TEXT;
    UPDATE support_tickets SET ticket_number = 'TK-' || year_str || '-' || LPAD(seq_val::TEXT, 4, '0') WHERE id = r.id;
  END LOOP;
END;
$$;

-- ============================================================================
-- 2. INTERNAL NOTES (persistent, separate from messages)
-- ============================================================================

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS internal_notes TEXT DEFAULT '';

-- ============================================================================
-- 3. SUPPORT AGENT STATUS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_agent_status (
  agent_id UUID PRIMARY KEY,
  agent_name TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support_agent_status ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CHAT SESSION ENHANCEMENTS (for 5-min timer)
-- ============================================================================

-- Track when client last sent a message (for timer)
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS last_client_message_at TIMESTAMPTZ;

-- Track when admin last responded (for timer)
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS last_admin_response_at TIMESTAMPTZ;

-- Track if the 5-min timeout message has been sent (avoid duplicates)
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS timeout_message_sent BOOLEAN DEFAULT false;

-- ============================================================================
-- 5. EMAIL NOTIFICATION TRACKING (avoid spamming)
-- ============================================================================

-- Track last email sent for a ticket to avoid duplicate emails
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_email_notified_at TIMESTAMPTZ;
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS last_email_notified_at TIMESTAMPTZ;

-- ============================================================================
-- 6. SUPABASE REALTIME PUBLICATION
-- ============================================================================

-- Add support tables to realtime publication
-- (safe: IF NOT EXISTS is not supported, so we use DO block)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_chat_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication
  END;
END;
$$;

-- ============================================================================
-- 7. INDEX for timer query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_support_chat_sessions_timeout
  ON support_chat_sessions(status, last_client_message_at)
  WHERE status = 'active' AND timeout_message_sent = false;

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
  ON support_tickets(ticket_number);

COMMIT;


-- ============================================================
-- FILE: 20260214_trusted_devices.sql
-- ============================================================

-- Migration: Trusted Devices for Consumer Authentication
-- Date: 2026-02-14
-- Purpose: Skip OTP verification for recognized (trusted) devices
--
-- When a user successfully authenticates (OTP or password), a device trust token
-- is issued as an HttpOnly cookie. On subsequent logins, if the cookie is present
-- and valid, OTP is skipped.
--
-- Token stored as SHA-256 hash (never plaintext) for security.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: trusted_devices
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,               -- SHA-256 hash of the device trust token
  device_name   TEXT DEFAULT '',             -- user-agent derived label (e.g. "Chrome on Windows")
  ip_address    TEXT DEFAULT '',             -- IP at time of trust creation (informational only)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,        -- 90 days from creation by default
  revoked_at    TIMESTAMPTZ DEFAULT NULL     -- NULL = active, set = revoked
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON public.trusted_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token_hash ON public.trusted_devices (token_hash);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires_at ON public.trusted_devices (expires_at);

-- RLS
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (server-side only)
DROP POLICY IF EXISTS trusted_devices_service_role_all ON public.trusted_devices;
CREATE POLICY trusted_devices_service_role_all ON public.trusted_devices
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.trusted_devices IS 'Stores hashed device trust tokens. When a valid token is presented via cookie, OTP verification is skipped.';

COMMIT;

