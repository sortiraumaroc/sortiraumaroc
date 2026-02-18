-- ============================================================
-- Module CE (Comité d'Entreprise) — Tables, indexes, RLS, seeds
-- ============================================================
BEGIN;

-- -----------------------------------------------------------
-- 1. companies (Entreprises CE)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ice_siret TEXT,
  address TEXT,
  sector TEXT,
  estimated_employees INTEGER,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  logo_url TEXT,
  slug TEXT NOT NULL,
  registration_code TEXT NOT NULL,
  contract_start_date DATE,
  contract_end_date DATE,
  auto_validate_employees BOOLEAN NOT NULL DEFAULT FALSE,
  auto_validate_domain TEXT,
  welcome_message TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_companies_slug UNIQUE (slug),
  CONSTRAINT unique_companies_registration_code UNIQUE (registration_code)
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_registration_code ON public.companies (registration_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies (status) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 2. company_admins (Gestionnaires CE)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_company_admin_user UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_admins_user ON public.company_admins (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_admins_company ON public.company_admins (company_id) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 3. company_employees (Salariés CE)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  employee_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES public.company_admins(id) ON DELETE SET NULL,
  qr_code_hash TEXT,
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_company_employee_user UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_employees_company_status ON public.company_employees (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.company_employees (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.company_employees (status) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------
-- 4. pro_ce_advantages (Avantages CE par établissement)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pro_ce_advantages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  advantage_type TEXT NOT NULL CHECK (advantage_type IN ('percentage', 'fixed', 'special_offer', 'gift', 'pack')),
  advantage_value NUMERIC,
  description TEXT,
  conditions TEXT,
  start_date DATE,
  end_date DATE,
  max_uses_per_employee INTEGER NOT NULL DEFAULT 0,
  max_uses_total INTEGER NOT NULL DEFAULT 0,
  target_companies JSONB NOT NULL DEFAULT '"all"'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_advantages_establishment_active
  ON public.pro_ce_advantages (establishment_id, is_active)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_advantages_active_dates
  ON public.pro_ce_advantages (is_active, start_date, end_date)
  WHERE deleted_at IS NULL AND is_active = TRUE;

-- -----------------------------------------------------------
-- 5. ce_scans (Historique des scans CE)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ce_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.company_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  advantage_id UUID NOT NULL REFERENCES public.pro_ce_advantages(id) ON DELETE CASCADE,
  scan_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated', 'refused', 'expired')),
  refusal_reason TEXT,
  scanned_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scans_employee ON public.ce_scans (employee_id);
CREATE INDEX IF NOT EXISTS idx_scans_establishment ON public.ce_scans (establishment_id);
CREATE INDEX IF NOT EXISTS idx_scans_company_datetime ON public.ce_scans (company_id, scan_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_scans_advantage ON public.ce_scans (advantage_id);

-- -----------------------------------------------------------
-- 6. ce_totp_secrets (TOTP pour QR CE dynamique)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ce_totp_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.company_employees(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'SHA1',
  digits INTEGER NOT NULL DEFAULT 6,
  period INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  validation_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ce_totp_employee UNIQUE (employee_id)
);

-- -----------------------------------------------------------
-- 7. Modifications sur tables existantes
-- -----------------------------------------------------------

-- consumer_users: flags CE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consumer_users' AND column_name = 'is_ce_employee'
  ) THEN
    ALTER TABLE public.consumer_users ADD COLUMN is_ce_employee BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consumer_users' AND column_name = 'ce_company_id'
  ) THEN
    ALTER TABLE public.consumer_users ADD COLUMN ce_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- establishments: flag avantages CE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'establishments' AND column_name = 'has_ce_advantages'
  ) THEN
    ALTER TABLE public.establishments ADD COLUMN has_ce_advantages BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consumer_users_ce ON public.consumer_users (is_ce_employee) WHERE is_ce_employee = TRUE;
CREATE INDEX IF NOT EXISTS idx_establishments_ce ON public.establishments (has_ce_advantages) WHERE has_ce_advantages = TRUE;

-- -----------------------------------------------------------
-- 8. RLS (Row Level Security)
-- -----------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_ce_advantages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_totp_secrets ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by the API server)
CREATE POLICY companies_service_all ON public.companies FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY company_admins_service_all ON public.company_admins FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY company_employees_service_all ON public.company_employees FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY pro_ce_advantages_service_all ON public.pro_ce_advantages FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY ce_scans_service_all ON public.ce_scans FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY ce_totp_secrets_service_all ON public.ce_totp_secrets FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------
-- 9. updated_at triggers
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ce_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_companies_updated_at') THEN
    CREATE TRIGGER trg_companies_updated_at
      BEFORE UPDATE ON public.companies
      FOR EACH ROW EXECUTE FUNCTION public.ce_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_company_employees_updated_at') THEN
    CREATE TRIGGER trg_company_employees_updated_at
      BEFORE UPDATE ON public.company_employees
      FOR EACH ROW EXECUTE FUNCTION public.ce_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pro_ce_advantages_updated_at') THEN
    CREATE TRIGGER trg_pro_ce_advantages_updated_at
      BEFORE UPDATE ON public.pro_ce_advantages
      FOR EACH ROW EXECUTE FUNCTION public.ce_set_updated_at();
  END IF;
END $$;

-- -----------------------------------------------------------
-- 10. Add 'ce' to notification_templates module CHECK constraint
-- -----------------------------------------------------------
ALTER TABLE public.notification_templates DROP CONSTRAINT notification_templates_module_check;
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_module_check
  CHECK (module = ANY (ARRAY['reservation', 'loyalty', 'packs', 'reviews', 'account', 'system', 'marketing', 'wheel', 'ce']));

-- -----------------------------------------------------------
-- 11. Seed notification templates
-- -----------------------------------------------------------
INSERT INTO public.notification_templates (event_type, channel, lang, subject, body, is_critical, module)
VALUES
  ('ce_employee_registered', 'email', 'fr', 'Nouveau salarié inscrit', 'Un nouveau salarié ({{employeeName}}) vient de s''inscrire pour le comité d''entreprise {{companyName}}.', FALSE, 'ce'),
  ('ce_employee_registered', 'in_app', 'fr', 'Nouveau salarié inscrit', '{{employeeName}} s''est inscrit au CE {{companyName}}.', FALSE, 'ce'),
  ('ce_employee_validated', 'email', 'fr', 'Votre accès CE est activé', 'Félicitations {{employeeName}} ! Votre accès aux avantages CE de {{companyName}} est désormais actif. Vous pouvez consulter vos avantages sur SAM.ma.', FALSE, 'ce'),
  ('ce_employee_validated', 'sms', 'fr', 'CE activé', 'Votre accès CE {{companyName}} est activé ! Consultez vos avantages sur SAM.ma', FALSE, 'ce'),
  ('ce_employee_suspended', 'email', 'fr', 'Accès CE suspendu', 'Votre accès aux avantages CE de {{companyName}} a été suspendu. Contactez votre gestionnaire CE pour plus d''informations.', FALSE, 'ce'),
  ('ce_scan_completed', 'in_app', 'fr', 'Avantage CE utilisé', 'Vous avez utilisé votre avantage CE chez {{establishmentName}} : {{advantageDescription}}.', FALSE, 'ce'),
  ('ce_advantage_expiring', 'email', 'fr', 'Avantage CE bientôt expiré', 'L''avantage CE "{{advantageDescription}}" chez {{establishmentName}} expire le {{endDate}}. Profitez-en avant qu''il ne soit plus disponible !', FALSE, 'ce'),
  ('ce_advantage_expiring', 'push', 'fr', 'Avantage CE bientôt expiré', 'L''avantage "{{advantageDescription}}" expire bientôt !', FALSE, 'ce'),
  ('ce_contract_expiring', 'email', 'fr', 'Contrat CE bientôt expiré', 'Le contrat CE de {{companyName}} expire le {{contractEndDate}}. Veuillez contacter l''équipe SAM pour le renouvellement.', TRUE, 'ce'),
  ('ce_quota_reached', 'in_app', 'fr', 'Quota CE atteint', 'Vous avez atteint votre quota d''utilisation pour l''avantage "{{advantageDescription}}" chez {{establishmentName}}.', FALSE, 'ce')
ON CONFLICT DO NOTHING;

COMMIT;
