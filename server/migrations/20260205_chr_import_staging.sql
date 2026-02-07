-- =============================================
-- Migration: CHR Import Staging System
-- Description: Tables pour l'import d'établissements CHR
--              avec workflow de validation humaine
-- Date: 2026-02-05
-- =============================================

-- Extension pour similarité de texte (déduplication)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================
-- 1. TABLE BATCHES D'IMPORT
-- =============================================
CREATE TABLE IF NOT EXISTS establishment_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Configuration du batch
  sources TEXT[] NOT NULL,           -- ['google', 'tripadvisor', 'sortiraumaroc', ...]
  cities TEXT[] NOT NULL,            -- ['casablanca', 'marrakech', ...]
  categories TEXT[],                 -- ['restaurant', 'cafe', 'bar', ...]
  keywords TEXT[],                   -- Mots-clés optionnels

  -- Statut
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

  -- Métriques
  total_fetched INTEGER DEFAULT 0,
  total_normalized INTEGER DEFAULT 0,
  total_duplicates INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Audit
  started_by TEXT,                   -- Admin ID ou email
  error_log JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE establishment_import_batches IS 'Batches d''import CHR avec suivi des métriques';

-- =============================================
-- 2. TABLE STAGING (données avant validation)
-- =============================================
CREATE TABLE IF NOT EXISTS establishment_import_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Données normalisées
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,     -- lowercase, sans accents, trimmed
  category TEXT,                     -- restaurant, cafe, bar, rooftop, patisserie, tea_room, fast_food
  subcategory TEXT,

  description_short TEXT,
  address_full TEXT,
  city TEXT NOT NULL,
  neighborhood TEXT,

  phone_e164 TEXT,                   -- Format +212XXXXXXXXX
  website_url TEXT,
  email TEXT,
  google_maps_url TEXT,

  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),

  opening_hours JSONB,
  price_range TEXT,                  -- €, €€, €€€, €€€€

  tags TEXT[],                       -- terrasse, vue, familial, etc.
  social_links JSONB,                -- {instagram, facebook, tiktok, whatsapp}
  photos JSONB,                      -- [{url, source, credit, hash}]

  -- Métadonnées sources
  sources JSONB NOT NULL,            -- [{source, source_url, external_id, fetched_at}]
  payload_raw JSONB,                 -- Données brutes originales (debug)

  -- Déduplication
  dedupe_candidates JSONB,           -- [{establishment_id, staging_id, score, reasons}]
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),

  -- Workflow
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'approved', 'rejected', 'imported')),
  reviewer_id TEXT,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Lien vers établissement créé (après validation)
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,

  -- Batch d'import
  import_batch_id UUID REFERENCES establishment_import_batches(id) ON DELETE SET NULL,

  -- Erreurs
  error_reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE establishment_import_staging IS 'Staging des établissements importés avant validation humaine';

-- =============================================
-- 3. INDEX POUR RECHERCHE ET PERFORMANCE
-- =============================================

-- Index de base
CREATE INDEX IF NOT EXISTS idx_staging_name_normalized ON establishment_import_staging(name_normalized);
CREATE INDEX IF NOT EXISTS idx_staging_city ON establishment_import_staging(city);
CREATE INDEX IF NOT EXISTS idx_staging_status ON establishment_import_staging(status);
CREATE INDEX IF NOT EXISTS idx_staging_batch ON establishment_import_staging(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_staging_confidence ON establishment_import_staging(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_staging_category ON establishment_import_staging(category);
CREATE INDEX IF NOT EXISTS idx_staging_created ON establishment_import_staging(created_at DESC);

-- Index GIN pour recherche par similarité (déduplication)
CREATE INDEX IF NOT EXISTS idx_staging_name_trgm ON establishment_import_staging
  USING gin(name_normalized gin_trgm_ops);

-- Index composite pour déduplication rapide
CREATE INDEX IF NOT EXISTS idx_staging_city_name ON establishment_import_staging(city, name_normalized);

-- Index pour batches
CREATE INDEX IF NOT EXISTS idx_batches_status ON establishment_import_batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created ON establishment_import_batches(created_at DESC);

-- =============================================
-- 4. TABLE LOGS D'IMPORT (observabilité)
-- =============================================
CREATE TABLE IF NOT EXISTS establishment_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES establishment_import_batches(id) ON DELETE CASCADE,

  source TEXT NOT NULL,              -- google, tripadvisor, sortiraumaroc, etc.
  source_url TEXT,

  status TEXT NOT NULL               -- success, error, rate_limited, skipped
    CHECK (status IN ('success', 'error', 'rate_limited', 'skipped', 'timeout')),
  response_code INTEGER,
  duration_ms INTEGER,

  items_fetched INTEGER DEFAULT 0,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE establishment_import_logs IS 'Logs détaillés des opérations d''import par source';

CREATE INDEX IF NOT EXISTS idx_import_logs_batch ON establishment_import_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_source ON establishment_import_logs(source);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON establishment_import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_created ON establishment_import_logs(created_at DESC);

-- =============================================
-- 5. FONCTION DE NORMALISATION DU NOM
-- =============================================
CREATE OR REPLACE FUNCTION normalize_establishment_name(input_name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    translate(
      trim(regexp_replace(COALESCE(input_name, ''), '\s+', ' ', 'g')),
      'àâäáãéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ',
      'aaaaaeeeeiiiioooooouuuucnAAAAEEEEIIIIOOOOOUUUUCN'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

COMMENT ON FUNCTION normalize_establishment_name IS 'Normalise un nom: lowercase, sans accents, espaces collapsés';

-- =============================================
-- 6. FONCTION DE CALCUL SIMILARITÉ
-- =============================================
CREATE OR REPLACE FUNCTION calculate_name_similarity(name1 TEXT, name2 TEXT)
RETURNS DECIMAL AS $$
BEGIN
  RETURN similarity(
    normalize_establishment_name(name1),
    normalize_establishment_name(name2)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

COMMENT ON FUNCTION calculate_name_similarity IS 'Calcule la similarité entre deux noms normalisés (0-1)';

-- =============================================
-- 7. TRIGGER MISE À JOUR AUTOMATIQUE
-- =============================================
CREATE OR REPLACE FUNCTION update_staging_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staging_updated ON establishment_import_staging;
CREATE TRIGGER trg_staging_updated
  BEFORE UPDATE ON establishment_import_staging
  FOR EACH ROW
  EXECUTE FUNCTION update_staging_timestamp();

-- =============================================
-- 8. AJOUT COLONNE source_refs SUR ESTABLISHMENTS
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'establishments' AND column_name = 'source_refs'
  ) THEN
    ALTER TABLE establishments ADD COLUMN source_refs JSONB;
    COMMENT ON COLUMN establishments.source_refs IS 'Références sources externes [{source, source_url, external_id, fetched_at}]';
  END IF;
END $$;

-- =============================================
-- 9. CATÉGORIES CHR (enum-like)
-- =============================================
CREATE TABLE IF NOT EXISTS chr_categories (
  slug TEXT PRIMARY KEY,
  name_fr TEXT NOT NULL,
  name_ar TEXT,
  icon TEXT,                         -- Lucide icon name
  universe_slug TEXT DEFAULT 'restaurants',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer les catégories CHR
INSERT INTO chr_categories (slug, name_fr, icon, sort_order) VALUES
  ('restaurant', 'Restaurant', 'utensils', 1),
  ('cafe', 'Café', 'coffee', 2),
  ('bar', 'Bar', 'wine', 3),
  ('rooftop', 'Rooftop', 'cloud', 4),
  ('lounge', 'Lounge', 'sofa', 5),
  ('patisserie', 'Pâtisserie', 'cake', 6),
  ('tea_room', 'Salon de thé', 'leaf', 7),
  ('fast_food', 'Fast-food', 'pizza', 8),
  ('brasserie', 'Brasserie', 'beer', 9),
  ('snack', 'Snack', 'sandwich', 10),
  ('glacier', 'Glacier', 'icecream', 11),
  ('boulangerie', 'Boulangerie', 'croissant', 12),
  ('traiteur', 'Traiteur', 'chef-hat', 13),
  ('food_truck', 'Food Truck', 'truck', 14),
  ('club', 'Club / Discothèque', 'music', 15)
ON CONFLICT (slug) DO UPDATE SET
  name_fr = EXCLUDED.name_fr,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- =============================================
-- 10. SOURCES D'IMPORT CONFIGURABLES
-- =============================================
CREATE TABLE IF NOT EXISTS import_sources (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('api', 'scraper')),
  base_url TEXT,
  rate_limit_per_second DECIMAL DEFAULT 1,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 30000,
  enabled BOOLEAN DEFAULT TRUE,
  config JSONB,                      -- Configuration spécifique
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer les sources (seulement Google et Made In City)
INSERT INTO import_sources (slug, name, type, base_url, rate_limit_per_second, config, enabled) VALUES
  ('google', 'Google Maps', 'api', 'https://maps.googleapis.com/maps/api/place', 10, '{"fields": ["name", "formatted_address", "formatted_phone_number", "website", "geometry", "opening_hours", "photos", "price_level", "rating", "reviews"]}', true),
  ('madeincity', 'Made In City', 'scraper', 'https://madein.city', 0.5, '{"respectRobots": true}', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  base_url = EXCLUDED.base_url,
  rate_limit_per_second = EXCLUDED.rate_limit_per_second,
  config = EXCLUDED.config,
  enabled = EXCLUDED.enabled;

-- Désactiver les anciennes sources
UPDATE import_sources SET enabled = false WHERE slug NOT IN ('google', 'madeincity');

-- =============================================
-- 11. RLS POLICIES (Service Role Only)
-- =============================================
ALTER TABLE establishment_import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishment_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishment_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chr_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sources ENABLE ROW LEVEL SECURITY;

-- Policies pour service role (API serveur)
DO $$
BEGIN
  -- Staging
  DROP POLICY IF EXISTS "Service role full access staging" ON establishment_import_staging;
  CREATE POLICY "Service role full access staging" ON establishment_import_staging
    FOR ALL USING (true);

  -- Batches
  DROP POLICY IF EXISTS "Service role full access batches" ON establishment_import_batches;
  CREATE POLICY "Service role full access batches" ON establishment_import_batches
    FOR ALL USING (true);

  -- Logs
  DROP POLICY IF EXISTS "Service role full access logs" ON establishment_import_logs;
  CREATE POLICY "Service role full access logs" ON establishment_import_logs
    FOR ALL USING (true);

  -- Categories (lecture publique)
  DROP POLICY IF EXISTS "Public read chr_categories" ON chr_categories;
  CREATE POLICY "Public read chr_categories" ON chr_categories
    FOR SELECT USING (true);

  -- Sources (lecture publique)
  DROP POLICY IF EXISTS "Public read import_sources" ON import_sources;
  CREATE POLICY "Public read import_sources" ON import_sources
    FOR SELECT USING (true);
END $$;

-- =============================================
-- 12. VUES UTILES
-- =============================================

-- Vue staging avec stats
CREATE OR REPLACE VIEW v_import_staging_summary AS
SELECT
  city,
  category,
  status,
  COUNT(*) as count,
  AVG(confidence_score) as avg_confidence,
  MIN(created_at) as first_import,
  MAX(created_at) as last_import
FROM establishment_import_staging
GROUP BY city, category, status;

-- Vue batches avec progression
CREATE OR REPLACE VIEW v_import_batch_progress AS
SELECT
  b.*,
  COUNT(s.id) as staging_count,
  COUNT(CASE WHEN s.status = 'new' THEN 1 END) as pending_count,
  COUNT(CASE WHEN s.status = 'approved' THEN 1 END) as approved_count,
  COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) as rejected_count,
  COUNT(CASE WHEN s.status = 'imported' THEN 1 END) as imported_count
FROM establishment_import_batches b
LEFT JOIN establishment_import_staging s ON s.import_batch_id = b.id
GROUP BY b.id;

-- =============================================
-- DONE
-- =============================================
