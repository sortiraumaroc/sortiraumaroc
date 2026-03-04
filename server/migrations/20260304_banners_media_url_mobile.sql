-- Add mobile-specific media URL for responsive banner images
-- Desktop: media_url (1200x625)
-- Mobile: media_url_mobile (800x800)

ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS media_url_mobile TEXT DEFAULT NULL;

COMMENT ON COLUMN banners.media_url_mobile IS 'Image URL for mobile (800x800). Falls back to media_url if NULL.';
