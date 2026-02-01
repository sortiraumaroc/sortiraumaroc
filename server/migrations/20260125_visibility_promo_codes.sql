begin;

create table if not exists public.visibility_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text null,

  -- Percentage discount in basis points (ex: 1000 = 10%)
  discount_bps int not null default 0 check (discount_bps >= 0 and discount_bps <= 10000),

  -- Optional scoping (global when both are null)
  applies_to_type text null check (applies_to_type is null or applies_to_type in ('pack','option','menu_digital','media_video')),
  applies_to_offer_id uuid null references public.visibility_offers(id) on delete set null,

  active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint visibility_promo_codes_code_unique unique (code)
);

create index if not exists idx_visibility_promo_codes_active on public.visibility_promo_codes (active, starts_at, ends_at);

alter table public.visibility_promo_codes enable row level security;

-- No policies on purpose: all access goes through the server API (service role).

commit;
