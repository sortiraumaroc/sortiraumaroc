-- ============================================================================
-- BATCH 5: Migrations 20260215-20260217_*
-- 14 fichiers: cursor pagination, leads, landing pages, search improvements, SEO, preferences, multilingual, onboarding, multiword fix, search path fix
-- ============================================================================


-- ============================================================
-- FILE: 20260215_cursor_pagination.sql
-- ============================================================

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

COMMENT ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid) IS
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

COMMENT ON FUNCTION public.count_establishments_scored(text, text, text) IS
  'Count matching establishments for a search query (same matching logic as search_establishments_scored, without scoring/pagination)';

COMMIT;


-- ============================================================
-- FILE: 20260215_establishment_leads_admin.sql
-- ============================================================

-- Migration: Add admin columns to lead_establishment_requests
-- Date: 2026-02-15
-- Purpose: Allow admin to track/process leads from "Ajouter mon établissement" form

ALTER TABLE lead_establishment_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE lead_establishment_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE lead_establishment_requests ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Index for admin listing (filter by status, order by date)
CREATE INDEX IF NOT EXISTS idx_lead_establishment_requests_status ON lead_establishment_requests (status);
CREATE INDEX IF NOT EXISTS idx_lead_establishment_requests_created_at ON lead_establishment_requests (created_at DESC);


-- ============================================================
-- FILE: 20260215_fix_landing_pages_encoding.sql
-- ============================================================

-- ============================================================================
-- Fix Mojibake encoding in landing_pages table
-- UTF-8 bytes misinterpreted as Latin-1/Windows-1252/Mac encoding
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: create a function to fix all mojibake patterns in a text field
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fix_mojibake(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result TEXT := input;
BEGIN
  IF result IS NULL THEN RETURN NULL; END IF;

  -- √ + char patterns (Mac OS encoding corruption)
  result := REPLACE(result, '√©', 'é');
  result := REPLACE(result, '√®', 'î');
  result := REPLACE(result, '√¢', 'â');
  result := REPLACE(result, '√†', 'à');
  result := REPLACE(result, '√π', 'ù');
  result := REPLACE(result, '√™', 'ê');
  result := REPLACE(result, '√´', 'ô');
  result := REPLACE(result, '√ª', 'ë');
  result := REPLACE(result, '√ß', 'ç');
  result := REPLACE(result, '√Æ', 'è');
  result := REPLACE(result, '√º', 'û');
  result := REPLACE(result, '√¶', 'ö');
  result := REPLACE(result, '√ü', 'ü');
  result := REPLACE(result, '√∫', 'ú');
  result := REPLACE(result, '√¨', 'è');
  result := REPLACE(result, '√Ä', 'à');
  result := REPLACE(result, '√â', 'â');
  result := REPLACE(result, '√¯', 'ï');
  result := REPLACE(result, '√Å', 'É');
  result := REPLACE(result, '√á', 'á');

  -- Ã + char patterns (classic UTF-8 → Latin-1 misread)
  result := REPLACE(result, 'Ã©', 'é');
  result := REPLACE(result, 'Ã¨', 'è');
  result := REPLACE(result, 'Ã ', 'à');
  result := REPLACE(result, 'Ã®', 'î');
  result := REPLACE(result, 'Ã´', 'ô');
  result := REPLACE(result, 'Ã¢', 'â');
  result := REPLACE(result, 'Ã§', 'ç');
  result := REPLACE(result, 'Ã¹', 'ù');
  result := REPLACE(result, 'Ã¼', 'ü');
  result := REPLACE(result, 'Ãª', 'ê');
  result := REPLACE(result, 'Ã«', 'ë');
  result := REPLACE(result, 'Ã¯', 'ï');
  result := REPLACE(result, 'Ã»', 'û');
  result := REPLACE(result, 'Ã¶', 'ö');
  result := REPLACE(result, 'Ã¤', 'ä');

  -- ,Ä patterns (Windows-1252 smart quotes/dashes stored as UTF-8)
  result := REPLACE(result, ',Äî', ' – ');  -- en-dash
  result := REPLACE(result, ',Äì', ' – ');  -- en-dash variant
  result := REPLACE(result, ',Äú', '"');     -- left double quote
  result := REPLACE(result, ',Äù', '"');     -- right double quote
  result := REPLACE(result, ',Äô', '''');    -- right single quote / apostrophe
  result := REPLACE(result, ',Äö', '''');    -- left single quote
  result := REPLACE(result, ',Ä¶', '...');   -- ellipsis
  result := REPLACE(result, ',Äë', ' ');     -- non-breaking space

  -- â€ patterns (another common UTF-8 → Latin-1 pattern for smart chars)
  result := REPLACE(result, 'â€™', '''');   -- right single quote
  result := REPLACE(result, 'â€"', '–');    -- en-dash
  result := REPLACE(result, 'â€"', '—');    -- em-dash
  result := REPLACE(result, 'â€œ', '"');    -- left double quote
  result := REPLACE(result, 'â€', '"');     -- right double quote (partial)

  -- Non-breaking space artifacts
  result := REPLACE(result, 'Â ', ' ');
  result := REPLACE(result, 'Â·', '·');

  -- Clean up any double spaces that may result from replacements
  WHILE POSITION('  ' IN result) > 0 LOOP
    result := REPLACE(result, '  ', ' ');
  END LOOP;

  RETURN TRIM(result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fix ALL text columns in landing_pages
-- ---------------------------------------------------------------------------
UPDATE landing_pages SET
  title_fr       = fix_mojibake(title_fr),
  title_en       = fix_mojibake(title_en),
  title_es       = fix_mojibake(title_es),
  title_it       = fix_mojibake(title_it),
  title_ar       = fix_mojibake(title_ar),
  description_fr = fix_mojibake(description_fr),
  description_en = fix_mojibake(description_en),
  description_es = fix_mojibake(description_es),
  description_it = fix_mojibake(description_it),
  description_ar = fix_mojibake(description_ar),
  h1_fr          = fix_mojibake(h1_fr),
  h1_en          = fix_mojibake(h1_en),
  h1_es          = fix_mojibake(h1_es),
  h1_it          = fix_mojibake(h1_it),
  h1_ar          = fix_mojibake(h1_ar),
  intro_text_fr  = fix_mojibake(intro_text_fr),
  intro_text_en  = fix_mojibake(intro_text_en),
  intro_text_es  = fix_mojibake(intro_text_es),
  intro_text_it  = fix_mojibake(intro_text_it),
  intro_text_ar  = fix_mojibake(intro_text_ar),
  keywords       = fix_mojibake(keywords),
  city           = fix_mojibake(city),
  cuisine_type   = fix_mojibake(cuisine_type),
  category       = fix_mojibake(category),
  updated_at     = now();

-- ---------------------------------------------------------------------------
-- Verify: slugs should be ASCII lowercase + hyphens only
-- Fix any slugs with accented characters
-- ---------------------------------------------------------------------------
UPDATE landing_pages SET
  slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(slug, '[éèêë]', 'e', 'g'),
                '[àâä]', 'a', 'g'),
              '[ùûü]', 'u', 'g'),
            '[îï]', 'i', 'g'),
          '[ôö]', 'o', 'g'),
        'ç', 'c', 'g'),
      '[^a-z0-9-]', '-', 'g')
  )
WHERE slug ~ '[^a-z0-9-]';

-- ---------------------------------------------------------------------------
-- Verification queries (run these manually to check results)
-- ---------------------------------------------------------------------------
-- SELECT slug, h1_fr, title_fr, city, cuisine_type
-- FROM landing_pages
-- WHERE is_active = true
-- ORDER BY slug
-- LIMIT 20;

-- Drop the helper function (optional — keep if you want to reuse)
-- DROP FUNCTION IF EXISTS fix_mojibake(TEXT);

COMMIT;


-- ============================================================
-- FILE: 20260215_hide_no_cover_establishments.sql
-- ============================================================

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


-- ============================================================
-- FILE: 20260215_search_boost_events.sql
-- ============================================================

-- Prompt 14 — Contextual boosting: event-based boost rules
-- Allows admin to configure time-limited boost rules (Ramadan, Saint-Valentin, etc.)

CREATE TABLE IF NOT EXISTS search_boost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  boost_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup of active events by date range
CREATE INDEX IF NOT EXISTS idx_search_boost_events_active_dates
  ON search_boost_events (date_from, date_to) WHERE is_active = true;

-- RLS: only service_role can access (admin-only table)
ALTER TABLE search_boost_events ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FILE: 20260215_search_fallback.sql
-- ============================================================

-- Prompt 13 — Search fallback analytics columns for search_history
-- Tracks when fallback suggestions were shown and which type
-- NOTE: search_history table may not exist yet — skip if missing

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    ALTER TABLE public.search_history
      ADD COLUMN IF NOT EXISTS fallback_shown boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS fallback_type text;
    CREATE INDEX IF NOT EXISTS idx_search_history_fallback
      ON public.search_history (fallback_shown, fallback_type)
      WHERE fallback_shown = true;
  END IF;
END $$;


-- ============================================================
-- FILE: 20260215_search_suggestions_last_searched.sql
-- ============================================================

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


-- ============================================================
-- FILE: 20260215_search_synonyms_and_vector_fix.sql
-- ============================================================

-- ============================================================================
-- SEARCH ENGINE FIX: Synonyms + Vector Enhancement
-- Fixes: "Asiatique", "cuisine marocaine", and ALL taxonomy terms
-- 1. Creates search_synonyms table with comprehensive mappings
-- 2. Updates search vector to include ambiance_tags + specialties
-- 3. Updates search function to expand queries via synonyms
-- 4. Re-populates all search vectors
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE SEARCH SYNONYMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,           -- What the user types (e.g. "asiatique", "cuisine marocaine")
  expanded_terms text NOT NULL, -- What we actually search for (e.g. "asiatique japonais chinois thaïlandais coréen vietnamien wok sushi")
  universe text,                -- NULL = all universes
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_synonyms_term_universe
  ON public.search_synonyms (lower(term), COALESCE(universe, '__all__'));

CREATE INDEX IF NOT EXISTS idx_search_synonyms_term_trgm
  ON public.search_synonyms USING GIN (term gin_trgm_ops);

-- ============================================================================
-- 2. SEED SYNONYMS — RESTAURANTS / CUISINE TYPES
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  -- Generic "cuisine X" phrases → expand to the cuisine adjective + related terms
  ('cuisine marocaine', 'marocain cuisine marocaine tajine couscous pastilla harira tanjia rfissa traditionnel', 'restaurant'),
  ('cuisine française', 'français cuisine française bistrot brasserie gastronomique terroir', 'restaurant'),
  ('cuisine italienne', 'italien cuisine italienne pizza pasta pâtes risotto antipasti trattoria', 'restaurant'),
  ('cuisine japonaise', 'japonais cuisine japonaise sushi sashimi ramen tempura izakaya yakitori maki', 'restaurant'),
  ('cuisine chinoise', 'chinois cuisine chinoise dim sum cantonais szechuan wok nouilles', 'restaurant'),
  ('cuisine libanaise', 'libanais cuisine libanaise mezze falafel houmous taboulé shawarma', 'restaurant'),
  ('cuisine indienne', 'indien cuisine indienne curry tandoori naan biryani tikka masala', 'restaurant'),
  ('cuisine mexicaine', 'mexicain cuisine mexicaine tacos burrito enchilada guacamole quesadilla', 'restaurant'),
  ('cuisine thaïlandaise', 'thaïlandais cuisine thaïlandaise thai pad thai tom yam curry vert', 'restaurant'),
  ('cuisine thaï', 'thaïlandais cuisine thaïlandaise thai pad thai tom yam curry vert', 'restaurant'),
  ('cuisine méditerranéenne', 'méditerranéen cuisine méditerranéenne grec turc libanais espagnol mezze', 'restaurant'),
  ('cuisine orientale', 'oriental cuisine orientale libanais syrien turc mezze kebab shawarma', 'restaurant'),
  ('cuisine espagnole', 'espagnol cuisine espagnole tapas paella sangria pintxos', 'restaurant'),
  ('cuisine turque', 'turc cuisine turque kebab döner pide lahmacun baklava', 'restaurant'),
  ('cuisine coréenne', 'coréen cuisine coréenne bibimbap kimchi barbecue coréen bulgogi', 'restaurant'),
  ('cuisine vietnamienne', 'vietnamien cuisine vietnamienne pho bo bun nem banh mi', 'restaurant'),
  ('cuisine brésilienne', 'brésilien cuisine brésilienne churrasco picanha feijoada', 'restaurant'),
  ('cuisine péruvienne', 'péruvien cuisine péruvienne ceviche lomo saltado', 'restaurant'),
  ('cuisine africaine', 'africain cuisine africaine sénégalais éthiopien camerounais', 'restaurant'),
  ('cuisine algérienne', 'algérien cuisine algérienne couscous chorba bourek', 'restaurant'),
  ('cuisine tunisienne', 'tunisien cuisine tunisienne brik ojja lablabi couscous', 'restaurant'),
  ('cuisine grecque', 'grec cuisine grecque gyros souvlaki moussaka tzatziki salade grecque', 'restaurant'),
  ('cuisine américaine', 'américain cuisine américaine burger hamburger hot dog bbq barbecue ribs', 'restaurant'),
  ('cuisine portugaise', 'portugais cuisine portugaise bacalhau pasteis de nata grillades', 'restaurant'),

  -- Adjective/noun variants → umbrella terms that encompass sub-cuisines
  ('asiatique', 'asiatique japonais chinois thaïlandais coréen vietnamien cambodgien indien wok sushi ramen pho noodles nouilles', 'restaurant'),
  ('oriental', 'oriental libanais syrien turc marocain tunisien algérien iranien mezze kebab shawarma falafel', 'restaurant'),
  ('africain', 'africain sénégalais éthiopien camerounais nigérian ivoirien', 'restaurant'),
  ('latino', 'latino mexicain brésilien péruvien colombien cubain vénézuélien argentin', 'restaurant'),
  ('européen', 'français italien espagnol portugais grec allemand anglais', 'restaurant'),
  ('fusion', 'fusion monde créatif asiatique méditerranéen moderne', 'restaurant'),

  -- Dish-based searches
  ('sushi', 'sushi japonais maki sashimi california roll nigiri', 'restaurant'),
  ('pizza', 'pizza italien pizzeria napolitaine margherita', 'restaurant'),
  ('burger', 'burger hamburger smash burger américain fast food gourmet', 'restaurant'),
  ('tacos', 'tacos mexicain taqueria burrito', 'restaurant'),
  ('couscous', 'couscous marocain algérien tunisien traditionnel', 'restaurant'),
  ('tajine', 'tajine marocain traditionnel tagine', 'restaurant'),
  ('pastilla', 'pastilla marocain traditionnel bastilla', 'restaurant'),
  ('brunch', 'brunch petit déjeuner breakfast eggs benedict pancakes', 'restaurant'),
  ('grillades', 'grillades grill barbecue bbq steakhouse viande braise', 'restaurant'),
  ('fruits de mer', 'fruits de mer poisson seafood crevettes huîtres moules crustacés', 'restaurant'),
  ('pâtes', 'pâtes pasta italien spaghetti tagliatelle penne carbonara bolognaise', 'restaurant'),
  ('ramen', 'ramen japonais nouilles soupe', 'restaurant'),
  ('mezze', 'mezze libanais oriental houmous taboulé falafel', 'restaurant'),
  ('kebab', 'kebab turc döner shawarma grillade', 'restaurant'),
  ('tapas', 'tapas espagnol pintxos apéritif petits plats', 'restaurant'),
  ('crêpes', 'crêpes crêperie galette bretonne', 'restaurant'),
  ('poke', 'poke bowl hawaïen poisson cru healthy', 'restaurant'),
  ('dim sum', 'dim sum chinois cantonais raviolis vapeur', 'restaurant'),

  -- Concept searches
  ('steakhouse', 'steakhouse grill grillades viande bœuf steak côte', 'restaurant'),
  ('café', 'café coffee shop salon de thé latte cappuccino espresso', 'restaurant'),
  ('bar', 'bar lounge cocktail apéritif mixologie', 'restaurant'),
  ('brasserie', 'brasserie français bistrot terrasse plat du jour', 'restaurant'),
  ('fast food', 'fast food burger pizza tacos rapide à emporter', 'restaurant'),
  ('gastronomique', 'gastronomique étoilé fine dining chef table gastro', 'restaurant'),
  ('street food', 'street food food truck ambulant snack rapide', 'restaurant'),
  ('buffet', 'buffet à volonté all you can eat brunch self service', 'restaurant'),
  ('traiteur', 'traiteur événement mariage réception catering', 'restaurant'),
  ('pâtisserie', 'pâtisserie dessert gâteau cake viennoiserie', 'restaurant'),
  ('boulangerie', 'boulangerie pain viennoiserie croissant artisan', 'restaurant'),
  ('glacier', 'glacier glace ice cream sorbet frozen', 'restaurant'),
  ('salon de thé', 'salon de thé thé pâtisserie café goûter', 'restaurant'),

  -- Diet searches
  ('vegan', 'vegan végétalien plant based sans viande sans lait', 'restaurant'),
  ('végétarien', 'végétarien vegan légumes sans viande veggie', 'restaurant'),
  ('halal', 'halal certifié halal viande halal', 'restaurant'),
  ('sans gluten', 'sans gluten gluten free intolérance cœliaque', 'restaurant'),
  ('healthy', 'healthy sain salade bowl poke bio détox', 'restaurant'),
  ('bio', 'bio biologique organique naturel produits locaux', 'restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. SEED SYNONYMS — AMBIANCES (all universes)
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('romantique', 'romantique couple amoureux tête à tête intimiste dîner aux chandelles saint valentin', NULL),
  ('familial', 'familial famille enfants kids club aire de jeux menu enfant', NULL),
  ('branché', 'branché tendance trendy hype insta instagrammable design', NULL),
  ('cosy', 'cosy chaleureux intime confortable douillet', NULL),
  ('terrasse', 'terrasse extérieur en plein air outdoor vue', NULL),
  ('rooftop', 'rooftop toit terrasse vue panoramique skybar', NULL),
  ('festif', 'festif fête soirée ambiance DJ musique danse', NULL),
  ('lounge', 'lounge bar chillout détente cocktail musique', NULL),
  ('live music', 'live music musique live concert groupe chanteur DJ', NULL),
  ('vue mer', 'vue mer bord de mer océan plage front de mer', NULL),
  ('bord de mer', 'bord de mer vue mer océan plage littoral côte', NULL),
  ('jardin', 'jardin verdure nature extérieur plein air calme', NULL),
  ('piscine', 'piscine pool baignade aqua', NULL),
  ('business', 'business professionnel séminaire réunion corporate conférence team building', NULL),
  ('anniversaire', 'anniversaire fête birthday célébration', NULL),
  ('evjf', 'evjf evg enterrement vie de jeune fille garçon bachelorette bachelor fête', NULL),
  ('team building', 'team building entreprise corporate séminaire groupe équipe cohésion', NULL),
  ('décontracté', 'décontracté casual relax informel chill', NULL),
  ('gastronomique', 'gastronomique étoilé fine dining chef table haut de gamme', NULL),
  ('traditionnel', 'traditionnel authentique typique artisanal local terroir', NULL),
  ('design', 'design moderne contemporain minimaliste architectural', NULL),
  ('intimiste', 'intimiste intime petit cosy calme tête à tête', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. SEED SYNONYMS — SPORT & BIEN-ÊTRE
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('hammam', 'hammam bain vapeur gommage savon noir spa traditionnel', 'sport'),
  ('spa', 'spa bien-être wellness détente relaxation massage jacuzzi sauna hammam', 'sport'),
  ('massage', 'massage relaxant sportif thaïlandais shiatsu pierres chaudes réflexologie', 'sport'),
  ('yoga', 'yoga hatha vinyasa kundalini méditation stretching souplesse', 'sport'),
  ('pilates', 'pilates renforcement gainage core souplesse', 'sport'),
  ('fitness', 'fitness gym musculation salle de sport entraînement cardio', 'sport'),
  ('crossfit', 'crossfit hiit fonctionnel circuit training', 'sport'),
  ('musculation', 'musculation bodybuilding fitness poids haltères gym', 'sport'),
  ('piscine', 'piscine natation aquagym aqua nage bassin', 'sport'),
  ('padel', 'padel raquette terrain padel court', 'sport'),
  ('tennis', 'tennis raquette court terre battue', 'sport'),
  ('foot', 'foot football foot5 foot 5 terrain synthétique', 'sport'),
  ('boxe', 'boxe boxing mma arts martiaux kick boxing muay thai', 'sport'),
  ('arts martiaux', 'arts martiaux karate judo taekwondo jiu jitsu kung fu self défense', 'sport'),
  ('coiffeur', 'coiffeur coiffure salon cheveux brushing coloration mèches', 'sport'),
  ('barbier', 'barbier barber coiffeur homme barbe rasage', 'sport'),
  ('institut beauté', 'institut beauté esthétique soins visage corps manucure pédicure épilation', 'sport'),
  ('salle de sport', 'salle de sport gym fitness musculation cardio entraînement', 'sport'),
  ('coach', 'coach personnel coaching entraîneur trainer personal training', 'sport'),
  ('bien-être', 'bien-être wellness spa hammam massage détente relaxation', 'sport'),
  ('détente', 'détente relaxation bien-être spa zen calme repos', 'sport'),
  ('escalade', 'escalade bloc varappe grimpe climbing mur', 'sport'),
  ('squash', 'squash raquette court indoor', 'sport'),
  ('sauna', 'sauna vapeur chaleur détente finlandais', 'sport'),
  ('jacuzzi', 'jacuzzi bain à remous spa balnéothérapie whirlpool', 'sport')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. SEED SYNONYMS — LOISIRS
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('escape game', 'escape game escape room énigme puzzle aventure enquête immersif', 'loisir'),
  ('karting', 'karting kart course circuit vitesse', 'loisir'),
  ('quad', 'quad buggy randonnée tout terrain aventure', 'loisir'),
  ('jet ski', 'jet ski jetski nautique mer eau sport scooter des mers', 'loisir'),
  ('paddle', 'paddle stand up paddle SUP mer eau planche', 'loisir'),
  ('kayak', 'kayak canoë pirogue eau rivière mer pagaie', 'loisir'),
  ('surf', 'surf kitesurf bodyboard vague planche glisse', 'loisir'),
  ('kitesurf', 'kitesurf kite surf vent planche voile', 'loisir'),
  ('parachute', 'parachute parapente saut chute libre vol aérien ciel', 'loisir'),
  ('parapente', 'parapente vol libre aérien ciel panorama', 'loisir'),
  ('golf', 'golf parcours green trou putting driving range practice', 'loisir'),
  ('bowling', 'bowling quilles piste boule', 'loisir'),
  ('laser game', 'laser game laser tag combat jeu équipe', 'loisir'),
  ('paintball', 'paintball airsoft tir combat équipe', 'loisir'),
  ('aquapark', 'aquapark parc aquatique toboggan piscine glissade eau', 'loisir'),
  ('parc attractions', 'parc attractions manèges sensations fortes fête foraine luna park', 'loisir'),
  ('zoo', 'zoo parc animalier animaux safari faune', 'loisir'),
  ('balade cheval', 'balade cheval équitation randonnée cavalière haras', 'loisir'),
  ('balade chameau', 'balade chameau dromadaire désert méharée', 'loisir'),
  ('randonnée', 'randonnée trekking marche trail montagne nature', 'loisir'),
  ('VTT', 'VTT vélo mountain bike cyclisme randonnée', 'loisir'),
  ('accrobranche', 'accrobranche parcours aventure tyrolienne arbre forêt', 'loisir'),
  ('plongée', 'plongée diving sous marine snorkeling masque tuba', 'loisir'),
  ('réalité virtuelle', 'réalité virtuelle VR jeu vidéo simulation immersif casque', 'loisir'),
  ('karaoké', 'karaoké chant micro soirée musique', 'loisir'),
  ('billard', 'billard pool snooker queue bille', 'loisir'),
  ('wakeboard', 'wakeboard ski nautique câble glisse eau', 'loisir'),
  ('saut élastique', 'saut élastique bungee jumping adrénaline sensations fortes', 'loisir'),
  ('simulateur', 'simulateur simulation vol course conduite expérience', 'loisir'),
  ('trottinette', 'trottinette électrique mobilité balade visite', 'loisir'),
  ('activité nautique', 'activité nautique mer eau jet ski paddle kayak surf voile bateau', 'loisir'),
  ('activité aérienne', 'activité aérienne parachute parapente ULM montgolfière vol', 'loisir'),
  ('sensations fortes', 'sensations fortes adrénaline extrême parachute saut élastique karting quad', 'loisir'),
  ('enfants', 'enfants kids famille parc jeux aire de jeux anniversaire', 'loisir')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. SEED SYNONYMS — HÉBERGEMENT
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('hôtel', 'hôtel hotel hébergement nuit chambre séjour', 'hebergement'),
  ('hotel', 'hôtel hotel hébergement nuit chambre séjour', 'hebergement'),
  ('riad', 'riad maison traditionnelle médina patio fontaine maroc', 'hebergement'),
  ('maison hôtes', 'maison hôtes guesthouse chambre hôtes accueil familial', 'hebergement'),
  ('villa', 'villa maison privée piscine jardin luxe vacances', 'hebergement'),
  ('appartement', 'appartement appart location meublé studio loft', 'hebergement'),
  ('resort', 'resort complexe all inclusive club vacances', 'hebergement'),
  ('auberge', 'auberge hostel backpacker dortoir budget économique', 'hebergement'),
  ('glamping', 'glamping camping luxe nature tente lodge insolite', 'hebergement'),
  ('camping', 'camping tente caravane nature plein air bivouac', 'hebergement'),
  ('palace', 'palace palace luxe 5 étoiles prestige grand hôtel', 'hebergement'),
  ('chalet', 'chalet montagne neige ski bois cosy', 'hebergement'),
  ('bungalow', 'bungalow cottage petite maison vacances plage', 'hebergement'),
  ('chambre hôtes', 'chambre hôtes bed and breakfast B&B petit déjeuner accueil', 'hebergement'),
  ('luxe', 'luxe palace 5 étoiles premium prestige suite', 'hebergement'),
  ('pas cher', 'pas cher budget économique bon marché low cost auberge hostel', 'hebergement'),
  ('piscine', 'piscine pool baignade hébergement piscine', 'hebergement'),
  ('vue mer', 'vue mer bord de mer plage océan front de mer littoral', 'hebergement'),
  ('all inclusive', 'all inclusive tout compris pension complète resort club', 'hebergement'),
  ('boutique hotel', 'boutique hotel petit hôtel design charme unique', 'hebergement')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. SEED SYNONYMS — CULTURE
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('musée', 'musée museum exposition collection art histoire sciences', 'culture'),
  ('visite', 'visite guidée visite touristique découverte excursion tour', 'culture'),
  ('visite guidée', 'visite guidée tour guide accompagné découverte patrimoine', 'culture'),
  ('théâtre', 'théâtre pièce spectacle comédie drame scène représentation', 'culture'),
  ('concert', 'concert musique live spectacle scène artiste groupe festival', 'culture'),
  ('exposition', 'exposition expo galerie art peinture sculpture photo', 'culture'),
  ('galerie', 'galerie galerie art exposition peinture sculpture artiste contemporain', 'culture'),
  ('festival', 'festival événement musique spectacle culturel annuel', 'culture'),
  ('monument', 'monument historique patrimoine architecture ancien palais château', 'culture'),
  ('médina', 'médina vieille ville souk artisanat patrimoine historique traditionnel', 'culture'),
  ('atelier', 'atelier workshop créatif art poterie calligraphie cuisine', 'culture'),
  ('cours cuisine', 'cours cuisine atelier culinaire gastronomie apprendre recette chef', 'culture'),
  ('poterie', 'poterie céramique atelier argile artisanat terre', 'culture'),
  ('calligraphie', 'calligraphie écriture arabe atelier art', 'culture'),
  ('dégustation', 'dégustation vin thé olive huile saveur terroir', 'culture'),
  ('spectacle', 'spectacle représentation show soirée performance artiste', 'culture'),
  ('opéra', 'opéra lyrique chant classique orchestré', 'culture'),
  ('danse', 'danse ballet contemporain traditionnelle folklore spectacle', 'culture'),
  ('archéologie', 'archéologie site archéologique ruines fouilles histoire antique', 'culture'),
  ('patrimoine', 'patrimoine historique monument culture héritage ancien', 'culture')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. SEED SYNONYMS — SHOPPING
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('mode', 'mode vêtements prêt-à-porter fashion style tendance', 'shopping'),
  ('chaussures', 'chaussures shoes sneakers baskets talons bottes sandales', 'shopping'),
  ('bijoux', 'bijoux joaillerie fantaisie bague collier bracelet montre', 'shopping'),
  ('beauté', 'beauté cosmétiques maquillage parfumerie soins crème', 'shopping'),
  ('parfumerie', 'parfumerie parfum fragrance eau de toilette beauté', 'shopping'),
  ('décoration', 'décoration déco maison intérieur design mobilier luminaire', 'shopping'),
  ('artisanat', 'artisanat marocain poterie céramique cuir tapis traditionnel souk', 'shopping'),
  ('épicerie fine', 'épicerie fine gourmet produits terroir bio délicatesse', 'shopping'),
  ('maroquinerie', 'maroquinerie cuir sac portefeuille ceinture', 'shopping'),
  ('optique', 'optique lunettes soleil vue monture', 'shopping'),
  ('concept store', 'concept store boutique design sélection multimarque tendance', 'shopping'),
  ('centre commercial', 'centre commercial mall shopping galerie marchande magasin', 'shopping'),
  ('souk', 'souk marché traditionnel artisanat médina bazar', 'shopping'),
  ('vintage', 'vintage rétro seconde main fripe occasion', 'shopping'),
  ('luxe', 'luxe premium haut de gamme marque designer', 'shopping'),
  ('pâtisserie', 'pâtisserie gâteaux desserts sucreries confiseries', 'shopping'),
  ('chocolaterie', 'chocolaterie chocolat praline confiserie douceurs', 'shopping'),
  ('cave vin', 'cave vin œnologie bouteille sommelier cru', 'shopping'),
  ('thé café', 'thé café salon torréfacteur infusion', 'shopping'),
  ('mobilier', 'mobilier meuble canapé table chaise décoration intérieur', 'shopping'),
  ('tapis', 'tapis berbère kilim artisanat décoration marocain', 'shopping'),
  ('textile', 'textile tissu broderie couture caftans djellaba', 'shopping')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. SEED SYNONYMS — RENTACAR / SE DÉPLACER
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('location voiture', 'location voiture véhicule automobile louer', 'rentacar'),
  ('voiture luxe', 'voiture luxe premium prestige sport berline coupé cabriolet', 'rentacar'),
  ('SUV', 'SUV 4x4 crossover tout terrain spacieux', 'rentacar'),
  ('moto', 'moto scooter deux roues motocyclette', 'rentacar'),
  ('vélo', 'vélo bicyclette VTT électrique balade', 'rentacar'),
  ('van', 'van camping-car minibus fourgon aménagé road trip', 'rentacar'),
  ('avec chauffeur', 'avec chauffeur privé transfert navette VTC', 'rentacar'),
  ('pas cher', 'pas cher économique budget bon marché low cost citadine', 'rentacar'),
  ('automatique', 'automatique boîte auto transmission automatique', 'rentacar'),
  ('électrique', 'électrique eco hybride vert écologique zéro émission', 'rentacar')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. SEED SYNONYMS — GENERIC / CROSS-UNIVERSE
-- ============================================================================

INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
  ('pas cher', 'pas cher budget économique bon marché low cost promo promotion', NULL),
  ('luxe', 'luxe premium prestige haut de gamme VIP exclusif', NULL),
  ('enfants', 'enfants kids famille bébé junior aire de jeux activité enfant', NULL),
  ('groupe', 'groupe groupes équipe corporate team building séminaire', NULL),
  ('couple', 'couple romantique amoureux tête à tête saint valentin', NULL),
  ('handicapé', 'handicapé accessible PMR mobilité réduite fauteuil roulant', NULL),
  ('parking', 'parking stationnement voiture garer', NULL),
  ('wifi', 'wifi internet connexion gratuit', NULL),
  ('animaux', 'animaux chien chat pet friendly accepté', NULL),
  ('ouvert maintenant', 'ouvert maintenant disponible', NULL),
  ('nouveauté', 'nouveauté nouveau récent ouverture', NULL),
  ('populaire', 'populaire tendance recommandé meilleur top avis', NULL),
  ('promo', 'promo promotion offre réduction deal bon plan', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. UPDATE generate_establishment_search_vector TO INCLUDE ambiance_tags + specialties
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_establishment_search_vector(
  p_name text,
  p_city text,
  p_neighborhood text,
  p_subcategory text,
  p_tags text[],
  p_amenities text[],
  p_cuisine_types text[],
  p_description_short text
) RETURNS tsvector AS $$
DECLARE
  v_tags_text text;
  v_amenities_text text;
  v_cuisine_text text;
  v_ambiance_text text;
  v_specialties_text text;
BEGIN
  -- Convert arrays to space-separated text
  v_tags_text := COALESCE(array_to_string(p_tags, ' '), '');
  v_amenities_text := COALESCE(array_to_string(p_amenities, ' '), '');
  v_cuisine_text := COALESCE(array_to_string(p_cuisine_types, ' '), '');

  RETURN (
    -- Weight A (highest): name
    setweight(to_tsvector('french', COALESCE(p_name, '')), 'A') ||
    -- Weight B: subcategory, cuisine types, tags
    setweight(to_tsvector('french', COALESCE(p_subcategory, '')), 'B') ||
    setweight(to_tsvector('french', v_cuisine_text), 'B') ||
    setweight(to_tsvector('french', v_tags_text), 'B') ||
    -- Weight C: amenities, city, neighborhood
    setweight(to_tsvector('french', v_amenities_text), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_city, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_neighborhood, '')), 'C') ||
    -- Weight D (lowest): description
    setweight(to_tsvector('french', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- NEW: Extended version that includes ambiance_tags and specialties
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
  p_specialties text[]
) RETURNS tsvector AS $$
DECLARE
  v_tags_text text;
  v_amenities_text text;
  v_cuisine_text text;
  v_ambiance_text text;
  v_specialties_text text;
BEGIN
  -- Convert arrays to space-separated text
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
    -- Weight C: amenities, city, neighborhood, ambiance
    setweight(to_tsvector('french', v_amenities_text), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_city, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(p_neighborhood, '')), 'C') ||
    setweight(to_tsvector('french', v_ambiance_text), 'C') ||
    -- Weight D (lowest): description
    setweight(to_tsvector('french', COALESCE(p_description_short, '')), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 12. UPDATE TRIGGER TO USE V2 FUNCTION WITH ambiance_tags + specialties
-- ============================================================================

CREATE OR REPLACE FUNCTION update_establishment_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := generate_establishment_search_vector_v2(
    NEW.name,
    NEW.city,
    NEW.neighborhood,
    NEW.subcategory,
    NEW.tags,
    NEW.amenities,
    NEW.cuisine_types,
    NEW.description_short,
    NEW.ambiance_tags,
    NEW.specialties
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to include ambiance_tags and specialties in the monitored columns
DROP TRIGGER IF EXISTS trg_establishments_search_vector ON public.establishments;

CREATE TRIGGER trg_establishments_search_vector
  BEFORE INSERT OR UPDATE OF name, city, neighborhood, subcategory, tags, amenities, cuisine_types, description_short, ambiance_tags, specialties
  ON public.establishments
  FOR EACH ROW
  EXECUTE FUNCTION update_establishment_search_vector();

-- ============================================================================
-- 13. CREATE SYNONYM EXPANSION HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION expand_search_query(
  search_text text,
  search_universe text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  expanded text;
  synonym_row RECORD;
  normalized_input text;
BEGIN
  normalized_input := lower(trim(search_text));

  -- Look for an exact synonym match (case-insensitive)
  SELECT s.expanded_terms INTO expanded
  FROM public.search_synonyms s
  WHERE lower(s.term) = normalized_input
    AND (s.universe IS NULL OR s.universe = search_universe)
  ORDER BY
    -- Prefer universe-specific match over global
    CASE WHEN s.universe IS NOT NULL THEN 0 ELSE 1 END
  LIMIT 1;

  IF expanded IS NOT NULL THEN
    RETURN expanded;
  END IF;

  -- No exact match: try partial match (the user's query contains a synonym term)
  -- e.g. "restaurant asiatique casablanca" contains "asiatique"
  FOR synonym_row IN
    SELECT s.term, s.expanded_terms
    FROM public.search_synonyms s
    WHERE normalized_input LIKE '%' || lower(s.term) || '%'
      AND length(s.term) >= 4  -- Avoid very short false matches
      AND (s.universe IS NULL OR s.universe = search_universe)
    ORDER BY length(s.term) DESC  -- Prefer longer (more specific) matches
    LIMIT 1
  LOOP
    -- Replace the matched synonym term with expanded terms in the original query
    RETURN replace(normalized_input, lower(synonym_row.term), synonym_row.expanded_terms);
  END LOOP;

  -- No synonym found, return original
  RETURN search_text;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expand_search_query(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text) TO anon;
GRANT EXECUTE ON FUNCTION expand_search_query(text, text) TO authenticated;

-- ============================================================================
-- 14. REPLACE search_establishments_scored WITH SYNONYM-AWARE VERSION
-- ============================================================================

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
  -- For expanded text with many words, use plainto_tsquery with OR logic
  -- so that matching ANY expanded term counts
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
  ORDER BY s.total_score DESC, s.relevance_score DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;

-- Grant execute permissions to Supabase roles
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.search_establishments_scored(text, text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.search_establishments_scored(text, text, text, int, int) IS
  'Full-text search for establishments with French stemming, synonym expansion, trigram fuzzy matching, direct array matching, and activity-based scoring';

-- ============================================================================
-- 15. RE-POPULATE SEARCH VECTORS FOR ALL EXISTING ESTABLISHMENTS
-- Uses the v2 function that includes ambiance_tags + specialties
-- ============================================================================

UPDATE public.establishments
SET search_vector = generate_establishment_search_vector_v2(
  name,
  city,
  neighborhood,
  subcategory,
  tags,
  amenities,
  cuisine_types,
  description_short,
  ambiance_tags,
  specialties
);

-- ============================================================================
-- 16. ADD GIN INDEXES FOR NEW ARRAY COLUMNS (if not exist)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_establishments_ambiance_tags_gin
  ON public.establishments USING GIN (ambiance_tags)
  WHERE ambiance_tags IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establishments_specialties_gin
  ON public.establishments USING GIN (specialties)
  WHERE specialties IS NOT NULL;

-- ============================================================================
-- 17. RLS FOR SEARCH SYNONYMS (public read, admin write)
-- ============================================================================

ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read search synonyms" ON public.search_synonyms;
CREATE POLICY "Anyone can read search synonyms"
  ON public.search_synonyms FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage search synonyms" ON public.search_synonyms;
CREATE POLICY "Service role can manage search synonyms"
  ON public.search_synonyms FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.search_synonyms TO anon;
GRANT SELECT ON public.search_synonyms TO authenticated;
GRANT ALL ON public.search_synonyms TO service_role;

COMMENT ON TABLE public.search_synonyms IS 'Maps user search terms to expanded search terms for synonym-based matching';
COMMENT ON FUNCTION generate_establishment_search_vector_v2(text, text, text, text, text[], text[], text[], text, text[], text[]) IS 'V2 search vector generator including ambiance_tags and specialties';
COMMENT ON FUNCTION expand_search_query(text, text) IS 'Expands search query using synonym table for better matching';

-- ============================================================================
-- 18. UNIQUE INDEX ON SYNONYMS (prevents duplicate entries)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_synonyms_term_universe
ON public.search_synonyms (lower(term), COALESCE(universe, '__null__'));

-- ============================================================================
-- 19. PATCH: Production gap analysis synonyms (37 values from DB not covered)
-- ============================================================================

-- Ambiance tags missing from production data
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('luxueux', 'luxueux luxe palace premium prestige haut de gamme somptueux', 'hebergement'),
('ambiance club', 'ambiance club festif DJ soirée danse night club boîte', 'restaurant'),
('ambiance marocaine', 'ambiance marocaine traditionnel marocain riad médina authentique oriental', 'restaurant'),
('candlelight', 'candlelight bougie romantique intimiste tamisé dîner aux chandelles', 'restaurant'),
('chic', 'chic élégant raffiné haut de gamme stylé classe distingué', 'restaurant'),
('convivial', 'convivial chaleureux accueillant sympathique familial décontracté', 'restaurant'),
('culturel', 'culturel culture art patrimoine historique exposition musée', 'restaurant'),
('dj set', 'dj set DJ musique soirée mix festif ambiance electro', 'restaurant'),
('historique', 'historique ancien patrimoine monument vieux classé héritage', 'restaurant'),
('live band', 'live band musique live concert groupe orchestre jazz', 'restaurant'),
('speakeasy', 'speakeasy bar caché secret cocktail prohibition intimiste clandestin', 'restaurant'),
('vue jardin', 'vue jardin jardin verdure nature extérieur terrasse calme', 'restaurant')
ON CONFLICT DO NOTHING;

-- Specialties missing from production data
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('afro-fusion', 'afro-fusion africain fusion cuisine monde sénégalais éthiopien', 'restaurant'),
('épicerie', 'épicerie épicerie fine traiteur produits alimentaire courses', 'restaurant'),
('foie gras', 'foie gras gastronomique français terroir canard sud-ouest luxe', 'restaurant'),
('international', 'international cuisine du monde fusion varié multi cuisine mondial cosmopolite', 'restaurant'),
('internationale', 'internationale international cuisine du monde fusion varié cosmopolite', 'restaurant'),
('yéménit', 'yéménit yéménite arabe oriental moyen-orient mandi', 'restaurant')
ON CONFLICT DO NOTHING;

-- Subcategories missing from production (dirty data coverage)
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('hôtel / lodge', 'hôtel lodge hébergement safari nature écolodge', 'hebergement'),
('hotel_5_etoiles', 'hôtel 5 étoiles palace luxe premium prestige', 'hebergement'),
('spa / loisirs', 'spa loisirs bien-être détente relaxation hammam massage', 'loisir'),
('international', 'international varié multi mondial cosmopolite', 'loisir'),
('loisir', 'loisir activité jeu divertissement sortie', 'loisir'),
('cafe_classique', 'café classique salon de thé coffee shop expresso cappuccino', 'restaurant'),
('français / français', 'français cuisine française bistrot brasserie gastronomique terroir', 'restaurant'),
('general', 'restaurant général cuisine variée', 'restaurant'),
('general / general', 'restaurant général cuisine variée', 'restaurant'),
('marocain / marocain', 'marocain cuisine marocaine tajine couscous pastilla traditionnel', 'restaurant'),
('patisserie_francaise', 'pâtisserie française gâteau dessert viennoiserie croissant', 'restaurant'),
('restaurant / marocain', 'restaurant marocain cuisine marocaine tajine couscous traditionnel', 'restaurant'),
('rooftop_restaurant', 'rooftop restaurant terrasse toit vue panoramique hauteur', 'restaurant'),
('shisha_lounge', 'chicha shisha narguilé lounge hookah fumoir détente', 'restaurant'),
('route de targa', 'restaurant marrakech', 'restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 20. TAXONOMY COVERAGE: All cuisine types from taxonomy.ts (21 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('cuisine afghane', 'afghan cuisine afghane kaboul kebab mantu bolani', 'restaurant'),
('afghan', 'afghan cuisine afghane kaboul kebab mantu bolani oriental', 'restaurant'),
('afternoon tea', 'afternoon tea thé goûter pâtisserie salon de thé british scones', 'restaurant'),
('cuisine alsacienne', 'alsacien cuisine alsacienne choucroute flammekueche tarte flambée bretzel', 'restaurant'),
('alsacien', 'alsacien cuisine alsacienne choucroute flammekueche tarte flambée bretzel', 'restaurant'),
('cuisine auvergnate', 'auvergnat cuisine auvergnate truffade aligot fromage cantal', 'restaurant'),
('auvergnat', 'auvergnat cuisine auvergnate truffade aligot fromage cantal', 'restaurant'),
('cuisine basque', 'basque cuisine basque pintxos piperade piment espelette axoa pays basque', 'restaurant'),
('basque', 'basque cuisine basque pintxos piperade piment espelette axoa pays basque', 'restaurant'),
('bouchon lyonnais', 'bouchon lyonnais lyon cuisine lyonnaise quenelle andouillette salade lyonnaise', 'restaurant'),
('cuisine canadienne', 'canadien cuisine canadienne poutine québec érable sirop', 'restaurant'),
('canadien', 'canadien cuisine canadienne poutine québec érable sirop', 'restaurant'),
('cuisine corse', 'corse cuisine corse charcuterie figatellu brocciu lonzu coppa île', 'restaurant'),
('corse', 'corse cuisine corse charcuterie figatellu brocciu lonzu coppa île', 'restaurant'),
('cuisine créole', 'créole cuisine créole antillais colombo accras boudin antilles réunion', 'restaurant'),
('créole', 'créole cuisine créole antillais colombo accras boudin antilles réunion', 'restaurant'),
('cuisine des îles', 'cuisine des îles tropical exotique antillais créole réunionnais malgache', 'restaurant'),
('cuisine suisse', 'cuisine suisse fondue raclette rösti suisse chocolat', 'restaurant'),
('cuisine traditionnelle', 'cuisine traditionnelle terroir classique maison fait maison plat du jour', 'restaurant'),
('cuisine égyptienne', 'égyptien cuisine égyptienne koshary foul medames falafel oriental', 'restaurant'),
('égyptien', 'égyptien cuisine égyptienne koshary foul medames falafel oriental', 'restaurant'),
('europe de l''est', 'europe de l''est polonais tchèque hongrois roumain bulgare pierogi goulash bortsch', 'restaurant'),
('cuisine franco-belge', 'franco-belge cuisine franco-belge belge frites moules gaufre carbonnade', 'restaurant'),
('franco-belge', 'franco-belge cuisine franco-belge belge frites moules gaufre carbonnade', 'restaurant'),
('cuisine israélienne', 'israélien cuisine israélienne houmous falafel shakshuka pita', 'restaurant'),
('israélien', 'israélien cuisine israélienne houmous falafel shakshuka pita', 'restaurant'),
('cuisine pakistanaise', 'pakistanais cuisine pakistanaise biryani curry naan tikka chapati', 'restaurant'),
('pakistanais', 'pakistanais cuisine pakistanaise biryani curry naan tikka chapati', 'restaurant'),
('cuisine provençale', 'provençal cuisine provençale ratatouille bouillabaisse tapenade pistou olive', 'restaurant'),
('provençal', 'provençal cuisine provençale ratatouille bouillabaisse tapenade pistou olive', 'restaurant'),
('cuisine russe', 'russe cuisine russe bortsch pelmeni blini caviar vodka', 'restaurant'),
('russe', 'russe cuisine russe bortsch pelmeni blini caviar vodka', 'restaurant'),
('cuisine savoyarde', 'savoyard cuisine savoyarde fondue raclette tartiflette reblochon montagne', 'restaurant'),
('savoyard', 'savoyard cuisine savoyarde fondue raclette tartiflette reblochon montagne', 'restaurant'),
('cuisine scandinave', 'scandinave cuisine scandinave nordique saumon gravlax suédois danois norvégien', 'restaurant'),
('scandinave', 'scandinave cuisine scandinave nordique saumon gravlax suédois danois norvégien', 'restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 21. TAXONOMY COVERAGE: Sport specialties (31 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('badminton', 'badminton raquette volant court indoor sport', 'sport'),
('basketball', 'basketball basket ballon panier terrain sport collectif', 'sport'),
('coiffure femme', 'coiffure femme salon cheveux brushing coloration mèches coupe', 'sport'),
('coiffure homme', 'coiffure homme salon barbier coupe dégradé', 'sport'),
('day spa', 'day spa spa journée soins détente relaxation bien-être', 'sport'),
('enveloppement', 'enveloppement soin corps argile algue boue gommage détox', 'sport'),
('hammam moderne', 'hammam moderne spa vapeur bain bien-être contemporain', 'sport'),
('hammam traditionnel', 'hammam traditionnel bain vapeur gommage savon noir beldi kessa', 'sport'),
('massage aux pierres chaudes', 'massage pierres chaudes hot stones relaxant détente chaleur', 'sport'),
('massage sportif', 'massage sportif récupération muscles sport performance', 'sport'),
('massage thaïlandais', 'massage thaïlandais thai stretching traditionnel asiatique', 'sport'),
('soins du corps', 'soins du corps gommage enveloppement modelage hydratation', 'sport'),
('soins du visage', 'soins du visage facial nettoyage peau hydratation anti-âge', 'sport'),
('spa de luxe', 'spa de luxe spa premium prestige haut de gamme 5 étoiles palace', 'sport'),
('yoga kundalini', 'yoga kundalini méditation spirituel énergie chakra respiration', 'sport'),
('yoga vinyasa', 'yoga vinyasa flow dynamique enchaînement respiration', 'sport'),
('zumba', 'zumba danse fitness cardio latino musique cours', 'sport'),
('méditation', 'méditation zen mindfulness pleine conscience relaxation calme', 'sport'),
('cardio', 'cardio vélo elliptique tapis course endurance', 'sport'),
('hiit', 'hiit high intensity interval training circuit intense', 'sport'),
('coloration', 'coloration couleur cheveux mèches balayage teinture', 'sport'),
('manucure', 'manucure ongles vernis nail art soin mains', 'sport'),
('pédicure', 'pédicure ongles pieds soin podologie', 'sport'),
('épilation', 'épilation cire laser lumière pulsée poils', 'sport'),
('gommage', 'gommage exfoliant peau soin corps visage peeling', 'sport'),
('réflexologie', 'réflexologie pieds mains plantaire massage zone', 'sport'),
('massage relaxant', 'massage relaxant détente zen calme bien-être huiles essentielles', 'sport'),
('natation', 'natation nage piscine bassin crawl brasse', 'sport'),
('aquagym', 'aquagym aqua fitness piscine eau gym gymnastique', 'sport'),
('mma', 'mma mixed martial arts combat libre grappling', 'sport'),
('football', 'football foot soccer ballon terrain sport collectif', 'sport')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 22. TAXONOMY COVERAGE: Loisirs specialties (17 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('escape game horreur', 'escape game horreur peur frisson zombie épouvante', 'loisir'),
('escape game aventure', 'escape game aventure exploration trésor mystère', 'loisir'),
('escape game enquête', 'escape game enquête détective crime indice mystère', 'loisir'),
('escape game famille', 'escape game famille enfants kids fun ludique', 'loisir'),
('karting indoor', 'karting indoor intérieur couvert circuit électrique', 'loisir'),
('karting outdoor', 'karting outdoor extérieur piste circuit vitesse', 'loisir'),
('buggy', 'buggy quad randonnée tout terrain aventure sable désert', 'loisir'),
('canoë', 'canoë kayak pirogue rivière eau pagaie descente', 'loisir'),
('snorkeling', 'snorkeling palmes masque tuba mer poissons coraux', 'loisir'),
('tyrolienne', 'tyrolienne zip line câble hauteur sensation accrobranche', 'loisir'),
('golf 18 trous', 'golf 18 trous parcours complet championnat green', 'loisir'),
('golf 9 trous', 'golf 9 trous parcours court practice putting', 'loisir'),
('mini-golf', 'mini-golf minigolf putt putt famille enfants fun', 'loisir'),
('airsoft', 'airsoft paintball combat tactique réplique équipe', 'loisir'),
('aquarium', 'aquarium poissons mer océan faune marine visite', 'loisir'),
('segway', 'segway gyropode balade visite électrique urbain', 'loisir'),
('saut à l''élastique', 'saut élastique bungee jumping adrénaline sensations fortes pont', 'loisir')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 23. TAXONOMY COVERAGE: Hébergement types (12 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('hôtel 5 étoiles', 'hôtel 5 étoiles palace luxe premium prestige suite', 'hebergement'),
('hôtel 4 étoiles', 'hôtel 4 étoiles confort supérieur standing', 'hebergement'),
('hôtel 3 étoiles', 'hôtel 3 étoiles standard confort milieu gamme', 'hebergement'),
('hôtel 2 étoiles', 'hôtel 2 étoiles économique budget simple', 'hebergement'),
('hôtel boutique', 'hôtel boutique design charme unique petit personnalisé', 'hebergement'),
('riad traditionnel', 'riad traditionnel médina patio fontaine zellige maroc artisanal', 'hebergement'),
('riad de luxe', 'riad de luxe riad premium prestige raffiné haut de gamme', 'hebergement'),
('maison d''hôtes', 'maison hôtes guesthouse chambre accueil familial convivial', 'hebergement'),
('chambre d''hôtes', 'chambre hôtes bed breakfast petit déjeuner accueil', 'hebergement'),
('studio', 'studio appartement petit logement meublé', 'hebergement'),
('loft', 'loft espace ouvert moderne design industriel appartement', 'hebergement'),
('gîte', 'gîte location vacances campagne nature rural maison', 'hebergement')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 24. TAXONOMY COVERAGE: Culture types (25 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('musée d''art', 'musée art peinture sculpture contemporain moderne beaux-arts', 'culture'),
('musée d''histoire', 'musée histoire civilisation patrimoine archéologie antiquité', 'culture'),
('musée des sciences', 'musée sciences technologie innovation découverte interactif', 'culture'),
('musée ethnographique', 'musée ethnographique traditions peuple culture artisanat folklore', 'culture'),
('galerie d''art', 'galerie art exposition peinture sculpture artiste contemporain', 'culture'),
('exposition temporaire', 'exposition temporaire expo art vernissage événement galerie', 'culture'),
('exposition permanente', 'exposition permanente collection musée visite', 'culture'),
('monument historique', 'monument historique patrimoine architecture ancien palais château', 'culture'),
('palais', 'palais royal historique architecture majestueux monument visite', 'culture'),
('château', 'château forteresse rempart médiéval historique visite', 'culture'),
('site archéologique', 'site archéologique ruines fouilles histoire antique romain', 'culture'),
('ruines', 'ruines vestiges antique archéologie site historique', 'culture'),
('mosquée', 'mosquée islam architecture islamique visite prière monument', 'culture'),
('église', 'église cathédrale chapelle chrétien architecture religieux', 'culture'),
('synagogue', 'synagogue judaïque mellah patrimoine religieux visite', 'culture'),
('salle de concert', 'salle concert musique live spectacle scène acoustique', 'culture'),
('ballet', 'ballet danse classique spectacle tutu pointes chorégraphie', 'culture'),
('danse traditionnelle', 'danse traditionnelle folklore ahwash guedra ahouach marocain spectacle', 'culture'),
('visite audioguidée', 'visite audioguidée audio guide casque parcours autonome', 'culture'),
('visite nocturne', 'visite nocturne nuit soirée illumination spectacle lumière', 'culture'),
('atelier créatif', 'atelier créatif art bricolage création DIY loisir créatif', 'culture'),
('atelier artisanat', 'atelier artisanat poterie céramique cuir zellige mosaïque', 'culture'),
('cours de poterie', 'cours poterie céramique argile tour atelier artisanat', 'culture'),
('cours de calligraphie', 'cours calligraphie écriture arabe art atelier', 'culture'),
('œnologie', 'œnologie vin dégustation sommelier cave cépage terroir', 'culture')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 25. TAXONOMY COVERAGE: Shopping types (31 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('mode femme', 'mode femme vêtements prêt-à-porter robe jupe pantalon fashion', 'shopping'),
('mode homme', 'mode homme vêtements costume chemise pantalon fashion', 'shopping'),
('mode enfant', 'mode enfant vêtements bébé junior kids', 'shopping'),
('mode bébé', 'mode bébé vêtements nourrisson layette naissance', 'shopping'),
('prêt-à-porter', 'prêt-à-porter mode vêtements fashion tendance', 'shopping'),
('haute couture', 'haute couture créateur designer luxe fashion mode couture', 'shopping'),
('créateur', 'créateur designer marque indépendant fait main artisan mode', 'shopping'),
('seconde main', 'seconde main occasion fripe vintage recyclé dépôt vente', 'shopping'),
('chaussures femme', 'chaussures femme escarpins sandales bottes talons baskets', 'shopping'),
('chaussures homme', 'chaussures homme mocassins derby baskets sneakers', 'shopping'),
('chaussures enfant', 'chaussures enfant baskets sandales bottes kids', 'shopping'),
('sacs', 'sacs maroquinerie main bandoulière cabas pochette', 'shopping'),
('accessoires', 'accessoires écharpe ceinture chapeau gants lunettes', 'shopping'),
('bijoux fantaisie', 'bijoux fantaisie collier bracelet bague boucles mode', 'shopping'),
('bijoux précieux', 'bijoux précieux or argent diamant joaillerie pierres', 'shopping'),
('montres', 'montres horlogerie bracelet luxe chronographe', 'shopping'),
('lunettes', 'lunettes optique soleil vue monture', 'shopping'),
('cosmétiques', 'cosmétiques maquillage beauté crème soin teint', 'shopping'),
('soins', 'soins beauté crème sérum masque hydratant anti-âge', 'shopping'),
('maquillage', 'maquillage beauté cosmétiques rouge lèvres fond de teint mascara', 'shopping'),
('luminaires', 'luminaires lampe suspension éclairage lustre design', 'shopping'),
('art de la table', 'art de la table vaisselle assiettes verres couverts', 'shopping'),
('linge de maison', 'linge de maison draps serviettes couette coussin textile', 'shopping'),
('artisanat local', 'artisanat local fait main traditionnel produit terroir régional', 'shopping'),
('artisanat marocain', 'artisanat marocain poterie zellige tapis cuir babouche', 'shopping'),
('céramique', 'céramique poterie artisanat vaisselle décoration argile', 'shopping'),
('cuir', 'cuir maroquinerie tannerie babouche sac ceinture', 'shopping'),
('traiteur', 'traiteur événement réception buffet catering cuisine', 'shopping'),
('produits du terroir', 'produits terroir local régional artisan producteur', 'shopping'),
('multimarques', 'multimarques boutique sélection marques mode', 'shopping'),
('marché', 'marché souk marché couvert frais producteur local', 'shopping')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 26. TAXONOMY COVERAGE: Vehicle types (21 missing)
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('citadine', 'citadine petite voiture ville compacte économique', 'rentacar'),
('compacte', 'compacte voiture moyenne berline pratique', 'rentacar'),
('berline', 'berline voiture confort familiale spacieuse', 'rentacar'),
('4x4', '4x4 SUV tout terrain offroad montagne piste', 'rentacar'),
('crossover', 'crossover SUV compact urbain polyvalent', 'rentacar'),
('monospace', 'monospace familial 7 places spacieux groupe', 'rentacar'),
('break', 'break voiture familiale coffre spacieux', 'rentacar'),
('coupé', 'coupé sportif deux portes élégant performance', 'rentacar'),
('cabriolet', 'cabriolet décapotable convertible toit ouvrant soleil', 'rentacar'),
('pick-up', 'pick-up utilitaire tout terrain chargement aventure', 'rentacar'),
('utilitaire', 'utilitaire camionnette fourgon déménagement transport', 'rentacar'),
('minibus', 'minibus transport groupe 9 places excursion navette', 'rentacar'),
('camping-car', 'camping-car van aménagé road trip voyage mobile', 'rentacar'),
('scooter', 'scooter deux roues moto urbain pratique', 'rentacar'),
('vélo électrique', 'vélo électrique e-bike VAE assistance pédalage balade', 'rentacar'),
('trottinette électrique', 'trottinette électrique mobilité urbain balade visite', 'rentacar'),
('voiture de luxe', 'voiture luxe premium prestige haut de gamme berline sport', 'rentacar'),
('voiture de sport', 'voiture sport performance rapide coupé cabriolet puissant', 'rentacar'),
('voiture électrique', 'voiture électrique eco zéro émission tesla green', 'rentacar'),
('voiture hybride', 'voiture hybride eco économique essence électrique', 'rentacar'),
('voiture avec chauffeur', 'voiture chauffeur privé VTC transfert navette service', 'rentacar')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 27. TAXONOMY COVERAGE: Ambiance types missing
-- ============================================================================
INSERT INTO public.search_synonyms (term, expanded_terms, universe) VALUES
('vue panoramique', 'vue panoramique rooftop hauteur panorama 360 terrasse toit', NULL),
('en plein air', 'en plein air extérieur outdoor terrasse jardin nature', NULL)
ON CONFLICT DO NOTHING;

COMMIT;


-- ============================================================
-- FILE: 20260215_seo_landing_pages.sql
-- ============================================================

-- ============================================================================
-- MIGRATION: SEO Landing Pages for category+city combinations
-- Date: 2026-02-15
-- Description:
--   1. Creates landing_pages table with multilingual SEO fields
--   2. Seeds ~43 landing pages for the restaurant universe
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE landing_pages
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,

  -- Filter mapping
  universe TEXT NOT NULL,             -- DB enum value: restaurant, loisir, hebergement, wellness, culture
  city TEXT,                          -- NULL = national page
  category TEXT,                      -- subcategory filter
  cuisine_type TEXT,                  -- cuisine filter (maps to cuisine_types array)

  -- Multilingual SEO: titles (50-60 chars)
  title_fr TEXT NOT NULL,
  title_en TEXT,
  title_es TEXT,
  title_it TEXT,
  title_ar TEXT,

  -- Multilingual SEO: meta descriptions (150-160 chars)
  description_fr TEXT NOT NULL,
  description_en TEXT,
  description_es TEXT,
  description_it TEXT,
  description_ar TEXT,

  -- Multilingual SEO: H1 headings
  h1_fr TEXT NOT NULL,
  h1_en TEXT,
  h1_es TEXT,
  h1_it TEXT,
  h1_ar TEXT,

  -- Multilingual SEO: intro paragraphs (200-300 words)
  intro_text_fr TEXT,
  intro_text_en TEXT,
  intro_text_es TEXT,
  intro_text_it TEXT,
  intro_text_ar TEXT,

  -- SEO control
  keywords TEXT,
  og_image_url TEXT,
  robots TEXT DEFAULT 'index,follow',
  priority REAL DEFAULT 0.8,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON public.landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_universe_city ON public.landing_pages(universe, city);
CREATE INDEX IF NOT EXISTS idx_landing_pages_active ON public.landing_pages(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

-- Public read policy
DROP POLICY IF EXISTS "landing_pages_public_read" ON public.landing_pages;
CREATE POLICY "landing_pages_public_read" ON public.landing_pages
  FOR SELECT USING (is_active = true);


-- ============================================================================
-- 2. SEED DATA — Restaurant universe
-- ============================================================================

-- -------------------------------------------------------
-- 2a. City pages (10 main cities)
-- -------------------------------------------------------

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

-- Casablanca
('restaurants-casablanca', 'restaurant', 'Casablanca', NULL, NULL,
 'Restaurants Casablanca — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Casablanca. Comparez les avis, consultez les menus et réservez en ligne sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Casablanca',
 'Casablanca, capitale économique du Maroc, est aussi sa capitale gastronomique. Des tables étoilées du quartier Gauthier aux restaurants traditionnels de l''ancienne médina, la ville offre une diversité culinaire exceptionnelle. Que vous cherchiez un restaurant marocain authentique avec vue sur la mosquée Hassan II, un restaurant de fruits de mer sur la corniche, ou une adresse branchée à Maarif, Casablanca saura satisfaire toutes vos envies. La scène culinaire casablancaise mêle traditions marocaines et influences internationales, avec des chefs qui revisitent les classiques et des concepts innovants qui ouvrent régulièrement. Réservez votre table en quelques clics sur Sortir Au Maroc et découvrez les adresses incontournables de la ville blanche. Des restaurants gastronomiques aux bistrots de quartier, notre sélection couvre tous les budgets et toutes les occasions, que ce soit pour un déjeuner d''affaires, un dîner en amoureux ou un repas en famille.',
 'restaurant casablanca, manger casablanca, où manger casablanca, meilleur restaurant casablanca',
 0.9),

-- Marrakech
('restaurants-marrakech', 'restaurant', 'Marrakech', NULL, NULL,
 'Restaurants Marrakech — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Marrakech. Des riads gastronomiques aux rooftops, réservez votre table sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Marrakech',
 'Marrakech est une destination culinaire de renommée mondiale. La ville ocre offre une expérience gastronomique unique, des souks animés de la Jemaa el-Fna aux restaurants raffinés de la Palmeraie. Les riads-restaurants du quartier de la Kasbah proposent une cuisine marocaine d''exception dans des cadres somptueux, tandis que les rooftops de Guéliz offrent des vues imprenables sur l''Atlas. La nouvelle ville regorge de concepts modernes : bistronomie, cuisine fusion, restaurants healthy et coffee shops tendance. Les chefs marrakchis, qu''ils soient locaux ou internationaux, puisent dans la richesse des épices et des produits du terroir pour créer des plats mémorables. Du tajine traditionnel au menu dégustation contemporain, Marrakech conjugue tradition et modernité avec brio. Réservez dès maintenant sur Sortir Au Maroc et laissez-vous porter par les saveurs de la ville rouge.',
 'restaurant marrakech, manger marrakech, où manger marrakech, meilleur restaurant marrakech',
 0.9),

-- Rabat
('restaurants-rabat', 'restaurant', 'Rabat', NULL, NULL,
 'Restaurants Rabat — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Rabat. Des tables de la capitale aux bistrots du quartier Hassan, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Rabat',
 'Rabat, capitale du Royaume, est une ville où la gastronomie se vit avec élégance et discrétion. Le quartier de l''Agdal regorge de restaurants branchés et de brasseries modernes, tandis que la médina et la Kasbah des Oudaïas abritent des adresses authentiques au charme intemporel. Les restaurants du front de mer à Salé et sur le Bouregreg offrent des panoramas exceptionnels pour accompagner votre repas. La scène culinaire rbatie se distingue par sa sophistication : les chefs de la capitale excellent dans l''art de marier cuisine marocaine traditionnelle et gastronomie internationale. Que vous cherchiez un restaurant pour un déjeuner diplomatique ou une terrasse décontractée pour un brunch dominical, Rabat a l''adresse qu''il vous faut. Explorez notre sélection complète et réservez votre table en quelques clics sur Sortir Au Maroc.',
 'restaurant rabat, manger rabat, où manger rabat, meilleur restaurant rabat',
 0.9),

-- Tanger
('restaurants-tanger', 'restaurant', 'Tanger', NULL, NULL,
 'Restaurants Tanger — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Tanger. Cuisine méditerranéenne, poissons frais et rooftops, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Tanger',
 'Tanger, porte de l''Afrique sur la Méditerranée, est une ville où les saveurs se croisent et s''enrichissent. Sa position géographique unique en fait un carrefour culinaire entre Europe et Afrique, entre Méditerranée et Atlantique. Les restaurants de poissons du port offrent une fraîcheur incomparable, tandis que les adresses du quartier Marshan et de la Kasbah séduisent par leur charme bohème. La ville nouvelle, en pleine effervescence, accueille de nouveaux concepts gastronomiques chaque mois. Des tapas espagnoles aux tajines traditionnels, en passant par la cuisine fusion et les rooftops avec vue sur le détroit de Gibraltar, Tanger est une destination food à part entière. Réservez votre prochaine expérience culinaire tangéroise sur Sortir Au Maroc.',
 'restaurant tanger, manger tanger, où manger tanger, meilleur restaurant tanger',
 0.8),

-- Agadir
('restaurants-agadir', 'restaurant', 'Agadir', NULL, NULL,
 'Restaurants Agadir — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Agadir. Poissons grillés, cuisine balnéaire et tables de plage, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Agadir',
 'Agadir, station balnéaire du sud marocain, est réputée pour sa cuisine de la mer exceptionnelle. Le port de pêche offre les produits les plus frais du pays, que les restaurants de la corniche transforment en véritables festins. Des grillades de sardines aux plateaux de fruits de mer, en passant par le poisson du jour cuisiné à la chermoula, Agadir est le paradis des amateurs de cuisine marine. La ville propose également une belle diversité de restaurants internationaux le long de son front de mer, des pizzerias aux restaurants asiatiques. Le souk El Had et ses environs recèlent des trésors de cuisine marocaine traditionnelle à prix doux. Découvrez toutes les bonnes adresses d''Agadir sur Sortir Au Maroc et réservez votre table face à l''océan.',
 'restaurant agadir, manger agadir, où manger agadir, meilleur restaurant agadir',
 0.8),

-- Fès
('restaurants-fes', 'restaurant', 'Fès', NULL, NULL,
 'Restaurants Fès — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Fès. Cuisine fassia raffinée et riads gastronomiques, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Fès',
 'Fès, berceau de la gastronomie marocaine, est reconnue pour l''excellence de sa cuisine traditionnelle. La cuisine fassia est considérée comme la plus raffinée du pays, héritière de siècles de savoir-faire culinaire. Les riads-restaurants de la médina, classée au patrimoine mondial de l''UNESCO, offrent des expériences gastronomiques inoubliables dans des décors somptueux. La pastilla, le tajine aux pruneaux et amandes, le mechoui et les pâtisseries au miel sont des spécialités incontournables. La ville nouvelle de Fès propose aussi des adresses modernes qui revisitent les classiques avec créativité. Que vous soyez amateur de cuisine traditionnelle ou de concepts contemporains, Fès saura enchanter vos papilles. Réservez votre table sur Sortir Au Maroc.',
 'restaurant fes, manger fes, où manger fes, meilleur restaurant fes, cuisine fassia',
 0.8),

-- Meknès
('restaurants-meknes', 'restaurant', 'Meknès', NULL, NULL,
 'Restaurants Meknès — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Meknès. Cuisine traditionnelle et produits du terroir, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Meknès',
 'Meknès, cité impériale entourée de vignobles et d''oliveraies, est une destination gourmande méconnue qui mérite le détour. La ville est célèbre pour la qualité de ses produits du terroir : huile d''olive, vins des coteaux de l''Atlas et fromages artisanaux. Les restaurants de la médina proposent une cuisine marocaine généreuse et authentique, tandis que les adresses de la ville nouvelle innovent avec des concepts modernes. La place El Hedim et ses environs regorgent de petits restaurants où déguster des plats traditionnels à prix doux. Meknès est aussi la capitale du vin marocain, avec plusieurs domaines viticoles qui proposent des dégustations et des repas gastronomiques. Découvrez les meilleures tables meknassies sur Sortir Au Maroc.',
 'restaurant meknes, manger meknes, où manger meknes, meilleur restaurant meknes',
 0.7),

-- Oujda
('restaurants-oujda', 'restaurant', 'Oujda', NULL, NULL,
 'Restaurants Oujda — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Oujda. Cuisine orientale et spécialités de l''est marocain, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Oujda',
 'Oujda, capitale de l''Oriental marocain, offre une gastronomie unique influencée par sa proximité avec l''Algérie et la Méditerranée. La cuisine oujdie se distingue par ses saveurs intenses et ses plats généreux : la berkoukes, la rfissa, le couscous aux sept légumes et les grillades sont des incontournables. Les restaurants du centre-ville et du quartier Al Massira proposent une cuisine traditionnelle authentique, tandis que les nouvelles adresses de la ville moderne apportent une touche contemporaine. Les pâtisseries et les cafés d''Oujda sont réputés dans tout le royaume pour leur excellence. Explorez la richesse culinaire de l''Oriental sur Sortir Au Maroc.',
 'restaurant oujda, manger oujda, où manger oujda, meilleur restaurant oujda',
 0.7),

-- Kénitra
('restaurants-kenitra', 'restaurant', 'Kénitra', NULL, NULL,
 'Restaurants Kénitra — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants à Kénitra. Cuisine marocaine et tables de la Mamora, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Kénitra',
 'Kénitra, ville dynamique du Gharb, propose une scène culinaire en plein essor. Située entre Rabat et Meknès, la ville bénéficie d''une position stratégique et d''un accès privilégié aux produits agricoles de la plaine du Gharb, l''un des greniers du Maroc. Les restaurants de Kénitra sont réputés pour la fraîcheur de leurs ingrédients et la générosité de leurs portions. Du poisson frais du port de Mehdia aux spécialités de viande grillée, en passant par les restaurants de la forêt de la Mamora, Kénitra offre des expériences variées pour tous les budgets. Découvrez les bonnes adresses de Kénitra sur Sortir Au Maroc.',
 'restaurant kenitra, manger kenitra, où manger kenitra, meilleur restaurant kenitra',
 0.7),

-- Tétouan
('restaurants-tetouan', 'restaurant', 'Tétouan', NULL, NULL,
 'Restaurants Tétouan — Les meilleures tables | SAM',
 'Découvrez les meilleurs restaurants à Tétouan. Cuisine andalouse et méditerranéenne, réservez sur Sortir Au Maroc.',
 'Les meilleurs restaurants à Tétouan',
 'Tétouan, la colombe blanche du nord du Maroc, est une ville où la gastronomie porte l''empreinte de l''Andalousie. Sa médina, classée au patrimoine mondial de l''UNESCO, abrite des restaurants et des pâtisseries qui perpétuent des recettes séculaires. La cuisine tétouanaise se distingue par sa finesse et ses influences hispano-mauresques : pastilla au pigeon, tajine de poisson à la charmoula, et les fameuses pâtisseries aux amandes. Les restaurants de la ville nouvelle et du front de mer de Martil complètent l''offre avec des concepts modernes et des terrasses avec vue sur la Méditerranée. Réservez votre table à Tétouan sur Sortir Au Maroc.',
 'restaurant tetouan, manger tetouan, où manger tetouan, meilleur restaurant tetouan',
 0.7)
ON CONFLICT (slug) DO NOTHING;


-- -------------------------------------------------------
-- 2b. Cuisine type × city pages (10 types × 3 cities)
-- -------------------------------------------------------

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

-- === CASABLANCA ===
('restaurant-italien-casablanca', 'restaurant', 'Casablanca', NULL, 'Italien',
 'Restaurants italiens Casablanca | SAM',
 'Les meilleurs restaurants italiens à Casablanca. Pizzas, pastas et cuisine transalpine, réservez votre table sur Sortir Au Maroc.',
 'Restaurants italiens à Casablanca',
 'Casablanca compte parmi les meilleures adresses italiennes du Maroc. Du quartier Gauthier à Maarif en passant par Anfa, les restaurants italiens de la ville blanche proposent des pizzas cuites au feu de bois, des pâtes fraîches maison et des plats de la tradition transalpine. Que vous ayez envie d''une simple margherita ou d''un risotto aux fruits de mer, les chefs italiens et marocains formés en Italie vous garantissent une expérience authentique. Découvrez notre sélection des meilleures tables italiennes à Casablanca et réservez en ligne.',
 'restaurant italien casablanca, pizza casablanca, pâtes casablanca, cuisine italienne casablanca',
 0.7),

('sushi-casablanca', 'restaurant', 'Casablanca', NULL, 'Japonais',
 'Sushi & restaurants japonais Casablanca | SAM',
 'Les meilleurs restaurants de sushi à Casablanca. Sushi, ramen et cuisine japonaise, réservez sur Sortir Au Maroc.',
 'Sushi et restaurants japonais à Casablanca',
 'La scène sushi de Casablanca n''a jamais été aussi dynamique. Des comptoirs à sushi traditionnels aux concepts fusion japonais-marocain, la ville blanche regorge d''adresses pour les amateurs de cuisine nippone. Que vous préfériez les makis classiques, les sashimis ultra-frais ou les rolls créatifs, les restaurants japonais de Casablanca rivalisent de qualité. Le quartier d''Anfa et le boulevard de la Corniche concentrent les meilleures adresses, mais de nouveaux concepts ouvrent régulièrement dans tous les quartiers. Réservez votre table sushi à Casablanca sur Sortir Au Maroc.',
 'sushi casablanca, japonais casablanca, ramen casablanca, maki casablanca',
 0.7),

('restaurant-marocain-casablanca', 'restaurant', 'Casablanca', NULL, 'Marocain',
 'Restaurants marocains Casablanca | SAM',
 'Les meilleurs restaurants marocains à Casablanca. Tajines, couscous et cuisine traditionnelle, réservez sur Sortir Au Maroc.',
 'Restaurants marocains à Casablanca',
 'Casablanca est la ville idéale pour découvrir la richesse de la cuisine marocaine. Des restaurants traditionnels de la médina aux tables gastronomiques qui revisitent les classiques, la ville offre toutes les facettes de la gastronomie du royaume. Tajines parfumés, couscous du vendredi, pastilla croustillante et méchoui fondant sont autant de spécialités à déguster dans des cadres allant du simple et authentique au luxueux et raffiné. Les chefs casablancais excellent dans l''art de sublimer les recettes ancestrales tout en innovant. Trouvez votre restaurant marocain à Casablanca sur Sortir Au Maroc.',
 'restaurant marocain casablanca, tajine casablanca, couscous casablanca, cuisine marocaine casablanca',
 0.7),

('brunch-casablanca', 'restaurant', 'Casablanca', NULL, NULL,
 'Brunch à Casablanca — Les meilleures adresses | SAM',
 'Les meilleurs brunchs à Casablanca. Brunchs gourmands, buffets et formules du weekend, réservez sur Sortir Au Maroc.',
 'Les meilleurs brunchs à Casablanca',
 'Le brunch est devenu un véritable art de vivre à Casablanca. Chaque weekend, les terrasses de Gauthier, les coffee shops de Maarif et les restaurants de la Corniche se remplissent de gourmands en quête du brunch parfait. Des formules buffet all-inclusive aux brunchs à la carte, les options sont nombreuses et variées. Pancakes, eggs benedict, avocado toast, msemen, baghrir et pâtisseries marocaines se côtoient dans des assiettes colorées. Certaines adresses proposent des brunchs thématiques ou des formules avec animation pour les enfants. Découvrez les meilleures adresses brunch de Casablanca et réservez votre dimanche matin sur Sortir Au Maroc.',
 'brunch casablanca, petit dejeuner casablanca, weekend casablanca, meilleur brunch casablanca',
 0.7),

('restaurant-francais-casablanca', 'restaurant', 'Casablanca', NULL, 'Français',
 'Restaurants français Casablanca | SAM',
 'Les meilleurs restaurants français à Casablanca. Bistrots et gastronomie française, réservez sur Sortir Au Maroc.',
 'Restaurants français à Casablanca',
 'L''héritage francophone de Casablanca se retrouve dans sa gastronomie. La ville compte de nombreux restaurants français de qualité, des bistrots traditionnels aux tables gastronomiques. Le quartier Gauthier et le centre-ville abritent des brasseries parisiennes, des restaurants de cuisine bourgeoise et des caves à vins avec menus accords mets-vins. Les chefs français installés à Casablanca apportent leur savoir-faire et leur créativité, souvent en intégrant des produits du terroir marocain à leurs recettes. Découvrez la fine cuisine française à Casablanca sur Sortir Au Maroc.',
 'restaurant francais casablanca, bistrot casablanca, gastronomie française casablanca',
 0.7),

('pizza-casablanca', 'restaurant', 'Casablanca', NULL, 'Italien',
 'Pizzerias Casablanca — Les meilleures pizzas | SAM',
 'Les meilleures pizzerias à Casablanca. Pizzas napolitaines et romaines, four à bois, réservez sur Sortir Au Maroc.',
 'Les meilleures pizzerias à Casablanca',
 'Casablanca est une ville de pizza lovers. Des pizzerias napolitaines authentiques aux concepts de pizza gourmet, la ville blanche offre un tour d''Italie sans quitter le Maroc. Les meilleurs pizzaïolos de la ville utilisent des fours à bois importés de Naples, de la mozzarella di bufala et des farines italiennes pour des pizzas dignes de la botte. Du quartier Gauthier à Ain Diab, en passant par Maarif et le centre-ville, chaque quartier a sa pizzeria préférée. Découvrez les meilleures pizzas de Casablanca et réservez votre soirée pizza sur Sortir Au Maroc.',
 'pizza casablanca, pizzeria casablanca, meilleure pizza casablanca, pizza napolitaine casablanca',
 0.6),

('burger-casablanca', 'restaurant', 'Casablanca', NULL, 'Américain',
 'Burgers Casablanca — Les meilleures adresses | SAM',
 'Les meilleurs burgers à Casablanca. Burgers gourmet, smash burgers et classiques, découvrez les adresses sur SAM.',
 'Les meilleurs burgers à Casablanca',
 'Le burger gourmet a conquis Casablanca. La ville regorge de restaurants et de food trucks spécialisés dans le burger, des classiques américains aux créations originales. Bœuf wagyu, poulet croustillant, options végétariennes : les propositions sont infinies. Les quartiers de Maarif et du Bourgogne concentrent les adresses les plus populaires, mais de nouveaux concepts ouvrent régulièrement aux quatre coins de la ville. Steaks hachés frais, buns briochés, sauces maison et frites croustillantes font le bonheur des burger addicts casablancais. Trouvez le meilleur burger de Casablanca sur Sortir Au Maroc.',
 'burger casablanca, meilleur burger casablanca, smash burger casablanca, burger gourmet casablanca',
 0.6),

('restaurant-asiatique-casablanca', 'restaurant', 'Casablanca', NULL, 'Asiatique',
 'Restaurants asiatiques Casablanca | SAM',
 'Les meilleurs restaurants asiatiques à Casablanca. Thaï, chinois, vietnamien et fusion, réservez sur Sortir Au Maroc.',
 'Restaurants asiatiques à Casablanca',
 'La cuisine asiatique a trouvé un véritable public à Casablanca. Des restaurants chinois historiques aux nouvelles adresses thaïlandaises et vietnamiennes, la ville blanche offre un voyage culinaire à travers l''Asie. Les restaurants de cuisine asiatique de Casablanca proposent des plats authentiques : pad thaï, dim sum, pho, bibimbap et curry sont au rendez-vous. Le quartier du Racine et le boulevard d''Anfa concentrent plusieurs adresses incontournables. Les concepts de street food asiatique et les restaurants fusion complètent une offre de plus en plus riche. Explorez la cuisine asiatique à Casablanca sur Sortir Au Maroc.',
 'restaurant asiatique casablanca, thaï casablanca, chinois casablanca, vietnamien casablanca',
 0.6),

('restaurant-indien-casablanca', 'restaurant', 'Casablanca', NULL, 'Indien',
 'Restaurants indiens Casablanca | SAM',
 'Les meilleurs restaurants indiens à Casablanca. Curry, tandoori et naan, réservez votre table sur Sortir Au Maroc.',
 'Restaurants indiens à Casablanca',
 'La cuisine indienne a ses fidèles adeptes à Casablanca. Les restaurants indiens de la ville proposent un voyage gustatif à travers le sous-continent : currys parfumés, tandoori fumé au charbon, naan fraîchement sorti du four et biryanis épicés. Du butter chicken au masala dosa, en passant par les thalis complets et les samossas croustillants, les saveurs de l''Inde sont bien représentées dans la ville blanche. Les restaurants indiens de Casablanca se distinguent par la qualité de leurs épices et l''authenticité de leurs recettes. Réservez votre table indienne à Casablanca sur Sortir Au Maroc.',
 'restaurant indien casablanca, curry casablanca, tandoori casablanca, cuisine indienne casablanca',
 0.6),

('fruits-de-mer-casablanca', 'restaurant', 'Casablanca', NULL, 'Fruits de mer',
 'Fruits de mer Casablanca — Les meilleures tables | SAM',
 'Les meilleurs restaurants de fruits de mer à Casablanca. Poissons frais et plateaux royaux, réservez sur Sortir Au Maroc.',
 'Restaurants de fruits de mer à Casablanca',
 'Casablanca, avec son port de pêche et sa corniche atlantique, est la ville idéale pour déguster des fruits de mer d''une fraîcheur incomparable. Les restaurants du port de pêche proposent des poissons grillés du jour et des plateaux de fruits de mer à des prix imbattables. Sur la Corniche, les restaurants haut de gamme subliment les produits de la mer avec des préparations raffinées. Huîtres, crevettes royales, homard, sole meunière et loup de mer grillé figurent parmi les incontournables. Découvrez les meilleures tables de fruits de mer à Casablanca sur Sortir Au Maroc.',
 'fruits de mer casablanca, restaurant poisson casablanca, plateau fruits de mer casablanca',
 0.7),

-- === MARRAKECH ===
('restaurant-italien-marrakech', 'restaurant', 'Marrakech', NULL, 'Italien',
 'Restaurants italiens Marrakech | SAM',
 'Les meilleurs restaurants italiens à Marrakech. Pizzas, pastas et dolce vita, réservez sur Sortir Au Maroc.',
 'Restaurants italiens à Marrakech',
 'Marrakech compte de nombreux restaurants italiens de qualité, notamment dans le quartier de Guéliz et à la Palmeraie. Les chefs italiens installés dans la ville ocre proposent des pizzas au feu de bois, des pâtes fraîches maison et des spécialités régionales de toute l''Italie. Les terrasses ombragées des restaurants italiens de Marrakech offrent un cadre idéal pour savourer un aperitivo ou un dîner romantique sous les étoiles. Réservez votre table italienne à Marrakech sur Sortir Au Maroc.',
 'restaurant italien marrakech, pizza marrakech, pâtes marrakech, cuisine italienne marrakech',
 0.7),

('sushi-marrakech', 'restaurant', 'Marrakech', NULL, 'Japonais',
 'Sushi & restaurants japonais Marrakech | SAM',
 'Les meilleurs restaurants de sushi à Marrakech. Sushi frais et cuisine japonaise raffinée, réservez sur Sortir Au Maroc.',
 'Sushi et restaurants japonais à Marrakech',
 'La scène sushi de Marrakech s''est considérablement enrichie ces dernières années. Les restaurants japonais de Guéliz et de l''Hivernage proposent des sushis d''une fraîcheur remarquable, des rolls créatifs et des menus dégustation qui rivalisent avec les grandes capitales. Certains restaurants intègrent des influences marocaines dans leurs créations pour des combinaisons surprenantes. Réservez votre expérience sushi à Marrakech sur Sortir Au Maroc.',
 'sushi marrakech, japonais marrakech, maki marrakech, restaurant japonais marrakech',
 0.7),

('restaurant-marocain-marrakech', 'restaurant', 'Marrakech', NULL, 'Marocain',
 'Restaurants marocains Marrakech | SAM',
 'Les meilleurs restaurants marocains à Marrakech. Tajines, tanjias et palais gastronomiques, réservez sur Sortir Au Maroc.',
 'Restaurants marocains à Marrakech',
 'Marrakech est la ville emblématique de la cuisine marocaine. Des palais gastronomiques de la médina aux restaurants de la Palmeraie, la ville ocre offre une expérience culinaire hors du commun. La tanjia, plat emblématique de Marrakech cuit lentement dans les cendres du hammam, est un incontournable. Les riads-restaurants proposent des menus traditionnels dans des cadres enchanteurs avec fontaines et jardins intérieurs. Les restaurants de la place Jemaa el-Fna offrent quant à eux une expérience street food unique au monde. Découvrez la cuisine marocaine authentique de Marrakech sur Sortir Au Maroc.',
 'restaurant marocain marrakech, tajine marrakech, tanjia marrakech, cuisine marocaine marrakech',
 0.7),

('brunch-marrakech', 'restaurant', 'Marrakech', NULL, NULL,
 'Brunch à Marrakech — Les meilleures adresses | SAM',
 'Les meilleurs brunchs à Marrakech. Terrasses de Guéliz et riads, formules weekend, réservez sur Sortir Au Maroc.',
 'Les meilleurs brunchs à Marrakech',
 'Le brunch à Marrakech est une institution, surtout le weekend. Les terrasses de Guéliz, les jardins de riads et les restaurants de la Palmeraie rivalisent de créativité pour proposer des brunchs mémorables. Mêlant influences marocaines et internationales, les brunchs marrakchis proposent des pancakes, des œufs bénédicte et des avocado toasts côte à côte avec des msemen, du baghrir et des pâtisseries aux amandes. Certains hôtels et riads proposent des brunchs avec piscine pour une expérience complète. Réservez votre brunch à Marrakech sur Sortir Au Maroc.',
 'brunch marrakech, petit dejeuner marrakech, weekend marrakech, meilleur brunch marrakech',
 0.7),

('restaurant-francais-marrakech', 'restaurant', 'Marrakech', NULL, 'Français',
 'Restaurants français Marrakech | SAM',
 'Les meilleurs restaurants français à Marrakech. Gastronomie et bistronomie française, réservez sur Sortir Au Maroc.',
 'Restaurants français à Marrakech',
 'Marrakech attire de nombreux chefs français qui y ouvrent des restaurants d''exception. La bistronomie française se marie parfaitement avec les produits du terroir marocain, donnant naissance à une cuisine fusion élégante. Les restaurants français de Guéliz et de l''Hivernage proposent des menus gastronomiques, des caves à vins bien fournies et un service soigné. Des adresses incontournables pour les amateurs de cuisine française au cœur de la ville ocre. Réservez sur Sortir Au Maroc.',
 'restaurant francais marrakech, bistrot marrakech, gastronomie française marrakech',
 0.6),

('pizza-marrakech', 'restaurant', 'Marrakech', NULL, 'Italien',
 'Pizzerias Marrakech — Les meilleures pizzas | SAM',
 'Les meilleures pizzerias à Marrakech. Pizzas napolitaines, four à bois et livraison, réservez sur Sortir Au Maroc.',
 'Les meilleures pizzerias à Marrakech',
 'Marrakech compte d''excellentes pizzerias, particulièrement dans les quartiers de Guéliz et de l''Hivernage. Les pizzaïolos de la ville ocre maîtrisent l''art de la pizza napolitaine avec des fours à bois, des pâtes longue fermentation et des ingrédients importés d''Italie. Des adresses familiales aux concepts gourmet, il y en a pour tous les goûts et tous les budgets. Trouvez votre pizzeria à Marrakech sur Sortir Au Maroc.',
 'pizza marrakech, pizzeria marrakech, meilleure pizza marrakech',
 0.6),

('burger-marrakech', 'restaurant', 'Marrakech', NULL, 'Américain',
 'Burgers Marrakech — Les meilleures adresses | SAM',
 'Les meilleurs burgers à Marrakech. Burgers gourmet et classiques américains, découvrez les adresses sur SAM.',
 'Les meilleurs burgers à Marrakech',
 'Le burger gourmet s''est imposé à Marrakech avec plusieurs adresses devenues incontournables. Guéliz concentre les meilleurs spots burger de la ville, avec des concepts qui misent sur la qualité des produits : bœuf frais, buns artisanaux et sauces maison. Des food trucks aux restaurants assis, la scène burger marrakchie est variée et créative. Trouvez le meilleur burger de Marrakech sur Sortir Au Maroc.',
 'burger marrakech, meilleur burger marrakech, burger gourmet marrakech',
 0.6),

('restaurant-asiatique-marrakech', 'restaurant', 'Marrakech', NULL, 'Asiatique',
 'Restaurants asiatiques Marrakech | SAM',
 'Les meilleurs restaurants asiatiques à Marrakech. Thaï, japonais, chinois et fusion, réservez sur Sortir Au Maroc.',
 'Restaurants asiatiques à Marrakech',
 'Marrakech propose une offre croissante de restaurants asiatiques de qualité. Des restaurants thaïlandais aux tables japonaises en passant par les restaurants chinois et vietnamiens, la ville ocre permet un véritable tour d''Asie culinaire. Les concepts de fusion asiatique-marocaine ajoutent une touche originale à cette offre. Découvrez les restaurants asiatiques de Marrakech sur Sortir Au Maroc.',
 'restaurant asiatique marrakech, thaï marrakech, chinois marrakech, cuisine asiatique marrakech',
 0.6),

('restaurant-indien-marrakech', 'restaurant', 'Marrakech', NULL, 'Indien',
 'Restaurants indiens Marrakech | SAM',
 'Les meilleurs restaurants indiens à Marrakech. Curry, tandoori et cuisine du sous-continent, réservez sur SAM.',
 'Restaurants indiens à Marrakech',
 'Les restaurants indiens de Marrakech proposent des currys épicés, des tandooris fumés et des naans dorés dans des cadres chaleureux. La communauté indienne de Marrakech a contribué à l''émergence de plusieurs adresses authentiques, notamment dans le quartier de Guéliz. Les biryanis parfumés et les thalis colorés séduisent les amateurs de saveurs intenses. Réservez votre table indienne à Marrakech sur Sortir Au Maroc.',
 'restaurant indien marrakech, curry marrakech, tandoori marrakech, cuisine indienne marrakech',
 0.6),

('fruits-de-mer-marrakech', 'restaurant', 'Marrakech', NULL, 'Fruits de mer',
 'Fruits de mer Marrakech — Les meilleures tables | SAM',
 'Les meilleurs restaurants de fruits de mer à Marrakech. Poissons frais et plateaux, réservez sur Sortir Au Maroc.',
 'Restaurants de fruits de mer à Marrakech',
 'Bien que située à l''intérieur des terres, Marrakech dispose de restaurants de fruits de mer qui se font livrer quotidiennement les produits de la pêche d''Essaouira et d''Agadir. Les restaurants de poisson de la ville ocre proposent des produits d''une remarquable fraîcheur : plateaux de fruits de mer, poissons grillés, tajines de poisson et spécialités de la côte atlantique. Réservez votre table poisson à Marrakech sur Sortir Au Maroc.',
 'fruits de mer marrakech, restaurant poisson marrakech, fruits de mer marrakech',
 0.6),

-- === RABAT ===
('restaurant-italien-rabat', 'restaurant', 'Rabat', NULL, 'Italien',
 'Restaurants italiens Rabat | SAM',
 'Les meilleurs restaurants italiens à Rabat. Pizzas, pastas et cuisine italienne authentique, réservez sur SAM.',
 'Restaurants italiens à Rabat',
 'Rabat accueille plusieurs restaurants italiens de qualité, notamment dans les quartiers de l''Agdal et de Hassan. Les pizzerias napolitaines côtoient les trattorias traditionnelles et les restaurants gastronomiques italiens. Le cadre raffiné de la capitale se prête parfaitement à un dîner italien avec vue sur le Bouregreg ou dans les ruelles de la ville nouvelle. Réservez votre restaurant italien à Rabat sur Sortir Au Maroc.',
 'restaurant italien rabat, pizza rabat, pâtes rabat, cuisine italienne rabat',
 0.6),

('sushi-rabat', 'restaurant', 'Rabat', NULL, 'Japonais',
 'Sushi & restaurants japonais Rabat | SAM',
 'Les meilleurs restaurants de sushi à Rabat. Sushi frais et cuisine japonaise, réservez sur Sortir Au Maroc.',
 'Sushi et restaurants japonais à Rabat',
 'La scène sushi de Rabat s''est considérablement développée avec l''ouverture de restaurants japonais de qualité dans les quartiers de l''Agdal et de Hay Riad. Des comptoirs à sushi intimistes aux restaurants japonais plus élaborés, la capitale offre un éventail d''adresses pour les amateurs de cuisine nippone. Fraîcheur du poisson et créativité des rolls sont au rendez-vous. Réservez votre expérience sushi à Rabat sur Sortir Au Maroc.',
 'sushi rabat, japonais rabat, maki rabat, restaurant japonais rabat',
 0.6),

('restaurant-marocain-rabat', 'restaurant', 'Rabat', NULL, 'Marocain',
 'Restaurants marocains Rabat | SAM',
 'Les meilleurs restaurants marocains à Rabat. Cuisine traditionnelle de la capitale, réservez sur Sortir Au Maroc.',
 'Restaurants marocains à Rabat',
 'Rabat, capitale du Royaume, offre une cuisine marocaine empreinte d''élégance et de raffinement. Les restaurants de la médina et de la Kasbah des Oudaïas proposent des tajines et des couscous dans des cadres historiques enchanteurs. L''Agdal et Hassan abritent des restaurants gastronomiques marocains qui revisitent les classiques avec modernité. La cuisine rbatie est réputée pour sa délicatesse et son équilibre des saveurs. Découvrez les restaurants marocains de la capitale sur Sortir Au Maroc.',
 'restaurant marocain rabat, tajine rabat, couscous rabat, cuisine marocaine rabat',
 0.6),

('brunch-rabat', 'restaurant', 'Rabat', NULL, NULL,
 'Brunch à Rabat — Les meilleures adresses | SAM',
 'Les meilleurs brunchs à Rabat. Brunchs gourmands et formules weekend dans la capitale, réservez sur SAM.',
 'Les meilleurs brunchs à Rabat',
 'Le brunch est devenu incontournable à Rabat, surtout le weekend. Les coffee shops de l''Agdal, les terrasses de Hassan et les restaurants du Bouregreg proposent des formules brunch variées et gourmandes. Influences internationales et touches marocaines se mêlent dans des assiettes créatives et généreuses. Des spots instagrammables aux adresses plus intimistes, Rabat a de quoi satisfaire tous les bruncheurs. Réservez votre brunch à Rabat sur Sortir Au Maroc.',
 'brunch rabat, petit dejeuner rabat, weekend rabat, meilleur brunch rabat',
 0.6),

('restaurant-francais-rabat', 'restaurant', 'Rabat', NULL, 'Français',
 'Restaurants français Rabat | SAM',
 'Les meilleurs restaurants français à Rabat. Gastronomie et bistronomie de la capitale, réservez sur Sortir Au Maroc.',
 'Restaurants français à Rabat',
 'Rabat, avec sa tradition diplomatique et sa communauté francophone importante, compte parmi les meilleures adresses françaises du Maroc. Les restaurants de l''Agdal et du centre-ville proposent une cuisine française raffinée, des brasseries classiques aux tables bistronomiques modernes. Les chefs français installés à Rabat y apportent leur expertise et leur passion, pour le plus grand bonheur des gourmets de la capitale. Réservez votre table française à Rabat sur Sortir Au Maroc.',
 'restaurant francais rabat, bistrot rabat, gastronomie française rabat',
 0.6),

('pizza-rabat', 'restaurant', 'Rabat', NULL, 'Italien',
 'Pizzerias Rabat — Les meilleures pizzas | SAM',
 'Les meilleures pizzerias à Rabat. Pizzas napolitaines et four à bois dans la capitale, réservez sur SAM.',
 'Les meilleures pizzerias à Rabat',
 'Rabat dispose d''excellentes pizzerias dans tous les quartiers de la ville. De l''Agdal à Hassan en passant par Hay Riad, les pizzaïolos de la capitale proposent des pizzas napolitaines au four à bois, des pâtes longue fermentation et des ingrédients de qualité. Des adresses familiales aux concepts gourmet, la pizza rbatie a de quoi surprendre. Découvrez les meilleures pizzerias de Rabat sur Sortir Au Maroc.',
 'pizza rabat, pizzeria rabat, meilleure pizza rabat',
 0.6),

('burger-rabat', 'restaurant', 'Rabat', NULL, 'Américain',
 'Burgers Rabat — Les meilleures adresses | SAM',
 'Les meilleurs burgers à Rabat. Burgers gourmet et smash burgers dans la capitale, découvrez les adresses sur SAM.',
 'Les meilleurs burgers à Rabat',
 'La scène burger de Rabat ne cesse de s''enrichir avec de nouvelles adresses créatives. L''Agdal et l''océan concentrent les spots les plus populaires, avec des concepts qui misent sur des steaks hachés frais, des buns artisanaux et des accompagnements originaux. Du classique cheeseburger au burger gourmet gastronomique, Rabat a le burger qu''il vous faut. Découvrez les meilleures adresses sur Sortir Au Maroc.',
 'burger rabat, meilleur burger rabat, burger gourmet rabat, smash burger rabat',
 0.6),

('restaurant-asiatique-rabat', 'restaurant', 'Rabat', NULL, 'Asiatique',
 'Restaurants asiatiques Rabat | SAM',
 'Les meilleurs restaurants asiatiques à Rabat. Thaï, chinois, japonais et fusion, réservez sur Sortir Au Maroc.',
 'Restaurants asiatiques à Rabat',
 'La cuisine asiatique est de plus en plus présente à Rabat. Des restaurants thaïlandais de l''Agdal aux restaurants chinois historiques, en passant par les nouveaux concepts vietnamiens et coréens, la capitale offre un beau panorama de la gastronomie asiatique. Les restaurants fusion qui marient saveurs asiatiques et produits locaux ajoutent une touche d''originalité. Explorez la cuisine asiatique à Rabat sur Sortir Au Maroc.',
 'restaurant asiatique rabat, thaï rabat, chinois rabat, cuisine asiatique rabat',
 0.6),

('restaurant-indien-rabat', 'restaurant', 'Rabat', NULL, 'Indien',
 'Restaurants indiens Rabat | SAM',
 'Les meilleurs restaurants indiens à Rabat. Curry, tandoori et naan dans la capitale, réservez sur SAM.',
 'Restaurants indiens à Rabat',
 'Les restaurants indiens de Rabat proposent une cuisine authentique aux saveurs intenses. Currys, tandooris, biryanis et naans sont préparés avec des épices importées et un savoir-faire traditionnel. Les quartiers de l''Agdal et de Hassan abritent les principales adresses indiennes de la capitale. Réservez votre table indienne à Rabat sur Sortir Au Maroc.',
 'restaurant indien rabat, curry rabat, tandoori rabat, cuisine indienne rabat',
 0.6),

('fruits-de-mer-rabat', 'restaurant', 'Rabat', NULL, 'Fruits de mer',
 'Fruits de mer Rabat — Les meilleures tables | SAM',
 'Les meilleurs restaurants de fruits de mer à Rabat. Poissons frais de l''Atlantique, réservez sur Sortir Au Maroc.',
 'Restaurants de fruits de mer à Rabat',
 'Rabat, ville côtière de l''Atlantique, offre un accès privilégié aux produits de la mer les plus frais. Les restaurants de fruits de mer du front de mer et du Bouregreg proposent des poissons grillés du jour, des plateaux royaux et des spécialités de la mer. Le port de pêche de Rabat alimente quotidiennement les tables de la ville en produits d''une fraîcheur incomparable. Réservez votre restaurant de fruits de mer à Rabat sur Sortir Au Maroc.',
 'fruits de mer rabat, restaurant poisson rabat, plateau fruits de mer rabat',
 0.6)
ON CONFLICT (slug) DO NOTHING;


-- -------------------------------------------------------
-- 2c. National pages (sans ville)
-- -------------------------------------------------------

INSERT INTO public.landing_pages (slug, universe, city, category, cuisine_type, title_fr, description_fr, h1_fr, intro_text_fr, keywords, priority)
VALUES

('restaurants-maroc', 'restaurant', NULL, NULL, NULL,
 'Restaurants au Maroc — Les meilleures adresses | SAM',
 'Trouvez les meilleurs restaurants au Maroc. De Casablanca à Marrakech, réservez dans les meilleures adresses sur Sortir Au Maroc.',
 'Les meilleurs restaurants au Maroc',
 'Le Maroc est une destination gastronomique de premier plan, reconnue mondialement pour la richesse et la diversité de sa cuisine. De Casablanca à Marrakech, de Fès à Tanger, chaque ville a ses spécialités et ses adresses incontournables. La cuisine marocaine, inscrite au patrimoine immatériel de l''UNESCO, se décline en une infinité de tajines, couscous, pastillas et grillades. Mais le Maroc, c''est aussi une scène culinaire internationale en pleine effervescence : restaurants français, italiens, japonais, indiens et fusion se multiplient dans les grandes villes. Que vous cherchiez un restaurant traditionnel dans un riad de Fès, un rooftop branché à Marrakech ou un restaurant de poisson face à l''océan à Agadir, Sortir Au Maroc vous aide à trouver et réserver la table parfaite. Notre plateforme référence des milliers de restaurants dans tout le royaume, avec des avis vérifiés et la réservation en ligne.',
 'restaurant maroc, meilleur restaurant maroc, où manger maroc, gastronomie marocaine',
 0.9),

('meilleurs-restaurants-maroc', 'restaurant', NULL, NULL, NULL,
 'Top restaurants Maroc — Les incontournables 2026 | SAM',
 'Le classement des meilleurs restaurants au Maroc en 2026. Gastronomie marocaine et internationale, réservez sur SAM.',
 'Les meilleurs restaurants du Maroc en 2026',
 'Découvrez notre sélection des meilleurs restaurants du Maroc pour 2026. Ce classement est basé sur les avis vérifiés de nos utilisateurs, les notes Google, et l''expertise de notre équipe éditoriale. Des tables gastronomiques aux adresses de quartier, nous avons sélectionné les établissements qui se distinguent par la qualité de leur cuisine, leur service et leur cadre. Le Maroc culinaire ne cesse de se réinventer, avec de nouveaux chefs talentueux qui ouvrent des restaurants innovants tout en préservant l''authenticité des saveurs marocaines. De Casablanca à Marrakech, de Rabat à Tanger, explorez les meilleures tables du royaume et réservez votre prochaine expérience gastronomique sur Sortir Au Maroc.',
 'meilleur restaurant maroc, top restaurant maroc, classement restaurant maroc 2026',
 0.8),

('brunch-maroc', 'restaurant', NULL, NULL, NULL,
 'Brunch au Maroc — Les meilleures adresses 2026 | SAM',
 'Les meilleurs brunchs au Maroc. De Casablanca à Marrakech, trouvez le brunch parfait et réservez sur Sortir Au Maroc.',
 'Les meilleurs brunchs au Maroc',
 'Le brunch est devenu un véritable phénomène au Maroc. Chaque weekend, les terrasses des grandes villes se remplissent de gourmands en quête de la formule idéale. Casablanca, Marrakech, Rabat et Tanger rivalisent de créativité avec des brunchs qui mêlent influences internationales et touches marocaines. Pancakes et msemen, eggs benedict et baghrir, avocado toast et amlou : les brunchs marocains sont un festival de saveurs. Des hôtels cinq étoiles aux coffee shops de quartier, en passant par les riads et les rooftops, les options sont infinies. Sortir Au Maroc vous aide à trouver le brunch parfait pour votre dimanche matin, où que vous soyez dans le royaume.',
 'brunch maroc, meilleur brunch maroc, brunch weekend maroc, petit dejeuner gourmand maroc',
 0.8)
ON CONFLICT (slug) DO NOTHING;

COMMIT;


-- ============================================================
-- FILE: 20260215_user_preferences.sql
-- ============================================================

-- ============================================================
-- User Preferences for Personalized Search Results (Prompt 12)
-- ============================================================
-- Stores computed preference profiles per user, derived from
-- reservations, search clicks, and search queries.
-- Used by listPublicEstablishments to re-rank results.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_preferences_computed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Preference signals: JSONB objects mapping dimension values to normalized scores (0.0–1.0)
  preferred_cuisines JSONB DEFAULT '{}',          -- {"japonais": 0.85, "italien": 0.42}
  preferred_ambiances JSONB DEFAULT '{}',         -- {"romantique": 0.7, "festif": 0.4}
  preferred_price_ranges JSONB DEFAULT '{}',      -- {"1": 0.1, "3": 0.8}
  preferred_amenities JSONB DEFAULT '{}',         -- {"terrasse": 0.9, "parking": 0.6}
  preferred_neighborhoods JSONB DEFAULT '{}',     -- {"Gauthier": 0.7, "Anfa": 0.5}
  preferred_cities JSONB DEFAULT '{}',            -- {"Casablanca": 0.9, "Marrakech": 0.3}

  -- Aggregate behavioral stats
  avg_rating_booked NUMERIC(3,2),                 -- average rating of booked establishments
  total_bookings INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 0,

  -- Confidence: 0.0 = no data (no personalization), 1.0 = strong profile
  confidence_score NUMERIC(3,2) DEFAULT 0.00,

  computed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_prefs_unique UNIQUE(user_id)
);

-- Index for cron batch recomputation (find stale profiles)
CREATE INDEX IF NOT EXISTS idx_user_prefs_updated
  ON user_preferences_computed(updated_at);

-- RLS: users can only read their own preferences
ALTER TABLE user_preferences_computed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_prefs_service_role ON user_preferences_computed;
CREATE POLICY user_prefs_service_role ON user_preferences_computed
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;


-- ============================================================
-- FILE: 20260216_multilingual_search.sql
-- ============================================================

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

COMMENT ON FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text) IS
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

COMMENT ON FUNCTION public.count_establishments_scored(text, text, text, text) IS
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


-- ============================================================
-- FILE: 20260216_pro_onboarding_wizard.sql
-- ============================================================

-- Pro Onboarding Wizard — progression tracking
-- Stores wizard state as JSONB on pro_profiles (current_step, completed_steps, data, etc.)

ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS onboarding_wizard_progress JSONB DEFAULT NULL;

COMMENT ON COLUMN public.pro_profiles.onboarding_wizard_progress IS
  'Stores the step-by-step progress of the pro onboarding wizard (current_step, completed_steps, skipped, completed, data)';


-- ============================================================
-- FILE: 20260217_fix_multiword_search.sql
-- ============================================================

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


-- ============================================================
-- FILE: 20260217_fix_search_path_functions.sql
-- ============================================================

-- ============================================================================
-- FIX: search_path vide sur les fonctions SECURITY DEFINER
--
-- Problème : Les fonctions search_establishments_scored, count_establishments_scored,
-- et expand_search_query ont search_path = '' (vide) car Supabase le force sur les
-- fonctions SECURITY DEFINER. Cela empêche ces fonctions de résoudre :
--   1. expand_search_query() (dans le schéma public)
--   2. similarity() de pg_trgm (dans le schéma extensions)
--
-- Résultat : Sam retourne toujours "Je n'ai rien trouvé" car la RPC crash silencieusement.
--
-- Fix : SET search_path TO public, extensions sur toutes les fonctions concernées.
-- ============================================================================

ALTER FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.count_establishments_scored(text, text, text, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.expand_search_query(text, text, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.expand_search_query(text, text)
  SET search_path TO public, extensions;

-- ============================================================================
-- FIX: search_path vide sur le trigger et les fonctions de génération de vecteur
--
-- Problème : La fonction trigger update_establishment_search_vector() a
-- search_path = '' (vide), ce qui empêche le trigger de résoudre les fonctions
-- generate_establishment_search_vector_v2() et generate_establishment_search_vector_en()
-- lors d'un INSERT/UPDATE sur la table establishments.
--
-- Résultat : Impossible de valider/créer/modifier un établissement.
-- Erreur : "function generate_establishment_search_vector_v2(...) does not exist"
--
-- Fix : SET search_path TO public, extensions sur la fonction trigger et les
-- fonctions de génération de vecteur de recherche.
-- ============================================================================

ALTER FUNCTION public.update_establishment_search_vector()
  SET search_path TO public, extensions;

ALTER FUNCTION public.generate_establishment_search_vector_v2(text, text, text, text, text[], text[], text[], text, text[], text[])
  SET search_path TO public, extensions;

ALTER FUNCTION public.generate_establishment_search_vector_en(text, text, text, text, text[], text[], text[], text, text[], text[])
  SET search_path TO public, extensions;

