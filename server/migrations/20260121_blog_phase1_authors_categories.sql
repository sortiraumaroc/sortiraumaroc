-- Blog — Phase 1 (Authors + Categories + metadata fields)
-- This module is server-driven: clients must NOT write these tables directly.

begin;

-- Ensure UUID generator exists
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Blog authors
-- ---------------------------------------------------------------------------
create table if not exists public.blog_authors (
  id uuid primary key default gen_random_uuid(),

  display_name text not null,
  bio_short text not null default '',
  avatar_url text null,

  -- Editorial role (kept intentionally small & controlled)
  role text not null default 'editor'
    check (role in ('editor','team','guest','sam')),

  profile_url text null,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_blog_authors_active_name
  on public.blog_authors (is_active, display_name);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_blog_authors_updated_at') then
      create trigger trg_blog_authors_updated_at
      before update on public.blog_authors
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Blog categories
-- ---------------------------------------------------------------------------
create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,

  is_active boolean not null default true,
  display_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint blog_categories_slug_key unique (slug)
);

create index if not exists idx_blog_categories_active_order
  on public.blog_categories (is_active, display_order, title);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_blog_categories_updated_at') then
      create trigger trg_blog_categories_updated_at
      before update on public.blog_categories
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Blog articles metadata extensions
-- ---------------------------------------------------------------------------
alter table public.blog_articles
  add column if not exists author_id uuid null references public.blog_authors(id) on delete set null,
  add column if not exists primary_category_id uuid null references public.blog_categories(id) on delete set null,
  add column if not exists secondary_category_ids uuid[] not null default '{}'::uuid[],
  add column if not exists show_read_count boolean not null default false,
  add column if not exists read_count int not null default 0 check (read_count >= 0);

create index if not exists idx_blog_articles_author_id on public.blog_articles (author_id);
create index if not exists idx_blog_articles_primary_category_id on public.blog_articles (primary_category_id);

-- ---------------------------------------------------------------------------
-- Seed default categories (idempotent)
-- ---------------------------------------------------------------------------
insert into public.blog_categories (slug, title, display_order)
values
  ('actualite', 'Actualité', 10),
  ('informations', 'Informations', 20),
  ('nouveautes', 'Nouveautés', 30),
  ('promotions', 'Promotions', 40),
  ('guides', 'Guides', 50),
  ('conseils', 'Conseils', 60),
  ('evenements', 'Événements', 70),
  ('autres', 'Autres', 999)
on conflict (slug) do nothing;

commit;
