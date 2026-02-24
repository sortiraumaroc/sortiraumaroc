-- ============================================================
-- Module Conciergerie — Tables, indexes, RLS, triggers, seeds
-- MVP: Auth + Journeys + Step requests + "First to accept"
-- Date: 2026-02-22
-- ============================================================
BEGIN;

-- -----------------------------------------------------------
-- 1. concierges (Entités conciergerie : hôtel, riad, agence)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'hotel' CHECK (type IN ('hotel', 'riad', 'agency', 'other')),
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_concierges_status ON public.concierges (status) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 2. concierge_users (Lie auth.users à une conciergerie)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_id UUID NOT NULL REFERENCES public.concierges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'operator')),
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_concierge_user UNIQUE (concierge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_concierge_users_user ON public.concierge_users (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_concierge_users_concierge ON public.concierge_users (concierge_id) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 3. experience_journeys (Parcours regroupant plusieurs étapes)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.experience_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_id UUID NOT NULL REFERENCES public.concierges(id) ON DELETE CASCADE,
  created_by UUID,

  -- Client info
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  client_notes TEXT,
  party_size INTEGER NOT NULL DEFAULT 2,

  -- Journey info
  title TEXT,
  desired_date DATE NOT NULL,
  desired_time_start TEXT,
  desired_time_end TEXT,
  city TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'requesting', 'partially_accepted', 'confirmed', 'cancelled', 'completed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_journeys_concierge ON public.experience_journeys (concierge_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_journeys_status ON public.experience_journeys (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_journeys_desired_date ON public.experience_journeys (desired_date) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 4. journey_steps (Étapes individuelles d'un parcours)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journey_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES public.experience_journeys(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 1,

  -- What
  universe TEXT,
  category TEXT,
  description TEXT,

  -- Budget (centimes MAD)
  budget_min INTEGER,
  budget_max INTEGER,

  -- Result (filled when a pro accepts)
  accepted_establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  confirmed_price INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requesting', 'accepted', 'refused_all', 'cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_steps_journey ON public.journey_steps (journey_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_steps_status ON public.journey_steps (status) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 5. step_requests (Demandes envoyées aux établissements)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.step_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES public.journey_steps(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Request details
  message TEXT,
  party_size INTEGER,
  desired_date DATE,
  desired_time TEXT,
  budget_hint TEXT,

  -- Response
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'refused', 'expired', 'superseded')),
  response_note TEXT,
  proposed_price INTEGER,
  responded_at TIMESTAMPTZ,
  responded_by UUID,

  -- Optimistic locking for "first to accept" race condition
  version INTEGER NOT NULL DEFAULT 1,

  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_step ON public.step_requests (step_id);
CREATE INDEX IF NOT EXISTS idx_requests_establishment ON public.step_requests (establishment_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.step_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_establishment_pending ON public.step_requests (establishment_id, status) WHERE status = 'pending';

-- -----------------------------------------------------------
-- 6. RLS (Row Level Security)
-- -----------------------------------------------------------
ALTER TABLE public.concierges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by the API server)
CREATE POLICY concierges_service_all ON public.concierges FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY concierge_users_service_all ON public.concierge_users FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY experience_journeys_service_all ON public.experience_journeys FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY journey_steps_service_all ON public.journey_steps FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY step_requests_service_all ON public.step_requests FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- 7. updated_at triggers (reuse ce_set_updated_at if exists)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conciergerie_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_concierges_updated_at') THEN
    CREATE TRIGGER trg_concierges_updated_at
      BEFORE UPDATE ON public.concierges
      FOR EACH ROW EXECUTE FUNCTION public.conciergerie_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_concierge_users_updated_at') THEN
    CREATE TRIGGER trg_concierge_users_updated_at
      BEFORE UPDATE ON public.concierge_users
      FOR EACH ROW EXECUTE FUNCTION public.conciergerie_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_experience_journeys_updated_at') THEN
    CREATE TRIGGER trg_experience_journeys_updated_at
      BEFORE UPDATE ON public.experience_journeys
      FOR EACH ROW EXECUTE FUNCTION public.conciergerie_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_journey_steps_updated_at') THEN
    CREATE TRIGGER trg_journey_steps_updated_at
      BEFORE UPDATE ON public.journey_steps
      FOR EACH ROW EXECUTE FUNCTION public.conciergerie_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_step_requests_updated_at') THEN
    CREATE TRIGGER trg_step_requests_updated_at
      BEFORE UPDATE ON public.step_requests
      FOR EACH ROW EXECUTE FUNCTION public.conciergerie_set_updated_at();
  END IF;
END $$;

-- -----------------------------------------------------------
-- 8. Add 'conciergerie' to email_templates audience CHECK
-- -----------------------------------------------------------
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_audience_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_audience_check
  CHECK (audience = ANY (ARRAY['consumer', 'pro', 'finance', 'marketing', 'system', 'conciergerie']));

-- -----------------------------------------------------------
-- 9. Email templates
-- -----------------------------------------------------------
INSERT INTO public.email_templates (key, audience, name, subject_fr, subject_en, body_fr, body_en, cta_label_fr, enabled)
VALUES
  (
    'conciergerie_request_to_pro',
    'pro',
    'Nouvelle demande conciergerie',
    'Nouvelle demande conciergerie — {{journey_title}}',
    'New concierge request — {{journey_title}}',
    E'Bonjour,\n\nVous avez reçu une nouvelle demande de conciergerie :\n\nConciergerie : {{concierge_name}}\nClient : {{client_name}} ({{party_size}} personnes)\nDate souhaitée : {{desired_date}} {{desired_time}}\nDemande : {{step_description}}\nBudget indicatif : {{budget_hint}}\n\n{{message}}\n\nConnectez-vous à votre espace Pro pour accepter ou refuser cette demande.\n\nCordialement,\nL''équipe Sortir Au Maroc',
    E'Hello,\n\nYou have received a new concierge request:\n\nConcierge: {{concierge_name}}\nClient: {{client_name}} ({{party_size}} guests)\nDesired date: {{desired_date}} {{desired_time}}\nRequest: {{step_description}}\nBudget hint: {{budget_hint}}\n\n{{message}}\n\nLog in to your Pro dashboard to accept or decline this request.\n\nBest regards,\nThe Sortir Au Maroc Team',
    'Répondre à la demande',
    TRUE
  ),
  (
    'conciergerie_request_accepted',
    'conciergerie',
    'Demande conciergerie acceptée',
    'Demande acceptée — {{journey_title}}',
    'Request accepted — {{journey_title}}',
    E'Bonjour {{concierge_user_name}},\n\nBonne nouvelle ! Votre demande pour le parcours "{{journey_title}}" a été acceptée :\n\nÉtape : {{step_description}}\nÉtablissement : {{establishment_name}}\nPrix proposé : {{proposed_price}} MAD\nNote : {{response_note}}\n\nConnectez-vous à votre espace Conciergerie pour voir les détails.\n\nCordialement,\nL''équipe Sortir Au Maroc',
    E'Hello {{concierge_user_name}},\n\nGreat news! Your request for the journey "{{journey_title}}" has been accepted:\n\nStep: {{step_description}}\nEstablishment: {{establishment_name}}\nProposed price: {{proposed_price}} MAD\nNote: {{response_note}}\n\nLog in to your Concierge dashboard to see the details.\n\nBest regards,\nThe Sortir Au Maroc Team',
    'Voir le parcours',
    TRUE
  )
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------
-- 10. Add 'conciergerie' to notification_templates module CHECK
-- -----------------------------------------------------------
ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_module_check;
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_module_check
  CHECK (module = ANY (ARRAY['reservation', 'loyalty', 'packs', 'reviews', 'account', 'system', 'marketing', 'wheel', 'ce', 'conciergerie']));

COMMIT;
