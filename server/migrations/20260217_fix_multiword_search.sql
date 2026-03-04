-- ============================================================================
-- FIX: Multi-word search returns 0 results
-- Problem: "restaurant français", "restaurant italien", "cuisine asiatique"
-- return 0 results because:
--   1. websearch_to_tsquery creates AND queries ('restaurant' & 'francai')
--      which require BOTH stems in search_vector
--   2. ILIKE fallbacks search for the FULL phrase (e.g. '%restaurant français%')
--      which doesn't match individual array elements like 'français'
--   3. expand_search_query only matches if query contains an exact synonym term
--
-- Fix: For multi-word queries, add:
--   a) An OR-based tsquery (ts_query_or) as fallback
--   b) Per-word ILIKE matching on arrays (cuisine_types, tags, specialties, etc.)
--   c) Additional synonyms for common "restaurant X" patterns
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD SYNONYMS FOR "restaurant + cuisine" PATTERNS
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('restaurant français', 'français cuisine française bistrot brasserie gastronomique terroir restaurant', 'restaurant'),
  ('restaurant italien', 'italien cuisine italienne pizza pasta pâtes risotto trattoria restaurant', 'restaurant'),
  ('restaurant japonais', 'japonais cuisine japonaise sushi sashimi ramen tempura izakaya maki restaurant', 'restaurant'),
  ('restaurant chinois', 'chinois cuisine chinoise dim sum cantonais wok nouilles restaurant', 'restaurant'),
  ('restaurant libanais', 'libanais cuisine libanaise mezze falafel houmous taboulé shawarma restaurant', 'restaurant'),
  ('restaurant indien', 'indien cuisine indienne curry tandoori naan biryani tikka restaurant', 'restaurant'),
  ('restaurant mexicain', 'mexicain cuisine mexicaine tacos burrito enchilada guacamole restaurant', 'restaurant'),
  ('restaurant thaïlandais', 'thaïlandais cuisine thaïlandaise thai pad thai tom yam restaurant', 'restaurant'),
  ('restaurant thaï', 'thaïlandais cuisine thaïlandaise thai pad thai tom yam restaurant', 'restaurant'),
  ('restaurant marocain', 'marocain cuisine marocaine tajine couscous pastilla harira traditionnel restaurant', 'restaurant'),
  ('restaurant asiatique', 'asiatique japonais chinois thaïlandais coréen vietnamien sushi ramen pho restaurant', 'restaurant'),
  ('restaurant méditerranéen', 'méditerranéen grec turc libanais espagnol mezze restaurant', 'restaurant'),
  ('restaurant oriental', 'oriental libanais syrien turc marocain mezze kebab shawarma restaurant', 'restaurant'),
  ('restaurant espagnol', 'espagnol cuisine espagnole tapas paella sangria pintxos restaurant', 'restaurant'),
  ('restaurant turc', 'turc cuisine turque kebab döner pide lahmacun restaurant', 'restaurant'),
  ('restaurant coréen', 'coréen cuisine coréenne bibimbap kimchi barbecue bulgogi restaurant', 'restaurant'),
  ('restaurant vietnamien', 'vietnamien cuisine vietnamienne pho bo bun nem banh mi restaurant', 'restaurant'),
  ('restaurant grec', 'grec cuisine grecque gyros souvlaki moussaka tzatziki restaurant', 'restaurant'),
  ('restaurant américain', 'américain cuisine américaine burger hamburger hot dog bbq barbecue restaurant', 'restaurant'),
  ('restaurant portugais', 'portugais cuisine portugaise bacalhau pasteis grillades restaurant', 'restaurant'),
  ('restaurant africain', 'africain sénégalais éthiopien camerounais restaurant', 'restaurant'),
  ('restaurant brésilien', 'brésilien cuisine brésilienne churrasco picanha feijoada restaurant', 'restaurant'),
  ('restaurant péruvien', 'péruvien cuisine péruvienne ceviche lomo saltado restaurant', 'restaurant'),
  ('restaurant algérien', 'algérien cuisine algérienne couscous chorba bourek restaurant', 'restaurant'),
  ('restaurant tunisien', 'tunisien cuisine tunisienne brik ojja lablabi couscous restaurant', 'restaurant'),
  ('restaurant halal', 'halal certifié halal viande halal restaurant', 'restaurant'),
  ('restaurant gastronomique', 'gastronomique étoilé fine dining chef table haut de gamme restaurant', 'restaurant'),
  ('restaurant romantique', 'romantique couple amoureux tête à tête intimiste dîner aux chandelles restaurant', 'restaurant'),
  ('restaurant familial', 'familial famille enfants kids menu enfant restaurant', 'restaurant'),
  ('cuisine asiatique', 'asiatique japonais chinois thaïlandais coréen vietnamien cambodgien wok sushi ramen pho nouilles', 'restaurant')
ON CONFLICT DO NOTHING;

-- English synonyms for multi-word searches
INSERT INTO public.search_synonyms (term, expanded_terms, universe, lang) VALUES
  ('french restaurant', 'french cuisine bistro brasserie gastronomic restaurant', 'restaurant', 'en'),
  ('italian restaurant', 'italian cuisine pizza pasta risotto trattoria restaurant', 'restaurant', 'en'),
  ('japanese restaurant', 'japanese cuisine sushi sashimi ramen tempura restaurant', 'restaurant', 'en'),
  ('chinese restaurant', 'chinese cuisine dim sum wok noodles restaurant', 'restaurant', 'en'),
  ('moroccan restaurant', 'moroccan cuisine tagine couscous pastilla traditional restaurant', 'restaurant', 'en'),
  ('asian restaurant', 'asian japanese chinese thai korean vietnamese sushi ramen restaurant', 'restaurant', 'en'),
  ('indian restaurant', 'indian cuisine curry tandoori naan biryani tikka restaurant', 'restaurant', 'en'),
  ('mexican restaurant', 'mexican cuisine tacos burrito enchilada guacamole restaurant', 'restaurant', 'en'),
  ('thai restaurant', 'thai cuisine pad thai tom yam curry restaurant', 'restaurant', 'en'),
  ('asian cuisine', 'asian japanese chinese thai korean vietnamese sushi ramen pho noodles', 'restaurant', 'en')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. UPDATE search_establishments_scored() — add multi-word fallback
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
  ts_query_or tsquery;          -- NEW: OR-based tsquery for multi-word
  ts_query_en tsquery;
  ts_query_en_original tsquery;
  ts_query_en_or tsquery;       -- NEW: OR-based English tsquery
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];           -- NEW: individual words for per-word matching
BEGIN
  search_text := trim(search_query);

  -- Determine language mode
  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english'::regconfig ELSE 'french'::regconfig END;

  -- Expand via synonyms (language-aware)
  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- NEW: Split original search text into individual words (min 3 chars each)
  search_words := ARRAY(
    SELECT w FROM unnest(string_to_array(lower(trim(search_text)), ' ')) w
    WHERE length(w) >= 3
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

  -- NEW: Build OR-based tsquery for multi-word queries
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

      -- NEW: OR-based English tsquery
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
        -- NEW: Bonus for per-word matching on arrays (multi-word queries)
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
        + CASE WHEN e.cuisine_types IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.cuisine_types) || '%')
          ) THEN 0.4 ELSE 0 END
        + CASE WHEN e.ambiance_tags IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.ambiance_tags) || '%')
          ) THEN 0.2 ELSE 0 END
        + CASE WHEN e.specialties IS NOT NULL AND search_text ILIKE ANY(
            ARRAY(SELECT '%' || unnest(e.specialties) || '%')
          ) THEN 0.3 ELSE 0 END
        -- NEW: Per-word bonus in total_score too
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
      AND (filter_universe IS NULL OR e.universe = filter_universe::booking_kind)
      AND (filter_city IS NULL OR e.city ILIKE filter_city)
      AND (
        -- Full-text search on expanded query (FR vector)
        (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        -- Full-text search on original query (FR vector)
        OR (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        -- NEW: OR-based tsquery for multi-word (FR)
        OR (NOT v_use_en AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
        -- Full-text search on expanded query (EN vector)
        OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector_en @@ ts_query)
        -- Full-text search on original query (EN vector)
        OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en @@ ts_query_original)
        -- NEW: OR-based tsquery for multi-word (EN)
        OR (v_use_en AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
        -- Both mode: FR or EN
        OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> '' AND e.search_vector_en @@ ts_query_en)
        OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
        -- NEW: OR-based tsquery for multi-word (both mode)
        OR (v_use_both AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
        OR (v_use_both AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
        -- Language-agnostic fallbacks (trigram, ILIKE, direct array)
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
        -- NEW: Per-word ILIKE fallbacks for multi-word queries
        -- Match if ANY individual word (≥3 chars) matches ANY array element
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
-- 3. UPDATE count_establishments_scored() — same multi-word fix
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
  ts_query_or tsquery;          -- NEW: OR-based tsquery for multi-word
  ts_query_en tsquery;
  ts_query_en_original tsquery;
  ts_query_en_or tsquery;       -- NEW: OR-based English tsquery
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  result_count integer;
  v_config regconfig;
  v_use_en boolean;
  v_use_both boolean;
  search_words text[];           -- NEW: individual words for per-word matching
BEGIN
  search_text := trim(search_query);

  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english'::regconfig ELSE 'french'::regconfig END;

  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

  -- NEW: Split original search text into individual words (min 3 chars each)
  search_words := ARRAY(
    SELECT w FROM unnest(string_to_array(lower(trim(search_text)), ' ')) w
    WHERE length(w) >= 3
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

  -- NEW: Build OR-based tsquery for multi-word queries
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

      -- NEW: OR-based English tsquery
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
    AND (filter_city IS NULL OR e.city ILIKE filter_city)
    AND (
      (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
      OR (NOT v_use_en AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
      -- NEW: OR-based tsquery for multi-word (FR)
      OR (NOT v_use_en AND is_multiword AND e.search_vector IS NOT NULL AND ts_query_or IS NOT NULL AND ts_query_or::text <> '' AND e.search_vector @@ ts_query_or)
      OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector_en @@ ts_query)
      OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en @@ ts_query_original)
      -- NEW: OR-based tsquery for multi-word (EN)
      OR (v_use_en AND is_multiword AND e.search_vector_en IS NOT NULL AND ts_query_en_or IS NOT NULL AND ts_query_en_or::text <> '' AND e.search_vector_en @@ ts_query_en_or)
      OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
      OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
      OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> '' AND e.search_vector_en @@ ts_query_en)
      OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
      -- NEW: OR-based tsquery for multi-word (both mode)
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
      -- NEW: Per-word ILIKE fallbacks for multi-word queries
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
-- 4. UPDATE expand_search_query() — also try matching individual words
-- ============================================================================

CREATE OR REPLACE FUNCTION expand_search_query(
  search_text text,
  search_universe text DEFAULT NULL,
  search_lang text DEFAULT 'fr'
) RETURNS text AS $$
DECLARE
  expanded text;
  synonym_row RECORD;
  normalized_input text;
  word text;
  word_expansion text;
  words text[];
  result_parts text[];
  found_any boolean := false;
BEGIN
  normalized_input := lower(trim(search_text));

  -- 1. Exact synonym match (unchanged)
  SELECT s.expanded_terms INTO expanded
  FROM public.search_synonyms s
  WHERE lower(s.term) = normalized_input
    AND (s.universe IS NULL OR s.universe = search_universe)
    AND (search_lang = 'both' OR s.lang = search_lang)
  ORDER BY
    CASE WHEN s.universe IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN s.lang = search_lang THEN 0 ELSE 1 END
  LIMIT 1;

  IF expanded IS NOT NULL THEN
    RETURN expanded;
  END IF;

  -- 2. Partial match: user's query contains a synonym term (unchanged)
  FOR synonym_row IN
    SELECT s.term, s.expanded_terms
    FROM public.search_synonyms s
    WHERE normalized_input LIKE '%' || lower(s.term) || '%'
      AND length(s.term) >= 4
      AND (s.universe IS NULL OR s.universe = search_universe)
      AND (search_lang = 'both' OR s.lang = search_lang)
    ORDER BY length(s.term) DESC
    LIMIT 1
  LOOP
    RETURN replace(normalized_input, lower(synonym_row.term), synonym_row.expanded_terms);
  END LOOP;

  -- 3. NEW: Per-word synonym expansion for multi-word queries
  -- Split into words, expand each individually, combine with OR semantics
  words := string_to_array(normalized_input, ' ');
  IF array_length(words, 1) > 1 THEN
    result_parts := ARRAY[]::text[];
    FOR i IN 1..array_length(words, 1) LOOP
      word := words[i];
      IF length(word) < 3 THEN
        CONTINUE;
      END IF;

      -- Try exact synonym match for this word
      SELECT s.expanded_terms INTO word_expansion
      FROM public.search_synonyms s
      WHERE lower(s.term) = word
        AND (s.universe IS NULL OR s.universe = search_universe)
        AND (search_lang = 'both' OR s.lang = search_lang)
      ORDER BY
        CASE WHEN s.universe IS NOT NULL THEN 0 ELSE 1 END
      LIMIT 1;

      IF word_expansion IS NOT NULL THEN
        result_parts := array_append(result_parts, word_expansion);
        found_any := true;
      ELSE
        result_parts := array_append(result_parts, word);
      END IF;
    END LOOP;

    IF found_any THEN
      RETURN array_to_string(result_parts, ' ');
    END IF;
  END IF;

  -- No synonym found
  RETURN search_text;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expand_search_query(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text, text) TO authenticated;

COMMIT;
