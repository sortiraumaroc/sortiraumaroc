-- Some environments might have an older visibility_promo_codes table without the description column.
-- The admin UI selects "description", so ensure the column exists.

begin;

alter table public.visibility_promo_codes
  add column if not exists description text null;

commit;
