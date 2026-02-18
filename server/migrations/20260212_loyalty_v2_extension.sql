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
