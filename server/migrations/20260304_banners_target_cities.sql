-- Migration: Add target_cities column to banners table for geographic targeting
-- Date: 2026-03-04

ALTER TABLE banners ADD COLUMN IF NOT EXISTS target_cities TEXT[] DEFAULT NULL;
COMMENT ON COLUMN banners.target_cities IS 'Villes ciblées pour le ciblage géographique (NULL = toutes les villes)';

-- Index for efficient filtering on target_cities
CREATE INDEX IF NOT EXISTS idx_banners_target_cities ON banners USING GIN (target_cities) WHERE target_cities IS NOT NULL;
