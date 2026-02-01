begin;

-- Menu Digital (annual) pricing rounding
-- Business requirement: display and charge rounded annual prices:
-- - Silver annual: 2 000 MAD HT
-- - Premium annual: 5 000 MAD HT
--
-- This migration updates the seeded offers from 20260121 (1992 / 4980) to the rounded prices.
-- It is intentionally safe/idempotent (only updates when the old values match).

update public.visibility_offers
set price_cents = 200000
where deleted_at is null
  and type = 'menu_digital'
  and title = 'MENU DIGITAL — SILVER (Annuel -17%)'
  and price_cents = 199200;

update public.visibility_offers
set price_cents = 500000
where deleted_at is null
  and type = 'menu_digital'
  and title = 'MENU DIGITAL — PREMIUM (Annuel -17%)'
  and price_cents = 498000;

commit;
