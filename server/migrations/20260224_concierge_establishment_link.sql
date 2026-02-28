-- Add establishment_id to concierges table
-- Links a conciergerie to an existing establishment (pro)
ALTER TABLE public.concierges
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_concierges_establishment_id
  ON public.concierges(establishment_id)
  WHERE establishment_id IS NOT NULL AND deleted_at IS NULL;
