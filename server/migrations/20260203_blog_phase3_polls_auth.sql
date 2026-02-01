-- Blog Phase 3: Polls (Phase 2) — Auth + Strong uniqueness

create extension if not exists pgcrypto;

alter table if exists public.blog_poll_votes
  add column if not exists user_id uuid;

-- session_id is now optional (legacy / extra signal). Strong uniqueness is user_id.
alter table if exists public.blog_poll_votes
  alter column session_id drop not null;

-- Strong uniqueness: 1 user = 1 vote per poll per article.
create unique index if not exists blog_poll_votes_unique_user
  on public.blog_poll_votes(article_id, poll_id, user_id)
  where user_id is not null;

-- Helpful for admin stats and fast lookups
create index if not exists blog_poll_votes_user
  on public.blog_poll_votes(user_id);
