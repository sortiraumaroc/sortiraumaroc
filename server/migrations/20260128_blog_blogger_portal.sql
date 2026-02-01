-- Blog Blogger Portal — Moderation & Partner Integration
-- Adds moderation workflow support and links blog authors to partner profiles

begin;

-- ---------------------------------------------------------------------------
-- Blog articles moderation fields
-- ---------------------------------------------------------------------------
alter table public.blog_articles
  add column if not exists moderation_status text not null default 'draft'
    check (moderation_status in ('draft', 'pending', 'approved', 'rejected')),
  add column if not exists moderation_note text null,
  add column if not exists moderation_submitted_at timestamptz null,
  add column if not exists moderation_reviewed_at timestamptz null;

create index if not exists idx_blog_articles_moderation_status
  on public.blog_articles (moderation_status)
  where moderation_status in ('pending', 'rejected');

-- ---------------------------------------------------------------------------
-- Blog authors partner integration
-- ---------------------------------------------------------------------------
alter table public.blog_authors
  add column if not exists partner_profile_id uuid null references public.partner_profiles(id) on delete set null,
  add column if not exists slug text null;

-- Create unique constraint on slug if not exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'blog_authors_slug_key'
  ) then
    alter table public.blog_authors add constraint blog_authors_slug_key unique (slug);
  end if;
end $$;

create index if not exists idx_blog_authors_partner_profile_id
  on public.blog_authors (partner_profile_id)
  where partner_profile_id is not null;

-- ---------------------------------------------------------------------------
-- Partner invoice requests reference type for blog articles
-- ---------------------------------------------------------------------------
-- Ensure the reference_type column can accept 'blog_article' value
-- (The partner_invoice_requests table should already exist from Media Factory setup)

commit;
