-- =============================================================================
-- MIGRATION: CE Notifications Table
-- Date: 2026-02-19
-- Description: Creates ce_notifications table for company admin notification system
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ce_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'info',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast list queries scoped by company
CREATE INDEX IF NOT EXISTS idx_ce_notifications_company_created
  ON public.ce_notifications (company_id, created_at DESC);

-- Index for fast unread count
CREATE INDEX IF NOT EXISTS idx_ce_notifications_unread
  ON public.ce_notifications (company_id, created_at DESC)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.ce_notifications IS 'CE company admin notifications — visible in the CE dashboard bell icon';
