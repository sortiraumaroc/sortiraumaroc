create table if not exists public.consumer_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text null,

  -- Percentage discount in basis points (ex: 10000 = 100%)
  discount_bps int not null default 0 check (discount_bps >= 0 and discount_bps <= 10000),

  -- Optional scoping
  applies_to_pack_id uuid null references public.packs(id) on delete set null,
  applies_to_establishment_ids uuid[] null,

  active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint consumer_promo_codes_code_unique unique (code)
);

create index if not exists idx_consumer_promo_codes_active on public.consumer_promo_codes (active, starts_at, ends_at);
create index if not exists idx_consumer_promo_codes_pack_id on public.consumer_promo_codes (applies_to_pack_id);
create index if not exists idx_consumer_promo_codes_establishment_ids on public.consumer_promo_codes using gin (applies_to_establishment_ids);

alter table public.consumer_promo_codes enable row level security;

-- No policies on purpose: all access goes through the server API (service role).

commit;
