-- ============================================================================
-- Migration: Dynamic Universes Management
-- Date: 2026-01-28
-- Description: Allows admins to manage universes (activity categories) dynamically
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Universes table
-- ---------------------------------------------------------------------------
create table if not exists public.universes (
  id uuid primary key default gen_random_uuid(),

  -- Unique slug used for URLs and internal references (e.g., "restaurants", "sport")
  slug text not null unique,

  -- Localized labels
  label_fr text not null,
  label_en text not null,

  -- Lucide icon name (e.g., "UtensilsCrossed", "Dumbbell", "Zap")
  icon_name text not null default 'Circle',

  -- Theme color (hex)
  color text not null default '#a3001d',

  -- Display order (lower = first)
  sort_order int not null default 0,

  -- Active status
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for active universes sorted by order
create index if not exists idx_universes_active_sorted
  on public.universes (is_active, sort_order)
  where is_active = true;

-- Trigger for updated_at (reuse existing function if available)
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_universes_updated_at') then
      create trigger trg_universes_updated_at
      before update on public.universes
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed initial data (matches current hardcoded values)
-- ---------------------------------------------------------------------------
insert into public.universes (slug, label_fr, label_en, icon_name, color, sort_order) values
  ('restaurants', 'Manger & Boire', 'Food & drink', 'UtensilsCrossed', '#a3001d', 1),
  ('sport', 'Sport & Bien-être', 'Sport & wellness', 'Dumbbell', '#a3001d', 2),
  ('loisirs', 'Loisirs', 'Leisure', 'Zap', '#a3001d', 3),
  ('hebergement', 'Hébergement', 'Accommodation', 'Building2', '#a3001d', 4),
  ('culture', 'Culture', 'Culture', 'Landmark', '#a3001d', 5),
  ('shopping', 'Shopping', 'Shopping', 'ShoppingBag', '#a3001d', 6)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------
alter table public.universes enable row level security;

-- Public read access for active universes
drop policy if exists "Public can read active universes" on public.universes;
create policy "Public can read active universes"
  on public.universes for select
  using (is_active = true);

-- Service role has full access (for admin operations)
drop policy if exists "Service role has full access to universes" on public.universes;
create policy "Service role has full access to universes"
  on public.universes for all
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.universes is 'Dynamic universe/category definitions for homepage and navigation';
comment on column public.universes.slug is 'URL-safe unique identifier (e.g., restaurants, sport)';
comment on column public.universes.icon_name is 'Lucide icon component name (e.g., UtensilsCrossed)';
comment on column public.universes.sort_order is 'Display order - lower values appear first';

commit;
