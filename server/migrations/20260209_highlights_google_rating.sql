-- Add highlights column (separate from tags) for wizard-created establishments
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT NULL;

-- Add Google Places rating columns for real-time rating sync
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1) DEFAULT NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_review_count INTEGER DEFAULT NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_place_id TEXT DEFAULT NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_rating_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Add google_maps_url to establishments if not already present (for public API)
-- (This column likely already exists, so IF NOT EXISTS is important)
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT NULL;
