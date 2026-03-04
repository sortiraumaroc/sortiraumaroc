-- Migration: Add slot_interval_minutes column to ramadan_offers
-- The onboarding form collects this value but it was never persisted.
-- This column stores the interval between booking slots (in minutes).

ALTER TABLE public.ramadan_offers
  ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.ramadan_offers.slot_interval_minutes
  IS 'Intervalle entre les créneaux de réservation, en minutes (15, 30, 45, 60, 90, 120)';
