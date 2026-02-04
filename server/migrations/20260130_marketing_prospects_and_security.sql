-- ============================================================================
-- Migration: Marketing Prospects & Security Settings
-- Date: 2026-01-30
-- Description: Creates marketing_prospects table for email campaigns (separate from users)
--              and admin_security_settings for sensitive action protection
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Admin Security Settings table (for sensitive action passwords)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_security_settings (
  key text primary key,
  value_hash text not null, -- bcrypt hashed value
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger for updated_at
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_admin_security_settings_updated_at') then
      create trigger trg_admin_security_settings_updated_at
      before update on public.admin_security_settings
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- RLS for admin_security_settings
alter table public.admin_security_settings enable row level security;

drop policy if exists "Service role has full access to admin_security_settings" on public.admin_security_settings;
create policy "Service role has full access to admin_security_settings"
  on public.admin_security_settings for all
  using (auth.role() = 'service_role');

comment on table public.admin_security_settings is 'Stores hashed security passwords for sensitive admin actions';

-- ---------------------------------------------------------------------------
-- Marketing Prospects table (completely separate from consumer_users)
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_prospects (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  phone text,
  city text,
  country text default 'MA',
  tags text[] default '{}',
  source text, -- e.g., 'import_csv', 'landing_page', 'manual'
  source_details jsonb default '{}', -- additional source metadata
  subscribed boolean not null default true,
  unsubscribed_at timestamptz,
  unsubscribe_reason text,
  email_verified boolean default false,
  email_verified_at timestamptz,
  last_email_sent_at timestamptz,
  emails_sent_count int not null default 0,
  emails_opened_count int not null default 0,
  emails_clicked_count int not null default 0,
  bounce_count int not null default 0,
  last_bounce_at timestamptz,
  bounce_type text, -- 'soft', 'hard'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Unique email constraint
  constraint marketing_prospects_email_unique unique (email)
);

-- Indexes for marketing_prospects
create index if not exists idx_marketing_prospects_email on public.marketing_prospects (lower(email));
create index if not exists idx_marketing_prospects_subscribed on public.marketing_prospects (subscribed) where subscribed = true;
create index if not exists idx_marketing_prospects_tags on public.marketing_prospects using gin (tags);
create index if not exists idx_marketing_prospects_city on public.marketing_prospects (lower(city));
create index if not exists idx_marketing_prospects_source on public.marketing_prospects (source);
create index if not exists idx_marketing_prospects_created_at on public.marketing_prospects (created_at desc);

-- Trigger for updated_at
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_marketing_prospects_updated_at') then
      create trigger trg_marketing_prospects_updated_at
      before update on public.marketing_prospects
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- RLS for marketing_prospects
alter table public.marketing_prospects enable row level security;

drop policy if exists "Service role has full access to marketing_prospects" on public.marketing_prospects;
create policy "Service role has full access to marketing_prospects"
  on public.marketing_prospects for all
  using (auth.role() = 'service_role');

comment on table public.marketing_prospects is 'Marketing contacts for email campaigns (separate from registered users)';
comment on column public.marketing_prospects.tags is 'Custom tags for segmentation (e.g., restaurant_interest, spa_lover)';
comment on column public.marketing_prospects.source is 'How the prospect was acquired';
comment on column public.marketing_prospects.bounce_type is 'soft = temporary issue, hard = permanent (invalid email)';

-- ---------------------------------------------------------------------------
-- Marketing Email Campaigns table (for mass emails via Amazon SES)
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  content_html text not null,
  content_text text,
  from_name text default 'Sortir Au Maroc',
  from_email text default 'contact@sortiraumaroc.ma',
  reply_to text,

  -- Targeting
  target_type text not null default 'all', -- 'all', 'tags', 'cities', 'custom_query'
  target_tags text[] default '{}',
  target_cities text[] default '{}',
  target_query jsonb, -- For advanced filtering

  -- Stats
  total_recipients int not null default 0,
  sent_count int not null default 0,
  delivered_count int not null default 0,
  opened_count int not null default 0,
  clicked_count int not null default 0,
  bounced_count int not null default 0,
  complained_count int not null default 0,
  unsubscribed_count int not null default 0,

  -- Status
  status text not null default 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  -- Metadata
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for marketing_email_campaigns
create index if not exists idx_marketing_email_campaigns_status on public.marketing_email_campaigns (status);
create index if not exists idx_marketing_email_campaigns_scheduled_at on public.marketing_email_campaigns (scheduled_at) where status = 'scheduled';
create index if not exists idx_marketing_email_campaigns_created_at on public.marketing_email_campaigns (created_at desc);

-- Trigger for updated_at
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_marketing_email_campaigns_updated_at') then
      create trigger trg_marketing_email_campaigns_updated_at
      before update on public.marketing_email_campaigns
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- RLS for marketing_email_campaigns
alter table public.marketing_email_campaigns enable row level security;

drop policy if exists "Service role has full access to marketing_email_campaigns" on public.marketing_email_campaigns;
create policy "Service role has full access to marketing_email_campaigns"
  on public.marketing_email_campaigns for all
  using (auth.role() = 'service_role');

comment on table public.marketing_email_campaigns is 'Mass email campaigns sent via Amazon SES';

-- ---------------------------------------------------------------------------
-- Marketing Email Sends (tracking individual email sends)
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_email_campaigns(id) on delete cascade,
  prospect_id uuid not null references public.marketing_prospects(id) on delete cascade,

  -- SES tracking
  ses_message_id text,

  -- Status
  status text not null default 'pending', -- 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  bounce_type text,
  bounce_reason text,
  complained_at timestamptz,

  created_at timestamptz not null default now()
);

-- Indexes for marketing_email_sends
create index if not exists idx_marketing_email_sends_campaign_id on public.marketing_email_sends (campaign_id);
create index if not exists idx_marketing_email_sends_prospect_id on public.marketing_email_sends (prospect_id);
create index if not exists idx_marketing_email_sends_ses_message_id on public.marketing_email_sends (ses_message_id);
create index if not exists idx_marketing_email_sends_status on public.marketing_email_sends (status);

-- RLS for marketing_email_sends
alter table public.marketing_email_sends enable row level security;

drop policy if exists "Service role has full access to marketing_email_sends" on public.marketing_email_sends;
create policy "Service role has full access to marketing_email_sends"
  on public.marketing_email_sends for all
  using (auth.role() = 'service_role');

comment on table public.marketing_email_sends is 'Individual email send tracking for campaigns';

-- ---------------------------------------------------------------------------
-- Function to clean up demo/test accounts
-- ---------------------------------------------------------------------------
create or replace function cleanup_demo_accounts()
returns table (
  deleted_count bigint,
  deleted_emails text[]
) as $$
declare
  demo_user_ids uuid[];
  demo_emails text[];
begin
  -- Find demo accounts: @example.invalid emails OR accounts with no reservations
  select
    array_agg(u.id),
    array_agg(u.email)
  into demo_user_ids, demo_emails
  from public.consumer_users u
  left join public.bookings b on b.user_id::text = u.id
  where
    -- Email contains @example.invalid
    u.email ilike '%@example.invalid'
    -- OR has no bookings at all
    or (
      not exists (
        select 1 from public.bookings bb
        where bb.user_id::text = u.id
      )
      -- And was created more than 7 days ago (to avoid deleting new real accounts)
      and u.created_at < now() - interval '7 days'
      -- And email looks like a test email
      and (
        u.email ilike 'test%@%'
        or u.email ilike 'demo%@%'
        or u.email ilike '%+test%@%'
        or u.email ilike 'fake%@%'
      )
    );

  -- Return count and emails
  return query select
    coalesce(array_length(demo_user_ids, 1), 0)::bigint,
    coalesce(demo_emails, '{}'::text[]);
end;
$$ language plpgsql security definer;

-- Grant execute to authenticated (for admin use via service role)
grant execute on function cleanup_demo_accounts to authenticated;

commit;
