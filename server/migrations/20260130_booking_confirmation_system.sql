-- Booking Confirmation System for H-3 pre-confirmation
-- Prevents no-shows by requiring confirmation 3h before reservation
-- Run this in Supabase SQL Editor

-- ============================================================================
-- TABLE: booking_confirmation_requests
-- Tracks confirmation requests sent to users before their reservation
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_confirmation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to reservation
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,

  -- Confirmation token (unique, used in URL)
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),

  -- Timing
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- Usually sent_at + 1 hour
  confirmed_at TIMESTAMPTZ,

  -- Auto-cancel tracking
  auto_cancelled_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bcr_reservation_id ON booking_confirmation_requests(reservation_id);
CREATE INDEX IF NOT EXISTS idx_bcr_token ON booking_confirmation_requests(token);
CREATE INDEX IF NOT EXISTS idx_bcr_status ON booking_confirmation_requests(status);
CREATE INDEX IF NOT EXISTS idx_bcr_expires_at ON booking_confirmation_requests(expires_at) WHERE status = 'pending';

-- Unique constraint: only one active confirmation request per reservation
CREATE UNIQUE INDEX IF NOT EXISTS idx_bcr_unique_active
ON booking_confirmation_requests(reservation_id)
WHERE status = 'pending';

-- ============================================================================
-- COLUMN: Add pre_confirmed flag to reservations
-- ============================================================================

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS pre_confirmed BOOLEAN DEFAULT FALSE;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS pre_confirmed_at TIMESTAMPTZ;

-- Index for querying reservations needing confirmation
CREATE INDEX IF NOT EXISTS idx_reservations_pre_confirmed
ON reservations(pre_confirmed, starts_at)
WHERE status = 'confirmed' AND pre_confirmed = FALSE;

-- ============================================================================
-- FUNCTION: Get reservations needing H-3 confirmation email
-- Returns reservations starting in ~3 hours that haven't received confirmation request
-- ============================================================================

CREATE OR REPLACE FUNCTION get_reservations_for_h3_confirmation()
RETURNS TABLE (
  reservation_id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  user_phone TEXT,
  establishment_id UUID,
  establishment_name TEXT,
  starts_at TIMESTAMPTZ,
  party_size INT,
  booking_reference TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id AS reservation_id,
    r.user_id,
    u.email AS user_email,
    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS user_name,
    u.phone AS user_phone,
    r.establishment_id,
    e.name AS establishment_name,
    r.starts_at,
    r.party_size,
    r.booking_reference
  FROM reservations r
  JOIN users u ON r.user_id = u.id
  JOIN establishments e ON r.establishment_id = e.id
  WHERE
    -- Only confirmed reservations
    r.status = 'confirmed'
    -- Not yet pre-confirmed
    AND r.pre_confirmed = FALSE
    -- Starting between 2h50 and 3h10 from now (window to catch all)
    AND r.starts_at BETWEEN NOW() + INTERVAL '2 hours 50 minutes' AND NOW() + INTERVAL '3 hours 10 minutes'
    -- No pending confirmation request already sent
    AND NOT EXISTS (
      SELECT 1 FROM booking_confirmation_requests bcr
      WHERE bcr.reservation_id = r.id
      AND bcr.status = 'pending'
    )
    -- User has an email
    AND u.email IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get expired confirmation requests (for auto-cancellation)
-- Returns pending requests that have expired (1h without confirmation)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_expired_confirmation_requests()
RETURNS TABLE (
  request_id UUID,
  reservation_id UUID,
  token TEXT,
  user_email TEXT,
  user_name TEXT,
  establishment_name TEXT,
  starts_at TIMESTAMPTZ,
  party_size INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bcr.id AS request_id,
    bcr.reservation_id,
    bcr.token,
    u.email AS user_email,
    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS user_name,
    e.name AS establishment_name,
    r.starts_at,
    r.party_size
  FROM booking_confirmation_requests bcr
  JOIN reservations r ON bcr.reservation_id = r.id
  JOIN users u ON r.user_id = u.id
  JOIN establishments e ON r.establishment_id = e.id
  WHERE
    bcr.status = 'pending'
    AND bcr.expires_at < NOW()
    AND r.status = 'confirmed';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Confirm booking via token
-- ============================================================================

CREATE OR REPLACE FUNCTION confirm_booking_by_token(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_request booking_confirmation_requests%ROWTYPE;
  v_reservation reservations%ROWTYPE;
  v_result JSON;
BEGIN
  -- Find the confirmation request
  SELECT * INTO v_request
  FROM booking_confirmation_requests
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Token invalide');
  END IF;

  -- Check if already processed
  IF v_request.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Cette confirmation a déjà été traitée', 'status', v_request.status);
  END IF;

  -- Check if expired
  IF v_request.expires_at < NOW() THEN
    -- Mark as expired
    UPDATE booking_confirmation_requests
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_request.id;

    RETURN json_build_object('success', false, 'error', 'Le délai de confirmation est expiré');
  END IF;

  -- Get reservation
  SELECT * INTO v_reservation FROM reservations WHERE id = v_request.reservation_id;

  IF v_reservation.status != 'confirmed' THEN
    RETURN json_build_object('success', false, 'error', 'Cette réservation n''est plus active');
  END IF;

  -- Mark confirmation request as confirmed
  UPDATE booking_confirmation_requests
  SET
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_request.id;

  -- Mark reservation as pre-confirmed
  UPDATE reservations
  SET
    pre_confirmed = TRUE,
    pre_confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_request.reservation_id;

  RETURN json_build_object(
    'success', true,
    'reservation_id', v_request.reservation_id,
    'message', 'Votre présence est confirmée'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Auto-cancel expired unconfirmed reservations
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_unconfirmed_reservations()
RETURNS TABLE (
  reservation_id UUID,
  user_email TEXT,
  user_name TEXT,
  establishment_id UUID,
  establishment_name TEXT,
  pro_email TEXT,
  starts_at TIMESTAMPTZ,
  party_size INT
) AS $$
BEGIN
  RETURN QUERY
  WITH expired_requests AS (
    SELECT
      bcr.id AS request_id,
      bcr.reservation_id
    FROM booking_confirmation_requests bcr
    JOIN reservations r ON bcr.reservation_id = r.id
    WHERE
      bcr.status = 'pending'
      AND bcr.expires_at < NOW()
      AND r.status = 'confirmed'
  ),
  updated_requests AS (
    UPDATE booking_confirmation_requests bcr
    SET
      status = 'expired',
      auto_cancelled_at = NOW(),
      updated_at = NOW()
    FROM expired_requests er
    WHERE bcr.id = er.request_id
    RETURNING bcr.reservation_id
  ),
  updated_reservations AS (
    UPDATE reservations r
    SET
      status = 'cancelled',
      meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
        'auto_cancelled_reason', 'no_h3_confirmation',
        'auto_cancelled_at', NOW()
      ),
      updated_at = NOW()
    FROM updated_requests ur
    WHERE r.id = ur.reservation_id
    RETURNING r.*
  )
  SELECT
    ur.id AS reservation_id,
    u.email AS user_email,
    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS user_name,
    ur.establishment_id,
    e.name AS establishment_name,
    p.email AS pro_email,
    ur.starts_at,
    ur.party_size
  FROM updated_reservations ur
  JOIN users u ON ur.user_id = u.id
  JOIN establishments e ON ur.establishment_id = e.id
  LEFT JOIN pro_users p ON e.owner_id = p.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verify setup
-- ============================================================================

SELECT 'booking_confirmation_requests table created' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_confirmation_requests');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'reservations'
AND column_name IN ('pre_confirmed', 'pre_confirmed_at');
