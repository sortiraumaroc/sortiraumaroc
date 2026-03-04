-- ============================================================================
-- Sam AI Assistant — Tables conversations et messages
-- ============================================================================
-- À exécuter dans Supabase SQL Editor (Dashboard > SQL > New query)
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. sam_conversations — une conversation par session utilisateur
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sam_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  language TEXT DEFAULT 'fr',
  started_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  message_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sam_conversations IS 'Conversations de l''assistant IA Sam';
COMMENT ON COLUMN sam_conversations.session_id IS 'ID session anonyme côté client (localStorage)';
COMMENT ON COLUMN sam_conversations.language IS 'Langue détectée : fr, en, ar (darija)';
COMMENT ON COLUMN sam_conversations.metadata IS 'Contexte: ville détectée, univers, préférences inférées';

-- --------------------------------------------------------------------------
-- 2. sam_messages — chaque message de la conversation
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sam_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES sam_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  tool_calls JSONB,
  tool_call_id TEXT,
  tool_name TEXT,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sam_messages IS 'Messages individuels des conversations Sam';
COMMENT ON COLUMN sam_messages.tool_calls IS 'Si role=assistant et GPT appelle des tools: [{id, type, function: {name, arguments}}]';
COMMENT ON COLUMN sam_messages.tool_call_id IS 'Si role=tool: ID du tool call auquel ce message répond';
COMMENT ON COLUMN sam_messages.tool_name IS 'Nom du tool appelé (pour analytics)';

-- --------------------------------------------------------------------------
-- 3. Index
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sam_conversations_user
  ON sam_conversations(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sam_conversations_session
  ON sam_conversations(session_id);

CREATE INDEX IF NOT EXISTS idx_sam_conversations_last_message
  ON sam_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_sam_messages_conversation
  ON sam_messages(conversation_id, created_at);

-- --------------------------------------------------------------------------
-- 4. RLS (service_role bypass, pas de politique publique)
-- --------------------------------------------------------------------------
ALTER TABLE sam_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sam_messages ENABLE ROW LEVEL SECURITY;

COMMIT;
