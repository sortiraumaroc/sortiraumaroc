-- Add image_url field to universes table for custom hero images
-- Rule: If ALL universes have an image, show images; otherwise show icons for all

ALTER TABLE universes ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN universes.image_url IS 'Optional hero image URL for this universe. If ALL universes have images, images are displayed instead of icons.';
