begin;

-- IMPORTANT: This project should not contain real corporate identifiers.
-- Replace any previously seeded legal entity data with neutral Sam’Booking placeholders.

update public.billing_company_profile
set
  legal_name = 'Sam’Booking',
  trade_name = 'Sam’Booking',
  legal_form = 'Plateforme (provisoire)',
  ice = 'N/A',
  rc_number = 'N/A',
  rc_court = 'N/A',
  address_line1 = 'Quartier Horizon Business Center',
  address_line2 = 'Boulevard Al Massira',
  city = 'Casablanca 20250',
  country = 'Maroc',
  capital_mad = 0,
  default_currency = 'MAD'
where id = 'default';

commit;
