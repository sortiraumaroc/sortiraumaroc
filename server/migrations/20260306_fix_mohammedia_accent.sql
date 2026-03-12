-- ============================================================================
-- MIGRATION: Corriger l'orthographe Mohammedia → Mohammédia
-- Date: 2026-03-06
-- Description:
--   Corrige l'accent manquant sur le "e" de Mohammédia dans toutes les tables
--   qui stockent des noms de villes.
-- ============================================================================

BEGIN;

-- 1. Establishments
UPDATE public.establishments
SET city = 'Mohammédia'
WHERE city = 'Mohammedia';

-- 2. Landing pages
UPDATE public.landing_pages
SET city = 'Mohammédia'
WHERE city = 'Mohammedia';

-- 3. Search suggestions / autocomplete
UPDATE public.search_suggestions
SET display_name = 'Mohammédia'
WHERE slug = 'mohammedia' AND display_name = 'Mohammedia';

-- 4. Home cities (if city names are stored)
UPDATE public.home_cities
SET name = 'Mohammédia'
WHERE name = 'Mohammedia';

-- 5. Neighborhoods
UPDATE public.neighborhoods
SET city = 'Mohammédia'
WHERE city = 'Mohammedia';

COMMIT;
