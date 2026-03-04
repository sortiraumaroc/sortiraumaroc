-- =============================================================================
-- Migration: Ramadan 2026 Module — Tables principales
-- Date: 2026-02-19
-- Description: Table ramadan_offers + ramadan_qr_scans + extension reservations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table des offres Ramadan
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ramadan_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL,

  -- Contenu
  title TEXT NOT NULL,
  description_fr TEXT,
  description_ar TEXT,

  -- Type d'offre
  type TEXT NOT NULL CHECK (type IN ('ftour', 'shour', 'traiteur', 'pack_famille', 'special')),

  -- Tarification (centimes)
  price INTEGER NOT NULL,
  original_price INTEGER, -- pour afficher la remise
  currency TEXT NOT NULL DEFAULT 'MAD',

  -- Capacité & créneaux
  capacity_per_slot INTEGER NOT NULL DEFAULT 20,
  time_slots JSONB NOT NULL DEFAULT '[]', -- [{start: "18:30", end: "20:00", label: "Ftour"}]

  -- Médias
  photos TEXT[] DEFAULT '{}',
  cover_url TEXT,

  -- Conditions
  conditions_fr TEXT,
  conditions_ar TEXT,

  -- Modération (même pattern que packs)
  moderation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (moderation_status IN (
      'draft',
      'pending_moderation',
      'approved',
      'rejected',
      'modification_requested',
      'active',
      'expired',
      'suspended'
    )),
  moderated_by UUID,
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT,
  rejection_reason TEXT,

  -- Validité
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,

  -- Mise en avant
  is_featured BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_ramadan_offers_establishment
  ON public.ramadan_offers(establishment_id);

CREATE INDEX IF NOT EXISTS idx_ramadan_offers_status
  ON public.ramadan_offers(moderation_status);

CREATE INDEX IF NOT EXISTS idx_ramadan_offers_type
  ON public.ramadan_offers(type);

CREATE INDEX IF NOT EXISTS idx_ramadan_offers_dates
  ON public.ramadan_offers(valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_ramadan_offers_active
  ON public.ramadan_offers(establishment_id, moderation_status)
  WHERE moderation_status = 'active';

CREATE INDEX IF NOT EXISTS idx_ramadan_offers_pending
  ON public.ramadan_offers(moderation_status, created_at DESC)
  WHERE moderation_status = 'pending_moderation';

-- ---------------------------------------------------------------------------
-- 2. Table des scans QR Ramadan
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ramadan_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id),
  ramadan_offer_id UUID REFERENCES public.ramadan_offers(id),
  scanned_by UUID NOT NULL, -- pro user who scanned
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  location JSONB, -- {lat, lng} optional
  scan_status TEXT NOT NULL CHECK (scan_status IN ('valid', 'already_used', 'expired', 'invalid'))
);

CREATE INDEX IF NOT EXISTS idx_ramadan_qr_scans_reservation
  ON public.ramadan_qr_scans(reservation_id);

CREATE INDEX IF NOT EXISTS idx_ramadan_qr_scans_offer
  ON public.ramadan_qr_scans(ramadan_offer_id);

-- ---------------------------------------------------------------------------
-- 3. Extension de la table reservations
-- ---------------------------------------------------------------------------

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS ramadan_offer_id UUID REFERENCES public.ramadan_offers(id);

CREATE INDEX IF NOT EXISTS idx_reservations_ramadan_offer
  ON public.reservations(ramadan_offer_id)
  WHERE ramadan_offer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS (Row Level Security) — lecture publique, écriture authentifiée
-- ---------------------------------------------------------------------------

ALTER TABLE public.ramadan_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ramadan_qr_scans ENABLE ROW LEVEL SECURITY;

-- Lecture publique des offres actives
CREATE POLICY IF NOT EXISTS "ramadan_offers_public_read"
  ON public.ramadan_offers FOR SELECT
  USING (moderation_status = 'active');

-- Les pros peuvent voir leurs propres offres (tous statuts)
CREATE POLICY IF NOT EXISTS "ramadan_offers_pro_read"
  ON public.ramadan_offers FOR SELECT
  USING (
    creator_id = auth.uid()
    OR establishment_id IN (
      SELECT establishment_id FROM public.pro_establishment_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Les pros peuvent créer des offres pour leurs établissements
CREATE POLICY IF NOT EXISTS "ramadan_offers_pro_insert"
  ON public.ramadan_offers FOR INSERT
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.pro_establishment_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Les pros peuvent modifier leurs brouillons
CREATE POLICY IF NOT EXISTS "ramadan_offers_pro_update"
  ON public.ramadan_offers FOR UPDATE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.pro_establishment_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (pour les routes admin/cron via supabase admin client)
CREATE POLICY IF NOT EXISTS "ramadan_offers_service_all"
  ON public.ramadan_offers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "ramadan_qr_scans_service_all"
  ON public.ramadan_qr_scans FOR ALL
  USING (auth.role() = 'service_role');

-- Les pros peuvent lire les scans de leurs établissements
CREATE POLICY IF NOT EXISTS "ramadan_qr_scans_pro_read"
  ON public.ramadan_qr_scans FOR SELECT
  USING (
    scanned_by = auth.uid()
    OR ramadan_offer_id IN (
      SELECT ro.id FROM public.ramadan_offers ro
      WHERE ro.establishment_id IN (
        SELECT establishment_id FROM public.pro_establishment_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
