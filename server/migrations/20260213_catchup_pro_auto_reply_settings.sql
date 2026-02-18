-- =============================================================================
-- CATCH-UP MIGRATION: Create pro_auto_reply_settings table
-- This table was missing from the partial execution of 20260213_pro_messaging_tables.sql
-- Safe to run multiple times (IF NOT EXISTS)
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: pro_auto_reply_settings
-- Auto-reply configuration per establishment (schedule + vacation mode)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_auto_reply_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL DEFAULT 'Bonjour, merci pour votre message. Nous sommes actuellement indisponibles mais nous vous répondrons dès que possible.',
  start_time TEXT, -- HH:MM format (e.g., '18:00')
  end_time TEXT,   -- HH:MM format (e.g., '09:00')
  days_of_week INTEGER[] DEFAULT '{}', -- 0=Sunday, 6=Saturday
  is_on_vacation BOOLEAN NOT NULL DEFAULT false,
  vacation_start TIMESTAMPTZ,
  vacation_end TIMESTAMPTZ,
  vacation_message TEXT NOT NULL DEFAULT 'Nous sommes actuellement en congés. Nous traiterons votre message à notre retour.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id)
);

-- Enable RLS
ALTER TABLE public.pro_auto_reply_settings ENABLE ROW LEVEL SECURITY;

COMMIT;
