begin;

-- ---------------------------------------------------------------------------
-- Establishment contracts (managed by Superadmin only)
-- Stores contract documents for establishments.
-- ---------------------------------------------------------------------------

create table if not exists public.establishment_contracts (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,

  -- Contract metadata
  contract_type varchar(50) not null default 'partnership', -- partnership, commission, service, other
  contract_reference varchar(100) null, -- Internal reference number

  -- File info
  file_path text not null,
  file_name text null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint null,

  -- Contract dates
  signed_at date null,
  starts_at date null,
  expires_at date null,

  -- Status
  status varchar(20) not null default 'active', -- active, expired, terminated, pending
  notes text null,

  -- Audit
  uploaded_by text null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_establishment_contracts_establishment_id
  on public.establishment_contracts (establishment_id);

create index if not exists idx_establishment_contracts_status
  on public.establishment_contracts (status, expires_at);

alter table public.establishment_contracts enable row level security;

-- Only service_role can access (admin only)
drop policy if exists "service_role_all" on public.establishment_contracts;
create policy "service_role_all" on public.establishment_contracts
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_establishment_contracts_updated_at') then
      create trigger trg_establishment_contracts_updated_at
        before update on public.establishment_contracts
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket (private)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('establishment-contracts', 'establishment-contracts', false)
    on conflict (id) do nothing;
  end if;
end $$;

commit;
