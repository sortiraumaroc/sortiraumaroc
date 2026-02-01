-- =============================================================================
-- SYSTÈME PUBLICITAIRE COMPLET - Sortir Au Maroc
-- =============================================================================
-- Inclut:
-- - Wallets publicitaires (solde prépayé)
-- - Campagnes avec modération
-- - Configuration enchères
-- - Analytics (impressions, clics, anti-fraude)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. WALLETS PUBLICITAIRES (Solde prépayé)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_wallets (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  balance_cents int not null default 0,
  total_credited_cents int not null default 0,
  total_spent_cents int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_ad_wallets_establishment unique (establishment_id),
  constraint chk_ad_wallets_balance_positive check (balance_cents >= 0)
);

create index if not exists idx_ad_wallets_establishment on public.ad_wallets (establishment_id);

-- Trigger updated_at
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_ad_wallets_updated_at') then
      create trigger trg_ad_wallets_updated_at
      before update on public.ad_wallets
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. TRANSACTIONS WALLET
-- ---------------------------------------------------------------------------
create table if not exists public.ad_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.ad_wallets(id) on delete cascade,
  type text not null check (type in ('credit', 'debit', 'refund', 'adjustment')),
  amount_cents int not null,
  balance_after_cents int not null,
  description text,
  reference_type text, -- 'payment', 'campaign_spend', 'refund', 'manual'
  reference_id uuid, -- payment_id, campaign_id, etc.
  created_by uuid, -- admin user id for manual adjustments
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_wallet_transactions_wallet on public.ad_wallet_transactions (wallet_id, created_at desc);
create index if not exists idx_ad_wallet_transactions_reference on public.ad_wallet_transactions (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- 3. EXTENSIONS TABLE CAMPAGNES (ajout colonnes modération & ciblage)
-- ---------------------------------------------------------------------------
-- Statuts de modération
alter table public.pro_campaigns add column if not exists moderation_status text not null default 'draft';
-- draft | pending_review | approved | rejected | changes_requested

alter table public.pro_campaigns add column if not exists submitted_at timestamptz;
alter table public.pro_campaigns add column if not exists reviewed_at timestamptz;
alter table public.pro_campaigns add column if not exists reviewed_by uuid;
alter table public.pro_campaigns add column if not exists rejection_reason text;
alter table public.pro_campaigns add column if not exists admin_notes text;

-- Ciblage
alter table public.pro_campaigns add column if not exists targeting jsonb not null default '{}'::jsonb;
-- Structure targeting: { keywords: [], categories: [], cities: [], radius_km: null }

-- Enchères
alter table public.pro_campaigns add column if not exists bid_amount_cents int;
alter table public.pro_campaigns add column if not exists daily_budget_cents int;
alter table public.pro_campaigns add column if not exists daily_spent_cents int not null default 0;
alter table public.pro_campaigns add column if not exists last_daily_reset timestamptz;

-- Qualité (pour algorithme enchères)
alter table public.pro_campaigns add column if not exists quality_score numeric(3,2) not null default 1.00;
alter table public.pro_campaigns add column if not exists ctr numeric(5,4) not null default 0.0000;

-- Référence établissement/offre promue
alter table public.pro_campaigns add column if not exists promoted_entity_type text; -- 'establishment', 'offer', 'pack'
alter table public.pro_campaigns add column if not exists promoted_entity_id uuid;

-- Index pour modération
create index if not exists idx_pro_campaigns_moderation_status on public.pro_campaigns (moderation_status) where moderation_status in ('pending_review', 'changes_requested');
create index if not exists idx_pro_campaigns_type_status on public.pro_campaigns (type, status) where status = 'active';

-- ---------------------------------------------------------------------------
-- 4. CRÉATIVES (visuels, textes pour les campagnes)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pro_campaigns(id) on delete cascade,
  type text not null check (type in ('text', 'image', 'banner', 'video')),
  name text,
  content jsonb not null default '{}'::jsonb,
  -- Structure content selon type:
  -- text: { headline, description, cta_text, cta_url }
  -- image: { image_url, alt_text }
  -- banner: { desktop_url, mobile_url, cta_url }
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_creatives_campaign on public.ad_creatives (campaign_id);

-- ---------------------------------------------------------------------------
-- 5. CONFIGURATION ENCHÈRES (Superadmin)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_auction_config (
  id uuid primary key default gen_random_uuid(),
  product_type text not null unique,
  -- 'sponsored_results', 'featured_pack', 'home_takeover', 'push_notification', 'email_campaign'

  min_bid_cents int not null default 200,
  suggested_bid_cents int not null default 300,
  max_bid_cents int, -- null = pas de max

  -- Facteurs de demande (ajustés automatiquement ou manuellement)
  demand_multiplier numeric(4,2) not null default 1.00,

  -- Limites
  min_budget_cents int not null default 50000, -- 500 MAD minimum
  min_daily_budget_cents int,

  -- Positions disponibles (pour sponsored_results)
  max_positions int,

  is_active boolean not null default true,

  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Insert default configs
insert into public.ad_auction_config (product_type, min_bid_cents, suggested_bid_cents, min_budget_cents, max_positions)
values
  ('sponsored_results', 200, 300, 50000, 3),
  ('featured_pack', 1000, 2000, 100000, null),
  ('home_takeover', 50000, 100000, 500000, 1),
  ('push_notification', 50, 100, 25000, null),
  ('email_campaign', 0, 0, 100000, null)
on conflict (product_type) do nothing;

-- ---------------------------------------------------------------------------
-- 6. IMPRESSIONS (Analytics détaillé)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pro_campaigns(id) on delete cascade,
  creative_id uuid references public.ad_creatives(id) on delete set null,

  user_id uuid, -- null si visiteur anonyme
  session_id text,

  placement text not null, -- 'search_results', 'home_featured', 'home_section_random', etc.
  position int, -- 1, 2, 3 pour sponsored_results

  -- Anti-fraude
  ip_hash text,
  user_agent_hash text,
  fingerprint_hash text,

  -- Contexte
  search_query text, -- pour sponsored_results
  page_url text,
  referrer text,
  device_type text, -- 'mobile', 'desktop', 'tablet'

  created_at timestamptz not null default now()
);

create index if not exists idx_ad_impressions_campaign_created on public.ad_impressions (campaign_id, created_at desc);
create index if not exists idx_ad_impressions_session on public.ad_impressions (session_id, created_at desc);
create index if not exists idx_ad_impressions_created_at on public.ad_impressions (created_at desc);

-- Partitioning hint: cette table peut devenir très volumineuse
-- Envisager partitionnement par mois si > 10M lignes

-- ---------------------------------------------------------------------------
-- 7. CLICS (Analytics + Facturation)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_clicks (
  id uuid primary key default gen_random_uuid(),
  impression_id uuid references public.ad_impressions(id) on delete set null,
  campaign_id uuid not null references public.pro_campaigns(id) on delete cascade,

  user_id uuid,
  session_id text,

  -- Facturation
  cost_cents int not null default 0,
  is_billable boolean not null default true,

  -- Anti-fraude
  ip_hash text,
  user_agent_hash text,
  is_valid boolean not null default true,
  fraud_reason text, -- 'duplicate_ip', 'bot_detected', 'rate_limit', etc.

  -- Contexte
  destination_url text,

  created_at timestamptz not null default now()
);

create index if not exists idx_ad_clicks_campaign_created on public.ad_clicks (campaign_id, created_at desc);
create index if not exists idx_ad_clicks_impression on public.ad_clicks (impression_id);
create index if not exists idx_ad_clicks_ip_hash on public.ad_clicks (ip_hash, created_at desc);

-- Index pour détection fraude (clics récents par IP)
create index if not exists idx_ad_clicks_fraud_detection on public.ad_clicks (campaign_id, ip_hash, created_at desc) where is_valid = true;

-- ---------------------------------------------------------------------------
-- 8. CONVERSIONS (Réservations/Achats attribués)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_conversions (
  id uuid primary key default gen_random_uuid(),
  click_id uuid references public.ad_clicks(id) on delete set null,
  campaign_id uuid not null references public.pro_campaigns(id) on delete cascade,

  conversion_type text not null, -- 'reservation', 'pack_purchase', 'page_view', 'contact'
  conversion_value_cents int, -- valeur de la conversion (montant réservation)

  -- Référence entité convertie
  entity_type text, -- 'reservation', 'order', etc.
  entity_id uuid,

  user_id uuid,

  -- Attribution
  attribution_window_hours int not null default 24, -- 24h par défaut
  click_to_conversion_seconds int,

  created_at timestamptz not null default now()
);

create index if not exists idx_ad_conversions_campaign on public.ad_conversions (campaign_id, created_at desc);
create index if not exists idx_ad_conversions_click on public.ad_conversions (click_id);

-- ---------------------------------------------------------------------------
-- 9. LOGS MODÉRATION
-- ---------------------------------------------------------------------------
create table if not exists public.ad_moderation_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pro_campaigns(id) on delete cascade,
  admin_user_id uuid not null,

  action text not null check (action in ('submitted', 'approved', 'rejected', 'changes_requested', 'resubmitted', 'paused', 'resumed', 'cancelled')),
  previous_status text,
  new_status text,

  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_ad_moderation_logs_campaign on public.ad_moderation_logs (campaign_id, created_at desc);
create index if not exists idx_ad_moderation_logs_admin on public.ad_moderation_logs (admin_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10. CALENDRIER HABILLAGE HOME (réservations par jour)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_home_takeover_calendar (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  campaign_id uuid references public.pro_campaigns(id) on delete set null,

  -- Prix pour ce jour (peut varier selon période)
  price_cents int not null,

  status text not null default 'available' check (status in ('available', 'reserved', 'confirmed', 'blocked')),

  -- Enchère gagnante
  winning_bid_cents int,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_home_takeover_calendar_date on public.ad_home_takeover_calendar (date);
create index if not exists idx_ad_home_takeover_calendar_status on public.ad_home_takeover_calendar (status, date) where status = 'available';

-- ---------------------------------------------------------------------------
-- 11. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------------

-- Fonction pour créditer un wallet
create or replace function public.credit_ad_wallet(
  p_establishment_id uuid,
  p_amount_cents int,
  p_description text default 'Recharge',
  p_reference_type text default 'payment',
  p_reference_id uuid default null
) returns public.ad_wallets as $$
declare
  v_wallet public.ad_wallets;
begin
  -- Créer le wallet s'il n'existe pas
  insert into public.ad_wallets (establishment_id, balance_cents)
  values (p_establishment_id, 0)
  on conflict (establishment_id) do nothing;

  -- Mettre à jour le solde
  update public.ad_wallets
  set balance_cents = balance_cents + p_amount_cents,
      total_credited_cents = total_credited_cents + p_amount_cents
  where establishment_id = p_establishment_id
  returning * into v_wallet;

  -- Enregistrer la transaction
  insert into public.ad_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    description, reference_type, reference_id
  ) values (
    v_wallet.id, 'credit', p_amount_cents, v_wallet.balance_cents,
    p_description, p_reference_type, p_reference_id
  );

  return v_wallet;
end;
$$ language plpgsql security definer;

-- Fonction pour débiter un wallet (pour facturation clics/impressions)
create or replace function public.debit_ad_wallet(
  p_wallet_id uuid,
  p_amount_cents int,
  p_description text,
  p_reference_type text default 'campaign_spend',
  p_reference_id uuid default null
) returns boolean as $$
declare
  v_wallet public.ad_wallets;
begin
  -- Vérifier et débiter atomiquement
  update public.ad_wallets
  set balance_cents = balance_cents - p_amount_cents,
      total_spent_cents = total_spent_cents + p_amount_cents
  where id = p_wallet_id
    and balance_cents >= p_amount_cents
  returning * into v_wallet;

  if not found then
    return false;
  end if;

  -- Enregistrer la transaction
  insert into public.ad_wallet_transactions (
    wallet_id, type, amount_cents, balance_after_cents,
    description, reference_type, reference_id
  ) values (
    p_wallet_id, 'debit', p_amount_cents, v_wallet.balance_cents,
    p_description, p_reference_type, p_reference_id
  );

  return true;
end;
$$ language plpgsql security definer;

-- Fonction pour obtenir les campagnes sponsorisées actives pour une recherche
create or replace function public.get_sponsored_results(
  p_search_query text,
  p_city text default null,
  p_category text default null,
  p_limit int default 3
) returns table (
  campaign_id uuid,
  establishment_id uuid,
  bid_amount_cents int,
  score numeric
) as $$
begin
  return query
  select
    c.id as campaign_id,
    c.establishment_id,
    c.bid_amount_cents,
    (c.bid_amount_cents * c.quality_score * (1 + c.ctr * 10))::numeric as score
  from public.pro_campaigns c
  where c.type = 'sponsored_results'
    and c.status = 'active'
    and c.moderation_status = 'approved'
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now())
    and c.remaining_cents >= coalesce(c.bid_amount_cents, 200)
    and (c.daily_budget_cents is null or c.daily_spent_cents < c.daily_budget_cents)
    -- Ciblage par mot-clé
    and (
      c.targeting->>'keywords' is null
      or c.targeting->>'keywords' = '[]'
      or exists (
        select 1 from jsonb_array_elements_text(c.targeting->'keywords') kw
        where lower(p_search_query) like '%' || lower(kw) || '%'
      )
    )
    -- Ciblage par ville
    and (
      p_city is null
      or c.targeting->>'cities' is null
      or c.targeting->>'cities' = '[]'
      or exists (
        select 1 from jsonb_array_elements_text(c.targeting->'cities') city
        where lower(city) = lower(p_city)
      )
    )
  order by score desc
  limit p_limit;
end;
$$ language plpgsql security definer;

-- Fonction pour reset quotidien des budgets journaliers
create or replace function public.reset_daily_ad_budgets() returns void as $$
begin
  update public.pro_campaigns
  set daily_spent_cents = 0,
      last_daily_reset = now()
  where daily_budget_cents is not null
    and (last_daily_reset is null or last_daily_reset < current_date);
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 12. VUES POUR DASHBOARD
-- ---------------------------------------------------------------------------

-- Vue campagnes avec stats pour PRO
create or replace view public.v_pro_campaigns_with_stats as
select
  c.*,
  w.balance_cents as wallet_balance_cents,
  coalesce(i.impression_count, 0) as total_impressions,
  coalesce(cl.click_count, 0) as total_clicks,
  coalesce(cv.conversion_count, 0) as total_conversions,
  case when coalesce(i.impression_count, 0) > 0
    then round(coalesce(cl.click_count, 0)::numeric / i.impression_count * 100, 2)
    else 0
  end as calculated_ctr
from public.pro_campaigns c
left join public.ad_wallets w on w.establishment_id = c.establishment_id
left join lateral (
  select count(*) as impression_count
  from public.ad_impressions
  where campaign_id = c.id
) i on true
left join lateral (
  select count(*) as click_count
  from public.ad_clicks
  where campaign_id = c.id and is_valid = true
) cl on true
left join lateral (
  select count(*) as conversion_count
  from public.ad_conversions
  where campaign_id = c.id
) cv on true;

-- Vue pour file de modération admin
create or replace view public.v_ad_moderation_queue as
select
  c.id,
  c.establishment_id,
  e.name as establishment_name,
  c.type,
  c.title,
  c.budget,
  c.bid_amount_cents,
  c.targeting,
  c.moderation_status,
  c.submitted_at,
  c.created_at,
  (select count(*) from public.ad_creatives where campaign_id = c.id) as creative_count
from public.pro_campaigns c
join public.establishments e on e.id = c.establishment_id
where c.moderation_status in ('pending_review', 'changes_requested')
order by c.submitted_at asc nulls last;

-- Vue revenus agrégés pour admin
create or replace view public.v_ad_revenue_daily as
select
  date_trunc('day', cl.created_at)::date as day,
  c.type as campaign_type,
  count(distinct c.id) as campaign_count,
  count(cl.id) as click_count,
  sum(cl.cost_cents) as revenue_cents
from public.ad_clicks cl
join public.pro_campaigns c on c.id = cl.campaign_id
where cl.is_billable = true and cl.is_valid = true
group by 1, 2
order by 1 desc, 2;

commit;
