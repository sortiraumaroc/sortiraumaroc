-- Migration: Add wizard-related columns to establishments table
-- Date: 2026-02-09
-- Description: Adds columns required by the admin wizard for creating
--              establishment listings: admin authorship tracking,
--              Google Maps URL, and top-level category.

-- Name of the admin collaborator who created the listing via the wizard
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_created_by_name text;

-- UUID of the admin collaborator who created the listing via the wizard
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_created_by_id uuid;

-- Google Maps URL for the establishment (copy-pasted from Google Maps)
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS google_maps_url text;

-- Top-level category of the establishment (parent of subcategory,
-- e.g. "restaurant", "cafe", "bar", "rooftop", "patisserie", etc.)
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS category text;

-- Logo URL for the establishment (square image, 200x200px or larger).
-- Used on pro profile photo, loyalty cards, and public establishment pages.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Name of the admin collaborator who last updated the listing
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_updated_by_name text;

-- UUID of the admin collaborator who last updated the listing
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS admin_updated_by_id uuid;

-- Cover image URL for the establishment (main hero image).
-- Used on homepage cards, results cards, and establishment detail page.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS cover_url text;

-- Gallery image URLs for the establishment (additional photos).
-- Array of public URLs stored in Supabase Storage.
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS gallery_urls text[];
