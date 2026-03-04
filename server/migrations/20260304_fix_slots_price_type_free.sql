-- Corrige les pro_slots avec price_type='free' qui ont un prix > 0.
-- Cause racine : adminUpsertSlots ne sauvegardait pas price_type='fixed' via RPC.

BEGIN;

-- Slots avec un prix défini mais price_type resté à 'free' → passer en 'fixed'
UPDATE public.pro_slots
SET price_type = 'fixed'
WHERE price_type = 'free'
  AND base_price IS NOT NULL
  AND base_price > 0;

-- Slots sans prix avec price_type 'free' → passer en 'nc'
UPDATE public.pro_slots
SET price_type = 'nc'
WHERE price_type = 'free'
  AND (base_price IS NULL OR base_price = 0);

COMMIT;
