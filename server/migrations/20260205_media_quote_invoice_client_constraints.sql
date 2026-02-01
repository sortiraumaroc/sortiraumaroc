begin;

-- Allow the new client_id column to be used without requiring legacy
-- platform_client_id/external_client_id columns.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_quotes_client_consistency'
      and conrelid = 'public.media_quotes'::regclass
  ) then
    alter table public.media_quotes drop constraint media_quotes_client_consistency;
  end if;
end $$;

alter table public.media_quotes
  add constraint media_quotes_client_consistency check (
    client_id is not null
    or
    (client_type = 'platform' and platform_client_id is not null and external_client_id is null)
    or
    (client_type = 'external' and external_client_id is not null and platform_client_id is null)
  );


do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_invoices_client_consistency'
      and conrelid = 'public.media_invoices'::regclass
  ) then
    alter table public.media_invoices drop constraint media_invoices_client_consistency;
  end if;
end $$;

alter table public.media_invoices
  add constraint media_invoices_client_consistency check (
    client_id is not null
    or
    (client_type = 'platform' and platform_client_id is not null and external_client_id is null)
    or
    (client_type = 'external' and external_client_id is not null and platform_client_id is null)
  );

commit;
