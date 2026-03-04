-- Prompt 14 — Contextual boosting: event-based boost rules
-- Allows admin to configure time-limited boost rules (Ramadan, Saint-Valentin, etc.)

CREATE TABLE IF NOT EXISTS search_boost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  boost_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup of active events by date range
CREATE INDEX IF NOT EXISTS idx_search_boost_events_active_dates
  ON search_boost_events (date_from, date_to) WHERE is_active = true;

-- RLS: only service_role can access (admin-only table)
ALTER TABLE search_boost_events ENABLE ROW LEVEL SECURITY;
