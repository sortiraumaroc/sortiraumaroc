-- Consumer User TOTP System
-- QR codes dynamiques personnels pour utilisateurs SAM
-- Rotation toutes les 30 secondes (anti-fraude)

BEGIN;

-- ============================================================================
-- Table: consumer_user_totp_secrets
-- Stocke les secrets TOTP par utilisateur
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consumer_user_totp_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.consumer_users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,                    -- Base32 encoded secret
  algorithm TEXT NOT NULL DEFAULT 'SHA1',  -- SHA1, SHA256, SHA512
  digits INT NOT NULL DEFAULT 6,           -- Number of digits in OTP
  period INT NOT NULL DEFAULT 30,          -- Time period in seconds
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  validation_count INT NOT NULL DEFAULT 0
);

-- Index pour lookup rapide par user_id
CREATE INDEX IF NOT EXISTS idx_consumer_totp_user
  ON public.consumer_user_totp_secrets(user_id);

-- Index pour trouver le secret actif
CREATE INDEX IF NOT EXISTS idx_consumer_totp_active
  ON public.consumer_user_totp_secrets(user_id, is_active)
  WHERE is_active = true;

-- Contrainte: un seul secret actif par utilisateur
-- Note: PostgreSQL partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumer_totp_unique_active
  ON public.consumer_user_totp_secrets(user_id)
  WHERE is_active = true;

-- ============================================================================
-- Table: consumer_totp_validation_logs
-- Logs de validation pour anti-fraude et analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consumer_totp_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  secret_id UUID REFERENCES public.consumer_user_totp_secrets(id) ON DELETE SET NULL,
  establishment_id UUID,                   -- Établissement où le scan a eu lieu
  submitted_code TEXT NOT NULL,            -- Code soumis par le scanner
  expected_code TEXT,                      -- Code attendu (pour debug)
  is_valid BOOLEAN NOT NULL,
  rejection_reason TEXT,                   -- 'invalid_code', 'expired', 'wrong_user', etc.
  time_window INT,                         -- -1, 0, 1 (période TOTP)
  validated_by_user_id TEXT,               -- ID du Pro qui a scanné
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour historique par utilisateur
CREATE INDEX IF NOT EXISTS idx_consumer_totp_logs_user
  ON public.consumer_totp_validation_logs(user_id, created_at DESC);

-- Index pour historique par établissement
CREATE INDEX IF NOT EXISTS idx_consumer_totp_logs_establishment
  ON public.consumer_totp_validation_logs(establishment_id, created_at DESC);

-- Index pour les validations du jour (dashboard Pro)
CREATE INDEX IF NOT EXISTS idx_consumer_totp_logs_today
  ON public.consumer_totp_validation_logs(created_at DESC)
  WHERE created_at > now() - INTERVAL '24 hours';

-- ============================================================================
-- RLS Policies (Row Level Security)
-- ============================================================================

-- Activer RLS
ALTER TABLE public.consumer_user_totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumer_totp_validation_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Les utilisateurs ne peuvent voir que leurs propres secrets
CREATE POLICY consumer_totp_secrets_user_select
  ON public.consumer_user_totp_secrets
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Policy: Seul le service role peut insérer/modifier les secrets
CREATE POLICY consumer_totp_secrets_service_all
  ON public.consumer_user_totp_secrets
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Policy: Les utilisateurs peuvent voir leurs propres logs
CREATE POLICY consumer_totp_logs_user_select
  ON public.consumer_totp_validation_logs
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Policy: Service role peut tout faire sur les logs
CREATE POLICY consumer_totp_logs_service_all
  ON public.consumer_totp_validation_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Vue: consumer_totp_stats
-- Statistiques TOTP par utilisateur (pour admin)
-- ============================================================================

CREATE OR REPLACE VIEW public.admin_consumer_totp_stats AS
SELECT
  s.user_id,
  u.full_name as user_name,
  u.email as user_email,
  s.created_at as secret_created_at,
  s.last_used_at,
  s.validation_count,
  (
    SELECT COUNT(*)
    FROM public.consumer_totp_validation_logs l
    WHERE l.user_id = s.user_id AND l.is_valid = true
  ) as successful_validations,
  (
    SELECT COUNT(*)
    FROM public.consumer_totp_validation_logs l
    WHERE l.user_id = s.user_id AND l.is_valid = false
  ) as failed_validations,
  (
    SELECT MAX(l.created_at)
    FROM public.consumer_totp_validation_logs l
    WHERE l.user_id = s.user_id AND l.is_valid = true
  ) as last_successful_validation
FROM public.consumer_user_totp_secrets s
JOIN public.consumer_users u ON u.id = s.user_id
WHERE s.is_active = true;

COMMIT;
