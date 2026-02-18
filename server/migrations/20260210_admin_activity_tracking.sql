-- =============================================================================
-- Admin Activity Tracking: heartbeat-based active time measurement
-- =============================================================================
-- Each row represents one heartbeat (~30s interval) from an admin collaborator.
-- active_seconds = how many seconds of actual activity detected since last heartbeat.
-- Only heartbeats with active_seconds >= 1 are stored (idle heartbeats are skipped).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_activity_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.admin_collaborators(id) ON DELETE CASCADE,
  session_id text NOT NULL,                -- unique per browser session (UUID generated client-side)
  active_seconds smallint NOT NULL DEFAULT 0
    CHECK (active_seconds >= 0 AND active_seconds <= 120),
  page_path text,                          -- current admin page path (e.g., '/admin/establishments')
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient per-user-per-day aggregation queries
CREATE INDEX IF NOT EXISTS idx_admin_heartbeats_collab_created
  ON public.admin_activity_heartbeats (collaborator_id, created_at DESC);

-- Index for date-range queries across all users
CREATE INDEX IF NOT EXISTS idx_admin_heartbeats_created
  ON public.admin_activity_heartbeats (created_at DESC);

-- =============================================================================
-- RLS: service role has full access (admin API uses service role key)
-- =============================================================================
ALTER TABLE public.admin_activity_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on admin_activity_heartbeats"
  ON public.admin_activity_heartbeats
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SQL Function: Aggregate heartbeat stats per collaborator for a date range
-- Called via supabase.rpc('get_admin_activity_stats', { start_date, end_date })
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_activity_stats(
  start_date text,
  end_date text
)
RETURNS TABLE (
  collaborator_id uuid,
  session_count bigint,
  total_active_seconds bigint,
  first_heartbeat timestamptz,
  last_heartbeat timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    h.collaborator_id,
    COUNT(DISTINCT h.session_id) AS session_count,
    SUM(h.active_seconds::bigint) AS total_active_seconds,
    MIN(h.created_at) AS first_heartbeat,
    MAX(h.created_at) AS last_heartbeat
  FROM public.admin_activity_heartbeats h
  WHERE h.created_at >= start_date::date
    AND h.created_at < (end_date::date + interval '1 day')
  GROUP BY h.collaborator_id;
$$;

-- =============================================================================
-- SQL Function: Count establishments created by admin collaborators in a date range
-- Uses the admin_created_by_id field set by the establishment wizard
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_establishment_counts(
  start_date text,
  end_date text
)
RETURNS TABLE (
  collaborator_id uuid,
  establishment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    e.admin_created_by_id AS collaborator_id,
    COUNT(*) AS establishment_count
  FROM public.establishments e
  WHERE e.admin_created_by_id IS NOT NULL
    AND e.created_at >= start_date::date
    AND e.created_at < (end_date::date + interval '1 day')
  GROUP BY e.admin_created_by_id;
$$;

-- =============================================================================
-- SQL Function: Cleanup heartbeats older than 90 days
-- Can be called periodically via cron or at server startup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_admin_heartbeats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.admin_activity_heartbeats
  WHERE created_at < now() - interval '90 days';
END;
$$;
