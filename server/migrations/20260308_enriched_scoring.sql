-- =============================================================================
-- SEARCH ENGINE IMPROVEMENT — Batch 3
-- P3: Bayesian scoring + Google rating integration
-- P4: menu_popularity_score from likes/dislikes
-- P5: Enable trigram for multi-word queries
-- Date: 2026-03-08
-- =============================================================================

-- =============================================================================
-- P4.1: ADD menu_popularity_score COLUMN
-- =============================================================================

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS menu_popularity_score NUMERIC(4,2) DEFAULT 0;

-- =============================================================================
-- P4.2: FUNCTION to recalculate menu_popularity_score from menu_item_votes
-- Score = (likes - dislikes) / total_votes per establishment, range [-1, 1]
-- =============================================================================

CREATE OR REPLACE FUNCTION recalcul_menu_popularity()
RETURNS void AS $$
BEGIN
  -- Update establishments that have votes
  UPDATE public.establishments e
  SET menu_popularity_score = sub.score
  FROM (
    SELECT
      v.establishment_id,
      CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
        (COUNT(*) FILTER (WHERE v.vote = 'like')::numeric
         - COUNT(*) FILTER (WHERE v.vote = 'dislike')::numeric
        ) / COUNT(*)::numeric,
        2
      )
      END AS score
    FROM public.menu_item_votes v
    GROUP BY v.establishment_id
  ) sub
  WHERE e.id = sub.establishment_id
    AND COALESCE(e.menu_popularity_score, 0) <> sub.score;

  -- Reset establishments that no longer have votes
  UPDATE public.establishments
  SET menu_popularity_score = 0
  WHERE menu_popularity_score <> 0
    AND id NOT IN (SELECT DISTINCT establishment_id FROM public.menu_item_votes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.recalcul_menu_popularity()
  SET search_path TO public, extensions;

GRANT EXECUTE ON FUNCTION public.recalcul_menu_popularity() TO service_role;

-- =============================================================================
-- P4.3: SCHEDULE hourly cron job (pg_cron)
-- If pg_cron is not available, this will fail silently — use server-side cron
-- =============================================================================

DO $$
BEGIN
  -- Try to schedule with pg_cron (may not be available on all Supabase plans)
  PERFORM cron.schedule(
    'recalcul_menu_popularity',
    '0 * * * *',
    'SELECT recalcul_menu_popularity()'
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available — silently skip, use server-side cron instead
  RAISE NOTICE 'pg_cron not available — schedule recalcul_menu_popularity via server cron';
END;
$$;

-- =============================================================================
-- P3+P4+P5: UPDATE search_establishments_scored() with enriched scoring
-- =============================================================================

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
  search_text_u text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];
  search_words_u text[];
BEGIN
  search_text := trim(search_query);
  search_text_u := public.immutable_unaccent(lower(search_text));

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
  search_words_u := ARRAY(
    SELECT public.immutable_unaccent(w) FROM unnest(search_words) w
  );

  -- Build primary tsquery
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
      -- Relevance score (unchanged from Batch 1 — no scoring changes here)
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
        CASE WHEN e.cuisine_types IS NOT NULL AND search_text_u LIKE ANY(
          ARRAY(SELECT '%' || public.immutable_unaccent(lower(unnest(e.cuisine_types))) || '%')
        ) THEN 0.4 ELSE 0 END
        +
        CASE WHEN e.ambiance_tags IS NOT NULL AND search_text_u LIKE ANY(
          ARRAY(SELECT '%' || public.immutable_unaccent(lower(unnest(e.ambiance_tags))) || '%')
        ) THEN 0.2 ELSE 0 END
        +
        CASE WHEN e.specialties IS NOT NULL AND search_text_u LIKE ANY(
          ARRAY(SELECT '%' || public.immutable_unaccent(lower(unnest(e.specialties))) || '%')
        ) THEN 0.3 ELSE 0 END
        +
        CASE WHEN is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(ct)) LIKE '%' || sw || '%'
        ) THEN 0.35 ELSE 0 END
        +
        CASE WHEN is_multiword AND e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(sp)) LIKE '%' || sw || '%'
        ) THEN 0.25 ELSE 0 END
      )::real AS relevance_score,
      -- Total score — P3: Bayesian + Google | P4: menu_popularity | P5: trigram multi-word
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
        + CASE WHEN e.cuisine_types IS NOT NULL AND search_text_u LIKE ANY(
            ARRAY(SELECT '%' || public.immutable_unaccent(lower(unnest(e.cuisine_types))) || '%')
          ) THEN 0.4 ELSE 0 END
        + CASE WHEN e.ambiance_tags IS NOT NULL AND search_text_u LIKE ANY(
            ARRAY(SELECT '%' || public.immutable_unaccent(lower(unnest(e.ambiance_tags))) || '%')
          ) THEN 0.2 ELSE 0 END
        + CASE WHEN e.specialties IS NOT NULL AND search_text_u LIKE ANY(
            ARRAY(SELECT '%' || public.immutable_unaccent(lower(unnest(e.specialties))) || '%')
          ) THEN 0.3 ELSE 0 END
        + CASE WHEN is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words_u) sw
            WHERE public.immutable_unaccent(lower(ct)) LIKE '%' || sw || '%'
          ) THEN 0.35 ELSE 0 END
        + CASE WHEN is_multiword AND e.specialties IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words_u) sw
            WHERE public.immutable_unaccent(lower(sp)) LIKE '%' || sw || '%'
          ) THEN 0.25 ELSE 0 END
        + COALESCE(e.activity_score, 0) * 0.003
        + CASE WHEN COALESCE(e.is_online, false) THEN 0.15 ELSE 0 END
        + CASE WHEN COALESCE(e.verified, false) THEN 0.05 ELSE 0 END
        + CASE WHEN COALESCE(e.premium, false) THEN 0.10 ELSE 0 END
        + CASE WHEN COALESCE(e.curated, false) THEN 0.05 ELSE 0 END
        -- P3: Bayesian internal rating (replaces avg_rating/50.0)
        + (COALESCE(e.review_count, 0) * COALESCE(e.avg_rating, 0) + 5 * 3.5)
          / (COALESCE(e.review_count, 0) + 5) / 50.0
          * (1 + ln(1 + COALESCE(e.review_count, 0)) * 0.02)
        -- P3: Google rating contribution
        + COALESCE(e.google_rating, 0) / 100.0
        + LEAST(COALESCE(e.google_review_count, 0), 1000) * 0.00005
        -- P4: Menu popularity from likes/dislikes
        + COALESCE(e.menu_popularity_score, 0) * 0.05
      )::real AS total_score
    FROM public.establishments e
    WHERE e.status = 'active'::establishment_status
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      AND (filter_city IS NULL OR public.immutable_unaccent(lower(e.city)) LIKE public.immutable_unaccent(lower(filter_city)))
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
        -- P5: Trigram for ALL queries (multi-word too, with higher threshold)
        OR similarity(e.name, search_text) > CASE WHEN is_multiword THEN 0.25 ELSE 0.15 END
        -- Unaccent-aware ILIKE fallbacks
        OR public.immutable_unaccent(lower(e.name)) LIKE '%' || search_text_u || '%'
        OR public.immutable_unaccent(lower(e.subcategory)) LIKE '%' || search_text_u || '%'
        OR (e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct WHERE public.immutable_unaccent(lower(ct)) LIKE '%' || search_text_u || '%'
        ))
        OR (e.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.tags) t WHERE public.immutable_unaccent(lower(t)) LIKE '%' || search_text_u || '%'
        ))
        OR (e.ambiance_tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.ambiance_tags) at WHERE public.immutable_unaccent(lower(at)) LIKE '%' || search_text_u || '%'
        ))
        OR (e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp WHERE public.immutable_unaccent(lower(sp)) LIKE '%' || search_text_u || '%'
        ))
        OR (is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(ct)) LIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.tags) t, unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(t)) LIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.ambiance_tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.ambiance_tags) at, unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(at)) LIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.specialties IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(sp)) LIKE '%' || sw || '%'
        ))
        OR (is_multiword AND e.subcategory IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(search_words_u) sw
          WHERE public.immutable_unaccent(lower(e.subcategory)) LIKE '%' || sw || '%'
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

-- =============================================================================
-- P5: UPDATE count_establishments_scored() — enable trigram for multi-word
-- =============================================================================

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
  search_text_u text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  result_count integer;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];
  search_words_u text[];
BEGIN
  search_text := trim(search_query);
  search_text_u := public.immutable_unaccent(lower(search_text));

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
  search_words_u := ARRAY(
    SELECT public.immutable_unaccent(w) FROM unnest(search_words) w
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
    AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
    AND (filter_city IS NULL OR public.immutable_unaccent(lower(e.city)) LIKE public.immutable_unaccent(lower(filter_city)))
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
      -- P5: Trigram for ALL queries (multi-word too)
      OR similarity(e.name, search_text) > CASE WHEN is_multiword THEN 0.25 ELSE 0.15 END
      -- Unaccent-aware ILIKE fallbacks
      OR public.immutable_unaccent(lower(e.name)) LIKE '%' || search_text_u || '%'
      OR public.immutable_unaccent(lower(e.subcategory)) LIKE '%' || search_text_u || '%'
      OR (e.cuisine_types IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.cuisine_types) ct WHERE public.immutable_unaccent(lower(ct)) LIKE '%' || search_text_u || '%'
      ))
      OR (e.tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.tags) t WHERE public.immutable_unaccent(lower(t)) LIKE '%' || search_text_u || '%'
      ))
      OR (e.ambiance_tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.ambiance_tags) at WHERE public.immutable_unaccent(lower(at)) LIKE '%' || search_text_u || '%'
      ))
      OR (e.specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.specialties) sp WHERE public.immutable_unaccent(lower(sp)) LIKE '%' || search_text_u || '%'
      ))
      OR (is_multiword AND e.cuisine_types IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.cuisine_types) ct, unnest(search_words_u) sw
        WHERE public.immutable_unaccent(lower(ct)) LIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.tags) t, unnest(search_words_u) sw
        WHERE public.immutable_unaccent(lower(t)) LIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.ambiance_tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.ambiance_tags) at, unnest(search_words_u) sw
        WHERE public.immutable_unaccent(lower(at)) LIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.specialties) sp, unnest(search_words_u) sw
        WHERE public.immutable_unaccent(lower(sp)) LIKE '%' || sw || '%'
      ))
      OR (is_multiword AND e.subcategory IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(search_words_u) sw
        WHERE public.immutable_unaccent(lower(e.subcategory)) LIKE '%' || sw || '%'
      ))
    );

  RETURN result_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO authenticated;

-- =============================================================================
-- Fix search_path for all functions
-- =============================================================================

ALTER FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.count_establishments_scored(text, text, text, text)
  SET search_path TO public, extensions;

-- =============================================================================
-- P4.4: Initial backfill of menu_popularity_score
-- =============================================================================

SELECT recalcul_menu_popularity();
