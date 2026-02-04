-- =============================================================================
-- CONSOLIDATED MISSING MIGRATIONS
-- Execute this script on your Supabase database to add missing columns
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. BOOKING SOURCE TRACKING (from 20260202_booking_source_tracking.sql)
-- Adds booking_source, referral_slug, source_url to reservations
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS referral_slug text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Add CHECK constraint for booking_source if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_booking_source_check'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_booking_source_check
      CHECK (booking_source IN ('platform', 'direct_link'));
  END IF;
END $$;

-- Indexes for booking source
CREATE INDEX IF NOT EXISTS idx_reservations_booking_source
  ON public.reservations(booking_source);

CREATE INDEX IF NOT EXISTS idx_reservations_referral_slug
  ON public.reservations(referral_slug)
  WHERE referral_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_establishment_source
  ON public.reservations(establishment_id, booking_source);

CREATE INDEX IF NOT EXISTS idx_reservations_source_created
  ON public.reservations(booking_source, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. BOOKING POLICIES DEPOSIT (from 20260203_booking_policies_deposit.sql)
-- Adds deposit_per_person to booking_policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking_policies
  ADD COLUMN IF NOT EXISTS deposit_per_person INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.booking_policies.deposit_per_person IS
  'Deposit amount per person in MAD for guaranteed reservations. If NULL or 0, guaranteed booking option is disabled.';

-- ---------------------------------------------------------------------------
-- 3. BOOKING CONFIRMATION SYSTEM (from 20260130_booking_confirmation_system.sql)
-- Adds pre_confirmed columns to reservations
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS pre_confirmed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pre_confirmed_at TIMESTAMPTZ;

-- Index for pre_confirmed
CREATE INDEX IF NOT EXISTS idx_reservations_pre_confirmed
  ON public.reservations(pre_confirmed)
  WHERE pre_confirmed = FALSE;

-- ---------------------------------------------------------------------------
-- DONE
-- ---------------------------------------------------------------------------
SELECT 'Migrations applied successfully!' as status;
