-- SAM Media / Visibilité — Unification clients = PRO
--
-- Non négociable: pas de table clients/external_clients pour la facturation.
-- Les devis/factures SAM Media doivent s'appuyer sur les comptes PRO existants.

begin;

-- ---------------------------------------------------------------------------
-- PRO profiles (infos société + typologie client A/B)
-- ---------------------------------------------------------------------------

create table if not exists public.pro_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_type text not null default 'B' check (client_type in ('A', 'B')),
  company_name text null,
  contact_name text null,
  email text null,
  phone text null,
  city text null,
  address text null,
  ice text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pro_profiles_client_type on public.pro_profiles (client_type);
create index if not exists idx_pro_profiles_company_name on public.pro_profiles (company_name);
create index if not exists idx_pro_profiles_city on public.pro_profiles (city);
create unique index if not exists idx_pro_profiles_email_unique on public.pro_profiles (lower(email)) where email is not null;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'trg_pro_profiles_updated_at'
        and tgrelid = 'public.pro_profiles'::regclass
    ) then
      create trigger trg_pro_profiles_updated_at
      before update on public.pro_profiles
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.pro_profiles enable row level security;

-- Ensure every PRO user has a profile row (fallback values).
insert into public.pro_profiles (user_id, client_type, company_name, email)
select up.user_id, 'B', up.email, up.email
from public.users_pro up
on conflict (user_id) do nothing;

-- Mark as Type A when at least one establishment membership exists.
with primary_est as (
  select distinct on (m.user_id)
    m.user_id,
    e.name as establishment_name,
    e.city as establishment_city
  from public.pro_establishment_memberships m
  join public.establishments e on e.id = m.establishment_id
  order by m.user_id, (case when m.role = 'owner' then 0 else 1 end), m.created_at asc
)
update public.pro_profiles p
set
  client_type = 'A',
  company_name = coalesce(p.company_name, primary_est.establishment_name),
  city = coalesce(p.city, primary_est.establishment_city)
from primary_est
where primary_est.user_id = p.user_id;

-- ---------------------------------------------------------------------------
-- SAM Media billing — move from establishment/external_clients to PRO
-- ---------------------------------------------------------------------------

-- Relax / remove legacy constraints.
alter table public.media_quotes drop constraint if exists media_quotes_client_consistency;
alter table public.media_invoices drop constraint if exists media_invoices_client_consistency;

alter table public.media_quotes drop constraint if exists media_quotes_client_type_check;
alter table public.media_invoices drop constraint if exists media_invoices_client_type_check;

-- Remove legacy external clients.
alter table public.media_quotes drop column if exists external_client_id;
alter table public.media_invoices drop column if exists external_client_id;

drop table if exists public.external_clients;

-- Rename establishment link to be explicit.
alter table public.media_quotes rename column platform_client_id to establishment_id;
alter table public.media_invoices rename column platform_client_id to establishment_id;

drop index if exists idx_media_quotes_platform_client_id;
drop index if exists idx_media_invoices_platform_client_id;
create index if not exists idx_media_quotes_establishment_id on public.media_quotes (establishment_id);
create index if not exists idx_media_invoices_establishment_id on public.media_invoices (establishment_id);

-- Link quotes/invoices to PRO (auth user).
alter table public.media_quotes
  add column if not exists pro_user_id uuid null references public.pro_profiles(user_id) on delete set null;

alter table public.media_invoices
  add column if not exists pro_user_id uuid null references public.pro_profiles(user_id) on delete set null;

create index if not exists idx_media_quotes_pro_user_id on public.media_quotes (pro_user_id);
create index if not exists idx_media_invoices_pro_user_id on public.media_invoices (pro_user_id);

-- Backfill pro_user_id from establishment membership (best effort).
with ranked as (
  select distinct on (m.establishment_id)
    m.establishment_id,
    m.user_id
  from public.pro_establishment_memberships m
  order by m.establishment_id, (case when m.role = 'owner' then 0 else 1 end), m.created_at asc
)
update public.media_quotes q
set pro_user_id = r.user_id
from ranked r
where q.establishment_id = r.establishment_id
  and q.pro_user_id is null;

with ranked as (
  select distinct on (m.establishment_id)
    m.establishment_id,
    m.user_id
  from public.pro_establishment_memberships m
  order by m.establishment_id, (case when m.role = 'owner' then 0 else 1 end), m.created_at asc
)
update public.media_invoices i
set pro_user_id = r.user_id
from ranked r
where i.establishment_id = r.establishment_id
  and i.pro_user_id is null;

-- Enforce a single "pro" mode (client_type kept for backwards compatibility).
alter table public.media_quotes alter column client_type set default 'pro';
alter table public.media_invoices alter column client_type set default 'pro';

update public.media_quotes set client_type = 'pro' where client_type is distinct from 'pro';
update public.media_invoices set client_type = 'pro' where client_type is distinct from 'pro';

alter table public.media_quotes add constraint media_quotes_client_type_check check (client_type = 'pro');
alter table public.media_invoices add constraint media_invoices_client_type_check check (client_type = 'pro');

-- Require pro_user_id for billing objects.
alter table public.media_quotes alter column pro_user_id set not null;
alter table public.media_invoices alter column pro_user_id set not null;

commit;
