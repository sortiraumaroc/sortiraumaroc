-- =============================================================================
-- ESTABLISHMENT FAVORITES — Favoris d'établissements (consommateurs)
-- Permet aux utilisateurs connectés de sauvegarder des établissements.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.establishment_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT establishment_favorites_unique_user UNIQUE (establishment_id, user_id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_estab_fav_user_id ON public.establishment_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_estab_fav_establishment_id ON public.establishment_favorites(establishment_id);
CREATE INDEX IF NOT EXISTS idx_estab_fav_user_created ON public.establishment_favorites(user_id, created_at DESC);

-- RLS
ALTER TABLE public.establishment_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on establishment_favorites"
  ON public.establishment_favorites
  FOR ALL
  USING (true)
  WITH CHECK (true);
