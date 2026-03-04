-- ============================================================
-- User Preferences for Personalized Search Results (Prompt 12)
-- ============================================================
-- Stores computed preference profiles per user, derived from
-- reservations, search clicks, and search queries.
-- Used by listPublicEstablishments to re-rank results.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_preferences_computed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Preference signals: JSONB objects mapping dimension values to normalized scores (0.0–1.0)
  preferred_cuisines JSONB DEFAULT '{}',          -- {"japonais": 0.85, "italien": 0.42}
  preferred_ambiances JSONB DEFAULT '{}',         -- {"romantique": 0.7, "festif": 0.4}
  preferred_price_ranges JSONB DEFAULT '{}',      -- {"1": 0.1, "3": 0.8}
  preferred_amenities JSONB DEFAULT '{}',         -- {"terrasse": 0.9, "parking": 0.6}
  preferred_neighborhoods JSONB DEFAULT '{}',     -- {"Gauthier": 0.7, "Anfa": 0.5}
  preferred_cities JSONB DEFAULT '{}',            -- {"Casablanca": 0.9, "Marrakech": 0.3}

  -- Aggregate behavioral stats
  avg_rating_booked NUMERIC(3,2),                 -- average rating of booked establishments
  total_bookings INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 0,

  -- Confidence: 0.0 = no data (no personalization), 1.0 = strong profile
  confidence_score NUMERIC(3,2) DEFAULT 0.00,

  computed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_prefs_unique UNIQUE(user_id)
);

-- Index for cron batch recomputation (find stale profiles)
CREATE INDEX IF NOT EXISTS idx_user_prefs_updated
  ON user_preferences_computed(updated_at);

-- RLS: users can only read their own preferences
ALTER TABLE user_preferences_computed ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_prefs_service_role ON user_preferences_computed
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
