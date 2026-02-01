-- PRO campaigns (ads/visibility) billing model + metrics tracking
--
-- Adds explicit CPC/CPM support:
-- - CPC: charged per click
-- - CPM: charged per 1000 impressions
--
-- NOTE: stored values are in cents.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.pro_campaigns (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  type text not null,
  title text not null,

  -- Stored in cents
  budget int not null default 0,

  starts_at timestamptz null,
  ends_at timestamptz null,
  status text not null default 'draft',

  -- Backward compatible flexible object
  metrics jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Billing & counters (added incrementally to support existing DBs)
alter table public.pro_campaigns add column if not exists billing_model text not null default 'cpc';
alter table public.pro_campaigns add column if not exists cpc_cents int null;
alter table public.pro_campaigns add column if not exists cpm_cents int null;

alter table public.pro_campaigns add column if not exists spent_cents int not null default 0;
alter table public.pro_campaigns add column if not exists remaining_cents int not null default 0;

alter table public.pro_campaigns add column if not exists impressions int not null default 0;
alter table public.pro_campaigns add column if not exists clicks int not null default 0;
alter table public.pro_campaigns add column if not exists reservations_count int not null default 0;
alter table public.pro_campaigns add column if not exists packs_count int not null default 0;

create index if not exists idx_pro_campaigns_establishment_created_at on public.pro_campaigns (establishment_id, created_at desc);
create index if not exists idx_pro_campaigns_establishment_status on public.pro_campaigns (establishment_id, status);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_pro_campaigns_updated_at') then
      create trigger trg_pro_campaigns_updated_at
      before update on public.pro_campaigns
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- Defaults/backfill
update public.pro_campaigns
set billing_model = coalesce(nullif(billing_model, ''), 'cpc')
where billing_model is null or billing_model = '';

update public.pro_campaigns
set cpc_cents = coalesce(cpc_cents, 200),
    cpm_cents = coalesce(cpm_cents, 2000)
where cpc_cents is null or cpm_cents is null;

update public.pro_campaigns
set remaining_cents = greatest(0, budget - spent_cents)
where remaining_cents = 0 and budget > 0;

-- ---------------------------------------------------------------------------
-- Raw events (impressions/clicks/conversions)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pro_campaigns(id) on delete cascade,
  establishment_id uuid null references public.establishments(id) on delete set null,
  session_id uuid null,
  event_type text not null check (event_type in ('impression','click','reservation','pack')),
  cost_cents int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pro_campaign_events_campaign_created_at on public.pro_campaign_events (campaign_id, created_at desc);
create index if not exists idx_pro_campaign_events_event_type on public.pro_campaign_events (event_type);

-- Basic dedupe when session_id is provided
create unique index if not exists uq_pro_campaign_events_campaign_session_type
  on public.pro_campaign_events (campaign_id, session_id, event_type)
  where session_id is not null;

commit;
