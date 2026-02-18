-- =============================================================================
-- MIGRATION: Admin Notifications Table
-- Date: 2026-02-18
-- Description: Creates admin_notifications table if not exists, ensures correct schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast unread count
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

-- Index for list queries
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications (created_at DESC);

-- If the table already exists but has 'message' instead of 'body', rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'message'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'body'
  ) THEN
    ALTER TABLE public.admin_notifications RENAME COLUMN message TO body;
  END IF;
END $$;

-- If the table has 'metadata' instead of 'data', rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'metadata'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'data'
  ) THEN
    ALTER TABLE public.admin_notifications RENAME COLUMN metadata TO data;
  END IF;
END $$;

-- Ensure body column exists (in case table was created with different schema)
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

COMMENT ON TABLE public.admin_notifications IS 'Admin notifications — visible in the admin dashboard bell icon';
