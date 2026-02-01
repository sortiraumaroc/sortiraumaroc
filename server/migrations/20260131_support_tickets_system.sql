-- Support Tickets System
-- Tables for support tickets and chat messages connected to admin interface

-- ============================================================================
-- SUPPORT TICKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Creator info (can be consumer user, pro user, or anonymous)
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_role TEXT NOT NULL DEFAULT 'user' CHECK (created_by_role IN ('user', 'pro', 'admin')),

  -- Optional establishment context (for pro users)
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,

  -- Ticket details
  subject TEXT NOT NULL CHECK (char_length(subject) >= 1 AND char_length(subject) <= 200),
  body TEXT NOT NULL CHECK (char_length(body) >= 1),
  category TEXT NOT NULL DEFAULT 'autre' CHECK (category IN (
    'reservations', 'annulation', 'paiement_facturation',
    'compte', 'technique', 'partenaires', 'autre'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'in_progress', 'closed')),

  -- Contact info (for non-authenticated users)
  contact_email TEXT,
  contact_name TEXT,

  -- Attachments stored as JSON array
  attachments JSONB DEFAULT '[]'::jsonb,

  -- Admin assignment (no FK - admin_collaborators table may not exist yet)
  assigned_to_collaborator_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by_user_id ON support_tickets(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_establishment_id ON support_tickets(establishment_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to_collaborator_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trigger_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_updated_at();

-- ============================================================================
-- SUPPORT TICKET MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

  -- Sender info
  from_role TEXT NOT NULL CHECK (from_role IN ('user', 'pro', 'admin')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_collaborator_id UUID,

  -- Message content
  body TEXT NOT NULL CHECK (char_length(body) >= 1),

  -- Internal note (only visible to admins)
  is_internal BOOLEAN NOT NULL DEFAULT false,

  -- Attachments
  attachments JSONB DEFAULT '[]'::jsonb,

  -- Read status
  read_by_user_at TIMESTAMPTZ,
  read_by_admin_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_created_at ON support_ticket_messages(created_at);

-- ============================================================================
-- SUPPORT CHAT SESSIONS TABLE (for real-time chat)
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User info
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT NOT NULL DEFAULT 'user' CHECK (user_role IN ('user', 'pro')),

  -- Optional establishment context
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,

  -- Session status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),

  -- Contact info for anonymous users
  contact_email TEXT,
  contact_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_chat_sessions_user_id ON support_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_sessions_status ON support_chat_sessions(status);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_support_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_chat_sessions_updated_at ON support_chat_sessions;
CREATE TRIGGER trigger_support_chat_sessions_updated_at
  BEFORE UPDATE ON support_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_support_chat_sessions_updated_at();

-- ============================================================================
-- SUPPORT CHAT MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES support_chat_sessions(id) ON DELETE CASCADE,

  -- Sender
  from_role TEXT NOT NULL CHECK (from_role IN ('user', 'pro', 'admin', 'system')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_collaborator_id UUID,

  -- Message content
  body TEXT NOT NULL CHECK (char_length(body) >= 1),

  -- Message type (for system messages like "Agent joined", "Chat closed")
  message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'system', 'auto_reply')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_session_id ON support_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_created_at ON support_chat_messages(created_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_chat_messages ENABLE ROW LEVEL SECURITY;

-- Support tickets: users can see their own tickets
DROP POLICY IF EXISTS support_tickets_select_own ON support_tickets;
CREATE POLICY support_tickets_select_own ON support_tickets
  FOR SELECT
  USING (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_insert_own ON support_tickets;
CREATE POLICY support_tickets_insert_own ON support_tickets
  FOR INSERT
  WITH CHECK (created_by_user_id = auth.uid() OR created_by_user_id IS NULL);

-- Support ticket messages: users can see messages on their own tickets
DROP POLICY IF EXISTS support_ticket_messages_select_own ON support_ticket_messages;
CREATE POLICY support_ticket_messages_select_own ON support_ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_ticket_messages.ticket_id
      AND support_tickets.created_by_user_id = auth.uid()
    )
    AND is_internal = false
  );

DROP POLICY IF EXISTS support_ticket_messages_insert_own ON support_ticket_messages;
CREATE POLICY support_ticket_messages_insert_own ON support_ticket_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_ticket_messages.ticket_id
      AND support_tickets.created_by_user_id = auth.uid()
    )
  );

-- Chat sessions: users can see their own sessions
DROP POLICY IF EXISTS support_chat_sessions_select_own ON support_chat_sessions;
CREATE POLICY support_chat_sessions_select_own ON support_chat_sessions
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_chat_sessions_insert_own ON support_chat_sessions;
CREATE POLICY support_chat_sessions_insert_own ON support_chat_sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Chat messages: users can see messages in their own sessions
DROP POLICY IF EXISTS support_chat_messages_select_own ON support_chat_messages;
CREATE POLICY support_chat_messages_select_own ON support_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_chat_sessions
      WHERE support_chat_sessions.id = support_chat_messages.session_id
      AND support_chat_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_chat_messages_insert_own ON support_chat_messages;
CREATE POLICY support_chat_messages_insert_own ON support_chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_chat_sessions
      WHERE support_chat_sessions.id = support_chat_messages.session_id
      AND support_chat_sessions.user_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get ticket reference number
CREATE OR REPLACE FUNCTION get_support_ticket_reference(ticket_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN '#' || UPPER(SUBSTRING(ticket_id::text FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to count unread messages for a ticket (for user)
CREATE OR REPLACE FUNCTION count_unread_ticket_messages_for_user(p_ticket_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM support_ticket_messages
    WHERE ticket_id = p_ticket_id
    AND from_role = 'admin'
    AND is_internal = false
    AND read_by_user_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to count unread messages for a ticket (for admin)
CREATE OR REPLACE FUNCTION count_unread_ticket_messages_for_admin(p_ticket_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM support_ticket_messages
    WHERE ticket_id = p_ticket_id
    AND from_role IN ('user', 'pro')
    AND read_by_admin_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;
