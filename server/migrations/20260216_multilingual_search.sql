-- ============================================================================
-- MIGRATION: Multilingual search (English-first)
-- Date: 2026-02-16
-- Description:
--   1. Adds search_vector_en (English tsvector) column to establishments
--   2. Creates English vector generation function + updates trigger
--   3. Adds lang column to search_synonyms + seeds English synonyms
--   4. Updates expand_search_query() to accept search_lang
--   5. Updates search_establishments_scored() to accept search_lang
--   6. Updates count_establishments_scored() to accept search_lang
--   7. Adds lang column to search_suggestions + seeds English suggestions
--   8. Updates get_popular_suggestions() to accept filter_lang
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD search_vector_en COLUMN TO establishments
-- ============================================================================

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS search_vector_en tsvector;

CREATE INDEX IF NOT EXISTS idx_establishments_search_vector_en
  ON public.establishments USING GIN (search_vector_en);

-- ============================================================================
-- 2. CREATE ENGLISH SEARCH VECTOR GENERATION FUNCTION
-- Same shape as generate_establishment_search_vector_v2 but using 'english'
-- ============================================================================

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
  p_specialties text[]
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
    setweight(to_tsvector('english', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 3. UPDATE TRIGGER TO POPULATE BOTH FRENCH AND ENGLISH VECTORS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_establishment_search_vector()
RETURNS trigger AS $$
BEGIN
  -- French vector (existing)
  NEW.search_vector := generate_establishment_search_vector_v2(
    NEW.name, NEW.city, NEW.neighborhood, NEW.subcategory,
    NEW.tags, NEW.amenities, NEW.cuisine_types, NEW.description_short,
    NEW.ambiance_tags, NEW.specialties
  );
  -- English vector (new)
  NEW.search_vector_en := generate_establishment_search_vector_en(
    NEW.name, NEW.city, NEW.neighborhood, NEW.subcategory,
    NEW.tags, NEW.amenities, NEW.cuisine_types, NEW.description_short,
    NEW.ambiance_tags, NEW.specialties
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

-- ============================================================================
-- 4. BACKFILL search_vector_en FOR ALL EXISTING ESTABLISHMENTS
-- ============================================================================

UPDATE public.establishments
SET search_vector_en = generate_establishment_search_vector_en(
  name, city, neighborhood, subcategory,
  tags, amenities, cuisine_types, description_short,
  ambiance_tags, specialties
);

-- ============================================================================
-- 5. ADD lang COLUMN TO search_synonyms
-- Existing rows get lang='fr' automatically via DEFAULT
-- ============================================================================

ALTER TABLE public.search_synonyms
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';

-- ============================================================================
-- 6. SEED ENGLISH SYNONYMS
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe, lang) VALUES
  -- Cuisines
  ('asian', 'asian japanese chinese thai korean vietnamese wok sushi ramen pho noodles', 'restaurant', 'en'),
  ('asian food', 'asian japanese chinese thai korean vietnamese wok sushi ramen', 'restaurant', 'en'),
  ('moroccan food', 'moroccan tagine couscous pastilla harira traditional rfissa', 'restaurant', 'en'),
  ('moroccan cuisine', 'moroccan tagine couscous pastilla harira traditional marocain', 'restaurant', 'en'),
  ('italian food', 'italian pizza pasta risotto antipasti trattoria', 'restaurant', 'en'),
  ('italian', 'italian pizza pasta risotto antipasti trattoria italien', 'restaurant', 'en'),
  ('french food', 'french bistro brasserie gastronomique cuisine francaise', 'restaurant', 'en'),
  ('mexican food', 'mexican tacos burrito enchilada guacamole', 'restaurant', 'en'),
  ('indian food', 'indian curry tandoori naan biryani masala', 'restaurant', 'en'),
  ('chinese food', 'chinese wok dim sum cantonese noodles fried rice', 'restaurant', 'en'),
  ('japanese food', 'japanese sushi sashimi ramen tempura yakitori', 'restaurant', 'en'),
  ('thai food', 'thai pad thai curry green red yellow tom yum', 'restaurant', 'en'),
  ('seafood', 'seafood fish shrimp lobster oyster crab poisson fruits de mer', 'restaurant', 'en'),
  ('steakhouse', 'steakhouse steak grill beef ribs meat barbecue viande', 'restaurant', 'en'),
  ('vegetarian', 'vegetarian vegan veggie plant based healthy bio', 'restaurant', 'en'),
  ('vegan', 'vegan vegetarian veggie plant based healthy bio', 'restaurant', 'en'),
  ('halal', 'halal certified halal food', 'restaurant', 'en'),
  ('fast food', 'fast food burger pizza sandwich snack rapide', 'restaurant', 'en'),
  ('street food', 'street food snack sandwich wrap quick bite', 'restaurant', 'en'),
  -- Meals
  ('brunch', 'brunch breakfast petit-dejeuner eggs pancakes', 'restaurant', 'en'),
  ('best brunch', 'brunch petit-dejeuner breakfast eggs pancakes', 'restaurant', 'en'),
  ('breakfast', 'breakfast brunch petit-dejeuner morning', 'restaurant', 'en'),
  ('lunch', 'lunch dejeuner midday formule menu', 'restaurant', 'en'),
  ('dinner', 'dinner diner evening souper restaurant gastronomique', 'restaurant', 'en'),
  ('late night', 'late night evening nocturne ouvert tard soiree', 'restaurant', 'en'),
  -- Ambiance
  ('romantic', 'romantic couple intimate candlelight dinner date romantique', NULL, 'en'),
  ('date night', 'romantic couple dinner date romantique soiree', 'restaurant', 'en'),
  ('family friendly', 'family kids children playground enfant famille', NULL, 'en'),
  ('kid friendly', 'family kids children enfant famille aire de jeux', NULL, 'en'),
  ('rooftop', 'rooftop terrasse terrace panoramic view vue', NULL, 'en'),
  ('rooftop bar', 'rooftop terrasse bar cocktail vue panoramique', 'restaurant', 'en'),
  ('sea view', 'sea view ocean vue mer bord de mer plage', NULL, 'en'),
  ('terrace', 'terrace terrasse outdoor garden jardin exterieur', NULL, 'en'),
  -- Price
  ('cheap', 'cheap affordable budget low cost economique pas cher', NULL, 'en'),
  ('cheap eats', 'cheap affordable budget economique pas cher abordable', 'restaurant', 'en'),
  ('budget', 'budget cheap affordable economique pas cher', NULL, 'en'),
  ('luxury', 'luxury premium prestige high end exclusive luxe', NULL, 'en'),
  ('fine dining', 'fine dining gastronomique luxe prestige raffinee', 'restaurant', 'en'),
  -- Services
  ('delivery', 'delivery livraison a domicile', 'restaurant', 'en'),
  ('takeaway', 'takeaway emporter a emporter', 'restaurant', 'en'),
  ('all you can eat', 'all you can eat buffet a volonte unlimited', 'restaurant', 'en'),
  ('buffet', 'buffet all you can eat a volonte', 'restaurant', 'en'),
  -- Activities / Loisirs
  ('spa', 'spa hammam massage wellness detente relaxation bien-etre', 'wellness', 'en'),
  ('hammam', 'hammam spa bain maure traditionnel gommage', 'wellness', 'en'),
  ('massage', 'massage spa relaxation detente bien-etre', 'wellness', 'en'),
  ('escape room', 'escape room escape game jeu enigme', 'loisir', 'en'),
  ('paintball', 'paintball airsoft tir jeu equipe combat', 'loisir', 'en'),
  ('karting', 'karting kart circuit course go kart', 'loisir', 'en'),
  ('bowling', 'bowling piste quilles jeu', 'loisir', 'en'),
  ('water park', 'water park aqua parc piscine toboggan aquatique', 'loisir', 'en'),
  ('amusement park', 'amusement park parc attraction manege', 'loisir', 'en'),
  ('hiking', 'hiking randonnee trek montagne nature marche', 'loisir', 'en'),
  ('surfing', 'surfing surf bodyboard vague plage ocean', 'loisir', 'en'),
  ('golf', 'golf green parcours club swing', 'loisir', 'en'),
  -- Accommodation
  ('hotel', 'hotel riad maison hote hebergement lodge', 'hebergement', 'en'),
  ('riad', 'riad traditional moroccan hotel maison hote medina', 'hebergement', 'en'),
  ('guest house', 'guest house maison hote chambre hote riad', 'hebergement', 'en'),
  ('resort', 'resort hotel luxe all inclusive piscine spa', 'hebergement', 'en'),
  ('hostel', 'hostel auberge jeunesse backpacker budget', 'hebergement', 'en'),
  ('pool', 'pool piscine swimming baignade', NULL, 'en'),
  -- Culture
  ('museum', 'museum musee exposition art culture galerie', 'culture', 'en'),
  ('gallery', 'gallery galerie art exposition contemporain', 'culture', 'en'),
  ('guided tour', 'guided tour visite guidee excursion decouverte', 'culture', 'en'),
  ('cooking class', 'cooking class cours cuisine atelier culinaire', 'culture', 'en')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. UPDATE expand_search_query() TO ACCEPT search_lang PARAMETER
-- The new 3-param version replaces the 2-param version.
-- Since the 3rd param has a DEFAULT, existing callers work unchanged.
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
BEGIN
  normalized_input := lower(trim(search_text));

  -- Exact synonym match
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

  -- Partial match: user's query contains a synonym term
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

  -- No synonym found
  RETURN search_text;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expand_search_query(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text, text) TO authenticated;

-- ============================================================================
-- 8. UPDATE search_establishments_scored() WITH search_lang PARAMETER
-- Drop old 7-param signature, create new 8-param signature
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_establishments_scored(text, text, text, int, int, real, uuid);

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
  ts_query_en tsquery;
  ts_query_en_original tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  v_config text;
  v_use_en boolean;
  v_use_both boolean;
BEGIN
  search_text := trim(search_query);

  -- Determine language mode
  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english' ELSE 'french' END;

  -- Expand via synonyms (language-aware)
  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

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
        -- Full-text search on expanded query (EN vector)
        OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector_en @@ ts_query)
        -- Full-text search on original query (EN vector)
        OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en @@ ts_query_original)
        -- Both mode: FR or EN
        OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
        OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
        OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> '' AND e.search_vector_en @@ ts_query_en)
        OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
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

COMMENT ON FUNCTION public.search_establishments_scored IS
  'Full-text search for establishments with multilingual support (FR/EN/both), synonym expansion, trigram fuzzy matching, direct array matching, activity-based scoring, and cursor-based pagination';

-- ============================================================================
-- 9. UPDATE count_establishments_scored() WITH search_lang PARAMETER
-- ============================================================================

DROP FUNCTION IF EXISTS public.count_establishments_scored(text, text, text);

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
  ts_query_en tsquery;
  ts_query_en_original tsquery;
  search_text text;
  expanded_text text;
  is_multiword boolean;
  word_count int;
  result_count integer;
  v_config text;
  v_use_en boolean;
  v_use_both boolean;
BEGIN
  search_text := trim(search_query);

  v_use_en := (search_lang = 'en');
  v_use_both := (search_lang = 'both');
  v_config := CASE WHEN v_use_en THEN 'english' ELSE 'french' END;

  expanded_text := expand_search_query(search_text, filter_universe, search_lang);

  word_count := array_length(string_to_array(expanded_text, ' '), 1);
  is_multiword := COALESCE(word_count, 0) > 1;

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
      OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector_en @@ ts_query)
      OR (v_use_en AND e.search_vector_en IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector_en @@ ts_query_original)
      OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query IS NOT NULL AND ts_query::text <> '' AND e.search_vector @@ ts_query)
      OR (v_use_both AND e.search_vector IS NOT NULL AND ts_query_original IS NOT NULL AND ts_query_original::text <> '' AND e.search_vector @@ ts_query_original)
      OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en IS NOT NULL AND ts_query_en::text <> '' AND e.search_vector_en @@ ts_query_en)
      OR (v_use_both AND e.search_vector_en IS NOT NULL AND ts_query_en_original IS NOT NULL AND ts_query_en_original::text <> '' AND e.search_vector_en @@ ts_query_en_original)
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

GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.count_establishments_scored(text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.count_establishments_scored IS
  'Count matching establishments for a search query with multilingual support (FR/EN/both)';

-- ============================================================================
-- 10. ADD lang COLUMN TO search_suggestions
-- Existing rows get lang='fr' automatically via DEFAULT
-- ============================================================================

ALTER TABLE public.search_suggestions
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';

-- ============================================================================
-- 11. SEED ENGLISH SEARCH SUGGESTIONS
-- ============================================================================

INSERT INTO public.search_suggestions (term, category, display_label, icon_name, universe, is_active, search_count, lang) VALUES
  ('moroccan cuisine', 'cuisine', 'Moroccan Cuisine', 'utensils', 'restaurant', true, 10, 'en'),
  ('brunch', 'cuisine', 'Brunch', 'coffee', 'restaurant', true, 10, 'en'),
  ('rooftop bar', 'tag', 'Rooftop Bar', 'wine', 'restaurant', true, 8, 'en'),
  ('romantic dinner', 'tag', 'Romantic Dinner', 'heart', 'restaurant', true, 8, 'en'),
  ('family restaurant', 'tag', 'Family Restaurant', 'users', 'restaurant', true, 7, 'en'),
  ('seafood', 'cuisine', 'Seafood', 'fish', 'restaurant', true, 8, 'en'),
  ('italian', 'cuisine', 'Italian', 'pizza', 'restaurant', true, 7, 'en'),
  ('sushi', 'cuisine', 'Sushi', 'utensils', 'restaurant', true, 9, 'en'),
  ('fine dining', 'tag', 'Fine Dining', 'star', 'restaurant', true, 6, 'en'),
  ('street food', 'cuisine', 'Street Food', 'utensils', 'restaurant', true, 6, 'en'),
  ('steakhouse', 'cuisine', 'Steakhouse', 'beef', 'restaurant', true, 6, 'en'),
  ('vegetarian', 'tag', 'Vegetarian / Vegan', 'leaf', NULL, true, 5, 'en'),
  ('spa', 'activity', 'Spa & Wellness', 'droplet', 'wellness', true, 8, 'en'),
  ('hammam', 'activity', 'Hammam', 'droplet', 'wellness', true, 9, 'en'),
  ('escape room', 'activity', 'Escape Room', 'puzzle', 'loisir', true, 6, 'en'),
  ('water park', 'activity', 'Water Park', 'waves', 'loisir', true, 5, 'en'),
  ('golf', 'activity', 'Golf', 'flag', 'loisir', true, 4, 'en'),
  ('surfing', 'activity', 'Surfing', 'waves', 'loisir', true, 5, 'en'),
  ('hiking', 'activity', 'Hiking', 'mountain', 'loisir', true, 5, 'en'),
  ('hotel', 'accommodation', 'Hotel', 'bed', 'hebergement', true, 8, 'en'),
  ('riad', 'accommodation', 'Riad', 'home', 'hebergement', true, 9, 'en'),
  ('resort', 'accommodation', 'Resort', 'palmtree', 'hebergement', true, 6, 'en'),
  ('museum', 'activity', 'Museum', 'landmark', 'culture', true, 5, 'en'),
  ('guided tour', 'activity', 'Guided Tour', 'map', 'culture', true, 5, 'en'),
  ('cooking class', 'activity', 'Cooking Class', 'chef-hat', 'culture', true, 4, 'en'),
  ('cheap eats', 'tag', 'Cheap Eats', 'banknote', 'restaurant', true, 5, 'en'),
  ('delivery', 'tag', 'Delivery', 'truck', 'restaurant', true, 4, 'en'),
  ('terrace', 'tag', 'Terrace', 'sun', NULL, true, 6, 'en'),
  ('pool', 'tag', 'Swimming Pool', 'waves', NULL, true, 5, 'en'),
  ('late night', 'tag', 'Late Night', 'moon', 'restaurant', true, 4, 'en')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 12. UPDATE get_popular_suggestions() TO ACCEPT filter_lang
-- ============================================================================

CREATE OR REPLACE FUNCTION get_popular_suggestions(
  filter_universe text DEFAULT NULL,
  max_results integer DEFAULT 10,
  filter_lang text DEFAULT 'fr'
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
    s.search_count::double precision * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - COALESCE(s.last_searched_at, s.created_at))) / 86400.0)) AS popularity_score
  FROM public.search_suggestions s
  WHERE s.is_active = true
    AND (filter_universe IS NULL OR s.universe = filter_universe OR s.universe IS NULL)
    AND s.search_count > 0
    AND s.lang = filter_lang
  ORDER BY popularity_score DESC
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION get_popular_suggestions(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_popular_suggestions(text, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION get_popular_suggestions(text, integer, text) TO authenticated;

COMMIT;
