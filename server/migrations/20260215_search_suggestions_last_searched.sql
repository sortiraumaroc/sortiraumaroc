-- Migration: Add last_searched_at column to search_suggestions
-- Purpose: Track when a suggestion was last searched to combine popularity + freshness
-- Part of: Prompt 3 — Auto-increment search_count

BEGIN;

-- Add last_searched_at column if it doesn't exist
ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS last_searched_at timestamptz DEFAULT now();

-- Backfill: set last_searched_at = updated_at for existing rows
UPDATE public.search_suggestions
SET last_searched_at = COALESCE(updated_at, created_at, now())
WHERE last_searched_at IS NULL;

-- Create a SQL function for popularity+freshness scoring
-- Formula: search_count * (1.0 / (1 + days_since_last_search))
-- Recent AND frequent searches rank higher
CREATE OR REPLACE FUNCTION get_popular_suggestions(
  filter_universe text DEFAULT NULL,
  max_results integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  term text,
  category text,
  display_label text,
  icon_name text,
  universe text,
  search_count integer,
  last_searched_at timestamptz,
  popularity_score double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    s.term,
    s.category,
    s.display_label,
    s.icon_name,
    s.universe,
    s.search_count,
    s.last_searched_at,
    -- Popularity * freshness decay: recent + frequent = highest score
    s.search_count::double precision * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - COALESCE(s.last_searched_at, s.created_at))) / 86400.0)) AS popularity_score
  FROM public.search_suggestions s
  WHERE s.is_active = true
    AND (filter_universe IS NULL OR s.universe = filter_universe OR s.universe IS NULL)
    AND s.search_count > 0
  ORDER BY popularity_score DESC
  LIMIT max_results;
$$;

-- Index to speed up popularity queries
CREATE INDEX IF NOT EXISTS idx_search_suggestions_popularity
  ON public.search_suggestions (is_active, search_count DESC, last_searched_at DESC NULLS LAST);

COMMIT;

-- TODO: Future cron job for cleanup:
-- DELETE FROM search_suggestions WHERE search_count < 3 AND last_searched_at < NOW() - INTERVAL '30 days';
-- TODO: Future fuzzy dedup of close suggestions (merge near-duplicates)
