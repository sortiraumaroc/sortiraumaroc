-- Allow pros to hide Google reviews from their public page
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS hide_google_reviews BOOLEAN NOT NULL DEFAULT FALSE;
