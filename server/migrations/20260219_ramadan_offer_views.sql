-- Migration: Tracking des vues et clics sur les offres Ramadan
-- Permet d'afficher aux pros le nombre de clics et visiteurs uniques

CREATE TABLE IF NOT EXISTS public.ramadan_offer_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.ramadan_offers(id) ON DELETE CASCADE,
  -- event_type: 'impression' = l'offre est apparue (carte visible), 'click' = l'utilisateur a cliqué pour voir le détail
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  -- visitor_id: fingerprint anonyme (hash IP + user-agent) pour compter les visiteurs uniques sans stocker de données perso
  visitor_id TEXT NOT NULL,
  -- user_id: si l'utilisateur est connecté (optionnel)
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les stats par offre
CREATE INDEX IF NOT EXISTS idx_ramadan_offer_views_offer_event
  ON public.ramadan_offer_views (offer_id, event_type);

-- Index pour les comptages de visiteurs uniques
CREATE INDEX IF NOT EXISTS idx_ramadan_offer_views_offer_visitor
  ON public.ramadan_offer_views (offer_id, event_type, visitor_id);

-- Index de nettoyage par date (pour purge future)
CREATE INDEX IF NOT EXISTS idx_ramadan_offer_views_created_at
  ON public.ramadan_offer_views (created_at);

-- RLS
ALTER TABLE public.ramadan_offer_views ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut insérer (tracking anonyme)
CREATE POLICY ramadan_offer_views_insert ON public.ramadan_offer_views
  FOR INSERT WITH CHECK (true);

-- Seul le service role peut lire (pour les stats côté serveur)
CREATE POLICY ramadan_offer_views_select_service ON public.ramadan_offer_views
  FOR SELECT USING (auth.role() = 'service_role');

-- Fonction RPC pour compter les visiteurs uniques (COUNT DISTINCT)
CREATE OR REPLACE FUNCTION count_distinct_visitors(p_offer_id UUID, p_event_type TEXT)
RETURNS TABLE(count BIGINT) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(DISTINCT visitor_id) AS count
  FROM public.ramadan_offer_views
  WHERE offer_id = p_offer_id AND event_type = p_event_type;
$$;
