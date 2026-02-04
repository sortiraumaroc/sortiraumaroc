-- Establishment Slugs
-- Add slug column to establishments table for friendly URLs
-- Format: {name}-{city} in lowercase with accents removed and spaces replaced by hyphens

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper function to generate URL-friendly slugs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_establishment_slug(name_val text, city_val text)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int := 0;
BEGIN
  -- Combine name and city
  base_slug := COALESCE(name_val, '') || '-' || COALESCE(city_val, '');

  -- Convert to lowercase
  base_slug := lower(base_slug);

  -- Remove accents (transliterate)
  base_slug := translate(base_slug,
    'àâäáãåæçèéêëìíîïñòóôõöøùúûüýÿœÀÂÄÁÃÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŸŒ',
    'aaaaaaeceeeeiiiinooooooouuuuyyoAAAAAAECEEEEIIIINOOOOOOUUUUYYO'
  );

  -- Replace spaces and special characters with hyphens
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');

  -- Remove leading/trailing hyphens
  base_slug := trim(both '-' from base_slug);

  -- Remove multiple consecutive hyphens
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');

  -- Ensure minimum length
  IF length(base_slug) < 3 THEN
    base_slug := base_slug || '-etablissement';
  END IF;

  RETURN base_slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- Add slug column to establishments table
-- ---------------------------------------------------------------------------
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS slug text;

-- ---------------------------------------------------------------------------
-- Create unique index on slug (partial - only for non-null slugs)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishments_slug_unique
  ON public.establishments(slug)
  WHERE slug IS NOT NULL;

-- Create regular index for fast lookups
CREATE INDEX IF NOT EXISTS idx_establishments_slug_lookup
  ON public.establishments(slug);

-- ---------------------------------------------------------------------------
-- Generate slugs for existing establishments
-- ---------------------------------------------------------------------------
UPDATE public.establishments
SET slug = generate_establishment_slug(name, city)
WHERE slug IS NULL
  AND name IS NOT NULL
  AND status = 'active';

-- ---------------------------------------------------------------------------
-- Handle duplicates by adding a numeric suffix
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_record RECORD;
  new_slug text;
  counter int;
BEGIN
  -- Find and fix duplicate slugs
  FOR dup_record IN (
    SELECT id, slug, name, city,
           ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn
    FROM public.establishments
    WHERE slug IS NOT NULL
  ) LOOP
    IF dup_record.rn > 1 THEN
      counter := dup_record.rn;
      new_slug := dup_record.slug || '-' || counter;

      -- Keep incrementing if still duplicate
      WHILE EXISTS (SELECT 1 FROM public.establishments WHERE slug = new_slug AND id != dup_record.id) LOOP
        counter := counter + 1;
        new_slug := dup_record.slug || '-' || counter;
      END LOOP;

      UPDATE public.establishments
      SET slug = new_slug
      WHERE id = dup_record.id;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Comment on the column
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.establishments.slug IS 'URL-friendly identifier (format: name-city). Used for SEO-friendly URLs like /restaurant/atlas-lodge-agadir';

COMMIT;
