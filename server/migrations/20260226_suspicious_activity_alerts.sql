-- =============================================================================
-- Table unifiée pour toutes les alertes de comportement suspect
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS suspicious_activity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Acteur concerné
  actor_type TEXT NOT NULL CHECK (actor_type IN ('consumer', 'pro', 'system')),
  actor_id TEXT NOT NULL,

  -- Type d'alerte (extensible, pas de CHECK constraint)
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),

  -- Descriptif
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  context JSONB DEFAULT '{}',

  -- Contexte optionnel
  establishment_id UUID DEFAULT NULL,

  -- Déduplification
  deduplication_key TEXT DEFAULT NULL,

  -- Résolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  resolved_by TEXT DEFAULT NULL,
  resolution_notes TEXT DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes admin courantes
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_resolved
  ON suspicious_activity_alerts(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_actor
  ON suspicious_activity_alerts(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_type
  ON suspicious_activity_alerts(alert_type, severity);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_establishment
  ON suspicious_activity_alerts(establishment_id) WHERE establishment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_dedup
  ON suspicious_activity_alerts(deduplication_key, created_at DESC)
  WHERE deduplication_key IS NOT NULL;

-- RLS
ALTER TABLE suspicious_activity_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suspicious_activity_alerts_service ON suspicious_activity_alerts;
CREATE POLICY suspicious_activity_alerts_service
  ON suspicious_activity_alerts FOR ALL USING (true);

COMMENT ON TABLE suspicious_activity_alerts
  IS 'Table unifiée pour toutes les alertes de comportement suspect (consumer + pro)';

COMMIT;
