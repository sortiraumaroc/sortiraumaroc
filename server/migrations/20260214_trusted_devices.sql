-- Migration: Trusted Devices for Consumer Authentication
-- Date: 2026-02-14
-- Purpose: Skip OTP verification for recognized (trusted) devices
--
-- When a user successfully authenticates (OTP or password), a device trust token
-- is issued as an HttpOnly cookie. On subsequent logins, if the cookie is present
-- and valid, OTP is skipped.
--
-- Token stored as SHA-256 hash (never plaintext) for security.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: trusted_devices
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,               -- SHA-256 hash of the device trust token
  device_name   TEXT DEFAULT '',             -- user-agent derived label (e.g. "Chrome on Windows")
  ip_address    TEXT DEFAULT '',             -- IP at time of trust creation (informational only)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,        -- 90 days from creation by default
  revoked_at    TIMESTAMPTZ DEFAULT NULL     -- NULL = active, set = revoked
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON public.trusted_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token_hash ON public.trusted_devices (token_hash);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires_at ON public.trusted_devices (expires_at);

-- RLS
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (server-side only)
CREATE POLICY trusted_devices_service_role_all ON public.trusted_devices
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.trusted_devices IS 'Stores hashed device trust tokens. When a valid token is presented via cookie, OTP verification is skipped.';

COMMIT;
