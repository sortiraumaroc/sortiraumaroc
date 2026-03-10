-- =============================================================================
-- PROGRAMME AMBASSADEURS
-- =============================================================================
-- Tables: ambassador_programs, ambassador_applications, post_tracking_tokens,
--         post_conversions, ambassador_rewards
-- =============================================================================
-- Système d'affiliation sociale : un abonné rejoint le programme ambassadeur
-- d'un établissement, publie du contenu en le taguant. Ses followers cliquent,
-- réservent, l'établissement confirme la présence. Au seuil atteint, récompense.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TABLE: ambassador_programs (Programmes par établissement)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ambassador_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- L'établissement propriétaire du programme
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Description de la récompense (ex: "Un dîner pour 2")
  reward_description TEXT NOT NULL,

  -- Nombre de conversions nécessaires pour débloquer la récompense
  conversions_required INT NOT NULL CHECK (conversions_required >= 1 AND conversions_required <= 100),

  -- Durée de validité de la récompense une fois débloquée (en jours)
  validity_days INT NOT NULL CHECK (validity_days >= 1 AND validity_days <= 365),

  -- Nombre max de bénéficiaires par mois (null = illimité)
  max_beneficiaries_per_month INT CHECK (max_beneficiaries_per_month IS NULL OR max_beneficiaries_per_month >= 1),

  -- Mode de confirmation de présence
  confirmation_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (confirmation_mode IN ('manual', 'qr')),

  -- Statut du programme
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Date d'expiration du programme (null = pas d'expiration)
  expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul programme actif par établissement (géré par index partiel)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ambassador_programs_one_active
  ON public.ambassador_programs(establishment_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ambassador_programs_establishment
  ON public.ambassador_programs(establishment_id);

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ambassador_programs_updated_at') THEN
      CREATE TRIGGER trg_ambassador_programs_updated_at
        BEFORE UPDATE ON public.ambassador_programs
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

ALTER TABLE public.ambassador_programs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ambassador_programs IS
  'Programmes ambassadeurs créés par les établissements (un seul actif par établissement)';
COMMENT ON COLUMN public.ambassador_programs.confirmation_mode IS
  'manual = confirmation depuis le dashboard, qr = scan QR du client';


-- ---------------------------------------------------------------------------
-- 2. TABLE: ambassador_applications (Candidatures des utilisateurs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ambassador_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Programme visé
  program_id UUID NOT NULL REFERENCES public.ambassador_programs(id) ON DELETE CASCADE,

  -- Utilisateur candidat (Supabase auth UID = TEXT)
  user_id TEXT NOT NULL,

  -- Statut de la candidature
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),

  -- Message de motivation optionnel
  motivation TEXT,

  -- Timestamps candidature
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Modération
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,  -- staff user_id qui a reviewé
  rejection_reason TEXT,

  -- Un utilisateur ne peut postuler qu'une fois par programme
  CONSTRAINT ambassador_applications_unique_user UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ambassador_applications_program
  ON public.ambassador_applications(program_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_user
  ON public.ambassador_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_status
  ON public.ambassador_applications(program_id, status);
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_pending
  ON public.ambassador_applications(applied_at) WHERE status = 'pending';

ALTER TABLE public.ambassador_applications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ambassador_applications IS
  'Candidatures des utilisateurs aux programmes ambassadeurs';
COMMENT ON COLUMN public.ambassador_applications.status IS
  'pending=en attente, accepted=acceptée, rejected=refusée';


-- ---------------------------------------------------------------------------
-- 3. TABLE: post_tracking_tokens (Clics sur publications ambassadeurs)
-- ---------------------------------------------------------------------------
-- Attribution last-click : le dernier clic avant une réservation est crédité.
-- Fenêtre d'attribution : 30 jours après le clic.

CREATE TABLE IF NOT EXISTS public.post_tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Post social qui a été cliqué (pas de FK car système social en développement)
  post_id UUID,

  -- Ambassadeur qui a publié le post
  author_id TEXT NOT NULL,

  -- Follower qui a cliqué sur le post
  visitor_id TEXT NOT NULL,

  -- Établissement tagué dans le post
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,

  -- Timestamp du clic
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Réservation éventuellement associée (rempli quand le visitor réserve)
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,

  -- Expiration du token (clicked_at + 30 jours)
  expires_at TIMESTAMPTZ NOT NULL,

  -- Anti-fraude : IP et device fingerprint
  ip_address TEXT,
  device_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_tracking_tokens_author
  ON public.post_tracking_tokens(author_id);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_visitor
  ON public.post_tracking_tokens(visitor_id);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_visitor_est
  ON public.post_tracking_tokens(visitor_id, establishment_id);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_expires
  ON public.post_tracking_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_reservation
  ON public.post_tracking_tokens(reservation_id) WHERE reservation_id IS NOT NULL;
-- Index pour l'attribution last-click : dernier clic actif d'un visitor pour un établissement
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_last_click
  ON public.post_tracking_tokens(visitor_id, establishment_id, clicked_at DESC)
  WHERE reservation_id IS NULL AND expires_at > NOW();

ALTER TABLE public.post_tracking_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.post_tracking_tokens IS
  'Tokens de tracking des clics sur publications d''ambassadeurs (attribution last-click, 30j)';
COMMENT ON COLUMN public.post_tracking_tokens.post_id IS
  'UUID du post social (social_posts.id). Pas de FK car le système social est en développement actif.';


-- ---------------------------------------------------------------------------
-- 4. TABLE: post_conversions (Conversions confirmées)
-- ---------------------------------------------------------------------------
-- Une conversion = 1 clic sur un post + 1 réservation + 1 présence confirmée.
-- Sans confirmation de présence dans les 48h → statut 'expired'.

CREATE TABLE IF NOT EXISTS public.post_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Token de tracking qui a déclenché la conversion
  token_id UUID NOT NULL REFERENCES public.post_tracking_tokens(id) ON DELETE CASCADE,

  -- Snapshot du post_id au moment de la conversion
  post_id UUID,

  -- Ambassadeur crédité
  ambassador_id TEXT NOT NULL,

  -- Visiteur qui a réservé
  visitor_id TEXT NOT NULL,

  -- Réservation concernée
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,

  -- Programme ambassadeur concerné
  program_id UUID NOT NULL REFERENCES public.ambassador_programs(id) ON DELETE CASCADE,

  -- Établissement
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Statut de la conversion
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),

  -- Confirmation de présence
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,  -- staff user_id
  confirmation_mode TEXT CHECK (confirmation_mode IS NULL OR confirmation_mode IN ('manual', 'qr')),

  -- Anti-fraude
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  suspicious_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversions_ambassador
  ON public.post_conversions(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_conversions_program
  ON public.post_conversions(program_id);
CREATE INDEX IF NOT EXISTS idx_conversions_establishment
  ON public.post_conversions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_conversions_status
  ON public.post_conversions(status);
CREATE INDEX IF NOT EXISTS idx_conversions_ambassador_program
  ON public.post_conversions(ambassador_id, program_id, status);
CREATE INDEX IF NOT EXISTS idx_conversions_pending_expiry
  ON public.post_conversions(created_at) WHERE status = 'pending';
-- Empêcher la double conversion pour la même réservation
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversions_unique_reservation
  ON public.post_conversions(reservation_id);

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_post_conversions_updated_at') THEN
      CREATE TRIGGER trg_post_conversions_updated_at
        BEFORE UPDATE ON public.post_conversions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

ALTER TABLE public.post_conversions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.post_conversions IS
  'Conversions confirmées : clic sur un post + réservation + présence confirmée';
COMMENT ON COLUMN public.post_conversions.status IS
  'pending=en attente de confirmation, confirmed=présence confirmée, rejected=absent, expired=délai 48h dépassé';


-- ---------------------------------------------------------------------------
-- 5. TABLE: ambassador_rewards (Récompenses débloquées)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ambassador_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Programme et ambassadeur
  program_id UUID NOT NULL REFERENCES public.ambassador_programs(id) ON DELETE CASCADE,
  ambassador_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Date de déverrouillage
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Expiration (unlocked_at + programme.validity_days)
  expires_at TIMESTAMPTZ NOT NULL,

  -- Code unique pour présenter à l'établissement (ex: SAM-X7K2-9P)
  claim_code VARCHAR(20) NOT NULL UNIQUE,

  -- Token QR unique pour le scan
  qr_reward_token UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Consommation de la récompense
  claimed_at TIMESTAMPTZ,
  claim_confirmed_by TEXT,  -- staff user_id qui a scanné/confirmé

  -- Statut
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'claimed', 'expired')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_ambassador
  ON public.ambassador_rewards(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_program
  ON public.ambassador_rewards(program_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_establishment
  ON public.ambassador_rewards(establishment_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_status
  ON public.ambassador_rewards(status);
CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_claim_code
  ON public.ambassador_rewards(claim_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ambassador_rewards_qr_token
  ON public.ambassador_rewards(qr_reward_token);
CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_expires
  ON public.ambassador_rewards(expires_at) WHERE status = 'active';
-- Limiter les récompenses par ambassadeur par programme (pour max_beneficiaries_per_month)
CREATE INDEX IF NOT EXISTS idx_ambassador_rewards_ambassador_program
  ON public.ambassador_rewards(ambassador_id, program_id, unlocked_at);

ALTER TABLE public.ambassador_rewards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ambassador_rewards IS
  'Récompenses débloquées pour les ambassadeurs ayant atteint le seuil de conversions';
COMMENT ON COLUMN public.ambassador_rewards.claim_code IS
  'Code unique type SAM-X7K2-9P à présenter à l''établissement';

COMMIT;
