-- Support System Enhancements
-- Adds: ticket_number, internal_notes, agent status, Realtime publication, timer columns

BEGIN;

-- ============================================================================
-- 1. TICKET NUMBER (TK-YYYY-XXXX format)
-- ============================================================================

-- Sequence for ticket numbers (starting at 1000 to get 4-digit numbers)
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq START WITH 1000;

-- Add ticket_number column
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT UNIQUE;

-- Function to auto-generate TK-YYYY-XXXX
CREATE OR REPLACE FUNCTION generate_support_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INTEGER;
  year_str TEXT;
BEGIN
  IF NEW.ticket_number IS NULL THEN
    seq_val := nextval('support_ticket_number_seq');
    year_str := EXTRACT(YEAR FROM NOW())::TEXT;
    NEW.ticket_number := 'TK-' || year_str || '-' || LPAD(seq_val::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_ticket_number ON support_tickets;
CREATE TRIGGER trigger_support_ticket_number
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION generate_support_ticket_number();

-- Backfill existing tickets that don't have a number
DO $$
DECLARE
  r RECORD;
  seq_val INTEGER;
  year_str TEXT;
BEGIN
  FOR r IN SELECT id, created_at FROM support_tickets WHERE ticket_number IS NULL ORDER BY created_at ASC
  LOOP
    seq_val := nextval('support_ticket_number_seq');
    year_str := EXTRACT(YEAR FROM r.created_at)::TEXT;
    UPDATE support_tickets SET ticket_number = 'TK-' || year_str || '-' || LPAD(seq_val::TEXT, 4, '0') WHERE id = r.id;
  END LOOP;
END;
$$;

-- ============================================================================
-- 2. INTERNAL NOTES (persistent, separate from messages)
-- ============================================================================

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS internal_notes TEXT DEFAULT '';

-- ============================================================================
-- 3. SUPPORT AGENT STATUS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_agent_status (
  agent_id UUID PRIMARY KEY,
  agent_name TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support_agent_status ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CHAT SESSION ENHANCEMENTS (for 5-min timer)
-- ============================================================================

-- Track when client last sent a message (for timer)
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS last_client_message_at TIMESTAMPTZ;

-- Track when admin last responded (for timer)
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS last_admin_response_at TIMESTAMPTZ;

-- Track if the 5-min timeout message has been sent (avoid duplicates)
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS timeout_message_sent BOOLEAN DEFAULT false;

-- ============================================================================
-- 5. EMAIL NOTIFICATION TRACKING (avoid spamming)
-- ============================================================================

-- Track last email sent for a ticket to avoid duplicate emails
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_email_notified_at TIMESTAMPTZ;
ALTER TABLE support_chat_sessions ADD COLUMN IF NOT EXISTS last_email_notified_at TIMESTAMPTZ;

-- ============================================================================
-- 6. SUPABASE REALTIME PUBLICATION
-- ============================================================================

-- Add support tables to realtime publication
-- (safe: IF NOT EXISTS is not supported, so we use DO block)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_chat_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication
  END;
END;
$$;

-- ============================================================================
-- 7. INDEX for timer query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_support_chat_sessions_timeout
  ON support_chat_sessions(status, last_client_message_at)
  WHERE status = 'active' AND timeout_message_sent = false;

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
  ON support_tickets(ticket_number);

COMMIT;
