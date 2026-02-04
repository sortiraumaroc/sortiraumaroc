-- Newsletter subscribers and Audiences system
--
-- This migration adds:
-- 1. newsletter_subscribers table for storing newsletter signups
-- 2. audiences table for creating segmented contact lists
-- 3. audience_members table for storing audience membership

begin;

-- ---------------------------------------------------------------------------
-- 1. Newsletter Subscribers Table
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  last_name text,
  phone text,
  city text,
  country text,
  ip_address inet,
  age integer,
  gender text check (gender in ('male', 'female', 'other', null)),
  profession text,
  csp text,
  interests text[],
  source text default 'footer',
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced')),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_newsletter_subscribers_email on public.newsletter_subscribers(email);
create index if not exists idx_newsletter_subscribers_status on public.newsletter_subscribers(status);
create index if not exists idx_newsletter_subscribers_city on public.newsletter_subscribers(city);
create index if not exists idx_newsletter_subscribers_country on public.newsletter_subscribers(country);
create index if not exists idx_newsletter_subscribers_created_at on public.newsletter_subscribers(created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Audiences Table
-- ---------------------------------------------------------------------------
create table if not exists public.audiences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  filters jsonb not null default '{}',
  is_dynamic boolean not null default true,
  member_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audiences_name on public.audiences(name);
create index if not exists idx_audiences_created_at on public.audiences(created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Audience Members Table (for static audiences or cached membership)
-- ---------------------------------------------------------------------------
create table if not exists public.audience_members (
  id uuid primary key default gen_random_uuid(),
  audience_id uuid not null references public.audiences(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique(audience_id, subscriber_id)
);

create index if not exists idx_audience_members_audience_id on public.audience_members(audience_id);
create index if not exists idx_audience_members_subscriber_id on public.audience_members(subscriber_id);

-- ---------------------------------------------------------------------------
-- 4. Link prospects to audiences
-- ---------------------------------------------------------------------------
alter table public.email_prospects add column if not exists audience_id uuid references public.audiences(id) on delete set null;
alter table public.email_prospects add column if not exists subscriber_id uuid references public.newsletter_subscribers(id) on delete set null;

create index if not exists idx_email_prospects_audience_id on public.email_prospects(audience_id);
create index if not exists idx_email_prospects_subscriber_id on public.email_prospects(subscriber_id);

-- ---------------------------------------------------------------------------
-- 5. Function to calculate audience members based on filters
-- ---------------------------------------------------------------------------
create or replace function public.get_audience_members(p_audience_id uuid)
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  phone text,
  city text,
  country text,
  age integer,
  gender text,
  profession text,
  csp text,
  interests text[],
  created_at timestamptz
) as $$
declare
  v_filters jsonb;
  v_is_dynamic boolean;
  v_sql text;
begin
  select a.filters, a.is_dynamic into v_filters, v_is_dynamic
  from public.audiences a
  where a.id = p_audience_id;

  if not found then
    return;
  end if;

  if not v_is_dynamic then
    return query
    select
      ns.id,
      ns.email,
      ns.first_name,
      ns.last_name,
      ns.phone,
      ns.city,
      ns.country,
      ns.age,
      ns.gender,
      ns.profession,
      ns.csp,
      ns.interests,
      ns.created_at
    from public.newsletter_subscribers ns
    join public.audience_members am on am.subscriber_id = ns.id
    where am.audience_id = p_audience_id
      and ns.status = 'active';
    return;
  end if;

  v_sql := 'select id, email, first_name, last_name, phone, city, country, age, gender, profession, csp, interests, created_at from public.newsletter_subscribers where status = ''active''';

  if v_filters->>'cities' is not null and jsonb_array_length(v_filters->'cities') > 0 then
    v_sql := v_sql || ' and city = any(select jsonb_array_elements_text($1->''cities''))';
  end if;

  if v_filters->>'countries' is not null and jsonb_array_length(v_filters->'countries') > 0 then
    v_sql := v_sql || ' and country = any(select jsonb_array_elements_text($1->''countries''))';
  end if;

  if v_filters->>'genders' is not null and jsonb_array_length(v_filters->'genders') > 0 then
    v_sql := v_sql || ' and gender = any(select jsonb_array_elements_text($1->''genders''))';
  end if;

  if v_filters->>'csp_list' is not null and jsonb_array_length(v_filters->'csp_list') > 0 then
    v_sql := v_sql || ' and csp = any(select jsonb_array_elements_text($1->''csp_list''))';
  end if;

  if v_filters->>'age_min' is not null then
    v_sql := v_sql || ' and age >= ($1->>''age_min'')::integer';
  end if;

  if v_filters->>'age_max' is not null then
    v_sql := v_sql || ' and age <= ($1->>''age_max'')::integer';
  end if;

  if v_filters->>'interests' is not null and jsonb_array_length(v_filters->'interests') > 0 then
    v_sql := v_sql || ' and interests && (select array_agg(x) from jsonb_array_elements_text($1->''interests'') as x)';
  end if;

  return query execute v_sql using v_filters;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 6. Function to update audience member count
-- ---------------------------------------------------------------------------
create or replace function public.update_audience_member_count(p_audience_id uuid)
returns integer as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.get_audience_members(p_audience_id);

  update public.audiences
  set member_count = v_count, updated_at = now()
  where id = p_audience_id;

  return v_count;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 7. Function to load audience into prospects
-- ---------------------------------------------------------------------------
create or replace function public.load_audience_to_prospects(p_audience_id uuid)
returns integer as $$
declare
  v_count integer := 0;
begin
  insert into public.email_prospects (email, first_name, last_name, phone, city, audience_id, subscriber_id, source, status)
  select
    m.email,
    m.first_name,
    m.last_name,
    m.phone,
    m.city,
    p_audience_id,
    m.id,
    'audience',
    'active'
  from public.get_audience_members(p_audience_id) m
  on conflict (email) do update set
    audience_id = excluded.audience_id,
    subscriber_id = excluded.subscriber_id,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 8. RLS Policies
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;
alter table public.audiences enable row level security;
alter table public.audience_members enable row level security;

drop policy if exists "Admin full access to newsletter_subscribers" on public.newsletter_subscribers;
create policy "Admin full access to newsletter_subscribers" on public.newsletter_subscribers
  for all using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

drop policy if exists "Public can insert newsletter_subscribers" on public.newsletter_subscribers;
create policy "Public can insert newsletter_subscribers" on public.newsletter_subscribers
  for insert with check (true);

drop policy if exists "Admin full access to audiences" on public.audiences;
create policy "Admin full access to audiences" on public.audiences
  for all using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

drop policy if exists "Admin full access to audience_members" on public.audience_members;
create policy "Admin full access to audience_members" on public.audience_members
  for all using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

commit;
