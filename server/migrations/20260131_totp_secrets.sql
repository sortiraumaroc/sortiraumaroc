-- Migration: TOTP Secrets for Dynamic QR Codes (Simplified)
-- Creates tables, functions, and triggers for TOTP-based dynamic QR codes
-- Executed on: 2026-01-31

-- ============================================================================
-- 1. Create TOTP Secrets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS reservation_totp_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6,
  period INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  validation_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB DEFAULT '{}',

  CONSTRAINT unique_reservation_secret UNIQUE (reservation_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_totp_reservation ON reservation_totp_secrets(reservation_id);
CREATE INDEX IF NOT EXISTS idx_totp_active ON reservation_totp_secrets(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 2. Create Validation Logs Table (for security auditing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS totp_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  code_submitted TEXT NOT NULL,
  is_valid BOOLEAN NOT NULL,
  validated_by TEXT,
  establishment_id UUID,
  time_window INTEGER,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_totp_logs_reservation ON totp_validation_logs(reservation_id);
CREATE INDEX IF NOT EXISTS idx_totp_logs_created ON totp_validation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_totp_logs_establishment ON totp_validation_logs(establishment_id);

-- ============================================================================
-- 3. Function to Generate TOTP Secret for a Reservation
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_reservation_totp_secret(p_reservation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret TEXT;
  v_existing TEXT;
BEGIN
  -- Check if active secret already exists
  SELECT secret INTO v_existing
  FROM reservation_totp_secrets
  WHERE reservation_id = p_reservation_id AND is_active = TRUE;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Generate a new Base32 secret (32 characters = 160 bits)
  v_secret := '';
  FOR i IN 1..32 LOOP
    v_secret := v_secret || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
                                   floor(random() * 32 + 1)::int, 1);
  END LOOP;

  -- Insert the new secret
  INSERT INTO reservation_totp_secrets (reservation_id, secret)
  VALUES (p_reservation_id, v_secret)
  ON CONFLICT (reservation_id)
  DO UPDATE SET
    secret = v_secret,
    is_active = TRUE,
    created_at = NOW(),
    validation_count = 0;

  RETURN v_secret;
END;
$$;

-- ============================================================================
-- 4. Function to Invalidate TOTP Secret (if compromised)
-- ============================================================================

CREATE OR REPLACE FUNCTION invalidate_reservation_totp_secret(p_reservation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE reservation_totp_secrets
  SET is_active = FALSE
  WHERE reservation_id = p_reservation_id;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 5. Trigger to Auto-Generate Secret on Reservation Confirmation
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_generate_totp_on_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Generate TOTP secret when reservation is confirmed
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    PERFORM generate_reservation_totp_secret(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS trg_reservation_totp ON reservations;
CREATE TRIGGER trg_reservation_totp
  AFTER INSERT OR UPDATE OF status ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION trg_generate_totp_on_confirmation();

-- ============================================================================
-- 6. RLS Policies (using service_role only for now, API handles auth)
-- ============================================================================

ALTER TABLE reservation_totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE totp_validation_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (API uses service_role key)
DROP POLICY IF EXISTS "Service role full access to secrets" ON reservation_totp_secrets;
CREATE POLICY "Service role full access to secrets"
  ON reservation_totp_secrets
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to logs" ON totp_validation_logs;
CREATE POLICY "Service role full access to logs"
  ON totp_validation_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7. Generate Secrets for Existing Confirmed Reservations
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id FROM reservations
    WHERE status = 'confirmed'
    AND id NOT IN (SELECT reservation_id FROM reservation_totp_secrets WHERE is_active = TRUE)
  LOOP
    PERFORM generate_reservation_totp_secret(r.id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Generated TOTP secrets for % existing confirmed reservations', v_count;
END;
$$;

-- ============================================================================
-- Done! Tables, functions, and triggers created successfully.
-- ============================================================================
