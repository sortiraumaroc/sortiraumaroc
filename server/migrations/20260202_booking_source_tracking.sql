-- Booking Source Tracking
-- Permet de distinguer les reservations via la plateforme (commissionnees)
-- des reservations via lien direct book.sam.ma/:username (non commissionnees)

BEGIN;

-- ---------------------------------------------------------------------------
-- Ajouter les colonnes de tracking de source sur reservations
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS referral_slug text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Ajouter la contrainte CHECK pour booking_source
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_booking_source_check'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_booking_source_check
      CHECK (booking_source IN ('platform', 'direct_link'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Index pour le reporting par source
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservations_booking_source
  ON public.reservations(booking_source);

CREATE INDEX IF NOT EXISTS idx_reservations_referral_slug
  ON public.reservations(referral_slug)
  WHERE referral_slug IS NOT NULL;

-- Index composite pour les stats par etablissement et source
CREATE INDEX IF NOT EXISTS idx_reservations_establishment_source
  ON public.reservations(establishment_id, booking_source);

-- Index pour les requetes de reporting avec date
CREATE INDEX IF NOT EXISTS idx_reservations_source_created
  ON public.reservations(booking_source, created_at DESC);

-- ---------------------------------------------------------------------------
-- Commentaires
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.reservations.booking_source IS
  'Source de la reservation: platform (via sam.ma, commissionnee) ou direct_link (via book.sam.ma/:username, non commissionnee)';

COMMENT ON COLUMN public.reservations.referral_slug IS
  'Username de l''etablissement si booking_source = direct_link, NULL sinon';

COMMENT ON COLUMN public.reservations.source_url IS
  'URL d''origine de la reservation (header Referer)';

-- ---------------------------------------------------------------------------
-- Fonction pour obtenir les stats de source par etablissement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_establishment_booking_source_stats(
  p_establishment_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  booking_source text,
  reservation_count bigint,
  total_revenue_cents bigint,
  confirmed_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.booking_source,
    COUNT(*)::bigint as reservation_count,
    COALESCE(SUM(r.amount_total), 0)::bigint as total_revenue_cents,
    COUNT(*) FILTER (WHERE r.status = 'confirmed')::bigint as confirmed_count
  FROM public.reservations r
  WHERE r.establishment_id = p_establishment_id
    AND (p_start_date IS NULL OR r.created_at >= p_start_date)
    AND (p_end_date IS NULL OR r.created_at < p_end_date)
  GROUP BY r.booking_source;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_establishment_booking_source_stats IS
  'Retourne les statistiques de reservations par source (platform/direct_link) pour un etablissement';

-- ---------------------------------------------------------------------------
-- Fonction pour calculer les economies de commission (lien direct)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_establishment_commission_savings(
  p_establishment_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_commission_rate numeric DEFAULT 10.0  -- Taux de commission par defaut si non specifie
)
RETURNS TABLE (
  direct_link_count bigint,
  direct_link_revenue_cents bigint,
  estimated_savings_cents bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as direct_link_count,
    COALESCE(SUM(r.amount_total), 0)::bigint as direct_link_revenue_cents,
    ROUND(COALESCE(SUM(r.amount_total), 0) * p_commission_rate / 100)::bigint as estimated_savings_cents
  FROM public.reservations r
  WHERE r.establishment_id = p_establishment_id
    AND r.booking_source = 'direct_link'
    AND r.status IN ('confirmed', 'pending_pro_validation')
    AND (p_start_date IS NULL OR r.created_at >= p_start_date)
    AND (p_end_date IS NULL OR r.created_at < p_end_date);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_establishment_commission_savings IS
  'Calcule les economies de commission realisees grace aux reservations via lien direct';

COMMIT;
