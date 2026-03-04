-- =============================================================================
-- RESERVATION SYSTEM V2 — Complete booking/reservation system upgrade
-- Date: 2026-02-11
--
-- This migration:
--   1. Extends reservations table with new statuses & fields
--   2. Extends consumer_user_stats with V2 scoring fields
--   3. Creates 8 new tables for capacity, quotas, scoring, disputes, quotes
--   4. Creates indexes, triggers, functions, RLS policies
--   5. Does NOT drop or rename any existing column/table
--
-- New tables:
--   - establishment_capacity     (capacity config per slot/day with quotas)
--   - establishment_slot_discounts (promotions per date/slot)
--   - no_show_disputes           (dispute/arbitration workflow)
--   - pro_trust_scores           (pro trust indicator)
--   - quote_requests             (group booking quotes > 15 persons)
--   - quote_messages             (messaging for quotes)
--   - pro_auto_accept_rules      (auto-acceptance rules)
--   - establishment_sanctions    (sanction history)
--
-- Depends on:
--   - public.reservations (existing)
--   - public.establishments (existing)
--   - public.consumer_users (existing)
--   - public.consumer_user_stats (existing)
--   - public.pro_slots (existing)
--   - public.consumer_promo_codes (existing)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. EXTEND: reservations — new statuses & columns
-- =============================================================================

-- 1a. Drop the old CHECK constraint on status so we can add new values
-- First find and drop any CHECK constraint on the status column
DO $$
DECLARE
  conname TEXT;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'public.reservations'::regclass
    AND c.contype = 'c'
    AND a.attname = 'status'
  LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reservations DROP CONSTRAINT %I', conname);
  END IF;
END
$$;

-- 1b. Add new CHECK constraint with all statuses (old + new)
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN (
    -- Existing statuses (preserved)
    'requested',
    'pending_pro_validation',
    'confirmed',
    'waitlist',
    'pending_waitlist',
    'cancelled',
    'cancelled_user',
    'cancelled_pro',
    'cancelled_waitlist_expired',
    'refused',
    'noshow',
    -- New V2 statuses
    'on_hold',                  -- Pro puts reservation on hold
    'deposit_requested',        -- Pro requests deposit (future paid mode)
    'deposit_paid',             -- Client paid deposit (future paid mode)
    'expired',                  -- Pro did not respond in time
    'consumed',                 -- Confirmed presence (QR scanned or pro confirmed)
    'consumed_default',         -- Auto-validated at H+24 (no pro response)
    'no_show_confirmed',        -- No-show confirmed (client accepted or 48h expired)
    'no_show_disputed'          -- No-show contested by client, pending arbitration
  ));

-- 1c. Add new columns to reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'standard'
    CHECK (type IN ('standard', 'group_quote')),
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_type IN ('free', 'paid')),
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES public.consumer_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount INTEGER,              -- cents (MAD × 100)
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qr_code_token TEXT UNIQUE,           -- unique QR token for this reservation
  ADD COLUMN IF NOT EXISTS qr_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protection_window_start TIMESTAMPTZ, -- reservation time - 3h
  ADD COLUMN IF NOT EXISTS pro_confirmation_requested_at TIMESTAMPTZ,  -- H+12
  ADD COLUMN IF NOT EXISTS pro_confirmation_deadline TIMESTAMPTZ,      -- H+24
  ADD COLUMN IF NOT EXISTS pro_venue_response TEXT
    CHECK (pro_venue_response IS NULL OR pro_venue_response IN ('client_came', 'client_no_show')),
  ADD COLUMN IF NOT EXISTS pro_venue_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_validated_at TIMESTAMPTZ,       -- H+24 auto-validation
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_custom_message TEXT,
  ADD COLUMN IF NOT EXISTS stock_type TEXT DEFAULT 'free_stock'
    CHECK (stock_type IS NULL OR stock_type IN ('paid_stock', 'free_stock', 'buffer')),
  ADD COLUMN IF NOT EXISTS converted_from_free_at TIMESTAMPTZ,  -- upgrade free → paid
  ADD COLUMN IF NOT EXISTS pro_processing_deadline TIMESTAMPTZ,  -- deadline for pro to respond
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;             -- when reservation was consumed

-- 1d. Indexes for new reservation workflows
CREATE INDEX IF NOT EXISTS idx_reservations_status_v2
  ON public.reservations(status);

CREATE INDEX IF NOT EXISTS idx_reservations_pro_processing_deadline
  ON public.reservations(pro_processing_deadline)
  WHERE status IN ('requested', 'pending_pro_validation') AND pro_processing_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_pro_confirmation_deadline
  ON public.reservations(pro_confirmation_deadline)
  WHERE pro_venue_response IS NULL AND pro_confirmation_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_protection_window
  ON public.reservations(protection_window_start)
  WHERE status = 'confirmed' AND payment_type = 'free';

CREATE INDEX IF NOT EXISTS idx_reservations_qr_token
  ON public.reservations(qr_code_token)
  WHERE qr_code_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_payment_type
  ON public.reservations(payment_type)
  WHERE payment_type = 'paid';

CREATE INDEX IF NOT EXISTS idx_reservations_stock_type
  ON public.reservations(establishment_id, stock_type, status);

COMMENT ON COLUMN public.reservations.type IS 'standard = normal booking, group_quote = quote request for 15+ people';
COMMENT ON COLUMN public.reservations.payment_type IS 'free = no deposit (beta), paid = deposit required';
COMMENT ON COLUMN public.reservations.qr_code_token IS 'Unique token for QR code validation at check-in';
COMMENT ON COLUMN public.reservations.protection_window_start IS 'starts_at - 3h: no cancellation allowed after this';
COMMENT ON COLUMN public.reservations.pro_processing_deadline IS 'Deadline for pro to accept/refuse (2h same-day, 12h otherwise)';
COMMENT ON COLUMN public.reservations.stock_type IS 'Which capacity pool this reservation uses (paid/free/buffer)';

-- =============================================================================
-- 2. EXTEND: consumer_user_stats — V2 scoring fields
-- =============================================================================

ALTER TABLE public.consumer_user_stats
  ADD COLUMN IF NOT EXISTS honored_reservations INTEGER NOT NULL DEFAULT 0
    CHECK (honored_reservations >= 0),
  ADD COLUMN IF NOT EXISTS late_cancellations INTEGER NOT NULL DEFAULT 0
    CHECK (late_cancellations >= 0),
  ADD COLUMN IF NOT EXISTS very_late_cancellations INTEGER NOT NULL DEFAULT 0
    CHECK (very_late_cancellations >= 0),
  ADD COLUMN IF NOT EXISTS reviews_posted INTEGER NOT NULL DEFAULT 0
    CHECK (reviews_posted >= 0),
  ADD COLUMN IF NOT EXISTS consecutive_honored INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_honored >= 0),
  ADD COLUMN IF NOT EXISTS consecutive_no_shows INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_no_shows >= 0),
  ADD COLUMN IF NOT EXISTS free_to_paid_conversions INTEGER NOT NULL DEFAULT 0
    CHECK (free_to_paid_conversions >= 0),
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS total_reservations INTEGER NOT NULL DEFAULT 0
    CHECK (total_reservations >= 0),
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.consumer_user_stats.honored_reservations IS 'Reservations where client showed up (QR scanned or confirmed)';
COMMENT ON COLUMN public.consumer_user_stats.late_cancellations IS 'Cancellations between 12h and 24h before reservation';
COMMENT ON COLUMN public.consumer_user_stats.very_late_cancellations IS 'Cancellations less than 12h before reservation';
COMMENT ON COLUMN public.consumer_user_stats.consecutive_honored IS 'Consecutive honored reservations (for rehabilitation)';
COMMENT ON COLUMN public.consumer_user_stats.consecutive_no_shows IS 'Consecutive no-shows (for auto-suspension)';
COMMENT ON COLUMN public.consumer_user_stats.is_suspended IS 'Client is suspended from making reservations';
COMMENT ON COLUMN public.consumer_user_stats.scoring_version IS '1 = legacy V1, 2 = V2 with full scoring';

-- =============================================================================
-- 3. TABLE: establishment_capacity
-- Capacity configuration per establishment per day/slot with quotas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- When this config applies
  day_of_week SMALLINT CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  specific_date DATE,              -- for special days (overrides day_of_week)

  -- Time slot definition
  time_slot_start TIME NOT NULL,
  time_slot_end TIME NOT NULL,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (slot_interval_minutes IN (15, 30, 60, 90, 120)),

  -- Capacity
  total_capacity INTEGER NOT NULL CHECK (total_capacity > 0),
  occupation_duration_minutes INTEGER NOT NULL DEFAULT 90
    CHECK (occupation_duration_minutes > 0 AND occupation_duration_minutes <= 480),

  -- Quota percentages (must sum to 100)
  paid_stock_percentage INTEGER NOT NULL DEFAULT 88
    CHECK (paid_stock_percentage >= 0 AND paid_stock_percentage <= 100),
  free_stock_percentage INTEGER NOT NULL DEFAULT 6
    CHECK (free_stock_percentage >= 0 AND free_stock_percentage <= 100),
  buffer_percentage INTEGER NOT NULL DEFAULT 6
    CHECK (buffer_percentage >= 0 AND buffer_percentage <= 100),

  -- Control
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT establishment_capacity_quotas_sum
    CHECK (paid_stock_percentage + free_stock_percentage + buffer_percentage = 100),
  CONSTRAINT establishment_capacity_time_range
    CHECK (time_slot_start < time_slot_end)
);

-- Unique: one config per establishment per day_of_week per time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishment_capacity_dow
  ON public.establishment_capacity(establishment_id, day_of_week, time_slot_start)
  WHERE day_of_week IS NOT NULL AND specific_date IS NULL;

-- Unique: one config per establishment per specific_date per time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishment_capacity_date
  ON public.establishment_capacity(establishment_id, specific_date, time_slot_start)
  WHERE specific_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establishment_capacity_establishment
  ON public.establishment_capacity(establishment_id);

COMMENT ON TABLE public.establishment_capacity IS 'Capacity configuration per establishment, per day/slot, with paid/free/buffer quotas';
COMMENT ON COLUMN public.establishment_capacity.occupation_duration_minutes IS 'Average time a party occupies a table/space (e.g. 90 min for restaurant)';
COMMENT ON COLUMN public.establishment_capacity.paid_stock_percentage IS 'Percentage of capacity reserved for paid bookings (guaranteed)';
COMMENT ON COLUMN public.establishment_capacity.free_stock_percentage IS 'Percentage of capacity reserved for free bookings';
COMMENT ON COLUMN public.establishment_capacity.buffer_percentage IS 'Dynamic buffer pool redistributed based on demand priority rules';

-- =============================================================================
-- 4. TABLE: establishment_slot_discounts
-- Promotions/remises per date or time slot
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_slot_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Scope
  applies_to TEXT NOT NULL CHECK (applies_to IN ('specific_date', 'day_of_week', 'time_range')),
  day_of_week SMALLINT CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  specific_date DATE,
  time_slot_start TIME,
  time_slot_end TIME,

  -- Discount
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),

  -- Display
  label TEXT NOT NULL,              -- e.g. "Happy Hour", "-20%", "Meilleur tarif"

  -- Validity
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_date DATE,
  end_date DATE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT establishment_slot_discounts_date_range
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_establishment_slot_discounts_est
  ON public.establishment_slot_discounts(establishment_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_establishment_slot_discounts_date
  ON public.establishment_slot_discounts(specific_date)
  WHERE is_active = TRUE AND specific_date IS NOT NULL;

COMMENT ON TABLE public.establishment_slot_discounts IS 'Promotions/remises configured by pro per date, day of week, or time range';

-- =============================================================================
-- 5. TABLE: no_show_disputes
-- No-show dispute & arbitration workflow
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.no_show_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Declaration
  declared_by TEXT NOT NULL CHECK (declared_by IN ('pro', 'system')),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Client notification & response
  client_notified_at TIMESTAMPTZ,
  client_response TEXT CHECK (client_response IS NULL OR client_response IN ('confirms_absence', 'disputes')),
  client_responded_at TIMESTAMPTZ,
  client_response_deadline TIMESTAMPTZ NOT NULL,  -- 48h after notification

  -- Dispute status workflow
  dispute_status TEXT NOT NULL DEFAULT 'pending_client_response'
    CHECK (dispute_status IN (
      'pending_client_response',
      'no_show_confirmed',
      'disputed_pending_arbitration',
      'resolved_favor_client',
      'resolved_favor_pro',
      'resolved_indeterminate'
    )),

  -- Arbitration
  arbitrated_by TEXT,               -- admin user_id
  arbitrated_at TIMESTAMPTZ,
  arbitration_notes TEXT,

  -- Evidence
  evidence_client JSONB DEFAULT '[]',  -- [{url, type, description}]
  evidence_pro JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One dispute per reservation
  CONSTRAINT no_show_disputes_unique_reservation UNIQUE (reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_pending
  ON public.no_show_disputes(client_response_deadline)
  WHERE dispute_status = 'pending_client_response';

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_arbitration
  ON public.no_show_disputes(created_at DESC)
  WHERE dispute_status = 'disputed_pending_arbitration';

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_user
  ON public.no_show_disputes(user_id);

CREATE INDEX IF NOT EXISTS idx_no_show_disputes_establishment
  ON public.no_show_disputes(establishment_id);

COMMENT ON TABLE public.no_show_disputes IS 'No-show dispute workflow with client response window and admin arbitration';
COMMENT ON COLUMN public.no_show_disputes.client_response_deadline IS '48h after client_notified_at for client to respond';

-- =============================================================================
-- 6. TABLE: pro_trust_scores
-- Aggregated trust indicator per establishment
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Core metrics
  trust_score INTEGER NOT NULL DEFAULT 80 CHECK (trust_score BETWEEN 0 AND 100),
  response_rate NUMERIC(5,2) DEFAULT 100.0,     -- % of reservations handled in time
  avg_response_time_minutes INTEGER DEFAULT 0,

  -- Incident counters
  false_no_show_count INTEGER NOT NULL DEFAULT 0 CHECK (false_no_show_count >= 0),
  total_disputes INTEGER NOT NULL DEFAULT 0 CHECK (total_disputes >= 0),
  cancellation_rate NUMERIC(5,2) DEFAULT 0.0,    -- % of confirmed reservations cancelled by pro

  -- Sanctions
  sanctions_count INTEGER NOT NULL DEFAULT 0 CHECK (sanctions_count >= 0),
  current_sanction TEXT NOT NULL DEFAULT 'none'
    CHECK (current_sanction IN ('none', 'warning', 'deactivated_7d', 'deactivated_30d', 'permanently_excluded')),
  deactivated_until TIMESTAMPTZ,

  -- Timestamps
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One score per establishment
  CONSTRAINT pro_trust_scores_unique_establishment UNIQUE (establishment_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_trust_scores_sanction
  ON public.pro_trust_scores(current_sanction)
  WHERE current_sanction != 'none';

CREATE INDEX IF NOT EXISTS idx_pro_trust_scores_deactivated
  ON public.pro_trust_scores(deactivated_until)
  WHERE deactivated_until IS NOT NULL;

COMMENT ON TABLE public.pro_trust_scores IS 'Aggregated trust indicator per establishment (response rate, disputes, sanctions)';

-- =============================================================================
-- 7. TABLE: quote_requests
-- Group booking quotes (> 15 persons)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Event details
  party_size INTEGER NOT NULL CHECK (party_size > 15),
  preferred_date DATE,
  preferred_time_slot TIME,
  is_date_flexible BOOLEAN NOT NULL DEFAULT FALSE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birthday', 'wedding', 'seminar', 'team_building', 'business_meal', 'other'
  )),
  event_type_other TEXT,              -- if event_type = 'other'
  requirements TEXT,                   -- special requirements (free text)
  budget_indication TEXT,

  -- Contact
  contact_phone TEXT,
  contact_email TEXT,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'acknowledged', 'quote_sent', 'quote_accepted', 'quote_declined', 'expired')),
  acknowledged_at TIMESTAMPTZ,         -- pro acknowledged receipt
  acknowledge_deadline TIMESTAMPTZ,    -- 48h after submission
  quote_deadline TIMESTAMPTZ,          -- 7 days after acknowledgement

  -- Conversion
  converted_to_reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_establishment
  ON public.quote_requests(establishment_id, status);

CREATE INDEX IF NOT EXISTS idx_quote_requests_user
  ON public.quote_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_quote_requests_pending_ack
  ON public.quote_requests(acknowledge_deadline)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_quote_requests_pending_quote
  ON public.quote_requests(quote_deadline)
  WHERE status = 'acknowledged';

COMMENT ON TABLE public.quote_requests IS 'Group booking quote requests for parties > 15 people';

-- =============================================================================
-- 8. TABLE: quote_messages
-- Messaging thread for quote negotiations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,

  -- Sender
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'pro')),
  sender_id TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  attachments JSONB DEFAULT '[]',     -- [{url, filename, type, size}]

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_messages_request
  ON public.quote_messages(quote_request_id, created_at);

COMMENT ON TABLE public.quote_messages IS 'Messaging thread between client and pro for quote negotiations';

-- =============================================================================
-- 9. TABLE: pro_auto_accept_rules
-- Auto-acceptance configuration per establishment
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_auto_accept_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Global toggle
  is_global BOOLEAN NOT NULL DEFAULT FALSE,   -- if true, accepts everything matching criteria

  -- Conditional rules
  min_client_score INTEGER CHECK (min_client_score IS NULL OR min_client_score BETWEEN 0 AND 100),
  max_party_size INTEGER CHECK (max_party_size IS NULL OR max_party_size > 0),
  applicable_time_slots JSONB,        -- [{"start": "12:00", "end": "14:00"}, ...] or null = all
  applicable_days JSONB,              -- [0,1,2,3,4,5,6] or null = all

  -- Future paid mode: auto-request deposit below this score
  auto_request_deposit_below_score INTEGER
    CHECK (auto_request_deposit_below_score IS NULL OR auto_request_deposit_below_score BETWEEN 0 AND 100),

  -- Control
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_auto_accept_rules_est
  ON public.pro_auto_accept_rules(establishment_id)
  WHERE is_active = TRUE;

COMMENT ON TABLE public.pro_auto_accept_rules IS 'Auto-acceptance rules per establishment (global or conditional on score, party size, time)';

-- =============================================================================
-- 10. TABLE: establishment_sanctions
-- Sanction history for establishments (pro)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Sanction type
  type TEXT NOT NULL CHECK (type IN ('warning', 'deactivation_7d', 'deactivation_30d', 'permanent_exclusion')),
  reason TEXT NOT NULL,

  -- Related dispute
  related_dispute_id UUID REFERENCES public.no_show_disputes(id) ON DELETE SET NULL,

  -- Imposed by admin
  imposed_by TEXT NOT NULL,           -- admin user_id
  imposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lifted (if applicable)
  lifted_by TEXT,                     -- admin user_id
  lifted_at TIMESTAMPTZ,
  lift_reason TEXT,

  -- Deactivation period
  deactivation_start TIMESTAMPTZ,
  deactivation_end TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_establishment_sanctions_est
  ON public.establishment_sanctions(establishment_id, imposed_at DESC);

CREATE INDEX IF NOT EXISTS idx_establishment_sanctions_active
  ON public.establishment_sanctions(deactivation_end)
  WHERE lifted_at IS NULL AND deactivation_end IS NOT NULL;

COMMENT ON TABLE public.establishment_sanctions IS 'Progressive sanctions history for establishments (warning, deactivation 7d/30d, exclusion)';

-- =============================================================================
-- 11. TRIGGERS: auto-update updated_at for new tables
-- =============================================================================

-- Reuse existing trigger function (created in reviews migration)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'establishment_capacity',
      'establishment_slot_discounts',
      'no_show_disputes',
      'pro_trust_scores',
      'quote_requests',
      'pro_auto_accept_rules'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trigger_%s_updated_at ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trigger_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl, tbl
    );
  END LOOP;
END
$$;

-- =============================================================================
-- 12. FUNCTIONS: Availability calculation
-- =============================================================================

-- Calculate available capacity for a given establishment, date, and time
-- Returns breakdown: total, paid_available, free_available, buffer_available, occupied
CREATE OR REPLACE FUNCTION calculate_slot_availability(
  p_establishment_id UUID,
  p_date DATE,
  p_time TIME
)
RETURNS TABLE(
  total_capacity INTEGER,
  paid_total INTEGER,
  free_total INTEGER,
  buffer_total INTEGER,
  paid_occupied INTEGER,
  free_occupied INTEGER,
  buffer_occupied INTEGER,
  paid_available INTEGER,
  free_available INTEGER,
  buffer_available INTEGER,
  occupation_rate NUMERIC(5,2)
) AS $$
DECLARE
  v_dow SMALLINT;
  v_cap RECORD;
  v_occupation_duration INTERVAL;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
BEGIN
  v_dow := EXTRACT(DOW FROM p_date)::SMALLINT;

  -- Find capacity config: specific_date first, then day_of_week, then default (null)
  SELECT * INTO v_cap
  FROM public.establishment_capacity ec
  WHERE ec.establishment_id = p_establishment_id
    AND ec.is_closed = FALSE
    AND p_time >= ec.time_slot_start
    AND p_time < ec.time_slot_end
    AND (
      (ec.specific_date = p_date)
      OR (ec.specific_date IS NULL AND ec.day_of_week = v_dow)
      OR (ec.specific_date IS NULL AND ec.day_of_week IS NULL)
    )
  ORDER BY
    ec.specific_date IS NOT NULL DESC,  -- specific_date first
    ec.day_of_week IS NOT NULL DESC      -- then day_of_week, then default
  LIMIT 1;

  -- No config found → return zeros
  IF v_cap IS NULL THEN
    RETURN QUERY SELECT
      0::INTEGER, 0::INTEGER, 0::INTEGER, 0::INTEGER,
      0::INTEGER, 0::INTEGER, 0::INTEGER,
      0::INTEGER, 0::INTEGER, 0::INTEGER,
      0.0::NUMERIC(5,2);
    RETURN;
  END IF;

  -- Calculate occupation window
  v_occupation_duration := (v_cap.occupation_duration_minutes || ' minutes')::INTERVAL;
  v_slot_start := (p_date || ' ' || p_time)::TIMESTAMPTZ;
  v_slot_end := v_slot_start + v_occupation_duration;

  -- Calculate quota amounts
  total_capacity := v_cap.total_capacity;
  paid_total := ROUND(v_cap.total_capacity * v_cap.paid_stock_percentage / 100.0)::INTEGER;
  free_total := ROUND(v_cap.total_capacity * v_cap.free_stock_percentage / 100.0)::INTEGER;
  buffer_total := v_cap.total_capacity - paid_total - free_total;  -- remainder to avoid rounding errors

  -- Count occupied seats by stock type (overlap-based)
  SELECT
    COALESCE(SUM(CASE WHEN r.stock_type = 'paid_stock' THEN r.party_size ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN r.stock_type = 'free_stock' THEN r.party_size ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN r.stock_type = 'buffer' THEN r.party_size ELSE 0 END), 0)::INTEGER
  INTO paid_occupied, free_occupied, buffer_occupied
  FROM public.reservations r
  WHERE r.establishment_id = p_establishment_id
    AND r.status IN ('requested', 'pending_pro_validation', 'confirmed', 'deposit_paid')
    AND r.starts_at < v_slot_end
    AND (r.starts_at + v_occupation_duration) > v_slot_start;

  -- Calculate available
  paid_available := GREATEST(0, paid_total - paid_occupied);
  free_available := GREATEST(0, free_total - free_occupied);
  buffer_available := GREATEST(0, buffer_total - buffer_occupied);

  -- Occupation rate
  IF total_capacity > 0 THEN
    occupation_rate := ROUND(
      ((paid_occupied + free_occupied + buffer_occupied)::NUMERIC / total_capacity) * 100, 2
    );
  ELSE
    occupation_rate := 0.0;
  END IF;

  RETURN QUERY SELECT
    total_capacity, paid_total, free_total, buffer_total,
    paid_occupied, free_occupied, buffer_occupied,
    paid_available, free_available, buffer_available,
    occupation_rate;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_slot_availability IS 'Calculate real-time availability breakdown by stock type (paid/free/buffer) using overlap-based occupation';

-- =============================================================================
-- 13. FUNCTION: Compute client score V2
-- Scale: 0-100 (displayed as 0-5 stars = score/20)
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_client_score_v2(
  p_honored INTEGER DEFAULT 0,
  p_no_shows INTEGER DEFAULT 0,
  p_late_cancellations INTEGER DEFAULT 0,       -- 12h-24h
  p_very_late_cancellations INTEGER DEFAULT 0,  -- <12h
  p_total_reservations INTEGER DEFAULT 0,
  p_reviews_posted INTEGER DEFAULT 0,
  p_free_to_paid_conversions INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
  v_base INTEGER := 60;  -- 3.0 stars baseline
  v_score NUMERIC;
  v_anciennete NUMERIC := 0;
BEGIN
  -- Points system (on 100 scale, mapped from 5.0 scale × 20)
  -- +1 point (5.0 scale) = +20 pts (100 scale) per honored reservation
  -- -3 points (5.0 scale) = -60 pts per no-show → too harsh, use -15 per no-show
  -- Adjusted for 100 scale:
  v_score := v_base
    + (p_honored * 5)                    -- +5 pts per honored (= +0.25 stars)
    - (p_no_shows * 15)                  -- -15 pts per no-show (= -0.75 stars)
    - (p_late_cancellations * 5)         -- -5 pts per late cancel 12-24h (= -0.25 stars)
    - (p_very_late_cancellations * 10)   -- -10 pts per very late cancel <12h (= -0.5 stars)
    + (p_reviews_posted * 1)             -- +1 pt per review (= +0.05 stars)
    + (p_free_to_paid_conversions * 2);  -- +2 pts per upgrade (= +0.1 stars)

  -- Anciennete bonus
  IF p_total_reservations >= 20 THEN
    v_anciennete := 10;  -- +0.5 stars after 20 reservations
  ELSIF p_total_reservations >= 5 THEN
    v_anciennete := 5;   -- +0.25 stars after 5 reservations
  END IF;

  v_score := v_score + v_anciennete;

  -- Clamp to [0, 100]
  RETURN GREATEST(0, LEAST(100, ROUND(v_score)::INTEGER));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION compute_client_score_v2 IS 'Compute client reliability score (0-100). Display as stars: score/20 = 0-5.0 stars. Base = 60 (3.0 stars)';

-- =============================================================================
-- 14. RLS POLICIES
-- =============================================================================

-- establishment_capacity
ALTER TABLE public.establishment_capacity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS establishment_capacity_select ON public.establishment_capacity;
CREATE POLICY establishment_capacity_select ON public.establishment_capacity
  FOR SELECT USING (true);  -- Public read (needed for booking calendar)

-- establishment_slot_discounts
ALTER TABLE public.establishment_slot_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS establishment_slot_discounts_select ON public.establishment_slot_discounts;
CREATE POLICY establishment_slot_discounts_select ON public.establishment_slot_discounts
  FOR SELECT USING (is_active = TRUE);

-- no_show_disputes
ALTER TABLE public.no_show_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS no_show_disputes_select_involved ON public.no_show_disputes;
CREATE POLICY no_show_disputes_select_involved ON public.no_show_disputes
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true)
  );

-- pro_trust_scores
ALTER TABLE public.pro_trust_scores ENABLE ROW LEVEL SECURITY;
-- No public read — admin and pro only (via service role)

-- quote_requests
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_requests_select_own ON public.quote_requests;
CREATE POLICY quote_requests_select_own ON public.quote_requests
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS quote_requests_insert_own ON public.quote_requests;
CREATE POLICY quote_requests_insert_own ON public.quote_requests
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
  );

-- quote_messages
ALTER TABLE public.quote_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_messages_select ON public.quote_messages;
CREATE POLICY quote_messages_select ON public.quote_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quote_requests qr
      WHERE qr.id = quote_request_id
      AND qr.user_id = current_setting('app.current_user_id', true)
    )
  );

-- pro_auto_accept_rules
ALTER TABLE public.pro_auto_accept_rules ENABLE ROW LEVEL SECURITY;
-- Pro and admin only (via service role)

-- establishment_sanctions
ALTER TABLE public.establishment_sanctions ENABLE ROW LEVEL SECURITY;
-- Admin only (via service role)

-- =============================================================================
-- 15. EXTEND: waitlist_entries — add probability estimation field
-- =============================================================================

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS estimated_probability NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS party_size INTEGER;

COMMENT ON COLUMN public.waitlist_entries.estimated_probability IS 'Estimated probability of getting a spot based on historical cancellation rate';

-- =============================================================================
-- 16. EXTEND: Update reservation state machine
-- Add new valid transitions for V2 statuses
-- =============================================================================

-- This is handled in TypeScript (shared/reservationStates.ts)
-- The DB CHECK constraint already includes all valid statuses (see step 1b)

-- =============================================================================
-- 17. CREATE: Audit logs table for V2 security
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'pro', 'client', 'system')),
  actor_id TEXT,
  target_type TEXT CHECK (target_type IN ('reservation', 'establishment', 'user', 'dispute', 'quote', 'sanction')),
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by action and time
CREATE INDEX IF NOT EXISTS idx_audit_logs_v2_action_created
  ON public.audit_logs_v2 (action, created_at DESC);

-- Index for querying by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_v2_actor
  ON public.audit_logs_v2 (actor_type, actor_id, created_at DESC);

-- Index for querying by target
CREATE INDEX IF NOT EXISTS idx_audit_logs_v2_target
  ON public.audit_logs_v2 (target_type, target_id, created_at DESC);

-- RLS: Only superadmin can read audit logs
ALTER TABLE public.audit_logs_v2 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.audit_logs_v2 IS 'Audit trail for all sensitive V2 reservation actions (security, compliance)';

COMMIT;
