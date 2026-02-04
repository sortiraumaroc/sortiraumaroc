-- FCM (Firebase Cloud Messaging) tokens for push notifications
--
-- This migration creates tables to store FCM tokens for consumers and pros
-- allowing the server to send push notifications to their devices.

begin;

-- ---------------------------------------------------------------------------
-- Consumer FCM tokens
-- ---------------------------------------------------------------------------
create table if not exists public.consumer_fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.consumer_users(id) on delete cascade,
  token text not null,
  device_type text null check (device_type in ('web', 'ios', 'android')),
  device_name text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Each token should be unique
  unique (token)
);

-- Index for fast lookup by user
create index if not exists idx_consumer_fcm_tokens_user_active
  on public.consumer_fcm_tokens (user_id, active)
  where active = true;

-- ---------------------------------------------------------------------------
-- Pro FCM tokens
-- ---------------------------------------------------------------------------
create table if not exists public.pro_fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.pro_profiles(user_id) on delete cascade,
  token text not null,
  device_type text null check (device_type in ('web', 'ios', 'android')),
  device_name text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Each token should be unique
  unique (token)
);

-- Index for fast lookup by user
create index if not exists idx_pro_fcm_tokens_user_active
  on public.pro_fcm_tokens (user_id, active)
  where active = true;

-- ---------------------------------------------------------------------------
-- Consumer notification preferences
-- ---------------------------------------------------------------------------
alter table public.consumer_users
  add column if not exists push_notifications_enabled boolean not null default true,
  add column if not exists push_waitlist_enabled boolean not null default true,
  add column if not exists push_bookings_enabled boolean not null default true,
  add column if not exists push_marketing_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- Pro notification preferences
-- ---------------------------------------------------------------------------
alter table public.pro_profiles
  add column if not exists push_notifications_enabled boolean not null default true,
  add column if not exists push_bookings_enabled boolean not null default true,
  add column if not exists push_waitlist_enabled boolean not null default true,
  add column if not exists push_reviews_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

-- Enable RLS
alter table public.consumer_fcm_tokens enable row level security;
alter table public.pro_fcm_tokens enable row level security;

-- Consumer can manage their own tokens
create policy "consumer_fcm_tokens_own" on public.consumer_fcm_tokens
  for all
  using (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  with check (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

-- Pro can manage their own tokens
create policy "pro_fcm_tokens_own" on public.pro_fcm_tokens
  for all
  using (user_id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  with check (user_id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

-- Service role can access all
create policy "consumer_fcm_tokens_service" on public.consumer_fcm_tokens
  for all
  using (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

create policy "pro_fcm_tokens_service" on public.pro_fcm_tokens
  for all
  using (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

commit;
