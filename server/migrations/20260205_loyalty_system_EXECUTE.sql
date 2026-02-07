-- ============================================================================
-- SAM LOYALTY SYSTEM - Migration à exécuter dans Supabase SQL Editor
-- Copiez tout ce fichier et exécutez-le dans: Dashboard > SQL Editor > New Query
-- ============================================================================

-- 1. LOYALTY PROGRAMS
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  stamps_required INT NOT NULL DEFAULT 10 CHECK (stamps_required >= 2 AND stamps_required <= 50),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('free_item', 'discount_percent', 'discount_fixed', 'custom')),
  reward_value TEXT,
  reward_description TEXT NOT NULL,
  reward_validity_days INT DEFAULT 30 CHECK (reward_validity_days >= 1 AND reward_validity_days <= 365),
  conditions TEXT,
  card_design JSONB DEFAULT '{"style": "gradient", "primary_color": "#6366f1", "secondary_color": "#8b5cf6", "stamp_icon": "coffee", "logo_url": null}'::jsonb,
  bonus_rules JSONB DEFAULT '{"birthday_bonus": false, "birthday_multiplier": 2, "happy_hour_bonus": false, "happy_hour_start": "14:00", "happy_hour_end": "17:00", "happy_hour_multiplier": 2, "sam_booking_bonus": true, "sam_booking_extra_stamps": 1}'::jsonb,
  stamps_expire_after_days INT DEFAULT 180,
  warn_expiration_days INT DEFAULT 14,
  allow_retroactive_stamps BOOLEAN DEFAULT false,
  retroactive_from_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_programs_establishment ON loyalty_programs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_active ON loyalty_programs(establishment_id, is_active) WHERE is_active = true;

-- 2. LOYALTY CARDS
CREATE TABLE IF NOT EXISTS loyalty_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  stamps_count INT DEFAULT 0 CHECK (stamps_count >= 0),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reward_pending', 'reward_used', 'expired')),
  cycle_number INT DEFAULT 1,
  completed_at TIMESTAMPTZ,
  last_stamp_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_active_card_per_program UNIQUE (user_id, program_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_cards_user ON loyalty_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_program ON loyalty_cards(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_establishment ON loyalty_cards(establishment_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_status ON loyalty_cards(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_active ON loyalty_cards(user_id, status) WHERE status = 'active';

-- 3. LOYALTY STAMPS
CREATE TABLE IF NOT EXISTS loyalty_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL,
  stamp_number INT NOT NULL,
  stamp_type TEXT DEFAULT 'regular' CHECK (stamp_type IN ('regular', 'bonus', 'birthday', 'happy_hour', 'sam_booking', 'retroactive', 'manual')),
  stamped_by_user_id TEXT,
  stamped_by_name TEXT,
  source TEXT DEFAULT 'scan' CHECK (source IN ('scan', 'reservation', 'manual', 'retroactive', 'offline_sync')),
  reservation_id UUID,
  offline_id TEXT,
  synced_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_card ON loyalty_stamps(card_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_user ON loyalty_stamps(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_date ON loyalty_stamps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_offline ON loyalty_stamps(offline_id) WHERE offline_id IS NOT NULL;

-- 4. LOYALTY REWARDS
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL,
  reward_code TEXT UNIQUE NOT NULL,
  reward_type TEXT NOT NULL,
  reward_value TEXT,
  reward_description TEXT NOT NULL,
  conditions TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_pro_user_id TEXT,
  used_by_pro_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_user ON loyalty_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_code ON loyalty_rewards(reward_code);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_status ON loyalty_rewards(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_establishment ON loyalty_rewards(establishment_id, status);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_expires ON loyalty_rewards(expires_at) WHERE status = 'active';

-- 5. LOYALTY NOTIFICATIONS
CREATE TABLE IF NOT EXISTS loyalty_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  card_id UUID REFERENCES loyalty_cards(id) ON DELETE SET NULL,
  reward_id UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('welcome', 'stamp_added', 'halfway', 'almost_complete', 'card_complete', 'reward_ready', 'reward_expiring_soon', 'reward_expired', 'stamps_expiring_soon', 'stamps_expired', 'inactive_reminder')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push', 'sms')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_notifications_user ON loyalty_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_notifications_pending ON loyalty_notifications(status, created_at) WHERE status = 'pending';

-- 6. MATERIALIZED VIEW FOR STATS
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
  ROUND(COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'used')::NUMERIC / NULLIF(COUNT(DISTINCT r.id), 0) * 100, 1) as redemption_rate,
  COUNT(DISTINCT c.user_id) as unique_members,
  AVG(c.stamps_count) FILTER (WHERE c.status = 'active') as avg_stamps_active,
  MAX(s.created_at) as last_activity
FROM loyalty_programs p
LEFT JOIN loyalty_cards c ON c.program_id = p.id
LEFT JOIN loyalty_rewards r ON r.program_id = p.id
LEFT JOIN loyalty_stamps s ON s.program_id = p.id
WHERE p.is_active = true
GROUP BY p.id, p.establishment_id, p.name, p.stamps_required;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_program_stats_id ON loyalty_program_stats(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_program_stats_establishment ON loyalty_program_stats(establishment_id);

-- 7. FUNCTIONS
CREATE OR REPLACE FUNCTION refresh_loyalty_stats() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_program_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_loyalty_reward_code() RETURNS TEXT AS $$
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

CREATE OR REPLACE FUNCTION check_loyalty_expirations() RETURNS void AS $$
BEGIN
  UPDATE loyalty_cards SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now();

  UPDATE loyalty_rewards SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_loyalty_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. TRIGGERS
DROP TRIGGER IF EXISTS loyalty_programs_updated_at ON loyalty_programs;
CREATE TRIGGER loyalty_programs_updated_at
  BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();

DROP TRIGGER IF EXISTS loyalty_cards_updated_at ON loyalty_cards;
CREATE TRIGGER loyalty_cards_updated_at
  BEFORE UPDATE ON loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();

-- 9. RLS
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS loyalty_programs_read ON loyalty_programs;
DROP POLICY IF EXISTS loyalty_cards_user_read ON loyalty_cards;
DROP POLICY IF EXISTS loyalty_stamps_read ON loyalty_stamps;
DROP POLICY IF EXISTS loyalty_rewards_read ON loyalty_rewards;

CREATE POLICY loyalty_programs_read ON loyalty_programs FOR SELECT USING (is_active = true);
CREATE POLICY loyalty_cards_user_read ON loyalty_cards FOR SELECT USING (true);
CREATE POLICY loyalty_stamps_read ON loyalty_stamps FOR SELECT USING (true);
CREATE POLICY loyalty_rewards_read ON loyalty_rewards FOR SELECT USING (true);

-- 10. COMMENTS
COMMENT ON TABLE loyalty_programs IS 'Programmes de fidélité créés par les établissements';
COMMENT ON TABLE loyalty_cards IS 'Cartes de fidélité des utilisateurs';
COMMENT ON TABLE loyalty_stamps IS 'Historique des tampons';
COMMENT ON TABLE loyalty_rewards IS 'Bons de récompense';

-- ============================================================================
-- MIGRATION COMPLETE!
-- Les tables suivantes ont été créées:
-- - loyalty_programs
-- - loyalty_cards
-- - loyalty_stamps
-- - loyalty_rewards
-- - loyalty_notifications
-- - loyalty_program_stats (materialized view)
-- ============================================================================

SELECT 'Migration SAM Loyalty System terminée avec succès!' as status;
