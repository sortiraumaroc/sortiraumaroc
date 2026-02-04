-- ============================================================================
-- Migration: Add establishment link to home_videos
-- Date: 2026-02-01
-- Description: Adds optional establishment_id to link videos to establishments
-- ============================================================================

-- Add establishment_id column to home_videos
ALTER TABLE public.home_videos
ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_home_videos_establishment
ON public.home_videos (establishment_id)
WHERE establishment_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.home_videos.establishment_id IS 'Optional link to an establishment - clicking the video can navigate to establishment page';
