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

CREATE TRIGGER trg_rental_vehicles_updated_at
  BEFORE UPDATE ON public.rental_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

CREATE TRIGGER trg_rental_reservations_updated_at
  BEFORE UPDATE ON public.rental_reservations
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

CREATE TRIGGER trg_rental_insurance_plans_updated_at
  BEFORE UPDATE ON public.rental_insurance_plans
  FOR EACH ROW EXECUTE FUNCTION public.rental_set_updated_at();

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
