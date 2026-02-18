-- ============================================================================
-- MIGRATION: Cursor-based pagination for search_establishments_scored
-- Date: 2026-02-15
-- Description:
--   1. Adds cursor_score + cursor_id parameters to search_establishments_scored
--   2. Adds deterministic tie-breaker (id DESC) to ORDER BY
--   3. Changes default result_limit from 24 to 12
--   4. Creates count_establishments_scored function for total count
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REPLACE search_establishments_scored WITH CURSOR SUPPORT
-- ============================================================================

-- First drop the old function signature (5 params) so we can create the new one (7 params)
DROP FUNCTION IF EXISTS public.search_establishments_scored(text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.search_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL,
  result_limit int DEFAULT 12,
  result_offset int DEFAULT 0,
  -- Cursor parameters for keyset pagination
  cursor_score real DEFAULT NULL,
  cursor_id uuid DEFAULT NULL
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
  ts_query_original tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
BEGIN
  -- Normalize the search text
  search_text := trim(search_query);

  -- Expand via synonyms
  expanded_text := expand_search_query(search_text, filter_universe);

  -- Detect multi-word queries (on EXPANDED text)
  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- Build tsquery from EXPANDED text
  BEGIN
    IF expanded_text <> search_text THEN
      -- Synonym was expanded: use OR logic (any expanded term should match)
      ts_query := to_tsquery('french',
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(
              tsvector_to_array(to_tsvector('french', expanded_text))
            ) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    ELSE
      -- No synonym expansion: use original AND logic
      ts_query := websearch_to_tsquery('french', search_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('french', search_text);
  END;

  -- Also build a tsquery from the ORIGINAL text for scoring boost
  BEGIN
    ts_query_original := websearch_to_tsquery('french', search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query_original := plainto_tsquery('french', search_text);
  END;

  -- If tsquery is empty, use plainto_tsquery fallback
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', expanded_text);
  END IF;
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
      -- Relevance score: full-text rank + trigram similarity + direct field matches
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        +
        -- Bonus if original query matches directly
        CASE
          WHEN ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector IS NOT NULL
               AND e.search_vector @@ ts_query_original
            THEN 0.3
          ELSE 0
        END
        +
        COALESCE(similarity(e.name, search_text), 0) * 0.3
        +
        -- Direct array membership checks (very relevant for taxonomy terms)
        CASE WHEN e.cuisine_types IS NOT NULL AND search_text ILIKE ANY(
          ARRAY(SELECT '%' || unnest(e.cuisine_types) || '%')
        ) THEN 0.4 ELSE 0 END
        +
        CASE WHEN e.ambiance_tags IS NOT NULL AND search_text ILIKE ANY(
          ARRAY(SELECT '%' || unnest(e.ambiance_tags) || '%')
        ) THEN 0.2 ELSE 0 END
        +
        CASE WHEN e.specialties IS NOT NULL AND search_text ILIKE ANY(
          ARRAY(SELECT '%' || unnest(e.specialties) || '%')
        ) THEN 0.3 ELSE 0 END
      )::real AS relevance_score,
      -- Total score: relevance + activity/quality bonuses
      (
        CASE
          WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          ELSE 0
        END
        + CASE
            WHEN ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector IS NOT NULL
                 AND e.search_vector @@ ts_query_original
              THEN 0.3
            ELSE 0
          END
        + COALESCE(similarity(e.name, search_text), 0) * 0.3
        + CASE WHEN e.cuisine_types IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.cuisine_types) || '%')
          ) THEN 0.4 ELSE 0 END
        + CASE WHEN e.ambiance_tags IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.ambiance_tags) || '%')
          ) THEN 0.2 ELSE 0 END
        + CASE WHEN e.specialties IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.specialties) || '%')
          ) THEN 0.3 ELSE 0 END
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
      -- Match condition: full-text OR trigram OR ILIKE OR direct array match
      AND (
        -- Full-text search on expanded query
        (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        -- Full-text search on original query
        OR (e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        -- Trigram similarity on name (single word only for performance)
        OR (NOT is_multiword AND similarity(e.name, search_text) > 0.15)
        -- ILIKE on name/subcategory
        OR e.name ILIKE '%' || search_text || '%'
        OR e.subcategory ILIKE '%' || search_text || '%'
        -- Direct array membership: cuisine_types
        OR (e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct WHERE ct ILIKE '%' || search_text || '%'
        ))
        -- Direct array membership: tags
        OR (e.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.tags) t WHERE t ILIKE '%' || search_text || '%'
        ))
        -- Direct array membership: ambiance_tags
        OR (e.ambiance_tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.ambiance_tags) at WHERE at ILIKE '%' || search_text || '%'
        ))
        -- Direct array membership: specialties
        OR (e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp WHERE sp ILIKE '%' || search_text || '%'
        ))
      )
  )
  SELECT s.*
  FROM scored s
  WHERE
    -- Cursor filter: skip items already seen (keyset pagination)
    -- When cursor_score IS NULL, this condition is skipped (first page)
    (cursor_score IS NULL OR cursor_id IS NULL
     OR (s.total_score, s.id) < (cursor_score, cursor_id))
  ORDER BY s.total_score DESC, s.id DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- Grant execute permissions (new 7-param signature)
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid) TO authenticated;

COMMENT ON FUNCTION public.search_establishments_scored IS
  'Full-text search for establishments with French stemming, synonym expansion, trigram fuzzy matching, direct array matching, activity-based scoring, and cursor-based pagination';


-- ============================================================================
-- 2. CREATE count_establishments_scored FOR TOTAL COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
  ts_query_original tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  result_count integer;
BEGIN
  -- Normalize the search text
  search_text := trim(search_query);

  -- Expand via synonyms
  expanded_text := expand_search_query(search_text, filter_universe);

  -- Detect multi-word queries
  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- Build tsquery from EXPANDED text (same logic as search_establishments_scored)
  BEGIN
    IF expanded_text <> search_text THEN
      ts_query := to_tsquery('french',
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(
              tsvector_to_array(to_tsvector('french', expanded_text))
            ) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    ELSE
      ts_query := websearch_to_tsquery('french', search_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('french', search_text);
  END;

  BEGIN
    ts_query_original := websearch_to_tsquery('french', search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query_original := plainto_tsquery('french', search_text);
  END;

  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', expanded_text);
  END IF;
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery('french', search_text);
  END IF;

  SELECT COUNT(*) INTO result_count
  FROM public.establishments e
  WHERE e.status = 'active'::establishment_status
    AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
    AND (filter_city IS NULL OR e.city ILIKE filter_city)
    AND (
      (e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
      OR (e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
      OR (NOT is_multiword AND similarity(e.name, search_text) > 0.15)
      OR e.name ILIKE '%' || search_text || '%'
      OR e.subcategory ILIKE '%' || search_text || '%'
      OR (e.cuisine_types IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.cuisine_types) ct WHERE ct ILIKE '%' || search_text || '%'
      ))
      OR (e.tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.tags) t WHERE t ILIKE '%' || search_text || '%'
      ))
      OR (e.ambiance_tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.ambiance_tags) at WHERE at ILIKE '%' || search_text || '%'
      ))
      OR (e.specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.specialties) sp WHERE sp ILIKE '%' || search_text || '%'
      ))
    );

  RETURN result_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.count_establishments_scored IS
  'Count matching establishments for a search query (same matching logic as search_establishments_scored, without scoring/pagination)';

COMMIT;
