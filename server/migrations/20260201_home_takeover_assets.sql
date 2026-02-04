-- =============================================================================
-- HOME TAKEOVER ASSETS - Ajout des champs pour les visuels et configuration
-- =============================================================================

-- Ajouter les colonnes pour les assets du Home Takeover
ALTER TABLE public.ad_home_takeover_calendar
  ADD COLUMN IF NOT EXISTS banner_desktop_url text,
  ADD COLUMN IF NOT EXISTS banner_mobile_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cta_text text DEFAULT 'Découvrir',
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS subheadline text,
  ADD COLUMN IF NOT EXISTS background_color text DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS text_color text DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL;

-- Commentaires sur les dimensions recommandées
COMMENT ON COLUMN public.ad_home_takeover_calendar.banner_desktop_url IS 'Banner desktop: 1920x400px, JPG/PNG/WebP';
COMMENT ON COLUMN public.ad_home_takeover_calendar.banner_mobile_url IS 'Banner mobile: 768x300px, JPG/PNG/WebP';
COMMENT ON COLUMN public.ad_home_takeover_calendar.logo_url IS 'Logo établissement: 200x200px, PNG transparent';

-- Index pour recherche par établissement
CREATE INDEX IF NOT EXISTS idx_ad_home_takeover_establishment
  ON public.ad_home_takeover_calendar (establishment_id)
  WHERE establishment_id IS NOT NULL;

-- Fonction pour récupérer le takeover du jour avec tous les détails
CREATE OR REPLACE FUNCTION public.get_today_home_takeover()
RETURNS TABLE (
  id uuid,
  date date,
  campaign_id uuid,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  establishment_cover_url text,
  banner_desktop_url text,
  banner_mobile_url text,
  logo_url text,
  cta_text text,
  cta_url text,
  headline text,
  subheadline text,
  background_color text,
  text_color text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    htc.id,
    htc.date,
    htc.campaign_id,
    htc.establishment_id,
    e.name::text as establishment_name,
    e.slug::text as establishment_slug,
    e.cover_url::text as establishment_cover_url,
    htc.banner_desktop_url,
    htc.banner_mobile_url,
    htc.logo_url,
    htc.cta_text,
    htc.cta_url,
    htc.headline,
    htc.subheadline,
    htc.background_color,
    htc.text_color
  FROM public.ad_home_takeover_calendar htc
  LEFT JOIN public.establishments e ON e.id = htc.establishment_id
  WHERE htc.date = CURRENT_DATE
    AND htc.status = 'confirmed'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accorder les droits
GRANT EXECUTE ON FUNCTION public.get_today_home_takeover() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_today_home_takeover() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_today_home_takeover() TO anon;
