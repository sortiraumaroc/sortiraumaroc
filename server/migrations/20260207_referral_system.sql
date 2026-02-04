-- =============================================================================
-- SYSTÈME DE PARRAINAGE COMPLET
-- =============================================================================
-- Tables: referral_partners, referral_links, referral_commissions,
--         referral_config, referral_config_universes, referral_payouts
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TABLE: referral_partners (Profils Parrains)
-- ---------------------------------------------------------------------------
-- Un parrain est un utilisateur (consumer) qui peut parrainer d'autres users
-- et toucher des commissions sur leurs réservations.

CREATE TABLE IF NOT EXISTS public.referral_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers le compte utilisateur consumer
  user_id TEXT NOT NULL,

  -- Code de parrainage unique (proposé par le parrain ou généré)
  referral_code TEXT NOT NULL,

  -- Statut du compte parrain
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),

  -- Type de parrain (pour stats et éventuels taux différenciés)
  partner_type TEXT DEFAULT 'individual'
    CHECK (partner_type IN ('individual', 'influencer', 'business', 'taxi', 'hotel', 'concierge', 'other')),

  -- Infos publiques
  display_name TEXT,
  bio TEXT,

  -- Coordonnées de paiement
  bank_name TEXT,
  bank_account_holder TEXT,
  bank_rib TEXT,

  -- Modération
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,

  -- Notes internes (admin)
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contraintes
  CONSTRAINT referral_partners_code_format
    CHECK (referral_code ~ '^[A-Za-z0-9_-]{3,20}$')
);

-- Index unique insensible à la casse pour le code
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_partners_code_unique
  ON public.referral_partners(LOWER(referral_code));

-- Un user ne peut avoir qu'un seul compte parrain
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_partners_user_unique
  ON public.referral_partners(user_id);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_referral_partners_status
  ON public.referral_partners(status);
CREATE INDEX IF NOT EXISTS idx_referral_partners_type
  ON public.referral_partners(partner_type);
CREATE INDEX IF NOT EXISTS idx_referral_partners_requested_at
  ON public.referral_partners(requested_at DESC);

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_referral_partners_updated_at') THEN
      CREATE TRIGGER trg_referral_partners_updated_at
        BEFORE UPDATE ON public.referral_partners
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- RLS
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.referral_partners IS
  'Profils des parrains (influenceurs, chauffeurs taxi, etc.) qui peuvent parrainer des utilisateurs';
COMMENT ON COLUMN public.referral_partners.referral_code IS
  'Code unique de parrainage (3-20 caractères alphanumériques, tirets, underscores)';
COMMENT ON COLUMN public.referral_partners.status IS
  'pending=en attente validation, active=actif, suspended=suspendu, rejected=refusé';


-- ---------------------------------------------------------------------------
-- 2. TABLE: referral_links (Relations Parrain → Filleul)
-- ---------------------------------------------------------------------------
-- Stocke le lien permanent entre un parrain et ses filleuls.
-- Créé lors de l'inscription d'un filleul avec un code valide.

CREATE TABLE IF NOT EXISTS public.referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Le parrain
  partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,

  -- Le filleul (consumer inscrit)
  referree_user_id TEXT NOT NULL,

  -- Code utilisé lors de l'inscription (snapshot)
  referral_code_used TEXT NOT NULL,

  -- Source du parrainage
  source TEXT DEFAULT 'registration'
    CHECK (source IN ('registration', 'link', 'qrcode', 'manual', 'import')),

  -- URL de provenance (pour tracking)
  source_url TEXT,

  -- Timestamp de création (inscription du filleul)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un filleul ne peut avoir qu'un seul parrain
  CONSTRAINT referral_links_unique_referree UNIQUE(referree_user_id)
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_referral_links_partner_id
  ON public.referral_links(partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_created_at
  ON public.referral_links(created_at DESC);

-- RLS
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.referral_links IS
  'Relations permanentes entre parrains et filleuls';
COMMENT ON COLUMN public.referral_links.referral_code_used IS
  'Snapshot du code utilisé (au cas où le parrain change de code plus tard)';


-- ---------------------------------------------------------------------------
-- 3. TABLE: referral_commissions (Commissions sur réservations)
-- ---------------------------------------------------------------------------
-- Une commission est créée pour chaque réservation d'un filleul.
-- Son statut évolue avec celui de la réservation.

CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Liens
  partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  referral_link_id UUID NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,

  -- Montants (en centimes MAD)
  reservation_amount_cents BIGINT NOT NULL,
  deposit_amount_cents BIGINT,

  -- Calcul de la commission
  commission_rate_percent NUMERIC(5,2),
  commission_fixed_amount_cents BIGINT,
  final_commission_cents BIGINT NOT NULL,

  -- Source du taux appliqué (pour audit)
  commission_source TEXT DEFAULT 'global'
    CHECK (commission_source IN ('global', 'universe', 'partner_override', 'manual')),

  -- Statut
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'cancelled', 'paid')),

  -- Contexte de la réservation
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  establishment_name TEXT,
  establishment_universe TEXT,

  -- Dates importantes
  reservation_date TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Raison d'annulation si applicable
  cancellation_reason TEXT,

  -- Lien vers le payout (quand payé)
  payout_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Une seule commission par réservation
  CONSTRAINT referral_commissions_unique_reservation UNIQUE(reservation_id)
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_referral_commissions_partner_id
  ON public.referral_commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_partner_status
  ON public.referral_commissions(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status
  ON public.referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_created_at
  ON public.referral_commissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_payout
  ON public.referral_commissions(payout_id) WHERE payout_id IS NOT NULL;

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_referral_commissions_updated_at') THEN
      CREATE TRIGGER trg_referral_commissions_updated_at
        BEFORE UPDATE ON public.referral_commissions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- RLS
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.referral_commissions IS
  'Commissions générées pour chaque réservation effectuée par un filleul';
COMMENT ON COLUMN public.referral_commissions.commission_source IS
  'Origine du taux: global, universe (par catégorie), partner_override, manual';


-- ---------------------------------------------------------------------------
-- 4. TABLE: referral_config (Configuration globale - Singleton)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Taux de commission par défaut
  default_commission_percent NUMERIC(5,2) DEFAULT 5.00,
  default_commission_fixed_cents BIGINT,

  -- Mode de calcul: percent, fixed, both_max (le plus élevé), both_min (le plus bas)
  commission_mode TEXT DEFAULT 'percent'
    CHECK (commission_mode IN ('percent', 'fixed', 'both_max', 'both_min')),

  -- Base de calcul
  commission_base TEXT DEFAULT 'deposit'
    CHECK (commission_base IN ('deposit', 'total')),

  -- Seuil minimum pour qu'une commission soit créée (en centimes)
  min_reservation_amount_cents BIGINT DEFAULT 0,
  min_commission_amount_cents BIGINT DEFAULT 100,

  -- Statuts de réservation éligibles à la commission
  eligible_reservation_statuses TEXT[] DEFAULT ARRAY['confirmed', 'completed'],

  -- Statuts qui valident automatiquement la commission
  validating_statuses TEXT[] DEFAULT ARRAY['confirmed', 'completed'],

  -- Statuts qui annulent automatiquement la commission
  cancelling_statuses TEXT[] DEFAULT ARRAY['cancelled', 'no_show', 'refunded'],

  -- Programme actif ou non
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Initialiser avec les valeurs par défaut
INSERT INTO public.referral_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.referral_config IS
  'Configuration globale du programme de parrainage (singleton)';
COMMENT ON COLUMN public.referral_config.commission_mode IS
  'percent=pourcentage, fixed=montant fixe, both_max=max des deux, both_min=min des deux';


-- ---------------------------------------------------------------------------
-- 5. TABLE: referral_config_universes (Taux par univers/catégorie)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_config_universes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Univers concerné (restaurant, wellness, loisir, etc.)
  universe TEXT NOT NULL UNIQUE,

  -- Taux spécifique pour cet univers
  commission_percent NUMERIC(5,2),
  commission_fixed_cents BIGINT,

  -- Actif ou non
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_referral_config_universes_updated_at') THEN
      CREATE TRIGGER trg_referral_config_universes_updated_at
        BEFORE UPDATE ON public.referral_config_universes
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.referral_config_universes IS
  'Taux de commission de parrainage spécifiques par univers (restaurant, wellness, etc.)';


-- ---------------------------------------------------------------------------
-- 6. TABLE: referral_payouts (Paiements aux parrains)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parrain concerné
  partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,

  -- Montant total payé (en centimes)
  amount_cents BIGINT NOT NULL,
  currency TEXT DEFAULT 'MAD',

  -- Période couverte
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Nombre de commissions incluses
  commission_count INTEGER NOT NULL DEFAULT 0,

  -- Statut du paiement
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),

  -- Détails du paiement
  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'cash', 'check', 'other')),
  payment_reference TEXT,

  -- Dates
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Admin qui a traité
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Notes
  admin_notes TEXT,
  partner_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_referral_payouts_partner_id
  ON public.referral_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_status
  ON public.referral_payouts(status);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_created_at
  ON public.referral_payouts(created_at DESC);

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_referral_payouts_updated_at') THEN
      CREATE TRIGGER trg_referral_payouts_updated_at
        BEFORE UPDATE ON public.referral_payouts
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- RLS
ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

-- Ajouter la FK sur referral_commissions.payout_id
ALTER TABLE public.referral_commissions
  ADD CONSTRAINT fk_referral_commissions_payout
  FOREIGN KEY (payout_id) REFERENCES public.referral_payouts(id) ON DELETE SET NULL;

COMMENT ON TABLE public.referral_payouts IS
  'Historique des paiements versés aux parrains';


-- ---------------------------------------------------------------------------
-- 7. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------------

-- Fonction pour valider un code de parrainage
CREATE OR REPLACE FUNCTION validate_referral_code(p_code TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  partner_id UUID,
  partner_display_name TEXT,
  error_message TEXT
) AS $$
BEGIN
  -- Vérifier si le code existe et est actif
  RETURN QUERY
  SELECT
    CASE WHEN rp.id IS NOT NULL AND rp.status = 'active' THEN TRUE ELSE FALSE END,
    rp.id,
    rp.display_name,
    CASE
      WHEN rp.id IS NULL THEN 'Code de parrainage invalide'
      WHEN rp.status = 'pending' THEN 'Ce parrain n''est pas encore activé'
      WHEN rp.status = 'suspended' THEN 'Ce compte parrain est suspendu'
      WHEN rp.status = 'rejected' THEN 'Ce compte parrain a été refusé'
      ELSE NULL
    END
  FROM public.referral_partners rp
  WHERE LOWER(rp.referral_code) = LOWER(p_code);

  -- Si aucun résultat, retourner invalide
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Code de parrainage invalide'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION validate_referral_code IS
  'Valide un code de parrainage et retourne les infos du parrain si valide';


-- Fonction pour générer un code unique
CREATE OR REPLACE FUNCTION generate_unique_referral_code(p_base TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_attempts INTEGER := 0;
  v_max_attempts INTEGER := 100;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;

    IF p_base IS NOT NULL AND v_attempts = 1 THEN
      -- Première tentative: utiliser la base proposée
      v_code := UPPER(REGEXP_REPLACE(p_base, '[^A-Za-z0-9_-]', '', 'g'));
      v_code := SUBSTRING(v_code FROM 1 FOR 20);
    ELSE
      -- Générer un code aléatoire
      v_code := UPPER(
        SUBSTRING(
          REPLACE(REPLACE(encode(gen_random_bytes(8), 'base64'), '+', ''), '/', ''),
          1,
          8
        )
      );
    END IF;

    -- Vérifier l'unicité
    IF NOT EXISTS (
      SELECT 1 FROM public.referral_partners WHERE LOWER(referral_code) = LOWER(v_code)
    ) THEN
      RETURN v_code;
    END IF;

    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Impossible de générer un code unique après % tentatives', v_max_attempts;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_unique_referral_code IS
  'Génère un code de parrainage unique, optionnellement basé sur une proposition';


-- Fonction pour calculer la commission d'un parrain
CREATE OR REPLACE FUNCTION compute_referral_commission(
  p_partner_id UUID,
  p_reservation_amount_cents BIGINT,
  p_deposit_amount_cents BIGINT,
  p_universe TEXT DEFAULT NULL
)
RETURNS TABLE (
  commission_cents BIGINT,
  commission_percent NUMERIC(5,2),
  commission_fixed BIGINT,
  commission_source TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_universe_config RECORD;
  v_base_amount BIGINT;
  v_percent_result BIGINT;
  v_fixed_result BIGINT;
  v_final BIGINT;
  v_source TEXT := 'global';
BEGIN
  -- Récupérer la config globale
  SELECT * INTO v_config FROM public.referral_config WHERE id = 1;

  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN QUERY SELECT 0::BIGINT, NULL::NUMERIC(5,2), NULL::BIGINT, 'inactive'::TEXT;
    RETURN;
  END IF;

  -- Déterminer la base de calcul
  IF v_config.commission_base = 'deposit' AND p_deposit_amount_cents IS NOT NULL THEN
    v_base_amount := p_deposit_amount_cents;
  ELSE
    v_base_amount := p_reservation_amount_cents;
  END IF;

  -- Vérifier le seuil minimum
  IF v_base_amount < COALESCE(v_config.min_reservation_amount_cents, 0) THEN
    RETURN QUERY SELECT 0::BIGINT, NULL::NUMERIC(5,2), NULL::BIGINT, 'below_minimum'::TEXT;
    RETURN;
  END IF;

  -- Chercher un taux spécifique par univers
  IF p_universe IS NOT NULL THEN
    SELECT * INTO v_universe_config
    FROM public.referral_config_universes
    WHERE universe = p_universe AND is_active = TRUE;

    IF v_universe_config IS NOT NULL THEN
      v_source := 'universe';
    END IF;
  END IF;

  -- Calculer selon le mode
  CASE v_config.commission_mode
    WHEN 'percent' THEN
      v_percent_result := ROUND(
        v_base_amount * COALESCE(v_universe_config.commission_percent, v_config.default_commission_percent, 0) / 100
      );
      v_final := v_percent_result;

    WHEN 'fixed' THEN
      v_fixed_result := COALESCE(v_universe_config.commission_fixed_cents, v_config.default_commission_fixed_cents, 0);
      v_final := LEAST(v_fixed_result, v_base_amount);

    WHEN 'both_max' THEN
      v_percent_result := ROUND(
        v_base_amount * COALESCE(v_universe_config.commission_percent, v_config.default_commission_percent, 0) / 100
      );
      v_fixed_result := COALESCE(v_universe_config.commission_fixed_cents, v_config.default_commission_fixed_cents, 0);
      v_final := GREATEST(v_percent_result, LEAST(v_fixed_result, v_base_amount));

    WHEN 'both_min' THEN
      v_percent_result := ROUND(
        v_base_amount * COALESCE(v_universe_config.commission_percent, v_config.default_commission_percent, 0) / 100
      );
      v_fixed_result := COALESCE(v_universe_config.commission_fixed_cents, v_config.default_commission_fixed_cents, 0);
      v_final := LEAST(v_percent_result, LEAST(v_fixed_result, v_base_amount));

    ELSE
      v_final := 0;
  END CASE;

  -- Appliquer le minimum de commission
  IF v_final < COALESCE(v_config.min_commission_amount_cents, 0) THEN
    v_final := 0;
  END IF;

  RETURN QUERY SELECT
    v_final,
    COALESCE(v_universe_config.commission_percent, v_config.default_commission_percent),
    COALESCE(v_universe_config.commission_fixed_cents, v_config.default_commission_fixed_cents),
    v_source;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION compute_referral_commission IS
  'Calcule la commission de parrainage pour une réservation donnée';


-- Fonction pour obtenir les stats d'un parrain
CREATE OR REPLACE FUNCTION get_referral_partner_stats(p_partner_id UUID)
RETURNS TABLE (
  total_referrees BIGINT,
  total_commissions BIGINT,
  total_earned_cents BIGINT,
  pending_cents BIGINT,
  validated_cents BIGINT,
  paid_cents BIGINT,
  this_month_earned_cents BIGINT,
  this_month_referrees BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.referral_links WHERE partner_id = p_partner_id)::BIGINT,
    (SELECT COUNT(*) FROM public.referral_commissions WHERE partner_id = p_partner_id)::BIGINT,
    COALESCE((SELECT SUM(final_commission_cents) FROM public.referral_commissions WHERE partner_id = p_partner_id AND status != 'cancelled'), 0)::BIGINT,
    COALESCE((SELECT SUM(final_commission_cents) FROM public.referral_commissions WHERE partner_id = p_partner_id AND status = 'pending'), 0)::BIGINT,
    COALESCE((SELECT SUM(final_commission_cents) FROM public.referral_commissions WHERE partner_id = p_partner_id AND status = 'validated'), 0)::BIGINT,
    COALESCE((SELECT SUM(final_commission_cents) FROM public.referral_commissions WHERE partner_id = p_partner_id AND status = 'paid'), 0)::BIGINT,
    COALESCE((SELECT SUM(final_commission_cents) FROM public.referral_commissions WHERE partner_id = p_partner_id AND status != 'cancelled' AND created_at >= DATE_TRUNC('month', NOW())), 0)::BIGINT,
    (SELECT COUNT(*) FROM public.referral_links WHERE partner_id = p_partner_id AND created_at >= DATE_TRUNC('month', NOW()))::BIGINT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_referral_partner_stats IS
  'Retourne les statistiques complètes d''un parrain';


-- ---------------------------------------------------------------------------
-- 8. VUES POUR FACILITER LES REQUÊTES
-- ---------------------------------------------------------------------------

-- Vue des parrains avec leurs stats
CREATE OR REPLACE VIEW public.referral_partners_with_stats AS
SELECT
  rp.*,
  COALESCE(link_stats.referree_count, 0) AS referree_count,
  COALESCE(commission_stats.total_earned_cents, 0) AS total_earned_cents,
  COALESCE(commission_stats.pending_cents, 0) AS pending_cents,
  COALESCE(commission_stats.validated_cents, 0) AS validated_cents
FROM public.referral_partners rp
LEFT JOIN (
  SELECT partner_id, COUNT(*) AS referree_count
  FROM public.referral_links
  GROUP BY partner_id
) link_stats ON link_stats.partner_id = rp.id
LEFT JOIN (
  SELECT
    partner_id,
    SUM(final_commission_cents) FILTER (WHERE status != 'cancelled') AS total_earned_cents,
    SUM(final_commission_cents) FILTER (WHERE status = 'pending') AS pending_cents,
    SUM(final_commission_cents) FILTER (WHERE status = 'validated') AS validated_cents
  FROM public.referral_commissions
  GROUP BY partner_id
) commission_stats ON commission_stats.partner_id = rp.id;

COMMENT ON VIEW public.referral_partners_with_stats IS
  'Vue des parrains enrichie avec leurs statistiques';


-- ---------------------------------------------------------------------------
-- 9. TRIGGER POUR MISE À JOUR AUTOMATIQUE DES COMMISSIONS
-- ---------------------------------------------------------------------------

-- Fonction trigger pour créer/mettre à jour les commissions lors des changements de réservation
CREATE OR REPLACE FUNCTION handle_reservation_referral_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_referral_link RECORD;
  v_partner RECORD;
  v_commission RECORD;
  v_establishment RECORD;
  v_config RECORD;
BEGIN
  -- Récupérer la config
  SELECT * INTO v_config FROM public.referral_config WHERE id = 1;

  -- Si le programme n'est pas actif, ne rien faire
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN NEW;
  END IF;

  -- Chercher si le user a un parrain
  SELECT rl.*, rp.status AS partner_status
  INTO v_referral_link
  FROM public.referral_links rl
  JOIN public.referral_partners rp ON rp.id = rl.partner_id
  WHERE rl.referree_user_id = NEW.user_id;

  -- Pas de parrain = pas de commission
  IF v_referral_link IS NULL THEN
    RETURN NEW;
  END IF;

  -- Parrain non actif = pas de commission
  IF v_referral_link.partner_status != 'active' THEN
    RETURN NEW;
  END IF;

  -- Récupérer les infos de l'établissement
  SELECT id, name, universe INTO v_establishment
  FROM public.establishments
  WHERE id = NEW.establishment_id;

  -- Vérifier si une commission existe déjà pour cette réservation
  SELECT * INTO v_commission
  FROM public.referral_commissions
  WHERE reservation_id = NEW.id;

  -- INSERT: Créer la commission si le statut est éligible
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = ANY(v_config.eligible_reservation_statuses) THEN
      -- Calculer la commission
      INSERT INTO public.referral_commissions (
        partner_id,
        referral_link_id,
        reservation_id,
        reservation_amount_cents,
        deposit_amount_cents,
        commission_rate_percent,
        final_commission_cents,
        commission_source,
        status,
        establishment_id,
        establishment_name,
        establishment_universe,
        reservation_date
      )
      SELECT
        v_referral_link.partner_id,
        v_referral_link.id,
        NEW.id,
        COALESCE(NEW.amount_total, 0),
        NEW.amount_deposit,
        comp.commission_percent,
        comp.commission_cents,
        comp.commission_source,
        'pending',
        v_establishment.id,
        v_establishment.name,
        v_establishment.universe,
        NEW.starts_at
      FROM compute_referral_commission(
        v_referral_link.partner_id,
        COALESCE(NEW.amount_total, 0),
        NEW.amount_deposit,
        v_establishment.universe
      ) comp
      WHERE comp.commission_cents > 0;
    END IF;

  -- UPDATE: Mettre à jour le statut de la commission
  ELSIF TG_OP = 'UPDATE' AND v_commission IS NOT NULL THEN
    -- Si le statut de la réservation change vers un statut validant
    IF NEW.status = ANY(v_config.validating_statuses) AND v_commission.status = 'pending' THEN
      UPDATE public.referral_commissions
      SET status = 'validated', validated_at = NOW()
      WHERE id = v_commission.id;

    -- Si le statut change vers un statut annulant
    ELSIF NEW.status = ANY(v_config.cancelling_statuses) AND v_commission.status IN ('pending', 'validated') THEN
      UPDATE public.referral_commissions
      SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = 'Réservation ' || NEW.status
      WHERE id = v_commission.id;
    END IF;

    -- Mettre à jour les montants si ils changent
    IF NEW.amount_total IS DISTINCT FROM OLD.amount_total OR NEW.amount_deposit IS DISTINCT FROM OLD.amount_deposit THEN
      UPDATE public.referral_commissions rc
      SET
        reservation_amount_cents = COALESCE(NEW.amount_total, 0),
        deposit_amount_cents = NEW.amount_deposit,
        final_commission_cents = comp.commission_cents,
        commission_rate_percent = comp.commission_percent
      FROM compute_referral_commission(
        v_referral_link.partner_id,
        COALESCE(NEW.amount_total, 0),
        NEW.amount_deposit,
        v_establishment.universe
      ) comp
      WHERE rc.id = v_commission.id
        AND rc.status NOT IN ('paid', 'cancelled');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger sur reservations
DROP TRIGGER IF EXISTS trg_reservation_referral_commission ON public.reservations;
CREATE TRIGGER trg_reservation_referral_commission
  AFTER INSERT OR UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION handle_reservation_referral_commission();

COMMENT ON FUNCTION handle_reservation_referral_commission IS
  'Gère automatiquement les commissions de parrainage lors des changements de réservation';


COMMIT;
