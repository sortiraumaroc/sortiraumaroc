begin;

-- Some environments still have the older visibility_promo_codes schema that uses a required "scope" column.
-- The admin/pro code now expects applies_to_type/applies_to_offer_id.
-- This migration makes the table backward-compatible without destructive changes.

alter table public.visibility_promo_codes
  add column if not exists applies_to_type text null,
  add column if not exists applies_to_offer_id uuid null;

-- Ensure inserts work even when "scope" exists and is NOT NULL.
-- Guarded so it won't fail on environments where "scope" doesn't exist.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visibility_promo_codes'
      and column_name = 'scope'
  ) then
    execute 'alter table public.visibility_promo_codes alter column scope set default ''global''';
  end if;
end $$;

-- Add FK only if it doesn't already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visibility_promo_codes_applies_to_offer_id_fkey'
  ) then
    alter table public.visibility_promo_codes
      add constraint visibility_promo_codes_applies_to_offer_id_fkey
      foreign key (applies_to_offer_id) references public.visibility_offers(id) on delete set null;
  end if;
end $$;

-- Best-effort backfill from legacy "scope" values when present.
-- legacy scope values: global | menu_digital | media | option
update public.visibility_promo_codes
set applies_to_type =
  case
    when scope = 'menu_digital' then 'menu_digital'
    when scope = 'option' then 'option'
    when scope = 'media' then 'pack'
    else null
  end
where applies_to_type is null
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visibility_promo_codes'
      and column_name = 'scope'
  );

commit;
