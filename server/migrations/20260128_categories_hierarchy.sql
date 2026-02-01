-- ============================================================================
-- Migration: Categories Hierarchy (3-level structure)
-- Date: 2026-01-28
-- Description: Create categories table for 3-level hierarchy:
--              Universe -> Category -> Subcategory (category_images)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Create categories table (level 2 in hierarchy)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  universe_slug text not null,
  slug text not null,
  name_fr text not null,
  name_en text,
  description_fr text,
  description_en text,
  icon_name text,
  image_url text,
  display_order integer default 0,
  is_active boolean default true,
  requires_booking boolean default true,
  supports_packs boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(universe_slug, slug)
);

-- Add index for faster lookups
create index if not exists idx_categories_universe_slug on public.categories(universe_slug);
create index if not exists idx_categories_is_active on public.categories(is_active);

-- Add category_slug column to category_images (subcategories)
alter table public.category_images
  add column if not exists category_slug text;

-- Add index for category_slug
create index if not exists idx_category_images_category_slug on public.category_images(category_slug);

-- Enable RLS
alter table public.categories enable row level security;

-- RLS policies for categories
drop policy if exists "Public read access to active categories" on public.categories;
create policy "Public read access to active categories"
  on public.categories for select
  using (is_active = true);

drop policy if exists "Admin full access to categories" on public.categories;
create policy "Admin full access to categories"
  on public.categories for all
  using (
    exists (
      select 1 from public.admin_collaborators ac
      where ac.user_id = auth.uid()
        and ac.is_active = true
    )
  );

commit;
