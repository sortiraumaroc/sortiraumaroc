-- ============================================================================
-- Migration: Home Videos Management
-- Date: 2026-02-01
-- Description: Allows admins to manage homepage video carousel section
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Home Videos table
-- ---------------------------------------------------------------------------
create table if not exists public.home_videos (
  id uuid primary key default gen_random_uuid(),

  -- YouTube video URL (required)
  youtube_url text not null,

  -- Video title
  title text not null,

  -- Optional description
  description text,

  -- Display order (lower = first)
  sort_order int not null default 0,

  -- Active status
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for active videos sorted by order
create index if not exists idx_home_videos_active_sorted
  on public.home_videos (is_active, sort_order)
  where is_active = true;

-- Trigger for updated_at (reuse existing function if available)
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_home_videos_updated_at') then
      create trigger trg_home_videos_updated_at
      before update on public.home_videos
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------
alter table public.home_videos enable row level security;

-- Public read access for active videos
drop policy if exists "Public can read active home_videos" on public.home_videos;
create policy "Public can read active home_videos"
  on public.home_videos for select
  using (is_active = true);

-- Service role has full access (for admin operations)
drop policy if exists "Service role has full access to home_videos" on public.home_videos;
create policy "Service role has full access to home_videos"
  on public.home_videos for all
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.home_videos is 'Homepage video carousel items for YouTube embeds';
comment on column public.home_videos.youtube_url is 'Full YouTube video URL (e.g., https://www.youtube.com/watch?v=XXXXX)';
comment on column public.home_videos.title is 'Video title for display and accessibility';
comment on column public.home_videos.description is 'Optional description text';
comment on column public.home_videos.sort_order is 'Display order - lower values appear first';

commit;
