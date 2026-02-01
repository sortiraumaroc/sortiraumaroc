begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Unified billable clients
--
-- client_type:
-- - establishment_client: SAM client with an establishment (Type A)
-- - visibility_client: Visibility-only client without establishment (Type B)
--
-- This table becomes the single source of truth for all billable clients.
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),

  client_type text not null check (client_type in ('establishment_client','visibility_client')),

  company_name text not null,
  contact_name text null,
  email text null,
  phone text null,
  city text null,
  address text null,
  ice text null,
  notes text null,

  establishment_id uuid null references public.establishments(id) on delete set null,

  created_by_admin_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_type_consistency check (
    (client_type = 'establishment_client' and establishment_id is not null)
    or
    (client_type = 'visibility_client' and establishment_id is null)
  )
);

create index if not exists idx_clients_company_name
  on public.clients (company_name);

create index if not exists idx_clients_city
  on public.clients (city);

-- 1 row per establishment (Type A)
create unique index if not exists idx_clients_establishment_id_unique
  on public.clients (establishment_id)
  where establishment_id is not null;

-- Unique email when present (Type B and some Type A)
create unique index if not exists idx_clients_email_unique
  on public.clients (lower(email))
  where email is not null;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_clients_updated_at') then
      create trigger trg_clients_updated_at
      before update on public.clients
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- Backfill Type A clients from establishments.
insert into public.clients (
  client_type,
  company_name,
  city,
  establishment_id,
  created_at,
  updated_at
)
select
  'establishment_client',
  coalesce(nullif(trim(e.name), ''), 'Client SAM'),
  nullif(trim(e.city), ''),
  e.id,
  now(),
  now()
from public.establishments e
where not exists (
  select 1
  from public.clients c
  where c.establishment_id = e.id
);

-- Backfill Type B clients from legacy external_clients.
-- external_clients has unique email so we can map by lower(email).
insert into public.clients (
  client_type,
  company_name,
  contact_name,
  email,
  phone,
  address,
  city,
  notes,
  created_by_admin_id,
  created_at,
  updated_at
)
select
  'visibility_client',
  ec.company_name,
  ec.contact_name,
  ec.email,
  ec.phone,
  ec.address,
  ec.city,
  ec.notes,
  ec.created_by_admin_id,
  ec.created_at,
  ec.created_at
from public.external_clients ec
where ec.email is not null
  and not exists (
    select 1
    from public.clients c
    where c.email is not null
      and lower(c.email) = lower(ec.email)
  );

-- ---------------------------------------------------------------------------
-- Missing table: public invoice links for /invoices/:token
-- ---------------------------------------------------------------------------
create table if not exists public.media_invoice_public_links (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null references public.media_invoices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,

  created_at timestamptz not null default now(),
  used_at timestamptz null
);

create index if not exists idx_media_invoice_public_links_invoice_id
  on public.media_invoice_public_links (invoice_id);

-- ---------------------------------------------------------------------------
-- Security: server-only write model
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.media_invoice_public_links enable row level security;

commit;
