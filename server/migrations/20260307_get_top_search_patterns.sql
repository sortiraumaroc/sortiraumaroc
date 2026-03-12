-- ============================================================================
-- Migration: get_top_search_patterns()
-- Date: 2026-03-07
-- Description: Aggregate top search patterns from search_history for
--              automatic landing page generation. Replaces the in-memory
--              fallback in server/index.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_top_search_patterns(
  days_back int DEFAULT 90,
  min_count int DEFAULT 10,
  max_results int DEFAULT 50
)
RETURNS TABLE(
  query text,
  universe text,
  city text,
  search_count bigint
)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT
    lower(trim(sh.query)) AS query,
    lower(trim(coalesce(sh.universe, 'restaurant'))) AS universe,
    trim(coalesce(sh.city, '')) AS city,
    count(*) AS search_count
  FROM search_history sh
  WHERE
    sh.created_at >= now() - (days_back || ' days')::interval
    AND sh.query IS NOT NULL
    AND trim(sh.query) <> ''
  GROUP BY
    lower(trim(sh.query)),
    lower(trim(coalesce(sh.universe, 'restaurant'))),
    trim(coalesce(sh.city, ''))
  HAVING count(*) >= min_count
  ORDER BY search_count DESC
  LIMIT max_results;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_top_search_patterns(int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_search_patterns(int, int, int) TO service_role;
