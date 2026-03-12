-- =============================================================================
-- Allow anonymous push tokens (user_id nullable)
-- =============================================================================
-- Before: consumer_fcm_tokens.user_id was NOT NULL with FK to consumer_users
-- After: user_id is nullable, anonymous tokens stored with user_id = NULL
-- When user logs in, the existing upsert on token migrates it automatically.

-- Drop the foreign key constraint
ALTER TABLE consumer_fcm_tokens
  DROP CONSTRAINT IF EXISTS consumer_fcm_tokens_user_id_fkey;

-- Make user_id nullable
ALTER TABLE consumer_fcm_tokens
  ALTER COLUMN user_id DROP NOT NULL;

-- Index for fast lookup of anonymous active tokens
CREATE INDEX IF NOT EXISTS idx_consumer_fcm_tokens_anon_active
  ON consumer_fcm_tokens (active)
  WHERE user_id IS NULL AND active = true;
