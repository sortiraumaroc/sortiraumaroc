-- =============================================================================
-- Concierge Partners — Table de partenariat conciergerie ↔ établissement
-- avec commission individuelle et split admin/conciergerie.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.concierge_partners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_id    UUID NOT NULL REFERENCES public.concierges(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  commission_rate  NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  admin_share      NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  concierge_share  NUMERIC(5,2) NOT NULL DEFAULT 70.00,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'suspended')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- Partial unique: un seul partenariat actif par couple concierge/établissement
CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_partners_active
  ON public.concierge_partners(concierge_id, establishment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_concierge_partners_concierge
  ON public.concierge_partners(concierge_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_concierge_partners_establishment
  ON public.concierge_partners(establishment_id)
  WHERE deleted_at IS NULL;

-- Trigger updated_at (réutilise la fonction existante de la migration conciergerie MVP)
CREATE TRIGGER trg_concierge_partners_updated_at
  BEFORE UPDATE ON public.concierge_partners
  FOR EACH ROW
  EXECUTE FUNCTION conciergerie_set_updated_at();

-- RLS
ALTER TABLE public.concierge_partners ENABLE ROW LEVEL SECURITY;
