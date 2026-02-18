-- ============================================================================
-- CREATE search_establishments_scored FUNCTION
-- Full-text search with French stemming, trigram fuzzy matching, and scoring
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.search_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL,
  result_limit int DEFAULT 24,
  result_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  cover_url text,
  universe text,
  subcategory text,
  city text,
  tags text[],
  verified boolean,
  premium boolean,
  curated boolean,
  rating_avg numeric,
  google_rating numeric,
  google_review_count integer,
  relevance_score real,
  total_score real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
  search_text text;
  is_multiword boolean;
  word_count int;
BEGIN
  -- Normalize the search text
  search_text := trim(search_query);

  -- Detect multi-word queries
  word_count := array_length(string_to_array(search_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- Build tsquery using websearch_to_tsquery (handles multi-word naturally)
  -- "restaurant français" becomes 'restaurant' & 'francais' with French stemming
  BEGIN
    ts_query := websearch_to_tsquery('french', search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('french', search_text);
  END;

  -- If tsquery is empty (e.g., all stop words), use plainto_tsquery fallback
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', search_text);
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      e.id,
      e.name,
      e.slug,
      e.cover_url,
      e.universe::text,
      e.subcategory,
      e.city,
      e.tags,
      COALESCE(e.verified, false) AS verified,
      COALESCE(e.premium, false) AS premium,
      COALESCE(e.curated, false) AS curated,
      e.avg_rating AS rating_avg,
      e.google_rating,
      e.google_review_count,
      -- Relevance score: full-text rank + trigram similarity
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        +
        COALESCE(similarity(e.name, search_text), 0) * 0.3
      )::real AS relevance_score,
      -- Total score: relevance + activity/quality bonuses
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        + COALESCE(similarity(e.name, search_text), 0) * 0.3
        + COALESCE(e.activity_score, 0) * 0.003
        + CASE WHEN COALESCE(e.is_online, false) THEN 0.15 ELSE 0 END
        + CASE WHEN COALESCE(e.verified, false) THEN 0.05 ELSE 0 END
        + CASE WHEN COALESCE(e.premium, false) THEN 0.10 ELSE 0 END
        + CASE WHEN COALESCE(e.curated, false) THEN 0.05 ELSE 0 END
        + COALESCE(e.avg_rating, 0) / 50.0
      )::real AS total_score
    FROM public.establishments e
    WHERE e.status = 'active'::establishment_status
      -- Universe filter
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      -- City filter (case-insensitive)
      AND (filter_city IS NULL OR e.city ILIKE filter_city)
      -- Match condition depends on single vs multi-word query
      AND (
        CASE
          WHEN is_multiword THEN
            -- Multi-word: full-text search only (uses AND logic: all words must match)
            -- No trigram similarity here — it matches partial words and gives false positives
            -- ILIKE on exact phrase as last resort
            (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
            OR (e.name ILIKE '%' || search_text || '%')
            OR (e.subcategory ILIKE '%' || search_text || '%')
          ELSE
            -- Single word: broader matching with trigram for typo tolerance
            (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
            OR similarity(e.name, search_text) > 0.15
            OR e.name ILIKE '%' || search_text || '%'
            OR e.subcategory ILIKE '%' || search_text || '%'
        END
      )
  )
  SELECT s.*
  FROM scored s
  ORDER BY s.total_score DESC, s.relevance_score DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- Grant execute permissions to Supabase roles
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.search_establishments_scored IS
  'Full-text search for establishments with French stemming, trigram fuzzy matching, and activity-based scoring';

COMMIT;
