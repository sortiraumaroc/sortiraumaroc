-- Migration: Add cover_url to packs table
-- Date: 2026-02-05
-- Description: Adds cover image URL field to packs for displaying visual covers in packs & promotions

-- Add cover_url column to packs table
ALTER TABLE packs ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Add comment
COMMENT ON COLUMN packs.cover_url IS 'URL of the pack cover image stored in pro-inventory-images bucket';
