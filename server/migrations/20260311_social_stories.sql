-- Migration: Social Stories
-- Created: 2026-03-11

-- 1. social_stories
CREATE TABLE IF NOT EXISTS public.social_stories (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 TEXT        NOT NULL,
  caption                 TEXT,
  location                TEXT,
  category                TEXT        CHECK (category IN ('restaurant','wellness','culture','sport','shopping','hotel','car')),
  is_partnership          BOOLEAN     DEFAULT false,
  partner_establishment_id UUID       REFERENCES public.establishments(id) ON DELETE SET NULL,
  partner_name            TEXT,
  is_active               BOOLEAN     DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  expires_at              TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  views_count             INT         DEFAULT 0
);

-- 2. social_story_images
CREATE TABLE IF NOT EXISTS public.social_story_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      UUID        NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  image_url     TEXT        NOT NULL,
  display_order INT         DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. social_story_views
CREATE TABLE IF NOT EXISTS public.social_story_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   UUID        NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  viewer_id  TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT social_story_views_unique UNIQUE (story_id, viewer_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_social_stories_user_id
  ON public.social_stories(user_id);

CREATE INDEX IF NOT EXISTS idx_social_stories_expires_at
  ON public.social_stories(expires_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_social_story_images_story_id
  ON public.social_story_images(story_id);

CREATE INDEX IF NOT EXISTS idx_social_story_views_story_id
  ON public.social_story_views(story_id);

CREATE INDEX IF NOT EXISTS idx_social_story_views_viewer
  ON public.social_story_views(viewer_id);

-- 5. RLS
ALTER TABLE public.social_stories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_views  ENABLE ROW LEVEL SECURITY;

DO $body$
BEGIN
  -- social_stories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'social_stories'
      AND policyname  = 'social_stories_service_role_all'
  ) THEN
    CREATE POLICY social_stories_service_role_all
      ON public.social_stories
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  -- social_story_images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'social_story_images'
      AND policyname  = 'social_story_images_service_role_all'
  ) THEN
    CREATE POLICY social_story_images_service_role_all
      ON public.social_story_images
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  -- social_story_views
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'social_story_views'
      AND policyname  = 'social_story_views_service_role_all'
  ) THEN
    CREATE POLICY social_story_views_service_role_all
      ON public.social_story_views
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$body$;
