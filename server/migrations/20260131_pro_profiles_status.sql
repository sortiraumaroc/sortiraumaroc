-- Add status field to pro_profiles for account suspension
-- Status: active (default) | suspended

begin;

-- Add status column to pro_profiles
alter table public.pro_profiles
  add column if not exists status text not null default 'active' check (status in ('active', 'suspended')),
  add column if not exists suspended_at timestamptz null,
  add column if not exists suspended_by text null,
  add column if not exists suspension_reason text null;

-- Index for filtering by status
create index if not exists idx_pro_profiles_status on public.pro_profiles (status);

-- Add comments for documentation
comment on column public.pro_profiles.status is 'Account status: active or suspended';
comment on column public.pro_profiles.suspended_at is 'When the account was suspended';
comment on column public.pro_profiles.suspended_by is 'Who suspended the account (admin user id)';
comment on column public.pro_profiles.suspension_reason is 'Reason for suspension';

commit;
