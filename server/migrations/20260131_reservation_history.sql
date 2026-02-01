-- Migration: Reservation history/timeline
-- Tracks all mutations on reservations with timestamps

-- ============================================
-- 1. Reservation history logs table
-- ============================================
CREATE TABLE IF NOT EXISTS reservation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,

  -- Who made the change
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'pro', 'consumer')),
  actor_id TEXT, -- user_id or null for system
  actor_name TEXT, -- Display name for the actor

  -- What changed
  action TEXT NOT NULL, -- 'created', 'status_changed', 'modified', 'message_sent', etc.
  action_label TEXT NOT NULL, -- Human-readable label in French

  -- Change details
  previous_status TEXT,
  new_status TEXT,
  previous_data JSONB, -- Snapshot of changed fields before
  new_data JSONB, -- Snapshot of changed fields after

  -- Additional context
  message TEXT, -- Optional message (e.g., reason for refusal)
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reservation_history_reservation ON reservation_history(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_history_establishment ON reservation_history(establishment_id);
CREATE INDEX IF NOT EXISTS idx_reservation_history_created ON reservation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_history_action ON reservation_history(action);

-- ============================================
-- 2. RLS Policies
-- ============================================
ALTER TABLE reservation_history ENABLE ROW LEVEL SECURITY;

-- Pro members can view history for their establishment
DROP POLICY IF EXISTS "Pro members can view reservation history" ON reservation_history;
CREATE POLICY "Pro members can view reservation history" ON reservation_history
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pro_memberships pm
    WHERE pm.establishment_id = reservation_history.establishment_id
    AND pm.user_id = auth.uid()
  )
);

-- System can insert (via service role)
DROP POLICY IF EXISTS "System can insert history" ON reservation_history;
CREATE POLICY "System can insert history" ON reservation_history
FOR INSERT WITH CHECK (true);

-- ============================================
-- 3. Function to log reservation changes
-- ============================================
CREATE OR REPLACE FUNCTION log_reservation_change(
  p_reservation_id UUID,
  p_establishment_id UUID,
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_actor_name TEXT,
  p_action TEXT,
  p_action_label TEXT,
  p_previous_status TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL,
  p_previous_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO reservation_history (
    reservation_id,
    establishment_id,
    actor_type,
    actor_id,
    actor_name,
    action,
    action_label,
    previous_status,
    new_status,
    previous_data,
    new_data,
    message
  ) VALUES (
    p_reservation_id,
    p_establishment_id,
    p_actor_type,
    p_actor_id,
    p_actor_name,
    p_action,
    p_action_label,
    p_previous_status,
    p_new_status,
    p_previous_data,
    p_new_data,
    p_message
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Trigger to auto-log status changes
-- ============================================
CREATE OR REPLACE FUNCTION trg_log_reservation_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_action_label TEXT;
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Generate human-readable label
    v_action_label := CASE NEW.status
      WHEN 'requested' THEN 'Réservation demandée'
      WHEN 'pending_pro_validation' THEN 'En attente de validation'
      WHEN 'confirmed' THEN 'Réservation confirmée'
      WHEN 'waitlist' THEN 'Mis en liste d''attente'
      WHEN 'cancelled' THEN 'Réservation annulée'
      WHEN 'cancelled_user' THEN 'Annulée par le client'
      WHEN 'cancelled_pro' THEN 'Annulée par l''établissement'
      WHEN 'refused' THEN 'Réservation refusée'
      WHEN 'noshow' THEN 'Client absent (no-show)'
      ELSE 'Statut modifié: ' || NEW.status
    END;

    INSERT INTO reservation_history (
      reservation_id,
      establishment_id,
      actor_type,
      actor_id,
      actor_name,
      action,
      action_label,
      previous_status,
      new_status
    ) VALUES (
      NEW.id,
      NEW.establishment_id,
      'system',
      NULL,
      'Système',
      'status_changed',
      v_action_label,
      OLD.status,
      NEW.status
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reservation_status_change ON reservations;
CREATE TRIGGER trg_reservation_status_change
AFTER UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION trg_log_reservation_status_change();

-- ============================================
-- 5. Trigger to log reservation creation
-- ============================================
CREATE OR REPLACE FUNCTION trg_log_reservation_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO reservation_history (
    reservation_id,
    establishment_id,
    actor_type,
    actor_id,
    actor_name,
    action,
    action_label,
    new_status,
    new_data
  ) VALUES (
    NEW.id,
    NEW.establishment_id,
    'consumer',
    NEW.user_id,
    'Client',
    'created',
    'Réservation créée',
    NEW.status,
    jsonb_build_object(
      'party_size', NEW.party_size,
      'starts_at', NEW.starts_at
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reservation_created ON reservations;
CREATE TRIGGER trg_reservation_created
AFTER INSERT ON reservations
FOR EACH ROW
EXECUTE FUNCTION trg_log_reservation_created();
