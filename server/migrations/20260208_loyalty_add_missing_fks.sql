-- ============================================================================
-- Ajouter les FK manquantes sur loyalty_rewards et loyalty_stamps
-- vers establishments pour permettre les joins PostgREST
-- ============================================================================

-- loyalty_rewards.establishment_id → establishments(id)
ALTER TABLE loyalty_rewards
  ADD CONSTRAINT fk_loyalty_rewards_establishment
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE;

-- loyalty_stamps.establishment_id → establishments(id)
ALTER TABLE loyalty_stamps
  ADD CONSTRAINT fk_loyalty_stamps_establishment
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE;
