-- ============================================================================
-- BATCH 6: Migrations 20260218-20260219_*
-- 5 fichiers: admin notifications, CE module, ramadan, rental vehicles, rental demo seed
-- ============================================================================


-- ============================================================
-- FILE: 20260218_admin_notifications_table.sql
-- ============================================================

-- =============================================================================
-- MIGRATION: Admin Notifications Table
-- Date: 2026-02-18
-- Description: Creates admin_notifications table if not exists, ensures correct schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast unread count
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

-- Index for list queries
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications (created_at DESC);

-- If the table already exists but has 'message' instead of 'body', rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'message'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'body'
  ) THEN
    ALTER TABLE public.admin_notifications RENAME COLUMN message TO body;
  END IF;
END $$;

-- If the table has 'metadata' instead of 'data', rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'metadata'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'data'
  ) THEN
    ALTER TABLE public.admin_notifications RENAME COLUMN metadata TO data;
  END IF;
END $$;

-- Ensure body column exists (in case table was created with different schema)
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

COMMENT ON TABLE public.admin_notifications IS 'Admin notifications — visible in the admin dashboard bell icon';


-- ============================================================
-- FILE: 20260218_ce_module.sql
-- ============================================================

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
DROP POLICY IF EXISTS companies_service_all ON public.companies;
CREATE POLICY companies_service_all ON public.companies FOR ALL USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS company_admins_service_all ON public.company_admins;
CREATE POLICY company_admins_service_all ON public.company_admins FOR ALL USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS company_employees_service_all ON public.company_employees;
CREATE POLICY company_employees_service_all ON public.company_employees FOR ALL USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS pro_ce_advantages_service_all ON public.pro_ce_advantages;
CREATE POLICY pro_ce_advantages_service_all ON public.pro_ce_advantages FOR ALL USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS ce_scans_service_all ON public.ce_scans;
CREATE POLICY ce_scans_service_all ON public.ce_scans FOR ALL USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS ce_totp_secrets_service_all ON public.ce_totp_secrets;
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
ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_module_check;
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


-- ============================================================
-- FILE: 20260218_ramadan_settings.sql
-- ============================================================

-- Migration: Ramadan & Ftour platform settings
-- Adds configurable Ramadan dates to platform_settings (replaces RAMADAN_START/RAMADAN_END env vars)

INSERT INTO public.platform_settings (key, value, value_type, label, description, category)
VALUES
  ('RAMADAN_ENABLED', 'false', 'boolean', 'Mode Ramadan',
   'Activer les fonctionnalités spéciales Ramadan (section Ftour sur la page d''accueil, badges, etc.)', 'ramadan'),
  ('RAMADAN_START_DATE', '2026-02-28', 'string', 'Date début Ramadan',
   'Date de début du Ramadan (YYYY-MM-DD)', 'ramadan'),
  ('RAMADAN_END_DATE', '2026-03-30', 'string', 'Date fin Ramadan',
   'Date de fin du Ramadan (YYYY-MM-DD)', 'ramadan')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- FILE: 20260218_rental_vehicles_module.sql
-- ============================================================

-- =============================================================================
-- RENTAL VEHICLES MODULE — Complete vehicle rental system
-- Date: 2026-02-18
--
-- This migration creates:
--   1. rental_vehicles           (vehicle fleet per establishment)
--   2. rental_vehicle_date_blocks (date blocking for maintenance/external bookings)
--   3. rental_options            (complementary options per establishment)
--   4. rental_insurance_plans    (admin-managed insurance formulas)
--   5. rental_reservations       (rental booking records)
--   6. rental_kyc_documents      (identity verification photos)
--   7. rental_contract_templates (customizable contract templates per establishment)
--   8. Supabase storage bucket for KYC photos
--   9. Indexes for performance
--
-- Depends on:
--   - public.establishments (existing)
--   - public.consumer_users (existing — via auth.users)
--   - 20260201_rentacar_universe.sql (rentacar universe already added)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. rental_vehicles
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_vehicles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id      uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  category              text NOT NULL CHECK (category IN (
    'citadine', 'compacte', 'berline', 'suv', '4x4', 'monospace',
    'utilitaire', 'luxe', 'cabriolet', 'electrique', 'sport', 'moto'
  )),
  brand                 text NOT NULL DEFAULT '',
  model                 text NOT NULL DEFAULT '',
  year                  smallint,
  photos                text[] NOT NULL DEFAULT '{}',
  specs                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- specs keys: seats (int), doors (int), transmission (text), ac (bool), fuel_type (text), trunk_volume (text)
  mileage_policy        text NOT NULL DEFAULT 'unlimited' CHECK (mileage_policy IN ('unlimited', 'limited')),
  mileage_limit_per_day integer,
  extra_km_cost         numeric(10,2),
  pricing               jsonb NOT NULL DEFAULT '{"standard": 0}'::jsonb,
  -- pricing keys: standard (number), weekend (number), high_season (number), long_duration_discount ({ min_days, discount_percent })
  high_season_dates     jsonb,
  -- array of { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
  quantity              integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  similar_vehicle       boolean NOT NULL DEFAULT false,
  similar_models        text[],
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_vehicles IS 'Vehicle fleet for rental establishments';

-- =============================================================================
-- 2. rental_vehicle_date_blocks
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_vehicle_date_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES public.rental_vehicles(id) ON DELETE CASCADE,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT date_block_range_check CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.rental_vehicle_date_blocks IS 'Date blocks for vehicle unavailability (maintenance, external bookings)';

-- =============================================================================
-- 3. rental_options
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_options (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  price             numeric(10,2) NOT NULL DEFAULT 0,
  price_type        text NOT NULL DEFAULT 'per_day' CHECK (price_type IN ('per_day', 'fixed')),
  is_mandatory      boolean NOT NULL DEFAULT false,
  sort_order        integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_options IS 'Complementary options offered by rental establishments (child seat, GPS, etc.)';

-- =============================================================================
-- 4. rental_insurance_plans (admin-managed)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_insurance_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  coverages     text[] NOT NULL DEFAULT '{}',
  price_per_day numeric(10,2) NOT NULL DEFAULT 0,
  franchise     numeric(10,2) NOT NULL DEFAULT 0,
  partner_name  text,
  badge         text,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_insurance_plans IS 'Insurance formulas managed by platform admin';

-- Seed default insurance plans
INSERT INTO public.rental_insurance_plans (name, description, coverages, price_per_day, franchise, badge, sort_order, is_active)
VALUES
  (
    'Essentielle',
    'Couverture de base incluse dans toute location',
    ARRAY['Responsabilité civile'],
    0,
    5000,
    NULL,
    1,
    true
  ),
  (
    'Confort',
    'Protection étendue pour rouler l''esprit tranquille',
    ARRAY['Responsabilité civile', 'Vol', 'Incendie', 'Bris de glace', 'Franchise réduite'],
    80,
    2000,
    NULL,
    2,
    true
  ),
  (
    'Sérénité',
    'Protection tous risques, 0 franchise, assistance 24h/24',
    ARRAY['Responsabilité civile', 'Vol', 'Incendie', 'Bris de glace', 'Tous risques', 'Franchise 0', 'Assistance 24/7'],
    150,
    0,
    'Recommandé',
    3,
    true
  )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. rental_reservations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference   text NOT NULL UNIQUE,
  user_id             uuid NOT NULL,
  establishment_id    uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  vehicle_id          uuid NOT NULL REFERENCES public.rental_vehicles(id) ON DELETE RESTRICT,
  -- Pickup / Dropoff
  pickup_city         text NOT NULL,
  pickup_date         date NOT NULL,
  pickup_time         time NOT NULL,
  dropoff_city        text NOT NULL,
  dropoff_date        date NOT NULL,
  dropoff_time        time NOT NULL,
  -- Options & Insurance
  selected_options    jsonb NOT NULL DEFAULT '[]'::jsonb,
  insurance_plan_id   uuid REFERENCES public.rental_insurance_plans(id) ON DELETE SET NULL,
  -- Deposit
  deposit_amount      numeric(10,2) NOT NULL DEFAULT 0,
  deposit_status      text NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending', 'held', 'released', 'forfeited')),
  -- Pricing
  base_price          numeric(10,2) NOT NULL DEFAULT 0,
  options_total       numeric(10,2) NOT NULL DEFAULT 0,
  insurance_total     numeric(10,2) NOT NULL DEFAULT 0,
  total_price         numeric(10,2) NOT NULL DEFAULT 0,
  commission_percent  numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount   numeric(10,2) NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'MAD',
  -- KYC
  kyc_status          text NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'validated', 'refused')),
  kyc_refusal_reason  text,
  -- Contract
  contract_pdf_url    text,
  -- Promo
  promo_code_id       uuid,
  promo_discount      numeric(10,2) NOT NULL DEFAULT 0,
  -- Status
  status              text NOT NULL DEFAULT 'pending_kyc' CHECK (status IN (
    'pending_kyc', 'confirmed', 'in_progress', 'completed',
    'cancelled', 'cancelled_user', 'cancelled_pro',
    'disputed', 'expired'
  )),
  cancelled_at        timestamptz,
  cancellation_reason text,
  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rental_reservation_dates_check CHECK (dropoff_date >= pickup_date)
);

COMMENT ON TABLE public.rental_reservations IS 'Vehicle rental reservations';

-- =============================================================================
-- 6. rental_kyc_documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_kyc_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid NOT NULL REFERENCES public.rental_reservations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  document_type   text NOT NULL CHECK (document_type IN ('permit', 'cin', 'passport')),
  side            text NOT NULL CHECK (side IN ('front', 'back')),
  photo_url       text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'refused')),
  refusal_reason  text,
  validated_by    uuid,
  validated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kyc_unique_doc UNIQUE (reservation_id, document_type, side)
);

COMMENT ON TABLE public.rental_kyc_documents IS 'KYC identity verification documents for rental reservations';

-- =============================================================================
-- 7. rental_contract_templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rental_contract_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  template_content  text NOT NULL DEFAULT '',
  custom_clauses    text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_active_template_per_establishment UNIQUE (establishment_id, is_active)
);

COMMENT ON TABLE public.rental_contract_templates IS 'Customizable rental contract templates per establishment';

-- =============================================================================
-- 8. Supabase storage bucket for KYC photos
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-kyc-documents',
  'rental-kyc-documents',
  false,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Also create a bucket for vehicle photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-vehicle-photos',
  'rental-vehicle-photos',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 9. INDEXES
-- =============================================================================

-- rental_vehicles
CREATE INDEX IF NOT EXISTS idx_rental_vehicles_establishment
  ON public.rental_vehicles (establishment_id);
CREATE INDEX IF NOT EXISTS idx_rental_vehicles_status
  ON public.rental_vehicles (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rental_vehicles_category
  ON public.rental_vehicles (category);
CREATE INDEX IF NOT EXISTS idx_rental_vehicles_specs
  ON public.rental_vehicles USING gin (specs);

-- rental_vehicle_date_blocks
CREATE INDEX IF NOT EXISTS idx_rental_date_blocks_vehicle
  ON public.rental_vehicle_date_blocks (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rental_date_blocks_range
  ON public.rental_vehicle_date_blocks (vehicle_id, start_date, end_date);

-- rental_options
CREATE INDEX IF NOT EXISTS idx_rental_options_establishment
  ON public.rental_options (establishment_id) WHERE is_active = true;

-- rental_reservations
CREATE INDEX IF NOT EXISTS idx_rental_reservations_user
  ON public.rental_reservations (user_id);
CREATE INDEX IF NOT EXISTS idx_rental_reservations_establishment
  ON public.rental_reservations (establishment_id);
CREATE INDEX IF NOT EXISTS idx_rental_reservations_vehicle
  ON public.rental_reservations (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rental_reservations_status
  ON public.rental_reservations (status);
CREATE INDEX IF NOT EXISTS idx_rental_reservations_pickup
  ON public.rental_reservations (pickup_city, pickup_date);
CREATE INDEX IF NOT EXISTS idx_rental_reservations_booking_ref
  ON public.rental_reservations (booking_reference);

-- rental_kyc_documents
CREATE INDEX IF NOT EXISTS idx_rental_kyc_reservation
  ON public.rental_kyc_documents (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rental_kyc_user
  ON public.rental_kyc_documents (user_id);

-- =============================================================================
-- 10. updated_at trigger function (reuse if exists)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rental_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rental_vehicles_updated_at ON public.rental_vehicles;
CREATE TRIGGER trg_rental_vehicles_updated_at
  BEFORE UPDATE ON public.rental_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

DROP TRIGGER IF EXISTS trg_rental_reservations_updated_at ON public.rental_reservations;
CREATE TRIGGER trg_rental_reservations_updated_at
  BEFORE UPDATE ON public.rental_reservations
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

DROP TRIGGER IF EXISTS trg_rental_insurance_plans_updated_at ON public.rental_insurance_plans;
CREATE TRIGGER trg_rental_insurance_plans_updated_at
  BEFORE UPDATE ON public.rental_insurance_plans
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

DROP TRIGGER IF EXISTS trg_rental_contract_templates_updated_at ON public.rental_contract_templates;
CREATE TRIGGER trg_rental_contract_templates_updated_at
  BEFORE UPDATE ON public.rental_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

-- =============================================================================
-- 11. Booking reference generation function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_rental_booking_reference()
RETURNS text AS $$
DECLARE
  ref text;
  exists_already boolean;
BEGIN
  LOOP
    ref := 'LOC-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM public.rental_reservations WHERE booking_reference = ref) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN ref;
END;
$$ LANGUAGE plpgsql;

COMMIT;


-- ============================================================
-- FILE: 20260219_rental_demo_seed.sql
-- ============================================================

-- =============================================================================
-- RENTAL DEMO SEED — 6 Loueurs + ~61 Véhicules + Options + Promos
-- Date: 2026-02-19
--
-- This migration inserts demo data for the rental module:
--   1. 6 rental establishments (loueurs)
--   2. ~61 vehicles across all categories
--   3. Rental options per establishment
--   4. 6 promo codes
--   5. Direct avg_rating / review_count updates
--
-- Companion script: server/scripts/seed-rental-demo.ts
--   (creates auth users, pro_profiles, memberships, reservations)
--
-- Idempotent: uses ON CONFLICT DO NOTHING everywhere.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. DETERMINISTIC UUIDs (for cross-reference with TypeScript seed script)
-- =============================================================================
-- Establishments
--   hertz:     11111111-aaaa-bbbb-cccc-000000000001
--   saharacar: 11111111-aaaa-bbbb-cccc-000000000002
--   casarent:  11111111-aaaa-bbbb-cccc-000000000003
--   atlantic:  11111111-aaaa-bbbb-cccc-000000000004
--   prestige:  11111111-aaaa-bbbb-cccc-000000000005
--   fesauto:   11111111-aaaa-bbbb-cccc-000000000006

-- =============================================================================
-- 1. ESTABLISHMENTS
-- =============================================================================

INSERT INTO public.establishments (
  id, name, slug, universe, category, subcategory, city, address, country, region,
  phone, description_short, description_long, hours,
  tags, amenities, status, is_online, verified, booking_enabled,
  avg_rating, review_count, lat, lng, extra,
  cover_url, logo_url
) VALUES

-- 1. HERTZ LOCATION MAROC
(
  '11111111-aaaa-bbbb-cccc-000000000001',
  'Hertz Location Maroc',
  'hertz-location-maroc-casablanca',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Casablanca',
  'Aéroport Mohammed V, Terminal 1, Nouaceur',
  'MA', 'Casablanca-Settat',
  '+212522539800',
  'Leader mondial de la location de véhicules, Hertz vous propose une flotte premium au Maroc avec un service irréprochable.',
  'Hertz Location Maroc vous accueille dans ses agences de Casablanca (Aéroport Mohammed V et Centre-ville) et Marrakech (Aéroport Menara). Flotte récente, véhicules parfaitement entretenus, et un service client disponible de 7h à 23h. Restitution inter-villes possible (Casablanca ↔ Marrakech, supplément 500 MAD). Caution standard : 5 000 MAD. Annulation flexible gratuite jusqu''à 24h avant.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]}}',
  ARRAY['location', 'voiture', 'aéroport', 'premium', 'hertz', 'loueur-vérifié', 'super-loueur'],
  ARRAY['parking', 'wifi', 'climatisation'],
  'active', true, true, true,
  4.3, 187,
  33.3675, -7.5898,
  '{"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 5000, "inter_city_return": true, "inter_city_supplement": 500}'::jsonb,
  'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&h=600&fit=crop&q=80',
  '/hertz-logo.avif'
),

-- 2. SAHARACAR
(
  '11111111-aaaa-bbbb-cccc-000000000002',
  'SaharaCar',
  'saharacar-marrakech',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Marrakech',
  'Zone Industrielle Sidi Ghanem, Rue 7, Marrakech',
  'MA', 'Marrakech-Safi',
  '+212524336700',
  'Spécialiste de la location tout-terrain et aventure dans le Sud marocain. Partez à la découverte du désert en toute liberté.',
  'SaharaCar est votre partenaire pour explorer le Sud marocain. Agences à Marrakech, Ouarzazate et Errachidia. Spécialistes des 4x4 et véhicules tout-terrain, nous vous proposons aussi des citadines et SUV pour tous vos besoins. Restitution inter-villes possible (Marrakech ↔ Ouarzazate ↔ Errachidia, supplément 300 MAD). Caution : 3 000 MAD. Annulation modérée (gratuite jusqu''à 48h, 50% après).',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]}}',
  ARRAY['location', '4x4', 'désert', 'aventure', 'tout-terrain', 'loueur-vérifié'],
  ARRAY['parking', 'climatisation'],
  'active', true, true, true,
  4.6, 94,
  31.6295, -7.9811,
  '{"rental_commission_percent": 15, "cancellation_policy": "moderate", "default_deposit": 3000, "inter_city_return": true, "inter_city_supplement": 300}'::jsonb,
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&h=200&fit=crop&q=80'
),

-- 3. CASARENT
(
  '11111111-aaaa-bbbb-cccc-000000000003',
  'CasaRent',
  'casarent-casablanca',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Casablanca',
  '45 Rue Mohammed V, Centre-ville, Casablanca',
  'MA', 'Casablanca-Settat',
  '+212522267890',
  'Votre partenaire mobilité à Casablanca. Véhicules récents, prix compétitifs, service rapide.',
  'CasaRent est la référence de la location de véhicules à Casablanca. Trois points de retrait : Centre-ville, Aïn Diab et Aéroport Mohammed V. Flotte variée des citadines économiques aux SUV familiaux, en passant par des véhicules électriques. Prix compétitifs et service rapide garanti. Caution : 2 000 MAD. Annulation flexible gratuite jusqu''à 24h.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"09:00","fin":"18:00"}]}}',
  ARRAY['location', 'voiture', 'économique', 'casablanca', 'électrique', 'loueur-vérifié', 'super-loueur'],
  ARRAY['parking', 'wifi', 'climatisation', 'borne-recharge'],
  'active', true, true, true,
  4.1, 256,
  33.5731, -7.5898,
  '{"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 2000, "inter_city_return": false}'::jsonb,
  'https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=200&h=200&fit=crop&q=80'
),

-- 4. ATLANTIC CARS
(
  '11111111-aaaa-bbbb-cccc-000000000004',
  'Atlantic Cars',
  'atlantic-cars-tanger',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Tanger',
  '12 Avenue Mohammed VI, Tanger',
  'MA', 'Tanger-Tétouan-Al Hoceïma',
  '+212539945600',
  'Location de véhicules sur tout le littoral atlantique nord. Service professionnel et véhicules bien entretenus.',
  'Atlantic Cars dessert les villes du nord du Maroc : Tanger, Rabat et Kénitra. Flotte diversifiée de la citadine au minibus, en passant par des SUV et utilitaires. Service professionnel avec livraison possible en gare ou à domicile. Restitution inter-villes (Tanger ↔ Rabat ↔ Kénitra, supplément 200 MAD). Caution : 3 000 MAD.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]}}',
  ARRAY['location', 'voiture', 'tanger', 'rabat', 'nord', 'loueur-vérifié'],
  ARRAY['parking', 'climatisation'],
  'active', true, true, true,
  4.0, 132,
  35.7595, -5.8340,
  '{"rental_commission_percent": 15, "cancellation_policy": "moderate", "default_deposit": 3000, "inter_city_return": true, "inter_city_supplement": 200}'::jsonb,
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=200&h=200&fit=crop&q=80'
),

-- 5. PRESTIGE AUTO MAROC
(
  '11111111-aaaa-bbbb-cccc-000000000005',
  'Prestige Auto Maroc',
  'prestige-auto-maroc-casablanca',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Casablanca',
  '88 Boulevard de la Corniche, Aïn Diab, Casablanca',
  'MA', 'Casablanca-Settat',
  '+212522797800',
  'Découvrez le Maroc au volant de véhicules d''exception. Mercedes, BMW, Porsche, Range Rover... Le luxe à portée de main.',
  'Prestige Auto Maroc est le spécialiste de la location de véhicules haut de gamme au Maroc. Présent à Casablanca, Marrakech et Tanger, nous mettons à votre disposition une flotte d''exception : Mercedes Classe S, BMW Série 7, Porsche 911, Range Rover Vogue et bien plus. GPS et WiFi inclus, livraison aéroport/hôtel offerte. Restitution inter-villes possible (supplément 800 MAD). Caution : 15 000 MAD. Annulation stricte (gratuite jusqu''à 72h, 100% après).',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]}}',
  ARRAY['location', 'luxe', 'premium', 'mercedes', 'bmw', 'porsche', 'range-rover', 'loueur-vérifié', 'super-loueur'],
  ARRAY['parking', 'wifi', 'climatisation', 'chauffeur'],
  'active', true, true, true,
  4.8, 67,
  33.5920, -7.6700,
  '{"rental_commission_percent": 15, "cancellation_policy": "strict", "default_deposit": 15000, "inter_city_return": true, "inter_city_supplement": 800}'::jsonb,
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=200&h=200&fit=crop&q=80'
),

-- 6. FÈS AUTO LOCATION
(
  '11111111-aaaa-bbbb-cccc-000000000006',
  'Fès Auto Location',
  'fes-auto-location-fes',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Fès',
  '23 Avenue Hassan II, Ville Nouvelle, Fès',
  'MA', 'Fès-Meknès',
  '+212535654300',
  'Explorer le Maroc impérial et le Moyen Atlas à votre rythme. Véhicules fiables et service familial depuis 2010.',
  'Fès Auto Location vous accompagne dans la découverte du Maroc impérial et du Moyen Atlas. Agences à Fès, Meknès et Ifrane. Service familial et personnalisé depuis 2010. Véhicules fiables et bien entretenus, des citadines aux 4x4. Restitution inter-villes (Fès ↔ Meknès ↔ Ifrane, supplément 150 MAD). Caution : 2 500 MAD. Annulation flexible.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"dimanche":{"ouvert":false,"plages":[]}}',
  ARRAY['location', 'voiture', 'fès', 'moyen-atlas', 'ifrane', 'familial', 'loueur-vérifié'],
  ARRAY['parking', 'climatisation'],
  'active', true, true, true,
  4.4, 78,
  34.0181, -5.0078,
  '{"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 2500, "inter_city_return": true, "inter_city_supplement": 150}'::jsonb,
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=200&h=200&fit=crop&q=80'
)

ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 2. VEHICLES
-- =============================================================================

-- High season dates common to all vehicles
-- July-August + December holidays

-- ---------------------------------------------------------------------------
-- HERTZ LOCATION MAROC — 15 vehicles
-- ---------------------------------------------------------------------------

INSERT INTO public.rental_vehicles (id, establishment_id, category, brand, model, year, photos, specs, mileage_policy, mileage_limit_per_day, extra_km_cost, pricing, high_season_dates, quantity, similar_vehicle, status, sort_order) VALUES

-- H1: Renault Clio 5
('22222222-0001-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'citadine', 'Renault', 'Clio 5', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"340L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 8, true, 'active', 1),

-- H2: Peugeot 208
('22222222-0001-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000001', 'citadine', 'Peugeot', '208', 2024,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"311L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":280,"weekend":325,"high_season":365,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 2),

-- H3: Volkswagen Golf 8
('22222222-0001-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000001', 'compacte', 'Volkswagen', 'Golf 8', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"380L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":350,"weekend":405,"high_season":455,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, false, 'active', 3),

-- H4: Toyota Corolla
('22222222-0001-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000001', 'compacte', 'Toyota', 'Corolla', 2023,
 ARRAY['https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"hybride","trunk_volume":"361L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":380,"weekend":440,"high_season":495,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 4),

-- H5: Peugeot 508
('22222222-0001-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000001', 'berline', 'Peugeot', '508', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"487L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":500,"weekend":575,"high_season":650,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 5),

-- H6: Mercedes Classe C
('22222222-0001-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000001', 'berline', 'Mercedes-Benz', 'Classe C', 2024,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"455L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":700,"weekend":805,"high_season":910,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 6),

-- H7: Dacia Duster
('22222222-0001-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000001', 'suv', 'Dacia', 'Duster', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":350,"weekend":405,"high_season":455,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 6, true, 'active', 7),

-- H8: Hyundai Tucson
('22222222-0001-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000001', 'suv', 'Hyundai', 'Tucson', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"hybride","trunk_volume":"546L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":500,"weekend":575,"high_season":650,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 8),

-- H9: BMW X3
('22222222-0001-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000001', 'suv', 'BMW', 'X3', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"550L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":900,"weekend":1035,"high_season":1170,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 9),

-- H10: Toyota Land Cruiser
('22222222-0001-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000001', '4x4', 'Toyota', 'Land Cruiser', 2023,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"553L"}'::jsonb,
 'limited', 300, 1.50,
 '{"standard":1200,"weekend":1380,"high_season":1560,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 10),

-- H11: Renault Kangoo
('22222222-0001-0001-0001-000000000011', '11111111-aaaa-bbbb-cccc-000000000001', 'utilitaire', 'Renault', 'Kangoo', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"3.6m³"}'::jsonb,
 'limited', 200, 1.00,
 '{"standard":300,"weekend":345,"high_season":390,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 11),

-- H12: Peugeot Expert
('22222222-0001-0001-0001-000000000012', '11111111-aaaa-bbbb-cccc-000000000001', 'utilitaire', 'Peugeot', 'Expert', 2023,
 ARRAY['https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":3,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"5.3m³"}'::jsonb,
 'limited', 200, 1.20,
 '{"standard":450,"weekend":520,"high_season":585,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, true, 'active', 12),

-- H13: Mercedes Classe E
('22222222-0001-0001-0001-000000000013', '11111111-aaaa-bbbb-cccc-000000000001', 'luxe', 'Mercedes-Benz', 'Classe E', 2025,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"540L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1100,"weekend":1265,"high_season":1430,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 13),

-- H14: BMW Série 5
('22222222-0001-0001-0001-000000000014', '11111111-aaaa-bbbb-cccc-000000000001', 'luxe', 'BMW', 'Série 5', 2025,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"520L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1050,"weekend":1210,"high_season":1365,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 14),

-- H15: Mercedes Vito (Minibus)
('22222222-0001-0001-0001-000000000015', '11111111-aaaa-bbbb-cccc-000000000001', 'monospace', 'Mercedes-Benz', 'Vito', 2024,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":9,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"Grand"}'::jsonb,
 'limited', 250, 1.50,
 '{"standard":800,"weekend":920,"high_season":1040,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 15),


-- ---------------------------------------------------------------------------
-- SAHARACAR — 8 vehicles
-- ---------------------------------------------------------------------------

-- S1: Dacia Duster 4x4
('22222222-0002-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000002', 'suv', 'Dacia', 'Duster 4x4', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 8, true, 'active', 1),

-- S2: Toyota Hilux
('22222222-0002-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000002', '4x4', 'Toyota', 'Hilux', 2023,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":4,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"Benne"}'::jsonb,
 'limited', 300, 1.00,
 '{"standard":800,"weekend":920,"high_season":1040,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, false, 'active', 2),

-- S3: Toyota Land Cruiser Prado
('22222222-0002-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000002', '4x4', 'Toyota', 'Land Cruiser Prado', 2024,
 ARRAY['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"550L"}'::jsonb,
 'limited', 250, 1.50,
 '{"standard":1300,"weekend":1495,"high_season":1690,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 3),

-- S4: Mitsubishi Pajero
('22222222-0002-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000002', '4x4', 'Mitsubishi', 'Pajero', 2023,
 ARRAY['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"500L"}'::jsonb,
 'limited', 300, 1.20,
 '{"standard":1000,"weekend":1150,"high_season":1300,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 4),

-- S5: Hyundai Tucson
('22222222-0002-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000002', 'suv', 'Hyundai', 'Tucson', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"546L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":480,"weekend":555,"high_season":625,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 5),

-- S6: Dacia Sandero Stepway
('22222222-0002-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000002', 'compacte', 'Dacia', 'Sandero Stepway', 2024,
 ARRAY['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"328L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 6),

-- S7: Fiat 500
('22222222-0002-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000002', 'citadine', 'Fiat', '500', 2023,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":4,"doors":3,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"185L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":220,"weekend":255,"high_season":290,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 7),

-- S8: Toyota Hiace (Minibus)
('22222222-0002-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000002', 'monospace', 'Toyota', 'Hiace', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":12,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"Grand"}'::jsonb,
 'limited', 200, 1.50,
 '{"standard":900,"weekend":1035,"high_season":1170,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 8),


-- ---------------------------------------------------------------------------
-- CASARENT — 10 vehicles
-- ---------------------------------------------------------------------------

-- C1: Dacia Sandero
('22222222-0003-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000003', 'citadine', 'Dacia', 'Sandero', 2024,
 ARRAY['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"328L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":180,"weekend":210,"high_season":235,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 10, true, 'active', 1),

-- C2: Renault Clio 5
('22222222-0003-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000003', 'citadine', 'Renault', 'Clio 5', 2023,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"340L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":220,"weekend":255,"high_season":290,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 8, true, 'active', 2),

-- C3: Peugeot 308
('22222222-0003-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000003', 'compacte', 'Peugeot', '308', 2024,
 ARRAY['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"412L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":320,"weekend":370,"high_season":415,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 3),

-- C4: Renault Megane
('22222222-0003-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000003', 'compacte', 'Renault', 'Megane', 2023,
 ARRAY['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"384L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":280,"weekend":325,"high_season":365,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 4),

-- C5: Hyundai Sonata
('22222222-0003-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000003', 'berline', 'Hyundai', 'Sonata', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"462L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":420,"weekend":485,"high_season":545,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 5),

-- C6: Renault Kadjar
('22222222-0003-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000003', 'suv', 'Renault', 'Kadjar', 2023,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"472L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 6),

-- C7: Dacia Duster
('22222222-0003-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000003', 'suv', 'Dacia', 'Duster', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":300,"weekend":345,"high_season":390,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 6, true, 'active', 7),

-- C8: Dacia Dokker (Utilitaire)
('22222222-0003-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000003', 'utilitaire', 'Dacia', 'Dokker', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"800L"}'::jsonb,
 'limited', 200, 0.80,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 8),

-- C9: Renault Master (Utilitaire)
('22222222-0003-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000003', 'utilitaire', 'Renault', 'Master', 2023,
 ARRAY['https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":3,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"8m³"}'::jsonb,
 'limited', 150, 1.00,
 '{"standard":500,"weekend":575,"high_season":650,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 9),

-- C10: Renault Zoe (Électrique)
('22222222-0003-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000003', 'electrique', 'Renault', 'Zoe', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"electrique","trunk_volume":"338L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":300,"weekend":345,"high_season":390,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 10),


-- ---------------------------------------------------------------------------
-- ATLANTIC CARS — 8 vehicles
-- ---------------------------------------------------------------------------

('22222222-0004-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000004', 'citadine', 'Hyundai', 'i10', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"252L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":200,"weekend":230,"high_season":260,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 7, true, 'active', 1),

('22222222-0004-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000004', 'citadine', 'Peugeot', '208', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"311L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":240,"weekend":275,"high_season":310,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 2),

('22222222-0004-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000004', 'compacte', 'Kia', 'Ceed', 2024,
 ARRAY['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"395L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":330,"weekend":380,"high_season":430,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 3),

('22222222-0004-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000004', 'berline', 'Skoda', 'Octavia', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"600L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 4),

('22222222-0004-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000004', 'suv', 'Kia', 'Sportage', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"543L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":480,"weekend":555,"high_season":625,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 5),

('22222222-0004-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000004', 'suv', 'Peugeot', '3008', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"520L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":520,"weekend":600,"high_season":675,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 6),

('22222222-0004-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000004', 'monospace', 'Kia', 'Carnival', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"627L"}'::jsonb,
 'limited', 250, 1.20,
 '{"standard":700,"weekend":805,"high_season":910,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 7),

('22222222-0004-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000004', 'utilitaire', 'Peugeot', 'Partner', 2023,
 ARRAY['https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"3.3m³"}'::jsonb,
 'limited', 200, 0.90,
 '{"standard":280,"weekend":325,"high_season":365,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 8),


-- ---------------------------------------------------------------------------
-- PRESTIGE AUTO MAROC — 12 vehicles
-- ---------------------------------------------------------------------------

('22222222-0005-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000005', 'luxe', 'Mercedes-Benz', 'Classe S', 2025,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"550L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2500,"weekend":2875,"high_season":3250,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 1),

('22222222-0005-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000005', 'luxe', 'BMW', 'Série 7', 2025,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"515L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2300,"weekend":2645,"high_season":2990,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 2),

('22222222-0005-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000005', 'luxe', 'Audi', 'A8', 2024,
 ARRAY['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"505L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2200,"weekend":2530,"high_season":2860,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 3),

('22222222-0005-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'Land Rover', 'Range Rover Vogue', 2025,
 ARRAY['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"818L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":3000,"weekend":3450,"high_season":3900,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 4),

('22222222-0005-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'Porsche', 'Cayenne', 2024,
 ARRAY['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"770L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2800,"weekend":3220,"high_season":3640,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 5),

('22222222-0005-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'Mercedes-Benz', 'GLE', 2024,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"630L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1800,"weekend":2070,"high_season":2340,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 6),

('22222222-0005-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000005', 'sport', 'Porsche', '911 Carrera', 2024,
 ARRAY['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":2,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"132L"}'::jsonb,
 'limited', 200, 3.00,
 '{"standard":4000,"weekend":4600,"high_season":5200,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 7),

('22222222-0005-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000005', 'sport', 'Mercedes-Benz', 'AMG GT', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":2,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"350L"}'::jsonb,
 'limited', 200, 3.50,
 '{"standard":4500,"weekend":5175,"high_season":5850,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 8),

('22222222-0005-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000005', 'cabriolet', 'BMW', 'Série 4 Cabriolet', 2024,
 ARRAY['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":4,"doors":2,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"300L"}'::jsonb,
 'limited', 250, 2.50,
 '{"standard":2000,"weekend":2300,"high_season":2600,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 9),

('22222222-0005-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000005', 'berline', 'Mercedes-Benz', 'Classe E', 2025,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"hybride","trunk_volume":"540L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1500,"weekend":1725,"high_season":1950,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 10),

('22222222-0005-0001-0001-000000000011', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'BMW', 'X5', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"650L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1600,"weekend":1840,"high_season":2080,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 11),

('22222222-0005-0001-0001-000000000012', '11111111-aaaa-bbbb-cccc-000000000005', 'monospace', 'Mercedes-Benz', 'Classe V', 2024,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"1030L"}'::jsonb,
 'limited', 300, 2.00,
 '{"standard":2000,"weekend":2300,"high_season":2600,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 12),


-- ---------------------------------------------------------------------------
-- FÈS AUTO LOCATION — 8 vehicles
-- ---------------------------------------------------------------------------

('22222222-0006-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000006', 'citadine', 'Dacia', 'Sandero', 2023,
 ARRAY['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"328L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":190,"weekend":220,"high_season":250,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 6, true, 'active', 1),

('22222222-0006-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000006', 'citadine', 'Renault', 'Clio 4', 2022,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"300L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":200,"weekend":230,"high_season":260,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 2),

('22222222-0006-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000006', 'compacte', 'Peugeot', '301', 2023,
 ARRAY['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"506L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 3),

('22222222-0006-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000006', 'berline', 'Hyundai', 'Elantra', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"474L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":380,"weekend":440,"high_season":495,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 4),

('22222222-0006-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000006', 'suv', 'Dacia', 'Duster', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":320,"weekend":370,"high_season":415,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 5),

('22222222-0006-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000006', 'suv', 'Hyundai', 'Creta', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"433L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 6),

('22222222-0006-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000006', '4x4', 'Mitsubishi', 'L200', 2023,
 ARRAY['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":4,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"Benne"}'::jsonb,
 'limited', 250, 1.00,
 '{"standard":700,"weekend":805,"high_season":910,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 7),

('22222222-0006-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000006', 'utilitaire', 'Renault', 'Kangoo', 2022,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"3.6m³"}'::jsonb,
 'limited', 200, 0.80,
 '{"standard":220,"weekend":255,"high_season":290,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 8)

ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 3. RENTAL OPTIONS
-- =============================================================================

INSERT INTO public.rental_options (establishment_id, name, description, price, price_type, is_mandatory, sort_order, is_active) VALUES

-- HERTZ
('11111111-aaaa-bbbb-cccc-000000000001', 'Siège bébé', 'Siège auto pour bébé (0-12 mois)', 50, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Siège enfant', 'Siège auto pour enfant (1-4 ans)', 50, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Conducteur additionnel', 'Ajout d''un conducteur supplémentaire', 80, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'GPS', 'Navigation GPS portable', 60, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'WiFi embarqué', 'Hotspot WiFi portable 4G', 70, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Livraison aéroport', 'Livraison du véhicule à l''aéroport', 200, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Livraison hôtel', 'Livraison du véhicule à votre hôtel', 150, 'fixed', false, 7, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Plein de carburant', 'Réservoir plein au retour non obligatoire', 500, 'fixed', false, 8, true),

-- SAHARACAR
('11111111-aaaa-bbbb-cccc-000000000002', 'Siège bébé', 'Siège auto pour bébé', 40, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Siège enfant', 'Siège auto pour enfant', 40, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Conducteur additionnel', 'Conducteur supplémentaire', 60, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'GPS', 'Navigation GPS', 50, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Chaînes neige', 'Chaînes neige (recommandé hiver)', 100, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Livraison aéroport', 'Livraison aéroport Menara', 150, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Livraison hôtel', 'Livraison à votre riad/hôtel', 100, 'fixed', false, 7, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Plein de carburant', 'Plein de carburant au retour', 400, 'fixed', false, 8, true),

-- CASARENT
('11111111-aaaa-bbbb-cccc-000000000003', 'Siège bébé', 'Siège auto bébé', 30, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Siège enfant', 'Siège auto enfant', 30, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Conducteur additionnel', 'Conducteur supplémentaire', 50, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'GPS', 'Navigation GPS', 40, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Livraison aéroport', 'Livraison aéroport Mohammed V', 100, 'fixed', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Livraison hôtel', 'Livraison hôtel Casablanca', 80, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Plein de carburant', 'Plein de carburant', 350, 'fixed', false, 7, true),

-- ATLANTIC CARS
('11111111-aaaa-bbbb-cccc-000000000004', 'Siège bébé', 'Siège auto bébé', 40, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Siège enfant', 'Siège auto enfant', 40, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Conducteur additionnel', 'Conducteur supplémentaire', 60, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'GPS', 'Navigation GPS', 50, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'WiFi embarqué', 'Hotspot WiFi 4G', 50, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Livraison aéroport', 'Livraison aéroport Tanger', 150, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Livraison hôtel', 'Livraison hôtel', 100, 'fixed', false, 7, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Plein de carburant', 'Plein de carburant', 400, 'fixed', false, 8, true),

-- PRESTIGE AUTO MAROC (GPS et WiFi inclus = price 0, mandatory)
('11111111-aaaa-bbbb-cccc-000000000005', 'Siège bébé', 'Siège auto premium bébé', 80, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Siège enfant', 'Siège auto premium enfant', 80, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Conducteur additionnel', 'Conducteur supplémentaire', 150, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'GPS', 'Navigation GPS (inclus)', 0, 'per_day', true, 4, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'WiFi embarqué', 'WiFi haut débit (inclus)', 0, 'per_day', true, 5, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Chaînes neige', 'Chaînes neige premium', 100, 'per_day', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Livraison aéroport', 'Livraison aéroport (inclus)', 0, 'fixed', true, 7, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Livraison hôtel', 'Livraison hôtel/riad (inclus)', 0, 'fixed', true, 8, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Plein de carburant', 'Plein de carburant premium', 800, 'fixed', false, 9, true),

-- FÈS AUTO LOCATION
('11111111-aaaa-bbbb-cccc-000000000006', 'Siège bébé', 'Siège auto bébé', 30, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Siège enfant', 'Siège auto enfant', 30, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Conducteur additionnel', 'Conducteur supplémentaire', 40, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'GPS', 'Navigation GPS', 40, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Chaînes neige', 'Chaînes neige (recommandé Ifrane)', 80, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Livraison hôtel', 'Livraison à votre hôtel/riad', 80, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Plein de carburant', 'Plein de carburant', 300, 'fixed', false, 7, true)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 4. PROMO CODES
-- =============================================================================

INSERT INTO public.consumer_promo_codes (code, description, discount_bps, applies_to_establishment_ids, active, is_public, starts_at, ends_at) VALUES
('HERTZ20',   'Réduction 20% Hertz Location — Mars 2026',    2000, ARRAY['11111111-aaaa-bbbb-cccc-000000000001']::uuid[], true, true, '2026-03-01'::timestamptz, '2026-03-31 23:59:59'::timestamptz),
('DESERT100', 'Réduction 10% SaharaCar — Printemps 2026',    1000, ARRAY['11111111-aaaa-bbbb-cccc-000000000002']::uuid[], true, true, '2026-03-01'::timestamptz, '2026-04-15 23:59:59'::timestamptz),
('BIENVENUE', 'Réduction 15% CasaRent — Bienvenue',          1500, ARRAY['11111111-aaaa-bbbb-cccc-000000000003']::uuid[], true, true, '2026-01-01'::timestamptz, '2027-12-31 23:59:59'::timestamptz),
('LUXE500',   'Réduction 20% Prestige Auto — Printemps 2026', 2000, ARRAY['11111111-aaaa-bbbb-cccc-000000000005']::uuid[], true, true, '2026-03-01'::timestamptz, '2026-06-30 23:59:59'::timestamptz),
('TANGER10',  'Réduction 10% Atlantic Cars — Tanger',         1000, ARRAY['11111111-aaaa-bbbb-cccc-000000000004']::uuid[], true, true, '2026-04-01'::timestamptz, '2026-05-31 23:59:59'::timestamptz),
('FES25',     'Réduction 25% Fès Auto — Printemps 2026',      2500, ARRAY['11111111-aaaa-bbbb-cccc-000000000006']::uuid[], true, true, '2026-03-15'::timestamptz, '2026-04-15 23:59:59'::timestamptz)
ON CONFLICT (code) DO NOTHING;


COMMIT;

