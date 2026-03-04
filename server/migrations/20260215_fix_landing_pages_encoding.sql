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
