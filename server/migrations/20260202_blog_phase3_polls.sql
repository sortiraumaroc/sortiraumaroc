-- Blog Phase 3: Polls (engagement)

-- Needed for gen_random_uuid() on some Postgres setups.
create extension if not exists pgcrypto;

create table if not exists public.blog_poll_votes (
  id uuid primary key default gen_random_uuid(),

  article_id uuid not null references public.blog_articles(id) on delete cascade,
  poll_id uuid not null,

  session_id uuid not null,
  option_index int not null,

  created_at timestamptz not null default now()
);

-- 1 vote / session / poll / article
create unique index if not exists blog_poll_votes_unique_session
  on public.blog_poll_votes(article_id, poll_id, session_id);

create index if not exists blog_poll_votes_poll
  on public.blog_poll_votes(article_id, poll_id);
