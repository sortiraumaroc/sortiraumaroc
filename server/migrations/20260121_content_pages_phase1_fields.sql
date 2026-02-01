begin;

alter table public.content_pages
  add column if not exists page_key text;

update public.content_pages
set page_key = coalesce(nullif(page_key, ''), slug)
where page_key is null or page_key = '';

alter table public.content_pages
  alter column page_key set not null;

create unique index if not exists content_pages_page_key_uidx on public.content_pages (page_key);

alter table public.content_pages
  add column if not exists slug_fr text,
  add column if not exists slug_en text;

update public.content_pages
set slug_fr = coalesce(nullif(slug_fr, ''), slug)
where slug_fr is null or slug_fr = '';

update public.content_pages
set slug_en = coalesce(nullif(slug_en, ''), slug)
where slug_en is null or slug_en = '';

alter table public.content_pages
  alter column slug_fr set not null,
  alter column slug_en set not null;

create unique index if not exists content_pages_slug_fr_uidx on public.content_pages (slug_fr);
create unique index if not exists content_pages_slug_en_uidx on public.content_pages (slug_en);

alter table public.content_pages
  add column if not exists status text;

update public.content_pages
set status = case when coalesce(is_published, false) then 'published' else 'draft' end
where status is null or status = '';

alter table public.content_pages
  alter column status set not null,
  alter column status set default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_pages_status_check'
  ) then
    alter table public.content_pages
      add constraint content_pages_status_check check (status in ('draft','published'));
  end if;
end $$;

alter table public.content_pages
  add column if not exists page_subtitle_fr text not null default '',
  add column if not exists page_subtitle_en text not null default '',
  add column if not exists seo_title_fr text not null default '',
  add column if not exists seo_title_en text not null default '',
  add column if not exists seo_description_fr text not null default '',
  add column if not exists seo_description_en text not null default '',
  add column if not exists og_title_fr text not null default '',
  add column if not exists og_title_en text not null default '',
  add column if not exists og_description_fr text not null default '',
  add column if not exists og_description_en text not null default '',
  add column if not exists og_image_url text,
  add column if not exists canonical_url_fr text not null default '',
  add column if not exists canonical_url_en text not null default '',
  add column if not exists robots text not null default '',
  add column if not exists show_toc boolean not null default false,
  add column if not exists related_links jsonb not null default '[]'::jsonb,
  add column if not exists schema_jsonld_fr jsonb,
  add column if not exists schema_jsonld_en jsonb;

create or replace function public.content_pages_sync_publish()
returns trigger
language plpgsql
as $$
begin
  -- Prefer status as the source of truth.
  if new.status is null or new.status = '' then
    new.status := case when coalesce(new.is_published, false) then 'published' else 'draft' end;
  end if;

  if new.status = 'published' then
    new.is_published := true;
  else
    new.is_published := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_content_pages_sync_publish on public.content_pages;
create trigger trg_content_pages_sync_publish
before insert or update on public.content_pages
for each row execute function public.content_pages_sync_publish();

commit;
