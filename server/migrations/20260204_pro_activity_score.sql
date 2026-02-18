-- Migration: PRO Activity & Assiduity Score System
-- Système de scoring d'activité pour favoriser les établissements assidus dans les recherches

begin;

-- ---------------------------------------------------------------------------
-- 1. Add online status and activity columns to establishments
-- ---------------------------------------------------------------------------
ALTER TABLE public.establishments
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS online_since TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS total_online_minutes INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS activity_score INT DEFAULT 0; -- Score 0-100

COMMENT ON COLUMN public.establishments.is_online IS 'Si l''établissement est actuellement en ligne (toggle PRO)';
COMMENT ON COLUMN public.establishments.online_since IS 'Timestamp de début de la session en ligne actuelle';
COMMENT ON COLUMN public.establishments.last_online_at IS 'Dernière fois que l''établissement était en ligne';
COMMENT ON COLUMN public.establishments.total_online_minutes IS 'Temps total passé en ligne (cumulé, en minutes)';
COMMENT ON COLUMN public.establishments.activity_score IS 'Score d''assiduité calculé (0-100), impacte le classement recherche';

-- Ensure existing establishments are online by default (for existing data where column was previously FALSE)
UPDATE public.establishments SET is_online = TRUE WHERE is_online = FALSE OR is_online IS NULL;

-- Index for search ordering by activity
CREATE INDEX IF NOT EXISTS idx_establishments_activity_score ON public.establishments (activity_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_establishments_is_online ON public.establishments (is_online) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 2. Create PRO activity tracking table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pro_activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- PRO user who triggered the session

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL,
  duration_minutes INT GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
      ELSE NULL
    END
  ) STORED,

  -- Session metadata
  session_type TEXT NOT NULL DEFAULT 'online' CHECK (session_type IN ('online', 'active', 'reservation_action')),
  -- online = toggle en ligne
  -- active = navigation/actions dans le dashboard
  -- reservation_action = action sur une réservation

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_activity_sessions_establishment ON public.pro_activity_sessions (establishment_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pro_activity_sessions_date ON public.pro_activity_sessions (started_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Create PRO activity daily aggregates for faster scoring
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pro_activity_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Daily metrics
  online_minutes INT DEFAULT 0, -- Minutes en ligne ce jour
  sessions_count INT DEFAULT 0, -- Nombre de sessions
  reservations_handled INT DEFAULT 0, -- Réservations traitées (confirmées/refusées)
  reservations_confirmed INT DEFAULT 0, -- Réservations confirmées
  avg_response_time_minutes INT NULL, -- Temps moyen de réponse aux réservations
  slots_updated INT DEFAULT 0, -- Créneaux créés/modifiés

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (establishment_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pro_activity_daily_lookup ON public.pro_activity_daily (establishment_id, date DESC);

-- ---------------------------------------------------------------------------
-- 4. Function to toggle online status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_establishment_online(
  p_establishment_id UUID,
  p_user_id UUID,
  p_is_online BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_establishment RECORD;
  v_session_id UUID;
  v_session_duration INT;
BEGIN
  -- Get current establishment state
  SELECT id, is_online, online_since, total_online_minutes
  INTO v_establishment
  FROM public.establishments
  WHERE id = p_establishment_id;

  IF v_establishment.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'establishment_not_found');
  END IF;

  -- Going ONLINE
  IF p_is_online = TRUE AND (v_establishment.is_online IS NULL OR v_establishment.is_online = FALSE) THEN
    -- Start new online session
    INSERT INTO public.pro_activity_sessions (establishment_id, user_id, session_type, started_at)
    VALUES (p_establishment_id, p_user_id, 'online', NOW())
    RETURNING id INTO v_session_id;

    -- Update establishment
    UPDATE public.establishments
    SET
      is_online = TRUE,
      online_since = NOW(),
      updated_at = NOW()
    WHERE id = p_establishment_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'action', 'went_online',
      'session_id', v_session_id,
      'online_since', NOW()
    );

  -- Going OFFLINE
  ELSIF p_is_online = FALSE AND v_establishment.is_online = TRUE THEN
    -- Calculate session duration
    v_session_duration := EXTRACT(EPOCH FROM (NOW() - v_establishment.online_since)) / 60;

    -- Close the current session
    UPDATE public.pro_activity_sessions
    SET ended_at = NOW()
    WHERE establishment_id = p_establishment_id
      AND session_type = 'online'
      AND ended_at IS NULL;

    -- Update establishment
    UPDATE public.establishments
    SET
      is_online = FALSE,
      last_online_at = NOW(),
      total_online_minutes = COALESCE(total_online_minutes, 0) + COALESCE(v_session_duration, 0),
      online_since = NULL,
      updated_at = NOW()
    WHERE id = p_establishment_id;

    -- Update daily aggregate
    INSERT INTO public.pro_activity_daily (establishment_id, date, online_minutes, sessions_count)
    VALUES (p_establishment_id, CURRENT_DATE, COALESCE(v_session_duration, 0), 1)
    ON CONFLICT (establishment_id, date)
    DO UPDATE SET
      online_minutes = public.pro_activity_daily.online_minutes + COALESCE(v_session_duration, 0),
      sessions_count = public.pro_activity_daily.sessions_count + 1,
      updated_at = NOW();

    RETURN jsonb_build_object(
      'ok', TRUE,
      'action', 'went_offline',
      'session_duration_minutes', v_session_duration,
      'total_online_minutes', COALESCE(v_establishment.total_online_minutes, 0) + COALESCE(v_session_duration, 0)
    );

  ELSE
    -- No change needed
    RETURN jsonb_build_object(
      'ok', TRUE,
      'action', 'no_change',
      'is_online', v_establishment.is_online
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_establishment_online(UUID, UUID, BOOLEAN) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Function to calculate activity score (0-100)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_establishment_activity_score(
  p_establishment_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score INT := 0;
  v_days_active INT := 0;
  v_total_online_hours NUMERIC := 0;
  v_avg_daily_minutes NUMERIC := 0;
  v_confirmation_rate NUMERIC := 0;
  v_recent_activity RECORD;
  v_establishment RECORD;
BEGIN
  -- Get establishment data
  SELECT id, total_online_minutes, last_online_at, is_online
  INTO v_establishment
  FROM public.establishments
  WHERE id = p_establishment_id;

  IF v_establishment.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate metrics from last 30 days
  SELECT
    COUNT(DISTINCT date) as days_active,
    SUM(online_minutes) as total_minutes,
    AVG(online_minutes) as avg_daily_minutes,
    SUM(reservations_confirmed) as confirmed,
    SUM(reservations_handled) as handled
  INTO v_recent_activity
  FROM public.pro_activity_daily
  WHERE establishment_id = p_establishment_id
    AND date >= CURRENT_DATE - INTERVAL '30 days';

  v_days_active := COALESCE(v_recent_activity.days_active, 0);
  v_total_online_hours := COALESCE(v_recent_activity.total_minutes, 0) / 60.0;
  v_avg_daily_minutes := COALESCE(v_recent_activity.avg_daily_minutes, 0);

  -- Calculate confirmation rate
  IF COALESCE(v_recent_activity.handled, 0) > 0 THEN
    v_confirmation_rate := (COALESCE(v_recent_activity.confirmed, 0)::NUMERIC / v_recent_activity.handled) * 100;
  END IF;

  -- SCORING ALGORITHM (0-100 points total)

  -- 1. Days active in last 30 days (max 30 points)
  -- 30 days = 30 points, 15 days = 15 points, etc.
  v_score := v_score + LEAST(30, v_days_active);

  -- 2. Average daily online time (max 25 points)
  -- 4+ hours/day = 25 points, 2 hours = 12.5 points, etc.
  v_score := v_score + LEAST(25, ROUND(v_avg_daily_minutes / 240.0 * 25));

  -- 3. Total online hours last 30 days (max 20 points)
  -- 100+ hours = 20 points, scaled down
  v_score := v_score + LEAST(20, ROUND(v_total_online_hours / 100.0 * 20));

  -- 4. Confirmation rate (max 15 points)
  -- 100% = 15 points, 50% = 7.5 points
  v_score := v_score + ROUND(v_confirmation_rate / 100.0 * 15);

  -- 5. Currently online bonus (10 points)
  IF v_establishment.is_online = TRUE THEN
    v_score := v_score + 10;
  END IF;

  -- 6. Recent activity bonus - last seen within 24h (5 points bonus, included in max)
  IF v_establishment.last_online_at >= NOW() - INTERVAL '24 hours' OR v_establishment.is_online = TRUE THEN
    v_score := LEAST(100, v_score + 5);
  END IF;

  -- Ensure score is within bounds
  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_establishment_activity_score(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Function to batch update all activity scores (called by cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_all_activity_scores()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT := 0;
  v_establishment RECORD;
  v_new_score INT;
BEGIN
  FOR v_establishment IN (
    SELECT id FROM public.establishments WHERE status = 'active'
  )
  LOOP
    v_new_score := public.calculate_establishment_activity_score(v_establishment.id);

    UPDATE public.establishments
    SET activity_score = v_new_score, updated_at = NOW()
    WHERE id = v_establishment.id AND (activity_score IS DISTINCT FROM v_new_score);

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'updated_count', v_updated,
    'processed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_all_activity_scores() TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Auto-close stale online sessions (safety net - called by cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_stale_online_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed INT := 0;
  v_stale_establishment RECORD;
  v_session_duration INT;
BEGIN
  -- Find establishments that have been "online" for more than 12 hours without activity
  -- This is a safety net for cases where the PRO forgot to go offline or browser crashed
  FOR v_stale_establishment IN (
    SELECT e.id, e.online_since, e.total_online_minutes
    FROM public.establishments e
    WHERE e.is_online = TRUE
      AND e.online_since < NOW() - INTERVAL '12 hours'
  )
  LOOP
    -- Cap session at 12 hours max
    v_session_duration := 720; -- 12 hours in minutes

    -- Close the session
    UPDATE public.pro_activity_sessions
    SET ended_at = v_stale_establishment.online_since + INTERVAL '12 hours'
    WHERE establishment_id = v_stale_establishment.id
      AND session_type = 'online'
      AND ended_at IS NULL;

    -- Update establishment
    UPDATE public.establishments
    SET
      is_online = FALSE,
      last_online_at = v_stale_establishment.online_since + INTERVAL '12 hours',
      total_online_minutes = COALESCE(total_online_minutes, 0) + v_session_duration,
      online_since = NULL,
      updated_at = NOW()
    WHERE id = v_stale_establishment.id;

    -- Update daily aggregate
    INSERT INTO public.pro_activity_daily (establishment_id, date, online_minutes, sessions_count)
    VALUES (v_stale_establishment.id, v_stale_establishment.online_since::DATE, v_session_duration, 1)
    ON CONFLICT (establishment_id, date)
    DO UPDATE SET
      online_minutes = public.pro_activity_daily.online_minutes + v_session_duration,
      sessions_count = public.pro_activity_daily.sessions_count + 1,
      updated_at = NOW();

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'closed_count', v_closed,
    'processed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_stale_online_sessions() TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Update search scoring function to include activity_score
-- ---------------------------------------------------------------------------
-- Note: This enhances the existing search to factor in activity_score
-- The actual search function (search_establishments_scored) should be updated
-- to include activity_score in the total_score calculation

-- Create or update the combined search view
CREATE OR REPLACE VIEW public.establishments_search_ranked AS
SELECT
  e.id,
  e.name,
  e.universe,
  e.city,
  e.status,
  e.is_online,
  e.activity_score,
  e.avg_rating,
  e.review_count,
  e.verified,
  e.premium,
  e.curated,
  -- Combined ranking score
  (
    COALESCE(e.activity_score, 0) * 0.3 +  -- 30% weight for activity
    COALESCE(e.avg_rating, 0) * 10 +        -- Rating contributes up to 50 points
    CASE WHEN e.is_online THEN 15 ELSE 0 END + -- Online bonus
    CASE WHEN e.verified THEN 5 ELSE 0 END +   -- Verified bonus
    CASE WHEN e.premium THEN 10 ELSE 0 END +   -- Premium bonus
    CASE WHEN e.curated THEN 5 ELSE 0 END      -- Curated bonus
  ) AS ranking_score
FROM public.establishments e
WHERE e.status = 'active'
  AND e.is_online = TRUE;

-- ---------------------------------------------------------------------------
-- 9. Track reservation actions for activity scoring
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_reservation_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only track when status changes to confirmed or refused
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('confirmed', 'refused', 'cancelled_pro') THEN
      -- Update daily aggregate
      INSERT INTO public.pro_activity_daily (
        establishment_id,
        date,
        reservations_handled,
        reservations_confirmed
      )
      VALUES (
        NEW.establishment_id,
        CURRENT_DATE,
        1,
        CASE WHEN NEW.status = 'confirmed' THEN 1 ELSE 0 END
      )
      ON CONFLICT (establishment_id, date)
      DO UPDATE SET
        reservations_handled = public.pro_activity_daily.reservations_handled + 1,
        reservations_confirmed = public.pro_activity_daily.reservations_confirmed +
          CASE WHEN NEW.status = 'confirmed' THEN 1 ELSE 0 END,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_track_reservation_activity'
  ) THEN
    CREATE TRIGGER trg_track_reservation_activity
    AFTER UPDATE ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.track_reservation_activity();
  END IF;
END $$;

commit;
