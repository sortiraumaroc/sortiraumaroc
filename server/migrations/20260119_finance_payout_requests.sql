begin;

create extension if not exists pgcrypto;
create schema if not exists finance;

-- ---------------------------------------------------------------------------
-- Extend finance.payouts to support explicit payout windows + eligibility
--
-- Note: the table already exists in production (used by admin payouts UI).
-- This migration is defensive to avoid breaking existing deployments.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('finance.payouts') is not null then
    alter table finance.payouts add column if not exists window_start date;
    alter table finance.payouts add column if not exists window_end date;
    alter table finance.payouts add column if not exists eligible_at timestamptz;
  end if;
end $$;

create index if not exists idx_finance_payouts_establishment_requested_at on finance.payouts (establishment_id, requested_at desc);
create index if not exists idx_finance_payouts_eligible_at on finance.payouts (eligible_at);

-- ---------------------------------------------------------------------------
-- PRO payout requests (appel à facture)
--
-- We keep payouts (finance.payouts) as the monetary object; payout_requests are
-- the PRO-driven workflow layer (submitted/approved/rejected/paid).
-- ---------------------------------------------------------------------------

create table if not exists finance.payout_requests (
  id uuid primary key default gen_random_uuid(),

  payout_id uuid not null references finance.payouts(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,

  status text not null default 'submitted' check (status in ('draft','submitted','approved','rejected','paid')),

  created_by_user_id uuid null,

  pro_comment text null,
  admin_comment text null,
  paid_reference text null,

  approved_at timestamptz null,
  paid_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_finance_payout_requests_payout_id on finance.payout_requests (payout_id);
create index if not exists idx_finance_payout_requests_establishment_created_at on finance.payout_requests (establishment_id, created_at desc);
create index if not exists idx_finance_payout_requests_status on finance.payout_requests (status);

-- Maintain updated_at if the shared trigger exists.
do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_finance_payout_requests_updated_at') then
      create trigger trg_finance_payout_requests_updated_at
      before update on finance.payout_requests
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- Server-only write model
alter table finance.payout_requests enable row level security;

commit;
