-- ============================================================================
-- Migration: Home Cities Management
-- Date: 2026-01-28
-- Description: Allows admins to manage cities displayed on the homepage
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Home Cities table
-- ---------------------------------------------------------------------------
create table if not exists public.home_cities (
  id uuid primary key default gen_random_uuid(),

  -- City name (e.g., "Casablanca", "Marrakech")
  name text not null,

  -- Unique slug used for URLs (e.g., "casablanca", "marrakech")
  slug text not null unique,

  -- Cover image URL (stored in public-assets bucket)
  image_url text,

  -- Display order (lower = first)
  sort_order int not null default 0,

  -- Active status
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for active cities sorted by order
create index if not exists idx_home_cities_active_sorted
  on public.home_cities (is_active, sort_order)
  where is_active = true;

-- Index for slug lookup
create index if not exists idx_home_cities_slug
  on public.home_cities (slug);

-- Trigger for updated_at (reuse existing function if available)
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_home_cities_updated_at') then
      create trigger trg_home_cities_updated_at
      before update on public.home_cities
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------
alter table public.home_cities enable row level security;

-- Public read access for active cities
drop policy if exists "Public can read active home cities" on public.home_cities;
create policy "Public can read active home cities"
  on public.home_cities for select
  using (is_active = true);

-- Service role has full access (for admin operations)
drop policy if exists "Service role has full access to home cities" on public.home_cities;
create policy "Service role has full access to home cities"
  on public.home_cities for all
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.home_cities is 'Cities displayed in the "Autres villes au Maroc" section on the homepage';
comment on column public.home_cities.slug is 'URL-safe unique identifier (e.g., casablanca, marrakech)';
comment on column public.home_cities.image_url is 'Cover image URL for the city card';
comment on column public.home_cities.sort_order is 'Display order - lower values appear first';

commit;
