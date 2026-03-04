-- Migration: Ajouter colonne service_types aux établissements
-- Types de service : "Buffet à volonté", "Servi à table", "À la carte"

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS service_types text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_establishments_service_types_gin
  ON public.establishments USING GIN (service_types);
