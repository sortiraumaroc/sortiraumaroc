-- ============================================================================
-- Migration: Add custom thumbnail to home_videos
-- Date: 2026-02-01
-- Description: Adds thumbnail_url for custom video cover images
-- Recommended: 640x360px (16:9 ratio), max 500KB
-- ============================================================================

-- Add thumbnail_url column to home_videos
ALTER TABLE public.home_videos
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add comment
COMMENT ON COLUMN public.home_videos.thumbnail_url IS 'Custom thumbnail image URL (640x360px, max 500KB). If null, YouTube thumbnail is used.';

-- Create storage bucket for video thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('video-thumbnails', 'video-thumbnails', true, 512000)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY IF NOT EXISTS "Public read access for video thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-thumbnails');

-- Allow admin upload
CREATE POLICY IF NOT EXISTS "Admin upload access for video thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'video-thumbnails');

-- Allow admin delete
CREATE POLICY IF NOT EXISTS "Admin delete access for video thumbnails"
ON storage.objects FOR DELETE
USING (bucket_id = 'video-thumbnails');
