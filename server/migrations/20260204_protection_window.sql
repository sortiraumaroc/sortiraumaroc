-- Migration: Protection Window for Free Reservations
-- Empêche le déplacement des réservations gratuites confirmées X heures avant l'heure
-- de réservation lorsqu'une réservation payante arrive

begin;

-- ---------------------------------------------------------------------------
-- 1. Add protection_window_hours to booking_policies
-- ---------------------------------------------------------------------------
-- Valeur en heures avant le début de la réservation pendant laquelle
-- une réservation gratuite confirmée ne peut plus être déplacée par une payante.
-- Par défaut: 2 heures (protection raisonnable pour le client en route)

ALTER TABLE public.booking_policies
ADD COLUMN IF NOT EXISTS protection_window_hours INTEGER DEFAULT 2;

COMMENT ON COLUMN public.booking_policies.protection_window_hours IS
  'Nombre d''heures avant la réservation pendant lesquelles une réservation gratuite confirmée ne peut pas être déplacée par une payante. NULL ou 0 = pas de protection.';

-- ---------------------------------------------------------------------------
-- 2. Create function to check if a reservation is protected
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_reservation_protected(
  p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_policy RECORD;
  v_protection_window_hours INTEGER;
  v_protection_starts_at TIMESTAMPTZ;
  v_is_protected BOOLEAN := FALSE;
  v_reason TEXT := NULL;
  v_hours_until_start NUMERIC;
BEGIN
  -- Get the reservation details
  SELECT
    r.id,
    r.establishment_id,
    r.starts_at,
    r.status,
    r.payment_status,
    r.amount_deposit,
    r.is_from_waitlist
  INTO v_reservation
  FROM public.reservations r
  WHERE r.id = p_reservation_id;

  IF v_reservation.id IS NULL THEN
    RETURN jsonb_build_object(
      'protected', FALSE,
      'reason', 'reservation_not_found'
    );
  END IF;

  -- Only protect confirmed free reservations (not paid, not from waitlist)
  IF v_reservation.status NOT IN ('confirmed', 'pending_pro_validation') THEN
    RETURN jsonb_build_object(
      'protected', FALSE,
      'reason', 'status_not_eligible',
      'status', v_reservation.status
    );
  END IF;

  -- If already paid, no need for protection (paid reservations have priority)
  IF v_reservation.payment_status = 'paid' OR
     (v_reservation.amount_deposit IS NOT NULL AND v_reservation.amount_deposit > 0) THEN
    RETURN jsonb_build_object(
      'protected', FALSE,
      'reason', 'already_paid_or_deposit'
    );
  END IF;

  -- If from waitlist and still pending, not protected
  IF v_reservation.is_from_waitlist = TRUE THEN
    RETURN jsonb_build_object(
      'protected', FALSE,
      'reason', 'from_waitlist'
    );
  END IF;

  -- Get the booking policy for this establishment
  SELECT bp.protection_window_hours
  INTO v_policy
  FROM public.booking_policies bp
  WHERE bp.establishment_id = v_reservation.establishment_id;

  v_protection_window_hours := COALESCE(v_policy.protection_window_hours, 2);

  -- If no protection window configured, not protected
  IF v_protection_window_hours IS NULL OR v_protection_window_hours <= 0 THEN
    RETURN jsonb_build_object(
      'protected', FALSE,
      'reason', 'no_protection_window_configured',
      'protection_window_hours', v_protection_window_hours
    );
  END IF;

  -- Calculate hours until reservation starts
  v_hours_until_start := EXTRACT(EPOCH FROM (v_reservation.starts_at - NOW())) / 3600;

  -- Check if we're within the protection window
  IF v_hours_until_start <= v_protection_window_hours AND v_hours_until_start > 0 THEN
    v_is_protected := TRUE;
    v_reason := 'within_protection_window';
  ELSIF v_hours_until_start <= 0 THEN
    -- Reservation already started or passed
    v_is_protected := FALSE;
    v_reason := 'reservation_already_started';
  ELSE
    v_is_protected := FALSE;
    v_reason := 'outside_protection_window';
  END IF;

  RETURN jsonb_build_object(
    'protected', v_is_protected,
    'reason', v_reason,
    'reservation_id', p_reservation_id,
    'hours_until_start', ROUND(v_hours_until_start::numeric, 2),
    'protection_window_hours', v_protection_window_hours,
    'starts_at', v_reservation.starts_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_reservation_protected(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Create function to check if a slot has protected reservations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slot_has_protected_reservations(
  p_slot_id UUID,
  p_exclude_reservation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot RECORD;
  v_policy RECORD;
  v_protection_window_hours INTEGER;
  v_hours_until_start NUMERIC;
  v_protected_count INTEGER := 0;
  v_protected_ids UUID[] := '{}';
  v_reservation RECORD;
BEGIN
  -- Get slot info
  SELECT s.id, s.establishment_id, s.starts_at
  INTO v_slot
  FROM public.pro_slots s
  WHERE s.id = p_slot_id;

  IF v_slot.id IS NULL THEN
    RETURN jsonb_build_object(
      'has_protected', FALSE,
      'reason', 'slot_not_found',
      'protected_count', 0
    );
  END IF;

  -- Get protection window from policy
  SELECT bp.protection_window_hours
  INTO v_policy
  FROM public.booking_policies bp
  WHERE bp.establishment_id = v_slot.establishment_id;

  v_protection_window_hours := COALESCE(v_policy.protection_window_hours, 2);

  IF v_protection_window_hours IS NULL OR v_protection_window_hours <= 0 THEN
    RETURN jsonb_build_object(
      'has_protected', FALSE,
      'reason', 'no_protection_window',
      'protected_count', 0
    );
  END IF;

  -- Calculate hours until slot starts
  v_hours_until_start := EXTRACT(EPOCH FROM (v_slot.starts_at - NOW())) / 3600;

  -- If outside protection window, no reservations are protected
  IF v_hours_until_start > v_protection_window_hours OR v_hours_until_start <= 0 THEN
    RETURN jsonb_build_object(
      'has_protected', FALSE,
      'reason', CASE
        WHEN v_hours_until_start <= 0 THEN 'slot_already_started'
        ELSE 'outside_protection_window'
      END,
      'protected_count', 0,
      'hours_until_start', ROUND(v_hours_until_start::numeric, 2),
      'protection_window_hours', v_protection_window_hours
    );
  END IF;

  -- Find all protected reservations on this slot
  FOR v_reservation IN (
    SELECT r.id
    FROM public.reservations r
    WHERE r.slot_id = p_slot_id
      AND r.status IN ('confirmed', 'pending_pro_validation')
      AND (r.payment_status IS NULL OR r.payment_status != 'paid')
      AND (r.amount_deposit IS NULL OR r.amount_deposit = 0)
      AND (r.is_from_waitlist IS NULL OR r.is_from_waitlist = FALSE)
      AND (p_exclude_reservation_id IS NULL OR r.id != p_exclude_reservation_id)
  )
  LOOP
    v_protected_count := v_protected_count + 1;
    v_protected_ids := array_append(v_protected_ids, v_reservation.id);
  END LOOP;

  RETURN jsonb_build_object(
    'has_protected', v_protected_count > 0,
    'protected_count', v_protected_count,
    'protected_reservation_ids', v_protected_ids,
    'hours_until_start', ROUND(v_hours_until_start::numeric, 2),
    'protection_window_hours', v_protection_window_hours,
    'slot_starts_at', v_slot.starts_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.slot_has_protected_reservations(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Add index for faster protected reservation lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservations_protection_lookup
ON public.reservations (slot_id, status, payment_status)
WHERE status IN ('confirmed', 'pending_pro_validation')
  AND (payment_status IS NULL OR payment_status != 'paid');

commit;
