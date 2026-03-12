-- ============================================================================
-- S1 — Slugs pour les plats (pro_inventory_items)
--
-- Ajoute un slug unique par établissement sur chaque item du menu,
-- permettant des URLs propres : /restaurant/{slug}/menu/{dishSlug}
--
-- 1. Colonne slug TEXT sur pro_inventory_items
-- 2. Index unique (establishment_id, slug) WHERE slug IS NOT NULL
-- 3. Fonction generate_dish_slug(title, est_id) — kebab-case, unaccent, dédup
-- 4. Trigger BEFORE INSERT/UPDATE pour auto-générer le slug
-- 5. Backfill des items actifs existants
-- ============================================================================

-- 1. Colonne slug
ALTER TABLE public.pro_inventory_items
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Index unique par établissement
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_est_slug
  ON public.pro_inventory_items (establishment_id, slug)
  WHERE slug IS NOT NULL;

-- 3. Fonction de génération de slug
CREATE OR REPLACE FUNCTION public.generate_dish_slug(
  p_title TEXT,
  p_establishment_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path TO public, extensions
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter INT := 0;
BEGIN
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN NULL;
  END IF;

  -- Normalise : unaccent → lowercase → remplace non-alphanum par tiret → trim tirets
  base_slug := lower(extensions.unaccent(trim(p_title)));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := left(base_slug, 60);

  IF base_slug = '' THEN
    RETURN NULL;
  END IF;

  candidate := base_slug;

  -- Déduplication : ajoute -2, -3, etc. si collision dans le même établissement
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.pro_inventory_items
      WHERE establishment_id = p_establishment_id
        AND slug = candidate
    ) THEN
      RETURN candidate;
    END IF;

    counter := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
END;
$$;

-- 4. Trigger pour auto-générer le slug
CREATE OR REPLACE FUNCTION public.trigger_generate_dish_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public, extensions
AS $$
BEGIN
  -- Génère le slug seulement si :
  --   a) INSERT sans slug fourni
  --   b) UPDATE du title (le slug doit suivre)
  IF (TG_OP = 'INSERT' AND NEW.slug IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title AND OLD.slug IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.slug IS NULL AND NEW.is_active = true)
  THEN
    NEW.slug := public.generate_dish_slug(NEW.title, NEW.establishment_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_dish_slug ON public.pro_inventory_items;

CREATE TRIGGER trg_generate_dish_slug
  BEFORE INSERT OR UPDATE OF title, slug, is_active
  ON public.pro_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_generate_dish_slug();

-- 5. Backfill : génère les slugs pour les items actifs existants
-- IMPORTANT : row-by-row via curseur pour que la déduplication fonctionne
-- (un UPDATE en masse ne voit pas les slugs assignés aux autres rows)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, title, establishment_id
    FROM public.pro_inventory_items
    WHERE is_active = true
      AND slug IS NULL
      AND title IS NOT NULL
      AND trim(title) <> ''
    ORDER BY establishment_id, sort_order NULLS LAST, id
  LOOP
    UPDATE public.pro_inventory_items
    SET slug = public.generate_dish_slug(r.title, r.establishment_id)
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 6. Fix search_path sur les nouvelles fonctions
ALTER FUNCTION public.generate_dish_slug(TEXT, UUID)
  SET search_path TO public, extensions;

ALTER FUNCTION public.trigger_generate_dish_slug()
  SET search_path TO public, extensions;
