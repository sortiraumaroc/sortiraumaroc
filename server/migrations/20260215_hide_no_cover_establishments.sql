-- ============================================================================
-- Migration: Hide establishments without cover photo
-- Date: 2026-02-15
-- Description:
--   1. Update search_establishments_scored() to exclude establishments without cover_url
--   2. Update count_establishments_scored() to exclude establishments without cover_url
--   3. Set active establishments without cover_url to 'pending' status
-- ============================================================================

-- ============================================================================
-- 1. UPDATE search_establishments_scored() — add cover_url filter
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_establishments_scored(text, text, text, int, int, real, uuid, text);

CREATE OR REPLACE FUNCTION public.search_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL,
  result_limit int DEFAULT 12,
  result_offset int DEFAULT 0,
  cursor_score real DEFAULT NULL,
  cursor_id uuid DEFAULT NULL,
  search_lang text DEFAULT 'fr'
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
  ts_query_or tsquery;
  ts_query_en tsquery;
  ts_query_en_original tsquery;
  ts_query_en_or tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];
BEGIN
  search_text := trim(search_query);

  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english'::regconfig ELSE 'french'::regconfig END;

  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  search_words := ARRAY(
    SELECT w FROM unnest(string_to_array(lower(trim(search_text)), ' ')) w
    WHERE length(w) >= 3
  );

  BEGIN
    IF expanded_text <> search_text THEN
      ts_query := to_tsquery(v_config,
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(tsvector_to_array(to_tsvector(v_config, expanded_text))) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    ELSE
      ts_query := websearch_to_tsquery(v_config, search_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery(v_config, search_text);
  END;

  BEGIN
    ts_query_original := websearch_to_tsquery(v_config, search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query_original := plainto_tsquery(v_config, search_text);
  END;

  IF is_multiword THEN
    BEGIN
      ts_query_or := to_tsquery(v_config,
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(tsvector_to_array(to_tsvector(v_config, search_text))) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    EXCEPTION WHEN OTHERS THEN
      ts_query_or := NULL;
    END;
  END IF;

  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery(v_config, expanded_text);
  END IF;
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery(v_config, search_text);
  END IF;

  IF v_use_both THEN
    DECLARE
      expanded_en text;
    BEGIN
      expanded_en := expand_search_query(search_text, filter_universe, 'en');
      BEGIN
        IF expanded_en <> search_text THEN
          ts_query_en := to_tsquery('english',
            array_to_string(
              ARRAY(
                SELECT lexeme || ':*'
                FROM unnest(tsvector_to_array(to_tsvector('english', expanded_en))) AS lexeme
                WHERE lexeme <> ''
              ),
              ' | '
            )
          );
        ELSE
          ts_query_en := websearch_to_tsquery('english', search_text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        ts_query_en := plainto_tsquery('english', search_text);
      END;

      BEGIN
        ts_query_en_original := websearch_to_tsquery('english', search_text);
      EXCEPTION WHEN OTHERS THEN
        ts_query_en_original := plainto_tsquery('english', search_text);
      END;

      IF is_multiword THEN
        BEGIN
          ts_query_en_or := to_tsquery('english',
            array_to_string(
              ARRAY(
                SELECT lexeme || ':*'
                FROM unnest(tsvector_to_array(to_tsvector('english', search_text))) AS lexeme
                WHERE lexeme <> ''
              ),
              ' | '
            )
          );
        EXCEPTION WHEN OTHERS THEN
          ts_query_en_or := NULL;
        END;
      END IF;

      IF ts_query_en IS NULL OR ts_query_en::text = '' THEN
        ts_query_en := plainto_tsquery('english', search_text);
      END IF;
    END;
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
      (
        CASE
          WHEN NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          WHEN v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector_en, ts_query, 32)
          WHEN v_use_both THEN GREATEST(
            CASE WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
              THEN ts_rank_cd(e.search_vector, ts_query, 32) ELSE 0 END,
            CASE WHEN e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> ''
              THEN ts_rank_cd(e.search_vector_en, ts_query_en, 32) ELSE 0 END
          )
          ELSE 0
        END
        +
        CASE
          WHEN NOT v_use_en AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector IS NOT NULL
               AND e.search_vector @@ ts_query_original
            THEN 0.3
          WHEN v_use_en AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en IS NOT NULL
               AND e.search_vector_en @@ ts_query_original
            THEN 0.3
          WHEN v_use_both AND (
            (e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
            OR (e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
          ) THEN 0.3
          ELSE 0
        END
        +
        COALESCE(similarity(e.name, search_text), 0) * 0.3
        +
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
        +
        CASE WHEN is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words) sw
          WHERE ct ILIKE '%' || sw || '%'
        ) THEN 0.35 ELSE 0 END
        +
        CASE WHEN is_multiword AND e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words) sw
          WHERE sp ILIKE '%' || sw || '%'
        ) THEN 0.25 ELSE 0 END
      )::real AS relevance_score,
      (
        CASE
          WHEN NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector, ts_query, 32)
          WHEN v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
            THEN ts_rank_cd(e.search_vector_en, ts_query, 32)
          WHEN v_use_both THEN GREATEST(
            CASE WHEN e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> ''
              THEN ts_rank_cd(e.search_vector, ts_query, 32) ELSE 0 END,
            CASE WHEN e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> ''
              THEN ts_rank_cd(e.search_vector_en, ts_query_en, 32) ELSE 0 END
          )
          ELSE 0
        END
        + CASE
            WHEN NOT v_use_en AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector IS NOT NULL
                 AND e.search_vector @@ ts_query_original
              THEN 0.3
            WHEN v_use_en AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en IS NOT NULL
                 AND e.search_vector_en @@ ts_query_original
              THEN 0.3
            WHEN v_use_both AND (
              (e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
              OR (e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
            ) THEN 0.3
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
        + CASE WHEN is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words) sw
            WHERE ct ILIKE '%' || sw || '%'
          ) THEN 0.35 ELSE 0 END
        + CASE WHEN is_multiword AND e.specialties IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words) sw
            WHERE sp ILIKE '%' || sw || '%'
          ) THEN 0.25 ELSE 0 END
        + COALESCE(e.activity_score, 0) * 0.003
        + CASE WHEN COALESCE(e.is_online, false) THEN 0.15 ELSE 0 END
        + CASE WHEN COALESCE(e.verified, false) THEN 0.05 ELSE 0 END
        + CASE WHEN COALESCE(e.premium, false) THEN 0.10 ELSE 0 END
        + CASE WHEN COALESCE(e.curated, false) THEN 0.05 ELSE 0 END
        + COALESCE(e.avg_rating, 0) / 50.0
      )::real AS total_score
    FROM public.establishments e
    WHERE e.status = 'active'::establishment_status
      AND e.cover_url IS NOT NULL AND e.cover_url <> ''
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      AND (filter_city IS NULL OR e.city ILIKE filter_city)
      AND (
        (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        OR (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        OR (NOT v_use_en AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
        OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector_en @@ ts_query)
        OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en @@ ts_query_original)
        OR (v_use_en AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
        OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> '' AND e.search_vector_en @@ ts_query_en)
        OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
        OR (v_use_both AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
        OR (v_use_both AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
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
        OR (is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words) sw
          WHERE ct ILIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.tags) t, unnest(search_words) sw
          WHERE t ILIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.ambiance_tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.ambiance_tags) at, unnest(search_words) sw
          WHERE at ILIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words) sw
          WHERE sp ILIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.subcategory IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(search_words) sw
          WHERE e.subcategory ILIKE '%' || sw || '%'
        ))
      )
  )
  SELECT s.*
  FROM scored s
  WHERE
    (cursor_score IS NULL OR cursor_id IS NULL
     OR (s.total_score, s.id) < (cursor_score, cursor_id))
  ORDER BY s.total_score DESC, s.id DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text) TO authenticated;

-- ============================================================================
-- 2. UPDATE count_establishments_scored() — add cover_url filter
-- ============================================================================

DROP FUNCTION IF EXISTS public.count_establishments_scored(text, text, text, text);

CREATE OR REPLACE FUNCTION public.count_establishments_scored(
  search_query text,
  filter_universe text DEFAULT NULL,
  filter_city text DEFAULT NULL,
  search_lang text DEFAULT 'fr'
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
  ts_query_original tsquery;
  ts_query_or tsquery;
  ts_query_en tsquery;
  ts_query_en_original tsquery;
  ts_query_en_or tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  result_count integer;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];
BEGIN
  search_text := trim(search_query);

  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english'::regconfig ELSE 'french'::regconfig END;

  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  search_words := ARRAY(
    SELECT w FROM unnest(string_to_array(lower(trim(search_text)), ' ')) w
    WHERE length(w) >= 3
  );

  BEGIN
    IF expanded_text <> search_text THEN
      ts_query := to_tsquery(v_config,
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(tsvector_to_array(to_tsvector(v_config, expanded_text))) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    ELSE
      ts_query := websearch_to_tsquery(v_config, search_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery(v_config, search_text);
  END;

  BEGIN
    ts_query_original := websearch_to_tsquery(v_config, search_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query_original := plainto_tsquery(v_config, search_text);
  END;

  IF is_multiword THEN
    BEGIN
      ts_query_or := to_tsquery(v_config,
        array_to_string(
          ARRAY(
            SELECT lexeme || ':*'
            FROM unnest(tsvector_to_array(to_tsvector(v_config, search_text))) AS lexeme
            WHERE lexeme <> ''
          ),
          ' | '
        )
      );
    EXCEPTION WHEN OTHERS THEN
      ts_query_or := NULL;
    END;
  END IF;

  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery(v_config, expanded_text);
  END IF;
  IF ts_query IS NULL OR ts_query::text = '' THEN
    ts_query := plainto_tsquery(v_config, search_text);
  END IF;

  IF v_use_both THEN
    DECLARE
      expanded_en text;
    BEGIN
      expanded_en := expand_search_query(search_text, filter_universe, 'en');
      BEGIN
        IF expanded_en <> search_text THEN
          ts_query_en := to_tsquery('english',
            array_to_string(
              ARRAY(
                SELECT lexeme || ':*'
                FROM unnest(tsvector_to_array(to_tsvector('english', expanded_en))) AS lexeme
                WHERE lexeme <> ''
              ),
              ' | '
            )
          );
        ELSE
          ts_query_en := websearch_to_tsquery('english', search_text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        ts_query_en := plainto_tsquery('english', search_text);
      END;

      BEGIN
        ts_query_en_original := websearch_to_tsquery('english', search_text);
      EXCEPTION WHEN OTHERS THEN
        ts_query_en_original := plainto_tsquery('english', search_text);
      END;

      IF is_multiword THEN
        BEGIN
          ts_query_en_or := to_tsquery('english',
            array_to_string(
              ARRAY(
                SELECT lexeme || ':*'
                FROM unnest(tsvector_to_array(to_tsvector('english', search_text))) AS lexeme
                WHERE lexeme <> ''
              ),
              ' | '
            )
          );
        EXCEPTION WHEN OTHERS THEN
          ts_query_en_or := NULL;
        END;
      END IF;

      IF ts_query_en IS NULL OR ts_query_en::text = '' THEN
        ts_query_en := plainto_tsquery('english', search_text);
      END IF;
    END;
  END IF;

  SELECT COUNT(*) INTO result_count
  FROM public.establishments e
  WHERE e.status = 'active'::establishment_status
    AND e.cover_url IS NOT NULL AND e.cover_url <> ''
    AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
    AND (filter_city IS NULL OR e.city ILIKE filter_city)
    AND (
      (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
      OR (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
      OR (NOT v_use_en AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
      OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector_en @@ ts_query)
      OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en @@ ts_query_original)
      OR (v_use_en AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
      OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
      OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
      OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> '' AND e.search_vector_en @@ ts_query_en)
      OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
      OR (v_use_both AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
      OR (v_use_both AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
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
      OR (is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words) sw
        WHERE ct ILIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.tags) t, unnest(search_words) sw
        WHERE t ILIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.ambiance_tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.ambiance_tags) at, unnest(search_words) sw
        WHERE at ILIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words) sw
        WHERE sp ILIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.subcategory IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(search_words) sw
        WHERE e.subcategory ILIKE '%' || sw || '%'
      ))
    );

  RETURN result_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO authenticated;

-- ============================================================================
-- 3. Set active establishments without cover_url to 'pending' status
-- ============================================================================

UPDATE public.establishments
SET status = 'pending'
WHERE status = 'active'
  AND (cover_url IS NULL OR cover_url = '');
