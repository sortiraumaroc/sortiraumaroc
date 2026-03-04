-- Ajout de la valeur 'starting_from' aux CHECK constraints price_type.
-- Tables concernées : pro_slots, packs, ramadan_offers.

BEGIN;

-- 1. pro_slots
ALTER TABLE public.pro_slots DROP CONSTRAINT IF EXISTS pro_slots_price_type_check;
ALTER TABLE public.pro_slots
  ADD CONSTRAINT pro_slots_price_type_check
  CHECK (price_type IN ('fixed', 'free', 'a_la_carte', 'starting_from', 'nc'));

-- 2. packs
ALTER TABLE public.packs DROP CONSTRAINT IF EXISTS packs_price_type_check;
ALTER TABLE public.packs
  ADD CONSTRAINT packs_price_type_check
  CHECK (price_type IN ('fixed', 'free', 'a_la_carte', 'starting_from', 'nc'));

-- 3. ramadan_offers
ALTER TABLE public.ramadan_offers DROP CONSTRAINT IF EXISTS ramadan_offers_price_type_check;
ALTER TABLE public.ramadan_offers
  ADD CONSTRAINT ramadan_offers_price_type_check
  CHECK (price_type IN ('fixed', 'free', 'a_la_carte', 'starting_from', 'nc'));

COMMIT;
