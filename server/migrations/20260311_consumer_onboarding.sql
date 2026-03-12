-- Migration: Consumer onboarding fields
-- Adds username, gender, onboarding_completed, email_verified, phone_verified to consumer_users

ALTER TABLE consumer_users
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Unique index on username (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumer_users_username
  ON consumer_users(username) WHERE username IS NOT NULL;
