-- =============================================================================
-- Concierge Allowed Cities — Villes supplémentaires autorisées par l'admin.
-- La ville principale reste dans concierges.city ; cette table ajoute des
-- villes complémentaires pour la recherche d'établissements.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.concierge_allowed_cities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_id UUID NOT NULL REFERENCES public.concierges(id) ON DELETE CASCADE,
  city         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(concierge_id, city)
);

CREATE INDEX IF NOT EXISTS idx_concierge_allowed_cities_concierge
  ON public.concierge_allowed_cities(concierge_id);

ALTER TABLE public.concierge_allowed_cities ENABLE ROW LEVEL SECURITY;
