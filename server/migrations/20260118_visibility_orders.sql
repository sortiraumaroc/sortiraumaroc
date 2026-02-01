-- Visibility (SAM Media) offers + orders
-- This module is server-driven: clients must NOT write these tables directly.

begin;

-- Ensure UUID generator exists
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Offers catalog (admin-managed pricing)
-- ---------------------------------------------------------------------------
create table if not exists public.visibility_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  type text not null check (type in ('pack', 'option')),
  deliverables text[] not null default '{}'::text[],
  duration_days int null check (duration_days is null or duration_days > 0),

  -- Pricing is admin-managed; price can be null when offer is inactive.
  price_cents int null check (price_cents is null or price_cents >= 0),
  currency text not null default 'MAD',

  -- Allow quantity changes for options (ex: extensions) when enabled.
  allow_quantity boolean not null default false,

  -- Minimal configurable taxes.
  tax_rate_bps int not null default 0 check (tax_rate_bps >= 0),
  tax_label text not null default 'TVA',

  active boolean not null default false,
  display_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists idx_visibility_offers_active_order on public.visibility_offers (active, display_order);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_visibility_offers_updated_at') then
      create trigger trg_visibility_offers_updated_at
      before update on public.visibility_offers
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Orders (created by PRO checkout; payment_status updated by webhook/admin)
-- ---------------------------------------------------------------------------
create table if not exists public.visibility_orders (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  created_by_user_id uuid null,

  payment_status text not null default 'pending' check (payment_status in ('pending','paid','refunded','failed')),

  -- Delivery lifecycle (admin-managed)
  status text not null default 'pending' check (status in ('pending','in_progress','delivered','cancelled','refunded')),

  currency text not null default 'MAD',
  subtotal_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null default 0,

  paid_at timestamptz null,
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visibility_orders_establishment_created_at on public.visibility_orders (establishment_id, created_at desc);
create index if not exists idx_visibility_orders_payment_created_at on public.visibility_orders (payment_status, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_visibility_orders_updated_at') then
      create trigger trg_visibility_orders_updated_at
      before update on public.visibility_orders
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Order items (snapshot of offer at time of purchase)
-- ---------------------------------------------------------------------------
create table if not exists public.visibility_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.visibility_orders(id) on delete cascade,
  offer_id uuid null references public.visibility_offers(id) on delete set null,

  title text not null,
  description text null,
  type text not null check (type in ('pack', 'option')),
  deliverables text[] not null default '{}'::text[],
  duration_days int null,

  quantity int not null default 1 check (quantity > 0),
  unit_price_cents int not null default 0,
  total_price_cents int not null default 0,
  currency text not null default 'MAD',

  tax_rate_bps int not null default 0,
  tax_label text not null default 'TVA',

  created_at timestamptz not null default now()
);

create index if not exists idx_visibility_order_items_order_id on public.visibility_order_items (order_id);

-- ---------------------------------------------------------------------------
-- Security: server-only write model (no direct client access)
-- ---------------------------------------------------------------------------
alter table public.visibility_offers enable row level security;
alter table public.visibility_orders enable row level security;
alter table public.visibility_order_items enable row level security;

-- No policies on purpose: all access goes through the server API (service role).

-- ---------------------------------------------------------------------------
-- Seed default offers (inactive until admin sets price)
-- ---------------------------------------------------------------------------
insert into public.visibility_offers (title, description, type, deliverables, duration_days, allow_quantity, tax_rate_bps, tax_label, active, display_order)
select * from (
  values
    (
      'PACK SILVER',
      'Vidéo pro ~90 sec (scénario, tournage, montage, voix off) + diffusion réseaux SAM + sponsoring ciblé 7 jours.',
      'pack',
      array[
        'Vidéo pro ~90 sec',
        'Scénario / tournage / montage',
        'Voix off',
        'Diffusion réseaux SAM',
        'Mention collaboration si requise',
        'Sponsoring ciblé 7 jours'
      ]::text[],
      7,
      false,
      0,
      'TVA',
      false,
      10
    ),
    (
      'PACK PREMIUM',
      'Tout le Silver + sponsoring 30 jours + 4 stories + CTA cliquable + article publi-reportage blog + contenu durable SEO.',
      'pack',
      array[
        'Tout le Pack Silver',
        'Sponsoring ciblé 30 jours',
        '4 stories',
        'CTA cliquable',
        'Article publi-reportage blog',
        'Contenu durable (SEO)'
      ]::text[],
      30,
      false,
      0,
      'TVA',
      false,
      20
    )
) as v(title, description, type, deliverables, duration_days, allow_quantity, tax_rate_bps, tax_label, active, display_order)
where not exists (
  select 1 from public.visibility_offers o
  where o.title = v.title and o.deleted_at is null
);

commit;
