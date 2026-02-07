-- Migration: SAM Loyalty System (Programme de Fidélité Digital)
-- Date: 2026-02-05
-- Description: Complete loyalty card system with multi-program support, stamps, rewards, and offline sync

-- =============================================================================
-- LOYALTY PROGRAMS (Configuration par établissement)
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,

  -- Programme Info
  name TEXT NOT NULL,
  description TEXT,

  -- Mécanique
  stamps_required INT NOT NULL DEFAULT 10 CHECK (stamps_required >= 2 AND stamps_required <= 50),

  -- Récompense
  reward_type TEXT NOT NULL CHECK (reward_type IN ('free_item', 'discount_percent', 'discount_fixed', 'custom')),
  reward_value TEXT, -- ex: "50" pour 50 MAD ou "20" pour 20%
  reward_description TEXT NOT NULL, -- ex: "1 café offert", "20% sur votre addition"
  reward_validity_days INT DEFAULT 30 CHECK (reward_validity_days >= 1 AND reward_validity_days <= 365),
  conditions TEXT, -- conditions d'utilisation

  -- Design de la carte
  card_design JSONB DEFAULT '{
    "style": "gradient",
    "primary_color": "#6366f1",
    "secondary_color": "#8b5cf6",
    "stamp_icon": "coffee",
    "logo_url": null
  }'::jsonb,

  -- Règles bonus
  bonus_rules JSONB DEFAULT '{
    "birthday_bonus": false,
    "birthday_multiplier": 2,
    "happy_hour_bonus": false,
    "happy_hour_start": "14:00",
    "happy_hour_end": "17:00",
    "happy_hour_multiplier": 2,
    "sam_booking_bonus": true,
    "sam_booking_extra_stamps": 1
  }'::jsonb,

  -- Expiration
  stamps_expire_after_days INT DEFAULT 180, -- NULL = jamais
  warn_expiration_days INT DEFAULT 14, -- prévenir X jours avant

  -- Rétroactivité
  allow_retroactive_stamps BOOLEAN DEFAULT false,
  retroactive_from_date DATE, -- date à partir de laquelle comptabiliser

  -- Statut
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX idx_loyalty_programs_establishment ON loyalty_programs(establishment_id);
CREATE INDEX idx_loyalty_programs_active ON loyalty_programs(establishment_id, is_active) WHERE is_active = true;

-- =============================================================================
-- LOYALTY CARDS (Carte de fidélité d'un user)
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- consumer_users.id
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,

  -- Progression
  stamps_count INT DEFAULT 0 CHECK (stamps_count >= 0),

  -- Statut
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reward_pending', 'reward_used', 'expired')),

  -- Cycle (pour les cartes répétées)
  cycle_number INT DEFAULT 1,

  -- Timestamps
  completed_at TIMESTAMPTZ,
  last_stamp_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- calculé à partir de stamps_expire_after_days

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Contrainte unique: un user ne peut avoir qu'une carte active par programme
  CONSTRAINT unique_active_card_per_program UNIQUE (user_id, program_id, cycle_number)
);

-- Index pour recherches
CREATE INDEX idx_loyalty_cards_user ON loyalty_cards(user_id);
CREATE INDEX idx_loyalty_cards_program ON loyalty_cards(program_id);
CREATE INDEX idx_loyalty_cards_establishment ON loyalty_cards(establishment_id);
CREATE INDEX idx_loyalty_cards_status ON loyalty_cards(user_id, status);
CREATE INDEX idx_loyalty_cards_active ON loyalty_cards(user_id, status) WHERE status = 'active';

-- =============================================================================
-- LOYALTY STAMPS (Historique des tampons)
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL,

  -- Info tampon
  stamp_number INT NOT NULL, -- numéro du tampon (1, 2, 3...)
  stamp_type TEXT DEFAULT 'regular' CHECK (stamp_type IN ('regular', 'bonus', 'birthday', 'happy_hour', 'sam_booking', 'retroactive', 'manual')),

  -- Qui a tamponné
  stamped_by_user_id TEXT, -- pro_memberships.user_id
  stamped_by_name TEXT, -- nom du staff pour historique

  -- Source
  source TEXT DEFAULT 'scan' CHECK (source IN ('scan', 'reservation', 'manual', 'retroactive', 'offline_sync')),
  reservation_id UUID, -- si lié à une réservation

  -- Offline sync
  offline_id TEXT, -- ID temporaire si créé offline
  synced_at TIMESTAMPTZ, -- quand synchronisé

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_loyalty_stamps_card ON loyalty_stamps(card_id);
CREATE INDEX idx_loyalty_stamps_user ON loyalty_stamps(user_id);
CREATE INDEX idx_loyalty_stamps_date ON loyalty_stamps(created_at DESC);
CREATE INDEX idx_loyalty_stamps_offline ON loyalty_stamps(offline_id) WHERE offline_id IS NOT NULL;

-- =============================================================================
-- LOYALTY REWARDS (Bons de récompense)
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL,

  -- Code unique du bon
  reward_code TEXT UNIQUE NOT NULL, -- SAM-FID-XXXXX-YYYY

  -- Détails récompense (copie pour historique)
  reward_type TEXT NOT NULL,
  reward_value TEXT,
  reward_description TEXT NOT NULL,
  conditions TEXT,

  -- Statut
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),

  -- Validité
  expires_at TIMESTAMPTZ NOT NULL,

  -- Utilisation
  used_at TIMESTAMPTZ,
  used_by_pro_user_id TEXT, -- le Pro qui a validé
  used_by_pro_name TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_loyalty_rewards_user ON loyalty_rewards(user_id);
CREATE INDEX idx_loyalty_rewards_code ON loyalty_rewards(reward_code);
CREATE INDEX idx_loyalty_rewards_status ON loyalty_rewards(user_id, status);
CREATE INDEX idx_loyalty_rewards_establishment ON loyalty_rewards(establishment_id, status);
CREATE INDEX idx_loyalty_rewards_expires ON loyalty_rewards(expires_at) WHERE status = 'active';

-- =============================================================================
-- LOYALTY NOTIFICATIONS LOG (Pour emails et push)
-- =============================================================================

CREATE TABLE IF NOT EXISTS loyalty_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  card_id UUID REFERENCES loyalty_cards(id) ON DELETE SET NULL,
  reward_id UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,

  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'welcome', -- bienvenue au programme
    'stamp_added', -- nouveau tampon
    'halfway', -- mi-parcours
    'almost_complete', -- plus qu'un tampon
    'card_complete', -- carte complète
    'reward_ready', -- bon disponible
    'reward_expiring_soon', -- bon expire bientôt
    'reward_expired', -- bon expiré
    'stamps_expiring_soon', -- tampons vont expirer
    'stamps_expired', -- tampons expirés
    'inactive_reminder' -- rappel d'inactivité
  )),

  channel TEXT NOT NULL CHECK (channel IN ('email', 'push', 'sms')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),

  sent_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_loyalty_notifications_user ON loyalty_notifications(user_id);
CREATE INDEX idx_loyalty_notifications_pending ON loyalty_notifications(status, created_at) WHERE status = 'pending';

-- =============================================================================
-- LOYALTY STATS (Vue matérialisée pour analytics Pro)
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS loyalty_program_stats AS
SELECT
  p.id as program_id,
  p.establishment_id,
  p.name as program_name,
  p.stamps_required,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') as active_cards,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('completed', 'reward_pending', 'reward_used')) as completed_cards,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'active') as pending_rewards,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'used') as used_rewards,
  ROUND(
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'used')::NUMERIC /
    NULLIF(COUNT(DISTINCT r.id), 0) * 100,
    1
  ) as redemption_rate,
  COUNT(DISTINCT c.user_id) as unique_members,
  AVG(c.stamps_count) FILTER (WHERE c.status = 'active') as avg_stamps_active,
  MAX(s.created_at) as last_activity
FROM loyalty_programs p
LEFT JOIN loyalty_cards c ON c.program_id = p.id
LEFT JOIN loyalty_rewards r ON r.program_id = p.id
LEFT JOIN loyalty_stamps s ON s.program_id = p.id
WHERE p.is_active = true
GROUP BY p.id, p.establishment_id, p.name, p.stamps_required;

-- Index sur la vue
CREATE UNIQUE INDEX idx_loyalty_program_stats_id ON loyalty_program_stats(program_id);
CREATE INDEX idx_loyalty_program_stats_establishment ON loyalty_program_stats(establishment_id);

-- Fonction pour rafraîchir les stats
CREATE OR REPLACE FUNCTION refresh_loyalty_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_program_stats;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FONCTIONS UTILITAIRES
-- =============================================================================

-- Générer un code de récompense unique
CREATE OR REPLACE FUNCTION generate_loyalty_reward_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'SAM-FID-';
  i INT;
BEGIN
  FOR i IN 1..5 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  result := result || '-' || to_char(now(), 'YY');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour vérifier et expirer les cartes/tampons
CREATE OR REPLACE FUNCTION check_loyalty_expirations()
RETURNS void AS $$
BEGIN
  -- Expirer les cartes inactives
  UPDATE loyalty_cards
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Expirer les récompenses
  UPDATE loyalty_rewards
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_loyalty_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loyalty_programs_updated_at
  BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();

CREATE TRIGGER loyalty_cards_updated_at
  BEFORE UPDATE ON loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();

-- =============================================================================
-- RLS (Row Level Security)
-- =============================================================================

ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_notifications ENABLE ROW LEVEL SECURITY;

-- Policies pour lecture publique des programmes actifs
CREATE POLICY loyalty_programs_read ON loyalty_programs
  FOR SELECT USING (is_active = true);

-- Policies pour les cartes (user voit ses propres cartes)
CREATE POLICY loyalty_cards_user_read ON loyalty_cards
  FOR SELECT USING (true); -- Filtrage côté API

-- Policies pour les tampons
CREATE POLICY loyalty_stamps_read ON loyalty_stamps
  FOR SELECT USING (true);

-- Policies pour les récompenses
CREATE POLICY loyalty_rewards_read ON loyalty_rewards
  FOR SELECT USING (true);

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================

COMMENT ON TABLE loyalty_programs IS 'Programmes de fidélité créés par les établissements';
COMMENT ON TABLE loyalty_cards IS 'Cartes de fidélité des utilisateurs (une par programme actif)';
COMMENT ON TABLE loyalty_stamps IS 'Historique de tous les tampons (passages)';
COMMENT ON TABLE loyalty_rewards IS 'Bons de récompense générés quand une carte est complète';
COMMENT ON COLUMN loyalty_programs.card_design IS 'Design de la carte: style (solid/gradient/pastel/neon), couleurs, icône tampon, logo';
COMMENT ON COLUMN loyalty_programs.bonus_rules IS 'Règles de tampons bonus: anniversaire, happy hour, réservation SAM';
COMMENT ON COLUMN loyalty_cards.cycle_number IS 'Numéro du cycle de la carte (1 = première carte, 2 = après première récompense, etc.)';
COMMENT ON COLUMN loyalty_stamps.offline_id IS 'ID temporaire pour les tampons créés en mode offline, synchronisés plus tard';
