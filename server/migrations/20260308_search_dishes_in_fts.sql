-- =============================================================================
-- SEARCH ENGINE IMPROVEMENT — Batch 1
-- P1: Include dish titles + descriptions in FTS vector (weight C)
-- P2: Unaccent-aware ILIKE fallbacks
-- Date: 2026-03-08
-- =============================================================================

-- =============================================================================
-- P2.1: ENABLE UNACCENT EXTENSION + IMMUTABLE WRAPPER
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;

-- Immutable wrapper needed for functional indexes (unaccent is STABLE by default)
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS $$
  SELECT extensions.unaccent($1);
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- Functional index for accent-insensitive name search
CREATE INDEX IF NOT EXISTS idx_est_name_unaccent_trgm
  ON public.establishments USING GIN (public.immutable_unaccent(lower(name)) gin_trgm_ops)
  WHERE status = 'active';

-- =============================================================================
-- P1.1: UPDATE generate_establishment_search_vector_v2() — add dishes param
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_establishment_search_vector_v2(
  p_name text,
  p_city text,
  p_neighborhood text,
  p_subcategory text,
  p_tags text[],
  p_amenities text[],
  p_cuisine_types text[],
  p_description_short text,
  p_ambiance_tags text[],
  p_specialties text[],
  p_dishes_text text DEFAULT ''
) RETURNS tsvector AS $$
DECLARE
  v_tags_text text;
  v_amenities_text text;
  v_cuisine_text text;
  v_ambiance_text text;
  v_specialties_text text;
BEGIN
  v_tags_text := COALESCE(array_to_string(p_tags, ' '), '');
  v_amenities_text := COALESCE(array_to_string(p_amenities, ' '), '');
  v_cuisine_text := COALESCE(array_to_string(p_cuisine_types, ' '), '');
  v_ambiance_text := COALESCE(array_to_string(p_ambiance_tags, ' '), '');
  v_specialties_text := COALESCE(array_to_string(p_specialties, ' '), '');

  RETURN (
    -- Weight A (highest): name
    setweight(to_tsvector('french', COALESCE(p_name, '')), 'A') ||
    -- Weight B: subcategory, cuisine types, tags, specialties
    setweight(to_tsvector('french', COALESCE(p_subcategory, '')), 'B') ||
    setweight(to_tsvector('french', v_cuisine_text), 'B') ||
    setweight(to_tsvector('french', v_tags_text), 'B') ||
    setweight(to_tsvector('french', v_specialties_text), 'B') ||
    -- Weight C: amenities, city, neighborhood, ambiance, DISHES
    setweight(to_tsvector('french', v_amenities_text), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_city, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_neighborhood, '')), 'C') ||
    setweight(to_tsvector('french', v_ambiance_text), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_dishes_text, '')), 'C') ||
    -- Weight D (lowest): description
    setweight(to_tsvector('french', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- P1.2: UPDATE generate_establishment_search_vector_en() — add dishes param
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_establishment_search_vector_en(
  p_name text,
  p_city text,
  p_neighborhood text,
  p_subcategory text,
  p_tags text[],
  p_amenities text[],
  p_cuisine_types text[],
  p_description_short text,
  p_ambiance_tags text[],
  p_specialties text[],
  p_dishes_text text DEFAULT ''
) RETURNS tsvector AS $$
DECLARE
  v_tags_text text;
  v_amenities_text text;
  v_cuisine_text text;
  v_ambiance_text text;
  v_specialties_text text;
BEGIN
  v_tags_text := COALESCE(array_to_string(p_tags, ' '), '');
  v_amenities_text := COALESCE(array_to_string(p_amenities, ' '), '');
  v_cuisine_text := COALESCE(array_to_string(p_cuisine_types, ' '), '');
  v_ambiance_text := COALESCE(array_to_string(p_ambiance_tags, ' '), '');
  v_specialties_text := COALESCE(array_to_string(p_specialties, ' '), '');

  RETURN (
    setweight(to_tsvector('english', COALESCE(p_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(p_subcategory, '')), 'B') ||
    setweight(to_tsvector('english', v_cuisine_text), 'B') ||
    setweight(to_tsvector('english', v_tags_text), 'B') ||
    setweight(to_tsvector('english', v_specialties_text), 'B') ||
    setweight(to_tsvector('english', v_amenities_text), 'C') ||
    setweight(to_tsvector('english', COALESCE(p_city, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(p_neighborhood, '')), 'C') ||
    setweight(to_tsvector('english', v_ambiance_text), 'C') ||
    setweight(to_tsvector('english', COALESCE(p_dishes_text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- P1.3: UPDATE TRIGGER to include dish text from pro_inventory_items
-- =============================================================================

CREATE OR REPLACE FUNCTION update_establishment_search_vector()
RETURNS trigger AS $$
DECLARE
  v_dishes_text text;
BEGIN
  -- Concatenate active menu item titles + descriptions
  SELECT COALESCE(string_agg(
    COALESCE(title, '') || ' ' || COALESCE(description, ''), ' '
  ), '') INTO v_dishes_text
  FROM public.pro_inventory_items
  WHERE establishment_id = NEW.id AND is_active = true;

  -- French vector
  NEW.search_vector := generate_establishment_search_vector_v2(
    NEW.name, NEW.city, NEW.neighborhood, NEW.subcategory,
    NEW.tags, NEW.amenities, NEW.cuisine_types, NEW.description_short,
    NEW.ambiance_tags, NEW.specialties, v_dishes_text
  );
  -- English vector
  NEW.search_vector_en := generate_establishment_search_vector_en(
    NEW.name, NEW.city, NEW.neighborhood, NEW.subcategory,
    NEW.tags, NEW.amenities, NEW.cuisine_types, NEW.description_short,
    NEW.ambiance_tags, NEW.specialties, v_dishes_text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition stays the same (same columns monitored)
DROP TRIGGER IF EXISTS trg_establishments_search_vector ON public.establishments;

CREATE TRIGGER trg_establishments_search_vector
  BEFORE INSERT OR UPDATE OF name, city, neighborhood, subcategory, tags, amenities, cuisine_types, description_short, ambiance_tags, specialties
  ON public.establishments
  FOR EACH ROW
  EXECUTE FUNCTION update_establishment_search_vector();

-- =============================================================================
-- P1.4: TRIGGER on pro_inventory_items to refresh parent establishment vector
-- When a menu item changes, touch the parent establishment to re-trigger vector
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_refresh_establishment_search_on_inventory()
RETURNS trigger AS $$
DECLARE
  v_est_id uuid;
BEGIN
  v_est_id := COALESCE(NEW.establishment_id, OLD.establishment_id);
  IF v_est_id IS NOT NULL THEN
    -- Setting name = name triggers the BEFORE UPDATE trigger which rebuilds the vector
    UPDATE public.establishments SET name = name WHERE id = v_est_id;
  END IF;
  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_refresh_search_vector ON public.pro_inventory_items;

CREATE TRIGGER trg_inventory_refresh_search_vector
  AFTER INSERT OR UPDATE OF title, description, is_active OR DELETE
  ON public.pro_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_establishment_search_on_inventory();

-- =============================================================================
-- P2.2: UPDATE search_establishments_scored() — unaccent-aware ILIKE
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
  search_text_u text;           -- P2: unaccented version for ILIKE
  expanded_text text;
  is_multiword boolean;
  word_count int;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];
  search_words_u text[];        -- P2: unaccented words
BEGIN
  search_text := trim(search_query);
  -- P2: Pre-normalize for accent-insensitive ILIKE matching
  search_text_u := public.immutable_unaccent(lower(search_text));

  -- Determine language mode
  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english'::regconfig ELSE 'french'::regconfig END;

  -- Expand via synonyms (language-aware)
  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- Split original search text into individual words (min 3 chars each)
  search_words := ARRAY(
    SELECT w FROM unnest(string_to_array(lower(trim(search_text)), ' ')) w
    WHERE length(w) >= 3
  );
  -- P2: Unaccented version of search words
  search_words_u := ARRAY(
    SELECT public.immutable_unaccent(w) FROM unnest(search_words) w
  );

  -- ============================
  -- Build primary tsquery (FR or EN depending on mode)
  -- ============================
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

  -- Build OR-based tsquery for multi-word queries
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

  -- ============================
  -- For 'both' mode: also build English tsquery
  -- ============================
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

      -- OR-based English tsquery
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
      -- Relevance score
      (
        -- Full-text rank (FR or EN)
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
        -- Bonus if original query matches directly
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
        -- P2: Unaccent-aware scoring bonuses
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
        -- Per-word matching on arrays (multi-word queries)
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
      -- Total score
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
        -- P2: Unaccent-aware scoring bonuses (total_score)
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
        + COALESCE(e.avg_rating, 0) / 50.0
      )::real AS total_score
    FROM public.establishments e
    WHERE e.status = 'active'::establishment_status
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      -- P2: Unaccent-aware city filter
      AND (filter_city IS NULL OR public.immutable_unaccent(lower(e.city)) LIKE public.immutable_unaccent(lower(filter_city)))
      AND (
        -- Full-text search on expanded query (FR vector)
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
        -- P2: Language-agnostic fallbacks with UNACCENT
        OR (NOT is_multiword AND similarity(e.name, search_text) > 0.15)
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
        -- Per-word ILIKE fallbacks for multi-word queries (with unaccent)
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
-- P2.3: UPDATE count_establishments_scored() — unaccent-aware ILIKE
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
  search_text_u text;           -- P2: unaccented
  expanded_text text;
  is_multiword boolean;
  word_count int;
  result_count integer;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];
  search_words_u text[];        -- P2: unaccented words
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

  -- For 'both' mode: build English tsquery
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
      -- P2: Unaccent-aware fallbacks
      OR (NOT is_multiword AND similarity(e.name, search_text) > 0.15)
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
-- FIX search_path for all modified functions (critical for Supabase)
-- =============================================================================

ALTER FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.count_establishments_scored(text, text, text, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.update_establishment_search_vector()
  SET search_path TO public, extensions;

ALTER FUNCTION public.generate_establishment_search_vector_v2(text, text, text, text, text[], text[], text[], text, text[], text[], text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.generate_establishment_search_vector_en(text, text, text, text, text[], text[], text[], text, text[], text[], text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.trigger_refresh_establishment_search_on_inventory()
  SET search_path TO public, extensions;

ALTER FUNCTION public.immutable_unaccent(text)
  SET search_path TO public, extensions;

-- =============================================================================
-- P1.5: BACKFILL — Re-index all establishments that have active menu items
-- This triggers the updated update_establishment_search_vector() function
-- =============================================================================

UPDATE public.establishments SET name = name
WHERE id IN (
  SELECT DISTINCT establishment_id FROM public.pro_inventory_items WHERE is_active = true
);
