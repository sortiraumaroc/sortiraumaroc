begin;

-- ---------------------------------------------------------------------------
-- Link quotes/invoices to unified clients table
-- Keep legacy platform_client_id/external_client_id for now (compat) but
-- progressively move server/client code to use client_id only.
-- ---------------------------------------------------------------------------

alter table public.media_quotes
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

alter table public.media_invoices
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

create index if not exists idx_media_quotes_client_id
  on public.media_quotes (client_id);

create index if not exists idx_media_invoices_client_id
  on public.media_invoices (client_id);

-- Backfill from platform_client_id -> clients.establishment_id
update public.media_quotes q
set client_id = c.id
from public.clients c
where q.client_id is null
  and q.client_type = 'platform'
  and q.platform_client_id is not null
  and c.establishment_id = q.platform_client_id;

update public.media_invoices i
set client_id = c.id
from public.clients c
where i.client_id is null
  and i.client_type = 'platform'
  and i.platform_client_id is not null
  and c.establishment_id = i.platform_client_id;

-- Backfill from external_client_id -> external_clients.email -> clients.email
update public.media_quotes q
set client_id = c.id
from public.external_clients ec
join public.clients c
  on c.email is not null
  and lower(c.email) = lower(ec.email)
where q.client_id is null
  and q.client_type = 'external'
  and q.external_client_id = ec.id;

update public.media_invoices i
set client_id = c.id
from public.external_clients ec
join public.clients c
  on c.email is not null
  and lower(c.email) = lower(ec.email)
where i.client_id is null
  and i.client_type = 'external'
  and i.external_client_id = ec.id;

commit;
