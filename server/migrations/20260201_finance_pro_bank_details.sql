begin;

create extension if not exists pgcrypto;
create schema if not exists finance;

-- ---------------------------------------------------------------------------
-- PRO bank details (managed by Superadmin only)
-- Source of truth for payouts and finance workflows.
-- ---------------------------------------------------------------------------

create table if not exists finance.pro_bank_details (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,

  bank_code varchar(3) not null,
  locality_code varchar(3) not null,
  branch_code varchar(3) not null,
  account_number varchar(12) not null,
  rib_key varchar(3) not null,

  bank_name varchar not null,
  bank_address text null,

  holder_name varchar not null,
  holder_address text null,

  rib_24 varchar(24) not null,

  is_validated boolean not null default false,
  validated_at timestamptz null,
  validated_by text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_finance_pro_bank_details_establishment
  on finance.pro_bank_details (establishment_id);

create index if not exists idx_finance_pro_bank_details_validated
  on finance.pro_bank_details (is_validated, validated_at desc);

alter table finance.pro_bank_details enable row level security;

-- ---------------------------------------------------------------------------
-- History (mandatory traceability)
-- ---------------------------------------------------------------------------

create table if not exists finance.pro_bank_details_history (
  id uuid primary key default gen_random_uuid(),
  pro_bank_id uuid not null references finance.pro_bank_details(id) on delete cascade,
  changed_by text null,
  changed_at timestamptz not null default now(),
  old_data jsonb null,
  new_data jsonb null
);

create index if not exists idx_finance_pro_bank_details_history_pro_bank_changed_at
  on finance.pro_bank_details_history (pro_bank_id, changed_at desc);

alter table finance.pro_bank_details_history enable row level security;

-- ---------------------------------------------------------------------------
-- Documents (PDF proof)
-- Stored in Supabase Storage; this table stores metadata.
-- ---------------------------------------------------------------------------

create table if not exists finance.pro_bank_documents (
  id uuid primary key default gen_random_uuid(),
  pro_bank_id uuid not null references finance.pro_bank_details(id) on delete cascade,
  file_path text not null,
  file_name text null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint null,
  uploaded_by text null,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_finance_pro_bank_documents_pro_bank_uploaded_at
  on finance.pro_bank_documents (pro_bank_id, uploaded_at desc);

alter table finance.pro_bank_documents enable row level security;

-- ---------------------------------------------------------------------------
-- updated_at triggers (if shared trigger exists)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_finance_pro_bank_details_updated_at') then
      create trigger trg_finance_pro_bank_details_updated_at
        before update on finance.pro_bank_details
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket (private)
-- We do NOT expose storage directly to clients; server uses service_role.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('pro-bank-documents', 'pro-bank-documents', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public views for PostgREST (service_role only)
-- Server code queries via public.finance_* views.
-- ---------------------------------------------------------------------------

create or replace view public.finance_pro_bank_details as
select *
from finance.pro_bank_details;

grant select, insert, update, delete on public.finance_pro_bank_details to service_role;

create or replace view public.finance_pro_bank_details_history as
select *
from finance.pro_bank_details_history;

grant select, insert, update, delete on public.finance_pro_bank_details_history to service_role;

create or replace view public.finance_pro_bank_documents as
select *
from finance.pro_bank_documents;

grant select, insert, update, delete on public.finance_pro_bank_documents to service_role;

commit;
