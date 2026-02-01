-- Extend pro_profiles with additional business information fields
-- Required for proper invoicing: postal_code, rc, country, first_name, last_name

begin;

-- Add missing columns to pro_profiles
alter table public.pro_profiles
  add column if not exists first_name text null,
  add column if not exists last_name text null,
  add column if not exists postal_code text null,
  add column if not exists country text null default 'Maroc',
  add column if not exists rc text null;

-- Index for RC lookups (Registre du Commerce)
create index if not exists idx_pro_profiles_rc on public.pro_profiles (rc) where rc is not null;

-- Add comment for documentation
comment on column public.pro_profiles.first_name is 'Prénom du contact principal';
comment on column public.pro_profiles.last_name is 'Nom du contact principal';
comment on column public.pro_profiles.postal_code is 'Code postal';
comment on column public.pro_profiles.country is 'Pays (défaut: Maroc)';
comment on column public.pro_profiles.rc is 'Registre du Commerce';

commit;
