-- Central issuer profile for all invoices (PRO + USER)
-- Source of truth: Moroccan RC data (do not duplicate in client code)

create table if not exists public.billing_company_profile (
  id text primary key default 'default',

  legal_name text not null,
  trade_name text not null,
  legal_form text not null,

  ice text not null,
  rc_number text not null,
  rc_court text not null,

  address_line1 text not null,
  address_line2 text,
  city text not null,
  country text not null default 'Maroc',

  capital_mad integer not null,
  default_currency text not null default 'MAD',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_company_profile_singleton_check check (id = 'default')
);

alter table public.billing_company_profile enable row level security;

-- No RLS policies: deny all for client. Server uses service role.

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_billing_company_profile_updated_at on public.billing_company_profile;
create trigger trg_billing_company_profile_updated_at
before update on public.billing_company_profile
for each row execute function public.set_updated_at();

insert into public.billing_company_profile (
  id,
  legal_name,
  trade_name,
  legal_form,
  ice,
  rc_number,
  rc_court,
  address_line1,
  address_line2,
  city,
  country,
  capital_mad,
  default_currency
) values (
  'default',
  'MINTA SARL',
  'Sam’Booking',
  'SARL',
  '003848820000094',
  '705569',
  'Tribunal de commerce de Casablanca',
  '45 Rue Abdelkader Mouftakar',
  'Étage 2, Apt 4',
  'Casablanca',
  'Maroc',
  10000,
  'MAD'
)
on conflict (id) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  legal_form = excluded.legal_form,
  ice = excluded.ice,
  rc_number = excluded.rc_number,
  rc_court = excluded.rc_court,
  address_line1 = excluded.address_line1,
  address_line2 = excluded.address_line2,
  city = excluded.city,
  country = excluded.country,
  capital_mad = excluded.capital_mad,
  default_currency = excluded.default_currency;
