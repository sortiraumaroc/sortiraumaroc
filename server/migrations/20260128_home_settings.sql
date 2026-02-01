-- ============================================================================
-- Migration: Home Settings (Hero Background Image)
-- Date: 2026-01-28
-- Description: Stores customizable settings for the homepage hero section
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Home Settings table (key-value store for homepage customization)
-- ---------------------------------------------------------------------------
create table if not exists public.home_settings (
  key text primary key,
  value jsonb not null default '{}',
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
    if not exists (select 1 from pg_trigger where tgname = 'trg_home_settings_updated_at') then
      create trigger trg_home_settings_updated_at
      before update on public.home_settings
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed default settings
-- ---------------------------------------------------------------------------
insert into public.home_settings (key, value) values
  ('hero', '{"background_image_url": null, "overlay_opacity": 0.7}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------
alter table public.home_settings enable row level security;

-- Public read access
drop policy if exists "Public can read home_settings" on public.home_settings;
create policy "Public can read home_settings"
  on public.home_settings for select
  using (true);

-- Service role has full access (for admin operations)
drop policy if exists "Service role has full access to home_settings" on public.home_settings;
create policy "Service role has full access to home_settings"
  on public.home_settings for all
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.home_settings is 'Key-value store for homepage customization settings';
comment on column public.home_settings.key is 'Setting identifier (e.g., hero, sections)';
comment on column public.home_settings.value is 'JSON value containing the setting data';

commit;
