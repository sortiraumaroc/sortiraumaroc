-- ============================================================================
-- Migration: Hashtag Search Function
-- Date: 2026-02-01
-- Description: Creates a function to search hashtags from video descriptions
--              and count their usage for relevance ranking
-- ============================================================================

-- Function to extract and search hashtags from home_videos descriptions
-- Returns hashtags matching the search term with usage count
CREATE OR REPLACE FUNCTION public.search_hashtags(search_term TEXT)
RETURNS TABLE (hashtag TEXT, usage_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH extracted_hashtags AS (
    -- Extract all hashtags from active video descriptions
    SELECT
      LOWER(TRIM(BOTH FROM (regexp_matches(description, '#([a-zA-Z0-9_\u00C0-\u024F]+)', 'g'))[1])) AS tag
    FROM public.home_videos
    WHERE is_active = true
      AND description IS NOT NULL
      AND description <> ''
  ),
  hashtag_counts AS (
    -- Count occurrences of each hashtag
    SELECT
      tag,
      COUNT(*) AS cnt
    FROM extracted_hashtags
    WHERE tag IS NOT NULL AND tag <> ''
    GROUP BY tag
  )
  SELECT
    hc.tag AS hashtag,
    hc.cnt AS usage_count
  FROM hashtag_counts hc
  WHERE hc.tag ILIKE '%' || search_term || '%'
  ORDER BY hc.cnt DESC, hc.tag ASC
  LIMIT 10;
END;
$$;

-- Grant execute permission to public (for API access)
GRANT EXECUTE ON FUNCTION public.search_hashtags(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_hashtags(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_hashtags(TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.search_hashtags(TEXT) IS
  'Searches for hashtags in home_videos descriptions and returns matches with usage count for relevance';

-- ============================================================================
-- Also create an index to improve hashtag extraction performance
-- ============================================================================

-- Create GIN index on description for faster text search (if not exists)
CREATE INDEX IF NOT EXISTS idx_home_videos_description_gin
  ON public.home_videos USING gin(to_tsvector('french', COALESCE(description, '')));

-- ============================================================================
-- Optional: Materialized view for faster hashtag searches (uncomment if needed)
-- ============================================================================

-- CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_video_hashtags AS
-- SELECT
--   LOWER(TRIM(BOTH FROM (regexp_matches(description, '#([a-zA-Z0-9_\u00C0-\u024F]+)', 'g'))[1])) AS hashtag,
--   COUNT(*) AS usage_count
-- FROM public.home_videos
-- WHERE is_active = true
--   AND description IS NOT NULL
--   AND description <> ''
-- GROUP BY 1
-- HAVING LOWER(TRIM(BOTH FROM (regexp_matches(description, '#([a-zA-Z0-9_\u00C0-\u024F]+)', 'g'))[1])) IS NOT NULL;

-- CREATE INDEX IF NOT EXISTS idx_mv_video_hashtags_hashtag ON public.mv_video_hashtags (hashtag);
-- CREATE INDEX IF NOT EXISTS idx_mv_video_hashtags_count ON public.mv_video_hashtags (usage_count DESC);

-- To refresh: REFRESH MATERIALIZED VIEW public.mv_video_hashtags;
