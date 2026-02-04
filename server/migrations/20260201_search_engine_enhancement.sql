-- ============================================================================
-- SEARCH ENGINE ENHANCEMENT MIGRATION
-- Adds Full-Text Search capabilities and missing columns for establishments
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD MISSING COLUMNS FOR ESTABLISHMENT FLAGS
-- ============================================================================

-- Add verified flag (establishment has been verified by admin)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;

-- Add premium flag (establishment has premium subscription)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS premium boolean DEFAULT false;

-- Add curated flag (establishment is curated/featured by editorial team)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS curated boolean DEFAULT false;

-- Add neighborhood for more granular location search
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS neighborhood text;

-- Add cuisine_types array for restaurant-specific search
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS cuisine_types text[] DEFAULT '{}';

-- Add price_range for filtering (1=budget, 2=moderate, 3=upscale, 4=luxury)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS price_range smallint;

-- ============================================================================
-- 2. CREATE FULL-TEXT SEARCH VECTOR COLUMN
-- ============================================================================

-- Add tsvector column for full-text search
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ============================================================================
-- 3. CREATE FUNCTION TO GENERATE SEARCH VECTOR
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

-- ============================================================================
-- 4. CREATE TRIGGER TO AUTO-UPDATE SEARCH VECTOR
-- ============================================================================

CREATE OR REPLACE FUNCTION update_establishment_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := generate_establishment_search_vector(
    NEW.name,
    NEW.city,
    NEW.neighborhood,
    NEW.subcategory,
    NEW.tags,
    NEW.amenities,
    NEW.cuisine_types,
    NEW.description_short
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_establishments_search_vector ON public.establishments;

CREATE TRIGGER trg_establishments_search_vector
  BEFORE INSERT OR UPDATE OF name, city, neighborhood, subcategory, tags, amenities, cuisine_types, description_short
  ON public.establishments
  FOR EACH ROW
  EXECUTE FUNCTION update_establishment_search_vector();

-- ============================================================================
-- 5. POPULATE SEARCH VECTOR FOR EXISTING DATA
-- ============================================================================

UPDATE public.establishments
SET search_vector = generate_establishment_search_vector(
  name,
  city,
  neighborhood,
  subcategory,
  tags,
  amenities,
  cuisine_types,
  description_short
)
WHERE search_vector IS NULL OR search_vector = '';

-- ============================================================================
-- 6. CREATE INDEXES FOR SEARCH PERFORMANCE
-- ============================================================================

-- GIN index for full-text search (most important)
CREATE INDEX IF NOT EXISTS idx_establishments_search_vector
  ON public.establishments USING GIN (search_vector);

-- Index for verified/premium/curated flags (for filtering)
CREATE INDEX IF NOT EXISTS idx_establishments_verified
  ON public.establishments (verified) WHERE verified = true;

CREATE INDEX IF NOT EXISTS idx_establishments_premium
  ON public.establishments (premium) WHERE premium = true;

CREATE INDEX IF NOT EXISTS idx_establishments_curated
  ON public.establishments (curated) WHERE curated = true;

-- Index for price range filtering
CREATE INDEX IF NOT EXISTS idx_establishments_price_range
  ON public.establishments (price_range) WHERE price_range IS NOT NULL;

-- Composite index for common search patterns
CREATE INDEX IF NOT EXISTS idx_establishments_search_composite
  ON public.establishments (universe, city, status)
  WHERE status = 'active';

-- GIN index for tags array search
CREATE INDEX IF NOT EXISTS idx_establishments_tags_gin
  ON public.establishments USING GIN (tags);

-- GIN index for amenities array search
CREATE INDEX IF NOT EXISTS idx_establishments_amenities_gin
  ON public.establishments USING GIN (amenities);

-- GIN index for cuisine_types array search
CREATE INDEX IF NOT EXISTS idx_establishments_cuisine_types_gin
  ON public.establishments USING GIN (cuisine_types);

-- ============================================================================
-- 7. ENABLE pg_trgm EXTENSION FOR FUZZY SEARCH (typo tolerance)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on name for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_establishments_name_trgm
  ON public.establishments USING GIN (name gin_trgm_ops);

-- ============================================================================
-- 8. CREATE SEARCH SUGGESTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  category text NOT NULL, -- 'cuisine', 'tag', 'city', 'establishment', 'dish'
  universe text, -- null means applies to all universes
  display_label text NOT NULL,
  icon_name text,
  search_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(term, category, universe)
);

-- Index for autocomplete queries
CREATE INDEX IF NOT EXISTS idx_search_suggestions_term_trgm
  ON public.search_suggestions USING GIN (term gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_search_suggestions_category
  ON public.search_suggestions (category, universe, is_active);

-- ============================================================================
-- 9. SEED INITIAL SEARCH SUGGESTIONS
-- ============================================================================

-- Cuisine types (for "Manger & Boire")
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('marocain', 'cuisine', 'restaurant', 'Cuisine Marocaine', 'utensils'),
  ('francais', 'cuisine', 'restaurant', 'Cuisine Fran??aise', 'utensils'),
  ('italien', 'cuisine', 'restaurant', 'Cuisine Italienne', 'utensils'),
  ('japonais', 'cuisine', 'restaurant', 'Cuisine Japonaise', 'utensils'),
  ('chinois', 'cuisine', 'restaurant', 'Cuisine Chinoise', 'utensils'),
  ('libanais', 'cuisine', 'restaurant', 'Cuisine Libanaise', 'utensils'),
  ('indien', 'cuisine', 'restaurant', 'Cuisine Indienne', 'utensils'),
  ('mexicain', 'cuisine', 'restaurant', 'Cuisine Mexicaine', 'utensils'),
  ('thai', 'cuisine', 'restaurant', 'Cuisine Tha??landaise', 'utensils'),
  ('mediterraneen', 'cuisine', 'restaurant', 'Cuisine M??diterran??enne', 'utensils'),
  ('asiatique', 'cuisine', 'restaurant', 'Cuisine Asiatique', 'utensils'),
  ('fruits de mer', 'cuisine', 'restaurant', 'Fruits de Mer', 'fish'),
  ('grillades', 'cuisine', 'restaurant', 'Grillades', 'flame'),
  ('pizza', 'cuisine', 'restaurant', 'Pizzeria', 'pizza'),
  ('burger', 'cuisine', 'restaurant', 'Burgers', 'utensils'),
  ('sushi', 'dish', 'restaurant', 'Sushi', 'utensils'),
  ('couscous', 'dish', 'restaurant', 'Couscous', 'utensils'),
  ('tajine', 'dish', 'restaurant', 'Tajine', 'utensils'),
  ('pastilla', 'dish', 'restaurant', 'Pastilla', 'utensils'),
  ('brunch', 'dish', 'restaurant', 'Brunch', 'coffee')
ON CONFLICT (term, category, universe) DO NOTHING;

-- Tags / Occasions (for all universes)
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('romantique', 'tag', NULL, 'Romantique', 'heart'),
  ('famille', 'tag', NULL, 'En Famille', 'users'),
  ('anniversaire', 'tag', NULL, 'Anniversaire', 'cake'),
  ('business', 'tag', NULL, 'Business / S??minaire', 'briefcase'),
  ('terrasse', 'tag', 'restaurant', 'Terrasse', 'sun'),
  ('rooftop', 'tag', 'restaurant', 'Rooftop', 'building'),
  ('vue mer', 'tag', NULL, 'Vue Mer', 'waves'),
  ('piscine', 'tag', NULL, 'Piscine', 'waves'),
  ('spa', 'tag', NULL, 'Spa', 'sparkles'),
  ('parking', 'tag', NULL, 'Parking', 'car'),
  ('wifi', 'tag', NULL, 'WiFi Gratuit', 'wifi'),
  ('livraison', 'tag', 'restaurant', 'Livraison', 'truck'),
  ('a emporter', 'tag', 'restaurant', '?? Emporter', 'shopping-bag'),
  ('vegetarien', 'tag', 'restaurant', 'V??g??tarien', 'leaf'),
  ('halal', 'tag', 'restaurant', 'Halal', 'check-circle'),
  ('sans alcool', 'tag', 'restaurant', 'Sans Alcool', 'glass-water'),
  ('enfants', 'tag', NULL, 'Adapt?? aux Enfants', 'baby'),
  ('groupe', 'tag', NULL, 'Groupes', 'users'),
  ('evjf', 'tag', NULL, 'EVJF / EVG', 'party-popper'),
  ('team building', 'tag', NULL, 'Team Building', 'users')
ON CONFLICT (term, category, universe) DO NOTHING;

-- Major cities
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('casablanca', 'city', NULL, 'Casablanca', 'map-pin'),
  ('marrakech', 'city', NULL, 'Marrakech', 'map-pin'),
  ('rabat', 'city', NULL, 'Rabat', 'map-pin'),
  ('tanger', 'city', NULL, 'Tanger', 'map-pin'),
  ('fes', 'city', NULL, 'F??s', 'map-pin'),
  ('agadir', 'city', NULL, 'Agadir', 'map-pin'),
  ('essaouira', 'city', NULL, 'Essaouira', 'map-pin'),
  ('meknes', 'city', NULL, 'Mekn??s', 'map-pin'),
  ('oujda', 'city', NULL, 'Oujda', 'map-pin'),
  ('kenitra', 'city', NULL, 'K??nitra', 'map-pin'),
  ('tetouan', 'city', NULL, 'T??touan', 'map-pin'),
  ('el jadida', 'city', NULL, 'El Jadida', 'map-pin'),
  ('nador', 'city', NULL, 'Nador', 'map-pin'),
  ('beni mellal', 'city', NULL, 'B??ni Mellal', 'map-pin'),
  ('mohammedia', 'city', NULL, 'Mohammedia', 'map-pin')
ON CONFLICT (term, category, universe) DO NOTHING;

-- Activities (for Loisirs)
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('escape game', 'activity', 'loisir', 'Escape Game', 'puzzle'),
  ('karting', 'activity', 'loisir', 'Karting', 'car'),
  ('quad', 'activity', 'loisir', 'Quad / Buggy', 'car'),
  ('jet ski', 'activity', 'loisir', 'Jet Ski', 'waves'),
  ('parachute', 'activity', 'loisir', 'Parachute / Parapente', 'wind'),
  ('golf', 'activity', 'loisir', 'Golf', 'flag'),
  ('bowling', 'activity', 'loisir', 'Bowling', 'circle'),
  ('laser game', 'activity', 'loisir', 'Laser Game', 'zap'),
  ('surf', 'activity', 'loisir', 'Surf / Kite', 'waves'),
  ('aquapark', 'activity', 'loisir', 'Aquapark', 'waves')
ON CONFLICT (term, category, universe) DO NOTHING;

-- Wellness activities
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('hammam', 'activity', 'wellness', 'Hammam', 'droplet'),
  ('massage', 'activity', 'wellness', 'Massage', 'hand'),
  ('spa', 'activity', 'wellness', 'Spa', 'sparkles'),
  ('yoga', 'activity', 'wellness', 'Yoga / Pilates', 'heart'),
  ('fitness', 'activity', 'wellness', 'Fitness / Gym', 'dumbbell'),
  ('coiffeur', 'activity', 'wellness', 'Coiffeur', 'scissors'),
  ('barbier', 'activity', 'wellness', 'Barbier', 'scissors'),
  ('institut beaute', 'activity', 'wellness', 'Institut de Beaut??', 'sparkles'),
  ('padel', 'activity', 'wellness', 'Padel', 'circle'),
  ('tennis', 'activity', 'wellness', 'Tennis', 'circle')
ON CONFLICT (term, category, universe) DO NOTHING;

-- Accommodation types
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('hotel', 'accommodation', 'hebergement', 'H??tel', 'building'),
  ('riad', 'accommodation', 'hebergement', 'Riad', 'home'),
  ('villa', 'accommodation', 'hebergement', 'Villa', 'home'),
  ('appartement', 'accommodation', 'hebergement', 'Appartement', 'building'),
  ('maison dhotes', 'accommodation', 'hebergement', 'Maison d''H??tes', 'home'),
  ('resort', 'accommodation', 'hebergement', 'Resort', 'palmtree')
ON CONFLICT (term, category, universe) DO NOTHING;

-- Culture activities
INSERT INTO public.search_suggestions (term, category, universe, display_label, icon_name) VALUES
  ('musee', 'activity', 'culture', 'Mus??e', 'landmark'),
  ('visite guidee', 'activity', 'culture', 'Visite Guid??e', 'map'),
  ('theatre', 'activity', 'culture', 'Th????tre', 'drama'),
  ('concert', 'activity', 'culture', 'Concert', 'music'),
  ('exposition', 'activity', 'culture', 'Exposition', 'image'),
  ('atelier', 'activity', 'culture', 'Atelier', 'palette')
ON CONFLICT (term, category, universe) DO NOTHING;

-- ============================================================================
-- 10. CREATE SEARCH HISTORY TABLE (for analytics and personalization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text, -- for anonymous users
  query text NOT NULL,
  universe text,
  city text,
  filters jsonb DEFAULT '{}',
  results_count integer,
  clicked_establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_search_history_created_at
  ON public.search_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_history_query_trgm
  ON public.search_history USING GIN (query gin_trgm_ops);

-- ============================================================================
-- 11. ADD COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.establishments.search_vector IS 'Full-text search vector combining name, tags, amenities, description';
COMMENT ON COLUMN public.establishments.verified IS 'Establishment has been verified by admin team';
COMMENT ON COLUMN public.establishments.premium IS 'Establishment has active premium subscription';
COMMENT ON COLUMN public.establishments.curated IS 'Establishment is featured/curated by editorial team';
COMMENT ON COLUMN public.establishments.cuisine_types IS 'Array of cuisine types for restaurants';
COMMENT ON COLUMN public.establishments.price_range IS 'Price range: 1=budget, 2=moderate, 3=upscale, 4=luxury';
COMMENT ON TABLE public.search_suggestions IS 'Autocomplete suggestions for search';
COMMENT ON TABLE public.search_history IS 'User search history for analytics and personalization';

COMMIT;
