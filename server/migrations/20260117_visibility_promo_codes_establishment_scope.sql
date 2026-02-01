begin;

alter table public.visibility_promo_codes
  add column if not exists applies_to_establishment_ids uuid[] null;

create index if not exists idx_visibility_promo_codes_establishment_ids
  on public.visibility_promo_codes using gin (applies_to_establishment_ids);

commit;
