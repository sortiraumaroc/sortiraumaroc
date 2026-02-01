-- Phase 4 (No-Show & Fiabilité) — v1 reliability stats
-- This module is server-driven: clients must NOT write these tables directly.

begin;

-- ---------------------------------------------------------------------------
-- consumer_user_stats: per-consumer aggregated reliability stats.
--
-- Notes:
-- - The admin_consumer_users view (20260121_consumer_account_lifecycle.sql)
--   expects this table to exist.
-- - The scoring logic is computed server-side; this table stores the latest
--   computed snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.consumer_user_stats (
  user_id text primary key references public.consumer_users(id) on delete cascade,
  reliability_score integer not null default 80 check (reliability_score between 0 and 100),
  reservations_count integer not null default 0 check (reservations_count >= 0),
  no_shows_count integer not null default 0 check (no_shows_count >= 0),
  last_activity_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_consumer_user_stats_updated_at on public.consumer_user_stats (updated_at desc);

-- Backfill stats rows for existing users (safe to re-run).
insert into public.consumer_user_stats (user_id)
select u.id
from public.consumer_users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Reservations indexes used by server-side 90-day reliability recomputation.
-- ---------------------------------------------------------------------------
create index if not exists idx_reservations_user_starts_at_desc on public.reservations (user_id, starts_at desc);
create index if not exists idx_reservations_user_status_starts_at_desc on public.reservations (user_id, status, starts_at desc);

commit;
