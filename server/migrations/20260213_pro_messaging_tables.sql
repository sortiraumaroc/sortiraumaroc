-- =============================================================================
-- Migration: Pro Messaging Tables
-- Date: 2026-02-13
-- Description: Version-controlled schema for pro_conversations, pro_messages,
--              pro_auto_reply_settings, and message-attachments bucket.
--              These tables may already exist (created manually).
--              Using IF NOT EXISTS to be safe.
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: pro_conversations
-- One conversation per reservation, linking pro <-> client messaging
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing conversations by establishment
CREATE INDEX IF NOT EXISTS idx_pro_conversations_establishment
  ON public.pro_conversations(establishment_id, updated_at DESC);

-- Index for finding conversation by reservation
CREATE INDEX IF NOT EXISTS idx_pro_conversations_reservation
  ON public.pro_conversations(establishment_id, reservation_id);

-- Enable RLS
ALTER TABLE public.pro_conversations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABLE: pro_messages
-- Individual messages within a conversation
-- from_role: 'pro' (establishment), 'client' (consumer), 'auto' (auto-reply)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pro_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.pro_conversations(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL CHECK (from_role IN ('pro', 'client', 'user', 'auto')),
  body TEXT NOT NULL DEFAULT '',
  sender_user_id UUID,
  read_by_pro_at TIMESTAMPTZ,
  read_by_client_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing messages in a conversation
CREATE INDEX IF NOT EXISTS idx_pro_messages_conversation
  ON public.pro_messages(establishment_id, conversation_id, created_at ASC);

-- Index for realtime: filter by establishment_id (used by Supabase Realtime)
CREATE INDEX IF NOT EXISTS idx_pro_messages_establishment
  ON public.pro_messages(establishment_id, created_at DESC);

-- Index for mark-read: find unread non-pro messages
CREATE INDEX IF NOT EXISTS idx_pro_messages_unread
  ON public.pro_messages(establishment_id, conversation_id, from_role)
  WHERE read_by_pro_at IS NULL;

-- Enable RLS
ALTER TABLE public.pro_messages ENABLE ROW LEVEL SECURITY;

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

-- =============================================================================
-- Enable Realtime on pro_messages for live message updates
-- =============================================================================

-- Add pro_messages to the Supabase Realtime publication
-- (safe to run even if already added — will just warn)
DO $$
BEGIN
  -- Check if table is already in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'pro_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pro_messages;
  END IF;
END $$;

-- =============================================================================
-- Storage bucket for message attachments
-- =============================================================================

-- Note: Supabase Storage buckets are created via the dashboard or API,
-- not via SQL. The bucket 'message-attachments' should be created in
-- Supabase Dashboard > Storage with the following settings:
--   - Name: message-attachments
--   - Public: true (so URLs can be shared in messages)
--   - File size limit: 5MB
--   - Allowed MIME types: image/*, application/pdf, application/msword,
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document

-- Create the bucket via SQL (Supabase extension)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated uploads
CREATE POLICY IF NOT EXISTS "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-attachments');

-- Storage policy: allow public reads
CREATE POLICY IF NOT EXISTS "Allow public reads message-attachments" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'message-attachments');

COMMIT;
