-- Migration: Reservation status change notifications
-- Automatically notifies clients when their reservation status changes

-- ============================================
-- 1. Notification preferences table
-- ============================================
CREATE TABLE IF NOT EXISTS reservation_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES consumer_users(id) ON DELETE CASCADE,

  -- Notification channels
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,

  -- What to notify about
  notify_confirmation BOOLEAN DEFAULT TRUE,
  notify_cancellation BOOLEAN DEFAULT TRUE,
  notify_modification BOOLEAN DEFAULT TRUE,
  notify_reminder BOOLEAN DEFAULT TRUE,
  notify_waitlist_offer BOOLEAN DEFAULT TRUE,

  -- Reminder timing (hours before)
  reminder_hours_before INTEGER DEFAULT 24,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_notif_prefs_user ON reservation_notification_preferences(user_id);

-- ============================================
-- 2. Notification log table
-- ============================================
CREATE TABLE IF NOT EXISTS reservation_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES consumer_users(id) ON DELETE SET NULL,

  -- Notification details
  notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'push', 'sms')),
  event_type TEXT NOT NULL, -- 'confirmation', 'cancellation', 'modification', 'reminder', 'waitlist_offer'

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),

  -- Content
  subject TEXT,
  body TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reservation_notif_sent_reservation ON reservation_notifications_sent(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_notif_sent_user ON reservation_notifications_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_reservation_notif_sent_status ON reservation_notifications_sent(status);
CREATE INDEX IF NOT EXISTS idx_reservation_notif_sent_created ON reservation_notifications_sent(created_at DESC);

-- ============================================
-- 3. RLS Policies
-- ============================================
ALTER TABLE reservation_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notification preferences" ON reservation_notification_preferences;
CREATE POLICY "Users can manage own notification preferences" ON reservation_notification_preferences
FOR ALL USING (user_id = auth.uid()::text);

ALTER TABLE reservation_notifications_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON reservation_notifications_sent;
CREATE POLICY "Users can view own notifications" ON reservation_notifications_sent
FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Pro can view establishment notifications" ON reservation_notifications_sent;
CREATE POLICY "Pro can view establishment notifications" ON reservation_notifications_sent
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pro_memberships pm
    WHERE pm.establishment_id = reservation_notifications_sent.establishment_id
    AND pm.user_id = auth.uid()
  )
);

-- ============================================
-- 4. Function to queue notification on status change
-- ============================================
CREATE OR REPLACE FUNCTION queue_reservation_status_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id TEXT;
  v_event_type TEXT;
  v_prefs RECORD;
BEGIN
  -- Only process if status changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_user_id := NEW.user_id;

  -- Determine event type based on new status
  v_event_type := CASE NEW.status
    WHEN 'confirmed' THEN 'confirmation'
    WHEN 'cancelled' THEN 'cancellation'
    WHEN 'cancelled_user' THEN 'cancellation'
    WHEN 'cancelled_pro' THEN 'cancellation'
    WHEN 'refused' THEN 'cancellation'
    WHEN 'waitlist' THEN 'waitlist_offer'
    ELSE NULL
  END;

  -- Skip if no matching event type
  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get user preferences (or use defaults)
  SELECT * INTO v_prefs FROM reservation_notification_preferences WHERE user_id = v_user_id;

  -- Queue email notification if enabled (default to true)
  IF v_prefs IS NULL OR v_prefs.email_enabled THEN
    -- Check specific event preference
    IF (v_event_type = 'confirmation' AND (v_prefs IS NULL OR v_prefs.notify_confirmation)) OR
       (v_event_type = 'cancellation' AND (v_prefs IS NULL OR v_prefs.notify_cancellation)) OR
       (v_event_type = 'waitlist_offer' AND (v_prefs IS NULL OR v_prefs.notify_waitlist_offer)) THEN

      INSERT INTO reservation_notifications_sent (
        reservation_id,
        establishment_id,
        user_id,
        notification_type,
        event_type,
        status
      ) VALUES (
        NEW.id,
        NEW.establishment_id,
        v_user_id,
        'email',
        v_event_type,
        'pending'
      );
    END IF;
  END IF;

  -- Queue push notification if enabled
  IF v_prefs IS NOT NULL AND v_prefs.push_enabled THEN
    IF (v_event_type = 'confirmation' AND v_prefs.notify_confirmation) OR
       (v_event_type = 'cancellation' AND v_prefs.notify_cancellation) OR
       (v_event_type = 'waitlist_offer' AND v_prefs.notify_waitlist_offer) THEN

      INSERT INTO reservation_notifications_sent (
        reservation_id,
        establishment_id,
        user_id,
        notification_type,
        event_type,
        status
      ) VALUES (
        NEW.id,
        NEW.establishment_id,
        v_user_id,
        'push',
        v_event_type,
        'pending'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trg_queue_reservation_notification ON reservations;
CREATE TRIGGER trg_queue_reservation_notification
AFTER UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION queue_reservation_status_notification();

-- ============================================
-- 5. Reminder scheduling function (to be called by cron)
-- ============================================
CREATE OR REPLACE FUNCTION schedule_reservation_reminders()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_reservation RECORD;
BEGIN
  -- Find confirmed reservations that:
  -- 1. Start within the reminder window (default 24h)
  -- 2. Haven't had a reminder sent yet
  FOR v_reservation IN
    SELECT r.id, r.user_id, r.establishment_id, r.starts_at,
           COALESCE(p.reminder_hours_before, 24) as reminder_hours
    FROM reservations r
    LEFT JOIN reservation_notification_preferences p ON p.user_id = r.user_id
    WHERE r.status = 'confirmed'
    AND r.starts_at > NOW()
    AND r.starts_at <= NOW() + (COALESCE(p.reminder_hours_before, 24) || ' hours')::interval
    AND NOT EXISTS (
      SELECT 1 FROM reservation_notifications_sent ns
      WHERE ns.reservation_id = r.id
      AND ns.event_type = 'reminder'
    )
  LOOP
    INSERT INTO reservation_notifications_sent (
      reservation_id,
      establishment_id,
      user_id,
      notification_type,
      event_type,
      status
    ) VALUES (
      v_reservation.id,
      v_reservation.establishment_id,
      v_reservation.user_id,
      'email',
      'reminder',
      'pending'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
