-- Migration: Move email verification codes from in-memory Maps to persistent DB tables.
-- This ensures codes survive server restarts/hot-reload and enables server-side code generation.

begin;

-- Table 1: Verification codes (one active code per email at a time)
create table if not exists public.consumer_email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

-- Index for looking up active (non-verified, non-expired) codes by email
create index if not exists idx_evc_email
  on public.consumer_email_verification_codes(email)
  where verified_at is null;

-- Index for cleanup of expired codes
create index if not exists idx_evc_expires
  on public.consumer_email_verification_codes(expires_at)
  where verified_at is null;

-- Table 2: Rate limiting (one row per email, upserted)
create table if not exists public.consumer_email_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  attempt_count int not null default 1,
  window_start timestamptz not null default now()
);

-- RLS: service_role only (no client access)
alter table public.consumer_email_verification_codes enable row level security;

-- Drop policy if it already exists (idempotent)
do $$
begin
  if exists (
    select 1 from pg_policies
    where tablename = 'consumer_email_verification_codes'
      and policyname = 'service_only'
  ) then
    drop policy "service_only" on public.consumer_email_verification_codes;
  end if;
end $$;

create policy "service_only" on public.consumer_email_verification_codes
  for all using (false) with check (false);

alter table public.consumer_email_verification_attempts enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where tablename = 'consumer_email_verification_attempts'
      and policyname = 'service_only'
  ) then
    drop policy "service_only" on public.consumer_email_verification_attempts;
  end if;
end $$;

create policy "service_only" on public.consumer_email_verification_attempts
  for all using (false) with check (false);

commit;
