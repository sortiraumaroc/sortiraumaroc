-- Category Images — Admin-managed category images for homepage display
-- Allows admins to customize category images per universe

begin;

-- ---------------------------------------------------------------------------
-- Category images table
-- ---------------------------------------------------------------------------
create table if not exists public.category_images (
  id uuid primary key default gen_random_uuid(),

  universe text not null check (universe in ('restaurants', 'sport', 'loisirs', 'hebergement', 'culture', 'shopping')),
  category_id text not null,

  name text not null,
  image_url text not null,

  display_order int not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint category_images_universe_category_key unique (universe, category_id)
);

create index if not exists idx_category_images_universe_active
  on public.category_images (universe, is_active, display_order)
  where is_active = true;

-- Trigger for updated_at
do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_category_images_updated_at') then
      create trigger trg_category_images_updated_at
      before update on public.category_images
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- Comment for documentation
comment on table public.category_images is 'Admin-managed category images for homepage display';
comment on column public.category_images.universe is 'Universe: restaurants, sport, loisirs, hebergement, culture, shopping';
comment on column public.category_images.category_id is 'Category ID matching taxonomy (e.g., french, italian, hammam)';
comment on column public.category_images.name is 'Display name for the category';
comment on column public.category_images.image_url is 'URL to the category image';

commit;
