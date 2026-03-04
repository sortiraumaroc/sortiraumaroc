-- Ajout de la colonne price_type sur pro_slots, packs, ramadan_offers.
-- Valeurs possibles : 'fixed', 'free', 'a_la_carte', 'nc'

BEGIN;

-- ═══════════════════════════════════════════════
-- 1. pro_slots.price_type (default 'free' — null/0 = Gratuit)
-- ═══════════════════════════════════════════════
ALTER TABLE public.pro_slots
  ADD COLUMN IF NOT EXISTS price_type text DEFAULT 'free';

UPDATE public.pro_slots
SET price_type = 'fixed'
WHERE base_price IS NOT NULL AND base_price > 0 AND price_type = 'free';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pro_slots_price_type_check'
  ) THEN
    ALTER TABLE public.pro_slots
      ADD CONSTRAINT pro_slots_price_type_check
      CHECK (price_type IN ('fixed', 'free', 'a_la_carte', 'nc'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- 2. packs.price_type (default 'fixed' — prix toujours requis)
-- ═══════════════════════════════════════════════
ALTER TABLE public.packs
  ADD COLUMN IF NOT EXISTS price_type text DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packs_price_type_check'
  ) THEN
    ALTER TABLE public.packs
      ADD CONSTRAINT packs_price_type_check
      CHECK (price_type IN ('fixed', 'free', 'a_la_carte', 'nc'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- 3. ramadan_offers.price_type (default 'fixed')
-- ═══════════════════════════════════════════════
ALTER TABLE public.ramadan_offers
  ADD COLUMN IF NOT EXISTS price_type text DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ramadan_offers_price_type_check'
  ) THEN
    ALTER TABLE public.ramadan_offers
      ADD CONSTRAINT ramadan_offers_price_type_check
      CHECK (price_type IN ('fixed', 'free', 'a_la_carte', 'nc'));
  END IF;
END $$;

COMMIT;
