-- Adds usage controls to consumer promo codes and tracks redemptions.
--
-- Requirements:
-- - Codes can be private/public (useful for gestures commerciaux)
-- - Codes can be limited by total usage and/or per-user usage
-- - Track successful redemptions for enforcement

begin;

alter table public.consumer_promo_codes
  add column if not exists is_public boolean not null default false,
  add column if not exists max_uses_total int null,
  add column if not exists max_uses_per_user int null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consumer_promo_codes_max_uses_total_check'
  ) then
    alter table public.consumer_promo_codes
      add constraint consumer_promo_codes_max_uses_total_check
        check (max_uses_total is null or max_uses_total >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'consumer_promo_codes_max_uses_per_user_check'
  ) then
    alter table public.consumer_promo_codes
      add constraint consumer_promo_codes_max_uses_per_user_check
        check (max_uses_per_user is null or max_uses_per_user >= 1);
  end if;
end $$;

create table if not exists public.consumer_promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.consumer_promo_codes(id) on delete cascade,
  user_id uuid not null,
  pack_purchase_id uuid null references public.pack_purchases(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint consumer_promo_code_redemptions_unique_purchase unique (promo_code_id, pack_purchase_id)
);

create index if not exists idx_consumer_promo_code_redemptions_promo_id
  on public.consumer_promo_code_redemptions (promo_code_id);

create index if not exists idx_consumer_promo_code_redemptions_user_id
  on public.consumer_promo_code_redemptions (user_id);

create index if not exists idx_consumer_promo_code_redemptions_promo_user
  on public.consumer_promo_code_redemptions (promo_code_id, user_id);

alter table public.consumer_promo_code_redemptions enable row level security;

-- No policies on purpose: all access goes through the server API (service role).

commit;
