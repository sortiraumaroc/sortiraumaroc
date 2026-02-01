-- SAM Media: Quotes + Invoices (Visibility as single catalog source)

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Extend existing catalog (public.visibility_offers)
-- These offers remain the single source of truth for billable catalog items.
-- ---------------------------------------------------------------------------
alter table public.visibility_offers
  add column if not exists is_quotable boolean not null default true,
  add column if not exists is_external_allowed boolean not null default true,
  add column if not exists category text not null default 'other',
  -- Human tax rate (%). Keep legacy tax_rate_bps for existing order flows.
  add column if not exists tax_rate numeric(5,2) not null default 0;

update public.visibility_offers
set tax_rate = (tax_rate_bps::numeric / 100)
where tax_rate is null;

create index if not exists idx_visibility_offers_active_quotable_order
  on public.visibility_offers (active, is_quotable, display_order);

create index if not exists idx_visibility_offers_category
  on public.visibility_offers (category);

create index if not exists idx_visibility_offers_type
  on public.visibility_offers (type);

-- ---------------------------------------------------------------------------
-- External clients
-- ---------------------------------------------------------------------------
create table if not exists public.external_clients (
  id uuid primary key default gen_random_uuid(),

  company_name text not null,
  contact_name text null,
  email text not null,
  phone text null,
  address text null,
  city text null,
  country text not null default 'MA',
  notes text null,

  created_by_admin_id uuid null,

  created_at timestamptz not null default now()
);

create index if not exists idx_external_clients_company_name
  on public.external_clients (company_name);

create unique index if not exists idx_external_clients_email_unique
  on public.external_clients (lower(email));

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
create sequence if not exists public.media_quote_seq;

create table if not exists public.media_quotes (
  id uuid primary key default gen_random_uuid(),

  quote_number text unique not null,
  status text not null check (status in ('draft','sent','accepted','rejected','expired','cancelled')),

  client_type text not null check (client_type in ('platform','external')),

  -- Platform client: we model it as establishment_id for now.
  platform_client_id uuid null references public.establishments(id) on delete set null,
  external_client_id uuid null references public.external_clients(id) on delete set null,

  issued_at timestamptz not null default now(),
  valid_until timestamptz null,

  currency text not null default 'MAD',
  notes text null,
  payment_terms text null,
  delivery_estimate text null,

  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,

  sent_at timestamptz null,
  accepted_at timestamptz null,
  rejected_at timestamptz null,

  created_by_admin_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_quotes_client_consistency check (
    (client_type = 'platform' and platform_client_id is not null and external_client_id is null)
    or
    (client_type = 'external' and external_client_id is not null and platform_client_id is null)
  )
);

create index if not exists idx_media_quotes_status_issued_at
  on public.media_quotes (status, issued_at);

create index if not exists idx_media_quotes_platform_client_id
  on public.media_quotes (platform_client_id);

create index if not exists idx_media_quotes_external_client_id
  on public.media_quotes (external_client_id);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_media_quotes_updated_at') then
      create trigger trg_media_quotes_updated_at
      before update on public.media_quotes
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Quote items (snapshot)
-- IMPORTANT: catalog_item_id references visibility_offers (single catalog).
-- ---------------------------------------------------------------------------
create table if not exists public.media_quote_items (
  id uuid primary key default gen_random_uuid(),

  quote_id uuid not null references public.media_quotes(id) on delete cascade,
  catalog_item_id uuid null references public.visibility_offers(id) on delete set null,

  item_type text not null,
  name_snapshot text not null,
  description_snapshot text null,
  category_snapshot text null,

  unit_price_snapshot numeric(12,2) not null,
  quantity int not null default 1 check (quantity > 0),
  tax_rate_snapshot numeric(5,2) not null default 0,

  line_subtotal numeric(12,2) not null default 0,
  line_tax numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_media_quote_items_quote_id
  on public.media_quote_items (quote_id);

create index if not exists idx_media_quote_items_catalog_item_id
  on public.media_quote_items (catalog_item_id);

-- ---------------------------------------------------------------------------
-- Public links for quote view/accept (token stored as hash)
-- ---------------------------------------------------------------------------
create table if not exists public.media_quote_public_links (
  id uuid primary key default gen_random_uuid(),

  quote_id uuid not null references public.media_quotes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,

  created_at timestamptz not null default now(),
  used_at timestamptz null
);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create sequence if not exists public.media_invoice_seq;

create table if not exists public.media_invoices (
  id uuid primary key default gen_random_uuid(),

  invoice_number text unique not null,
  status text not null check (status in ('draft','issued','paid','partial','overdue','cancelled')),

  source_quote_id uuid null references public.media_quotes(id) on delete set null,

  client_type text not null check (client_type in ('platform','external')),
  platform_client_id uuid null references public.establishments(id) on delete set null,
  external_client_id uuid null references public.external_clients(id) on delete set null,

  issued_at timestamptz not null default now(),
  due_at timestamptz null,

  currency text not null default 'MAD',
  notes text null,

  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,

  paid_amount numeric(12,2) not null default 0,

  created_by_admin_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_invoices_client_consistency check (
    (client_type = 'platform' and platform_client_id is not null and external_client_id is null)
    or
    (client_type = 'external' and external_client_id is not null and platform_client_id is null)
  )
);

create index if not exists idx_media_invoices_status_issued_at
  on public.media_invoices (status, issued_at);

create index if not exists idx_media_invoices_source_quote_id
  on public.media_invoices (source_quote_id);

create index if not exists idx_media_invoices_platform_client_id
  on public.media_invoices (platform_client_id);

create index if not exists idx_media_invoices_external_client_id
  on public.media_invoices (external_client_id);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_media_invoices_updated_at') then
      create trigger trg_media_invoices_updated_at
      before update on public.media_invoices
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Invoice items (snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.media_invoice_items (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null references public.media_invoices(id) on delete cascade,
  catalog_item_id uuid null,

  item_type text not null,
  name_snapshot text not null,
  description_snapshot text null,
  category_snapshot text null,

  unit_price_snapshot numeric(12,2) not null,
  quantity int not null default 1 check (quantity > 0),
  tax_rate_snapshot numeric(5,2) not null default 0,

  line_subtotal numeric(12,2) not null default 0,
  line_tax numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_media_invoice_items_invoice_id
  on public.media_invoice_items (invoice_id);

-- ---------------------------------------------------------------------------
-- Invoice payments (optional trace)
-- ---------------------------------------------------------------------------
create table if not exists public.media_invoice_payments (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null references public.media_invoices(id) on delete cascade,
  method text null check (method in ('card','bank_transfer','cash','other')),
  amount numeric(12,2) not null,
  reference text null,
  paid_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);

create index if not exists idx_media_invoice_payments_invoice_id
  on public.media_invoice_payments (invoice_id);

-- ---------------------------------------------------------------------------
-- Security: server-only write model
-- ---------------------------------------------------------------------------
alter table public.external_clients enable row level security;
alter table public.media_quotes enable row level security;
alter table public.media_quote_items enable row level security;
alter table public.media_quote_public_links enable row level security;
alter table public.media_invoices enable row level security;
alter table public.media_invoice_items enable row level security;
alter table public.media_invoice_payments enable row level security;

commit;
