-- ============================================================
-- Module Partner Agreements (Accords Partenaires)
-- Phase 1 MVP: Agreements, Lines, History
-- Date: 2026-02-22
-- ============================================================
BEGIN;

-- -----------------------------------------------------------
-- 1. partner_agreements (Un accord par établissement)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Statut du cycle de négociation
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'proposal_sent', 'in_negotiation', 'active', 'suspended', 'expired', 'refused')),

  -- Contact de négociation (décideur côté PRO)
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,

  -- Dates de validité
  start_date DATE,
  end_date DATE,

  -- Commission SAM (jamais visible par le PRO)
  commission_rate NUMERIC(5,2),

  -- Notes internes (jamais visibles par le PRO)
  notes TEXT,

  -- Métadonnées
  created_by TEXT,          -- admin user ID qui a créé l'accord
  signed_at TIMESTAMPTZ,    -- date d'acceptation par le PRO
  signed_by TEXT,           -- pro user ID qui a accepté

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Un seul accord actif par établissement (les soft-deleted sont gérés côté applicatif)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_agreements_establishment_unique
  ON public.partner_agreements (establishment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_agreements_status
  ON public.partner_agreements (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_partner_agreements_end_date
  ON public.partner_agreements (end_date) WHERE deleted_at IS NULL AND status = 'active';

-- -----------------------------------------------------------
-- 2. agreement_lines (Lignes d'avantages dans un accord)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agreement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.partner_agreements(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- Module ciblé (CE, Conciergerie, ou les deux)
  module TEXT NOT NULL DEFAULT 'ce'
    CHECK (module IN ('ce', 'conciergerie', 'both')),

  -- Détails de l'avantage (mêmes champs que pro_ce_advantages)
  advantage_type TEXT NOT NULL
    CHECK (advantage_type IN ('percentage', 'fixed', 'special_offer', 'gift', 'pack')),
  advantage_value NUMERIC,
  description TEXT,
  conditions TEXT,

  -- Dates (peuvent différer des dates de l'accord)
  start_date DATE,
  end_date DATE,

  -- Quotas d'utilisation (0 = illimité)
  max_uses_per_employee INTEGER NOT NULL DEFAULT 0,
  max_uses_total INTEGER NOT NULL DEFAULT 0,

  -- Ciblage entreprises CE (identique à pro_ce_advantages)
  target_companies JSONB NOT NULL DEFAULT '"all"'::jsonb,

  -- Commission SAM par ligne (optionnel, override l'accord)
  sam_commission_type TEXT CHECK (sam_commission_type IS NULL OR sam_commission_type IN ('percentage', 'fixed')),
  sam_commission_value NUMERIC,

  -- État de la ligne
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  toggled_by_pro BOOLEAN NOT NULL DEFAULT FALSE,
  toggled_by_pro_at TIMESTAMPTZ,

  -- Ordre d'affichage
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agreement_lines_agreement
  ON public.agreement_lines (agreement_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agreement_lines_establishment_active
  ON public.agreement_lines (establishment_id, is_active)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agreement_lines_module
  ON public.agreement_lines (module) WHERE deleted_at IS NULL AND is_active = TRUE;

-- -----------------------------------------------------------
-- 3. agreement_history (Journal de négociation — append-only)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agreement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.partner_agreements(id) ON DELETE CASCADE,

  -- Qui a fait quoi
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'pro', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,

  -- Détails du changement (JSON libre)
  details JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agreement_history_agreement
  ON public.agreement_history (agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_history_created
  ON public.agreement_history (created_at DESC);

-- -----------------------------------------------------------
-- 4. RLS (Row Level Security)
-- -----------------------------------------------------------
ALTER TABLE public.partner_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_history ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by the API server)
CREATE POLICY partner_agreements_service_all ON public.partner_agreements FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY agreement_lines_service_all ON public.agreement_lines FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY agreement_history_service_all ON public.agreement_history FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- 5. updated_at triggers
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partnership_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_partner_agreements_updated_at') THEN
    CREATE TRIGGER trg_partner_agreements_updated_at
      BEFORE UPDATE ON public.partner_agreements
      FOR EACH ROW EXECUTE FUNCTION public.partnership_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agreement_lines_updated_at') THEN
    CREATE TRIGGER trg_agreement_lines_updated_at
      BEFORE UPDATE ON public.agreement_lines
      FOR EACH ROW EXECUTE FUNCTION public.partnership_set_updated_at();
  END IF;
END $$;

-- -----------------------------------------------------------
-- 6. Flag on establishments
-- -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'establishments' AND column_name = 'has_partner_agreement'
  ) THEN
    ALTER TABLE public.establishments ADD COLUMN has_partner_agreement BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_establishments_partner
  ON public.establishments (has_partner_agreement)
  WHERE has_partner_agreement = TRUE;

-- -----------------------------------------------------------
-- 7. Add 'partnership' to notification_templates module CHECK
-- -----------------------------------------------------------
ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_module_check;
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_module_check
  CHECK (module = ANY (ARRAY['reservation', 'loyalty', 'packs', 'reviews', 'account', 'system', 'marketing', 'wheel', 'ce', 'conciergerie', 'partnership']));

-- -----------------------------------------------------------
-- 8. Seed notification templates
-- -----------------------------------------------------------
INSERT INTO public.notification_templates (event_type, channel, lang, subject, body, is_critical, module)
VALUES
  ('partnership_proposal_sent', 'email', 'fr', 'Nouvelle proposition de partenariat', 'SAM vous propose un partenariat pour votre établissement {{establishmentName}}. Connectez-vous à votre espace PRO pour consulter la proposition.', FALSE, 'partnership'),
  ('partnership_proposal_sent', 'in_app', 'fr', 'Proposition de partenariat reçue', 'SAM vous propose un partenariat pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_accepted', 'email', 'fr', 'Partenariat accepté', 'Le professionnel {{contactName}} a accepté le partenariat pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_accepted', 'in_app', 'fr', 'Partenariat accepté', '{{contactName}} a accepté le partenariat pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_refused', 'email', 'fr', 'Partenariat refusé', 'Le professionnel {{contactName}} a refusé le partenariat pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_refused', 'in_app', 'fr', 'Partenariat refusé', '{{contactName}} a refusé le partenariat pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_modification_requested', 'in_app', 'fr', 'Demande de modification', '{{contactName}} demande une modification du partenariat pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_line_toggled', 'in_app', 'fr', 'Ligne d''avantage modifiée', 'Le PRO a {{action}} la ligne "{{lineDescription}}" pour {{establishmentName}}.', FALSE, 'partnership'),
  ('partnership_expiring_30d', 'email', 'fr', 'Partenariat expire dans 30 jours', 'Le partenariat avec {{establishmentName}} expire le {{endDate}}. Pensez au renouvellement.', FALSE, 'partnership'),
  ('partnership_expiring_7d', 'email', 'fr', 'Partenariat expire dans 7 jours', 'Le partenariat avec {{establishmentName}} expire le {{endDate}}. Action requise.', TRUE, 'partnership'),
  ('partnership_expired', 'email', 'fr', 'Partenariat expiré', 'Le partenariat avec {{establishmentName}} est arrivé à expiration le {{endDate}}.', FALSE, 'partnership')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------
-- 9. Email templates for partnership
-- -----------------------------------------------------------
INSERT INTO public.email_templates (key, audience, name, subject_fr, subject_en, body_fr, body_en, cta_label_fr, enabled)
VALUES
  (
    'partnership_proposal_sent',
    'pro',
    'Proposition de partenariat envoyée',
    'SAM — Proposition de partenariat pour {{establishment_name}}',
    'SAM — Partnership proposal for {{establishment_name}}',
    E'Bonjour {{contact_name}},\n\nNous avons le plaisir de vous adresser une proposition de partenariat pour votre établissement {{establishment_name}}.\n\nCette proposition inclut {{lines_count}} ligne(s) d''avantages.\n\nConnectez-vous à votre espace Pro pour consulter et accepter cette proposition.\n\nCordialement,\nL''équipe Sortir Au Maroc',
    E'Hello {{contact_name}},\n\nWe are pleased to send you a partnership proposal for your establishment {{establishment_name}}.\n\nThis proposal includes {{lines_count}} advantage line(s).\n\nLog in to your Pro dashboard to review and accept this proposal.\n\nBest regards,\nThe Sortir Au Maroc Team',
    'Voir la proposition',
    TRUE
  ),
  (
    'partnership_accepted',
    'system',
    'Partenariat accepté par le PRO',
    'Partenariat accepté — {{establishment_name}}',
    'Partnership accepted — {{establishment_name}}',
    E'Le professionnel {{contact_name}} a accepté la proposition de partenariat pour {{establishment_name}}.\n\nL''accord est maintenant actif avec {{lines_count}} ligne(s) d''avantages.',
    E'The professional {{contact_name}} has accepted the partnership proposal for {{establishment_name}}.\n\nThe agreement is now active with {{lines_count}} advantage line(s).',
    'Voir l''accord',
    TRUE
  )
ON CONFLICT DO NOTHING;

COMMIT;
