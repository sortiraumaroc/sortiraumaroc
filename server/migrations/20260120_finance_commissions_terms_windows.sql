begin;

create extension if not exists pgcrypto;
create schema if not exists finance;

-- ---------------------------------------------------------------------------
-- Establishment-level commission overrides
-- ---------------------------------------------------------------------------
create table if not exists public.establishment_commission_overrides (
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  active boolean not null default true,

  -- Either a percent, or an explicit fixed commission amount in cents.
  commission_percent numeric null check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100)),
  commission_amount_cents bigint null check (commission_amount_cents is null or commission_amount_cents >= 0),

  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_establishment_commission_overrides_active on public.establishment_commission_overrides (active);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_establishment_commission_overrides_updated_at') then
      create trigger trg_establishment_commission_overrides_updated_at
      before update on public.establishment_commission_overrides
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.establishment_commission_overrides enable row level security;

-- ---------------------------------------------------------------------------
-- PRO terms (admin-managed) + acceptance tracking
-- ---------------------------------------------------------------------------
create table if not exists finance.pro_terms (
  id int primary key check (id = 1),
  version text not null,
  title text not null default 'Conditions PRO',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into finance.pro_terms (id, version, title, body)
values (1, 'v1', 'Conditions PRO', '')
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_finance_pro_terms_updated_at') then
      create trigger trg_finance_pro_terms_updated_at
      before update on finance.pro_terms
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table finance.pro_terms enable row level security;

create table if not exists finance.pro_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  user_id uuid not null,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists ux_finance_pro_terms_acceptances_unique
  on finance.pro_terms_acceptances (establishment_id, user_id, terms_version);

create index if not exists idx_finance_pro_terms_acceptances_establishment_accepted_at
  on finance.pro_terms_acceptances (establishment_id, accepted_at desc);

alter table finance.pro_terms_acceptances enable row level security;

-- ---------------------------------------------------------------------------
-- Payout batch RPC: keep signature, but store payout windows + eligibility
--  - Transactions from days 1-15 => eligible on 5th of next month
--  - Transactions from days 16-end => eligible on 22nd of next month
-- ---------------------------------------------------------------------------
create or replace function public.finance_upsert_payout_batch(
  p_idempotency_key text,
  p_establishment_id uuid,
  p_currency text,
  p_amount_cents bigint,
  p_reservation_id uuid,
  p_reason text,
  p_commission_cents bigint
)
returns table(payout_id uuid, applied boolean, current_status text)
language plpgsql
set search_path to 'public, finance, extensions, pg_temp'
as $function$
declare
  v_row record;
  v_existing_ids jsonb;
  v_already boolean;
  v_currency text;

  v_local_date date;
  v_month_start date;
  v_month_end date;
  v_month_start_next date;
  v_window_start date;
  v_window_end date;
  v_eligible_at timestamptz;
  v_day int;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'p_idempotency_key is required';
  end if;

  if p_establishment_id is null then
    raise exception 'p_establishment_id is required';
  end if;

  if p_reservation_id is null then
    raise exception 'p_reservation_id is required';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'p_amount_cents must be > 0';
  end if;

  v_currency := upper(coalesce(nullif(btrim(p_currency), ''), 'MAD'));

  -- Casablanca-local window rules
  v_local_date := (now() at time zone 'Africa/Casablanca')::date;
  v_month_start := date_trunc('month', v_local_date)::date;
  v_month_end := (date_trunc('month', v_local_date) + interval '1 month - 1 day')::date;
  v_month_start_next := (date_trunc('month', v_local_date) + interval '1 month')::date;
  v_day := extract(day from v_local_date)::int;

  if v_day <= 15 then
    v_window_start := v_month_start;
    v_window_end := (v_month_start + 14);
    v_eligible_at := ((v_month_start_next + 4)::timestamp at time zone 'Africa/Casablanca');
  else
    v_window_start := (v_month_start + 15);
    v_window_end := v_month_end;
    v_eligible_at := ((v_month_start_next + 21)::timestamp at time zone 'Africa/Casablanca');
  end if;

  select *
  into v_row
  from finance.payouts
  where idempotency_key = p_idempotency_key
  for update;

  if not found then
    insert into finance.payouts (
      establishment_id,
      amount_cents,
      currency,
      status,
      provider,
      idempotency_key,
      requested_at,
      window_start,
      window_end,
      eligible_at,
      metadata
    )
    values (
      p_establishment_id,
      p_amount_cents,
      v_currency,
      'pending',
      'manual',
      p_idempotency_key,
      now(),
      v_window_start,
      v_window_end,
      v_eligible_at,
      jsonb_build_object(
        'batch', true,
        'reservation_ids', jsonb_build_array(p_reservation_id::text),
        'reservations_count', 1,
        'commission_cents_total', coalesce(p_commission_cents, 0),
        'last_reservation_id', p_reservation_id::text,
        'last_reason', coalesce(p_reason, ''),
        'window_start', v_window_start::text,
        'window_end', v_window_end::text,
        'eligible_at', to_char(v_eligible_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
    returning id, true, status
    into payout_id, applied, current_status;

    return;
  end if;

  payout_id := v_row.id;
  current_status := v_row.status;

  if current_status not in ('pending','processing') then
    applied := false;
    return;
  end if;

  v_existing_ids := coalesce((v_row.metadata->'reservation_ids')::jsonb, '[]'::jsonb);
  v_already := v_existing_ids @> jsonb_build_array(p_reservation_id::text);

  if v_already then
    applied := false;
    return;
  end if;

  update finance.payouts
  set
    amount_cents = amount_cents + p_amount_cents,
    requested_at = now(),
    window_start = coalesce(window_start, v_window_start),
    window_end = coalesce(window_end, v_window_end),
    eligible_at = coalesce(eligible_at, v_eligible_at),
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  coalesce(metadata,'{}'::jsonb),
                  '{reservation_ids}',
                  v_existing_ids || jsonb_build_array(p_reservation_id::text),
                  true
                ),
                '{reservations_count}',
                to_jsonb(coalesce((metadata->>'reservations_count')::int, 0) + 1),
                true
              ),
              '{commission_cents_total}',
              to_jsonb(coalesce((metadata->>'commission_cents_total')::bigint, 0) + coalesce(p_commission_cents, 0)),
              true
            ),
            '{last_reservation_id}',
            to_jsonb(p_reservation_id::text),
            true
          ),
          '{last_reason}',
          to_jsonb(coalesce(p_reason, '')),
          true
        ),
        '{window_start}',
        to_jsonb(coalesce((metadata->>'window_start')::text, v_window_start::text)),
        true
      ),
      '{eligible_at}',
      to_jsonb(coalesce((metadata->>'eligible_at')::text, to_char(v_eligible_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
      true
    )
  where id = payout_id;

  applied := true;
  return;
end;
$function$;

commit;
