-- =============================================================================
-- MIGRATIONS MANQUANTES - A executer dans Supabase SQL Editor
-- =============================================================================
-- Ce script combine les migrations essentielles manquantes pour resoudre:
-- 1. username_subscriptions table missing
-- 2. platform_settings table missing
-- =============================================================================

-- ============================================================================
-- 1. ESTABLISHMENT USERNAMES (prerequis pour username_subscriptions)
-- ============================================================================

-- Add username column to establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

-- Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishments_username_unique
  ON public.establishments(lower(username))
  WHERE username IS NOT NULL;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_establishments_username_lookup
  ON public.establishments(username);

-- Comment on columns
COMMENT ON COLUMN public.establishments.username IS 'Custom short URL username (e.g., @monrestaurant). Must be approved by admin.';
COMMENT ON COLUMN public.establishments.username_changed_at IS 'Timestamp of last username change. Cannot change again for 180 days.';

-- Create username moderation requests table
CREATE TABLE IF NOT EXISTS public.establishment_username_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  requested_username text NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_username_requests_establishment
  ON public.establishment_username_requests(establishment_id);

CREATE INDEX IF NOT EXISTS idx_username_requests_status
  ON public.establishment_username_requests(status);

CREATE INDEX IF NOT EXISTS idx_username_requests_username
  ON public.establishment_username_requests(lower(requested_username));

-- Comment on table
COMMENT ON TABLE public.establishment_username_requests IS 'Moderation queue for establishment username change requests';

-- Function to check username availability
CREATE OR REPLACE FUNCTION check_username_available(username_to_check text)
RETURNS boolean AS $$
BEGIN
  -- Normalize to lowercase
  username_to_check := lower(trim(username_to_check));

  -- Check if already taken by an establishment
  IF EXISTS (
    SELECT 1 FROM public.establishments
    WHERE lower(username) = username_to_check
  ) THEN
    RETURN false;
  END IF;

  -- Check if pending in moderation queue
  IF EXISTS (
    SELECT 1 FROM public.establishment_username_requests
    WHERE lower(requested_username) = username_to_check
    AND status = 'pending'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to validate username format
CREATE OR REPLACE FUNCTION validate_username_format(username_val text)
RETURNS boolean AS $$
BEGIN
  -- Must be 3-30 characters
  IF length(username_val) < 3 OR length(username_val) > 30 THEN
    RETURN false;
  END IF;

  -- Only lowercase letters, numbers, underscores, and dots allowed
  -- Must start with a letter
  -- Cannot end with underscore or dot
  -- No consecutive underscores or dots
  IF username_val !~ '^[a-z][a-z0-9._]*[a-z0-9]$' AND username_val !~ '^[a-z][a-z0-9]?$' THEN
    RETURN false;
  END IF;

  -- No consecutive dots or underscores
  IF username_val ~ '\.\.' OR username_val ~ '__' OR username_val ~ '\._' OR username_val ~ '_\.' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- RLS Policies for username_requests
ALTER TABLE public.establishment_username_requests ENABLE ROW LEVEL SECURITY;

-- Pro users can view their own requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro users can view own username requests' AND tablename = 'establishment_username_requests') THEN
    CREATE POLICY "Pro users can view own username requests"
      ON public.establishment_username_requests
      FOR SELECT
      USING (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Pro users with edit rights can create requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro users can create username requests' AND tablename = 'establishment_username_requests') THEN
    CREATE POLICY "Pro users can create username requests"
      ON public.establishment_username_requests
      FOR INSERT
      WITH CHECK (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid()
          AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- Admins can do everything
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all username requests' AND tablename = 'establishment_username_requests') THEN
    CREATE POLICY "Admins can manage all username requests"
      ON public.establishment_username_requests
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_profiles
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 2. USERNAME BLACKLIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.username_blacklist (
  slug text PRIMARY KEY,
  reason text NOT NULL,
  category text DEFAULT 'generic',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_username_blacklist_category
  ON public.username_blacklist(category);

COMMENT ON TABLE public.username_blacklist IS
  'Liste des usernames interdits (termes generiques, villes, mots reserves)';

-- Inserer les slugs interdits - Termes generiques
INSERT INTO public.username_blacklist (slug, reason, category) VALUES
  ('restaurant', 'Terme generique de categorie', 'generic'),
  ('restaurants', 'Terme generique de categorie', 'generic'),
  ('hotel', 'Terme generique de categorie', 'generic'),
  ('hotels', 'Terme generique de categorie', 'generic'),
  ('spa', 'Terme generique de categorie', 'generic'),
  ('spas', 'Terme generique de categorie', 'generic'),
  ('hammam', 'Terme generique de categorie', 'generic'),
  ('cafe', 'Terme generique de categorie', 'generic'),
  ('bar', 'Terme generique de categorie', 'generic'),
  ('club', 'Terme generique de categorie', 'generic'),
  ('riad', 'Terme generique de categorie', 'generic'),
  ('riads', 'Terme generique de categorie', 'generic')
ON CONFLICT (slug) DO NOTHING;

-- Noms de villes marocaines
INSERT INTO public.username_blacklist (slug, reason, category) VALUES
  ('marrakech', 'Nom de ville', 'city'),
  ('casablanca', 'Nom de ville', 'city'),
  ('rabat', 'Nom de ville', 'city'),
  ('tanger', 'Nom de ville', 'city'),
  ('fes', 'Nom de ville', 'city'),
  ('agadir', 'Nom de ville', 'city'),
  ('essaouira', 'Nom de ville', 'city')
ON CONFLICT (slug) DO NOTHING;

-- Termes reserves
INSERT INTO public.username_blacklist (slug, reason, category) VALUES
  ('admin', 'Terme reserve', 'reserved'),
  ('api', 'Terme reserve', 'reserved'),
  ('pro', 'Terme reserve', 'reserved'),
  ('sam', 'Terme reserve (marque)', 'reserved'),
  ('sortiraumaroc', 'Terme reserve (marque)', 'reserved'),
  ('support', 'Terme reserve', 'reserved'),
  ('help', 'Terme reserve', 'reserved'),
  ('contact', 'Terme reserve', 'reserved'),
  ('book', 'Terme reserve', 'reserved'),
  ('booking', 'Terme reserve', 'reserved'),
  ('test', 'Terme reserve', 'reserved'),
  ('demo', 'Terme reserve', 'reserved')
ON CONFLICT (slug) DO NOTHING;

-- Update function to check blacklist
CREATE OR REPLACE FUNCTION check_username_available(username_to_check text)
RETURNS boolean AS $$
BEGIN
  username_to_check := lower(trim(username_to_check));

  -- Verifier la liste noire
  IF EXISTS (
    SELECT 1 FROM public.username_blacklist
    WHERE slug = username_to_check
  ) THEN
    RETURN false;
  END IF;

  -- Verifier si deja pris par un etablissement
  IF EXISTS (
    SELECT 1 FROM public.establishments
    WHERE lower(username) = username_to_check
  ) THEN
    RETURN false;
  END IF;

  -- Verifier si en attente de moderation
  IF EXISTS (
    SELECT 1 FROM public.establishment_username_requests
    WHERE lower(requested_username) = username_to_check
    AND status = 'pending'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS pour username_blacklist
ALTER TABLE public.username_blacklist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read username blacklist' AND tablename = 'username_blacklist') THEN
    CREATE POLICY "Anyone can read username blacklist"
      ON public.username_blacklist
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage username blacklist' AND tablename = 'username_blacklist') THEN
    CREATE POLICY "Admins can manage username blacklist"
      ON public.username_blacklist
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_profiles
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 3. USERNAME SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.username_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  visibility_order_id uuid REFERENCES public.visibility_orders(id) ON DELETE SET NULL,

  -- Status flow: trial -> active (after payment) -> grace_period (after expiry) -> expired
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'pending', 'active', 'grace_period', 'expired', 'cancelled')),

  -- Trial tracking
  is_trial boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz NULL,

  -- Paid subscription dates
  starts_at timestamptz NULL,
  expires_at timestamptz NULL,
  grace_period_ends_at timestamptz NULL,

  -- Reminder tracking
  renewal_reminder_sent_at jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Cancellation
  cancelled_at timestamptz NULL,
  cancelled_by uuid NULL,

  -- Pricing snapshot
  price_cents int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MAD',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraint: only one active/trial/pending subscription per establishment
CREATE UNIQUE INDEX IF NOT EXISTS idx_username_subscriptions_active_unique
  ON public.username_subscriptions(establishment_id)
  WHERE status IN ('trial', 'pending', 'active', 'grace_period');

-- Index for cron job queries
CREATE INDEX IF NOT EXISTS idx_username_subscriptions_status_expires
  ON public.username_subscriptions(status, expires_at)
  WHERE status IN ('active', 'grace_period');

CREATE INDEX IF NOT EXISTS idx_username_subscriptions_trial_ends
  ON public.username_subscriptions(trial_ends_at)
  WHERE status = 'trial' AND trial_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_username_subscriptions_establishment
  ON public.username_subscriptions(establishment_id);

-- Trigger for updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname = 'set_updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_username_subscriptions_updated_at') THEN
      CREATE TRIGGER trg_username_subscriptions_updated_at
      BEFORE UPDATE ON public.username_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- Function: Check if establishment has valid username subscription access
CREATE OR REPLACE FUNCTION is_username_subscription_active(p_establishment_id uuid)
RETURNS boolean AS $$
DECLARE
  sub record;
BEGIN
  SELECT * INTO sub
  FROM public.username_subscriptions
  WHERE establishment_id = p_establishment_id
    AND status IN ('trial', 'active', 'grace_period')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF sub.status = 'trial' THEN
    RETURN sub.trial_ends_at IS NULL OR sub.trial_ends_at > now();
  END IF;

  IF sub.status = 'active' THEN
    RETURN sub.expires_at IS NULL OR sub.expires_at > now();
  END IF;

  IF sub.status = 'grace_period' THEN
    RETURN false;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Check if username is reserved
CREATE OR REPLACE FUNCTION is_username_reserved(p_establishment_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.username_subscriptions
    WHERE establishment_id = p_establishment_id
      AND status IN ('trial', 'active', 'grace_period')
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Extend visibility_offers type constraint for username_subscription
ALTER TABLE public.visibility_offers
  DROP CONSTRAINT IF EXISTS visibility_offers_type_check;

ALTER TABLE public.visibility_offers
  ADD CONSTRAINT visibility_offers_type_check
  CHECK (type IN ('pack', 'option', 'menu_digital', 'media_video', 'username_subscription'));

ALTER TABLE public.visibility_order_items
  DROP CONSTRAINT IF EXISTS visibility_order_items_type_check;

ALTER TABLE public.visibility_order_items
  ADD CONSTRAINT visibility_order_items_type_check
  CHECK (type IN ('pack', 'option', 'menu_digital', 'media_video', 'username_subscription'));

-- Seed the Username Subscription offer
INSERT INTO public.visibility_offers (
  title,
  description,
  type,
  deliverables,
  duration_days,
  price_cents,
  currency,
  allow_quantity,
  tax_rate_bps,
  tax_label,
  active,
  display_order
)
SELECT * FROM (
  VALUES (
    'LIEN PERSONNALISE book.sam.ma',
    'Abonnement annuel au lien de reservation personnalise.',
    'username_subscription',
    ARRAY[
      'Lien personnalise book.sam.ma/@votrenom',
      'QR Code unique pour vos supports',
      'Reservations sans commission SAM'
    ]::text[],
    365,
    240000,
    'MAD',
    false,
    2000,
    'TVA',
    true,
    5
  )
) AS v(
  title, description, type, deliverables, duration_days,
  price_cents, currency, allow_quantity, tax_rate_bps, tax_label, active, display_order
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.visibility_offers o
  WHERE o.type = 'username_subscription' AND o.deleted_at IS NULL
);

-- RLS Policies for username_subscriptions
ALTER TABLE public.username_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro users can view own username subscriptions' AND tablename = 'username_subscriptions') THEN
    CREATE POLICY "Pro users can view own username subscriptions"
      ON public.username_subscriptions
      FOR SELECT
      USING (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all username subscriptions' AND tablename = 'username_subscriptions') THEN
    CREATE POLICY "Admins can manage all username subscriptions"
      ON public.username_subscriptions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_profiles
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 4. PLATFORM SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  value_type text NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'boolean', 'number', 'json')),
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_sensitive boolean NOT NULL DEFAULT false,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_settings IS 'Platform-wide configuration settings managed by Superadmin';

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to platform_settings' AND tablename = 'platform_settings') THEN
    CREATE POLICY "Service role full access to platform_settings"
      ON public.platform_settings
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON public.platform_settings(category);

-- Seed default settings
INSERT INTO public.platform_settings (key, value, value_type, label, description, category) VALUES
  ('PLATFORM_MODE', 'test', 'string', 'Mode de la Plateforme', 'Mode actuel: test ou commercial', 'mode'),
  ('PAYMENTS_RESERVATIONS_ENABLED', 'false', 'boolean', 'Paiements Reservations', 'Activer les paiements sur les reservations', 'payments'),
  ('COMMISSIONS_ENABLED', 'false', 'boolean', 'Commissions', 'Activer le calcul des commissions', 'payments'),
  ('SUBSCRIPTIONS_ENABLED', 'false', 'boolean', 'Abonnements PRO', 'Activer les abonnements professionnels', 'payments'),
  ('PACKS_PURCHASES_ENABLED', 'false', 'boolean', 'Achats de Packs', 'Permettre les achats de packs', 'payments'),
  ('PAYOUTS_ENABLED', 'false', 'boolean', 'Payouts PRO', 'Permettre les demandes de virements', 'payments'),
  ('VISIBILITY_ORDERS_ENABLED', 'true', 'boolean', 'Commandes Visibilite', 'Permettre les achats de visibilite', 'visibility'),
  ('FREE_RESERVATIONS_ENABLED', 'true', 'boolean', 'Reservations Gratuites', 'Permettre les reservations sans paiement', 'reservations'),
  ('BRAND_NAME', 'Sortir Au Maroc', 'string', 'Nom de Marque', 'Nom principal de la plateforme', 'branding'),
  ('BRAND_SHORT', 'SAM', 'string', 'Nom Court', 'Acronyme de la plateforme', 'branding'),
  ('BRAND_DOMAIN', 'sortiraumaroc.ma', 'string', 'Domaine Principal', 'Domaine web principal', 'branding')
ON CONFLICT (key) DO NOTHING;

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_platform_setting(setting_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT value FROM public.platform_settings WHERE key = setting_key LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_setting_bool(setting_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT value = 'true' FROM public.platform_settings WHERE key = setting_key LIMIT 1;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_platform_setting(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_setting_bool(text) TO authenticated;

-- Audit trigger
CREATE OR REPLACE FUNCTION public.platform_settings_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  new.updated_at := now();

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_log') THEN
    INSERT INTO public.admin_audit_log (action, entity_type, entity_id, metadata, created_at)
    VALUES (
      'settings.platform.update',
      'platform_settings',
      new.key,
      jsonb_build_object(
        'old_value', old.value,
        'new_value', new.value,
        'updated_by', new.updated_by
      ),
      now()
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS platform_settings_audit ON public.platform_settings;
CREATE TRIGGER platform_settings_audit
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_settings_audit_trigger();

-- ============================================================================
-- FIN DES MIGRATIONS
-- ============================================================================
-- Executez ce script dans Supabase Dashboard > SQL Editor
-- ============================================================================
