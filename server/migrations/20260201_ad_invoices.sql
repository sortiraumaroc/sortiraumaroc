-- =============================================================================
-- AD INVOICES - Factures automatiques pour les commandes publicitaires
-- =============================================================================

-- Table des factures publicitaires
create table if not exists public.ad_invoices (
  id uuid primary key default gen_random_uuid(),

  -- Numérotation séquentielle
  invoice_number varchar(50) not null unique,
  -- Format: SAM-PUB-2024-00001

  -- Relation établissement
  establishment_id uuid not null references public.establishments(id) on delete restrict,

  -- Type de commande
  invoice_type text not null check (
    invoice_type in ('wallet_recharge', 'sponsored_result', 'featured_pack', 'home_takeover', 'push_notification', 'email_campaign')
  ),

  -- Référence à la commande/campagne/transaction
  reference_type text, -- 'campaign', 'wallet_transaction', 'notification', etc.
  reference_id uuid,

  -- Montants
  subtotal_cents int not null,
  vat_rate numeric(5, 2) not null default 20.00, -- 20% TVA
  vat_amount_cents int not null,
  total_cents int not null,

  -- Informations client (snapshot au moment de la création)
  client_info jsonb not null default '{}',
  -- {
  --   "name": "Nom établissement",
  --   "ice": "ICE000000000",
  --   "rc": "RC000000",
  --   "address": "123 Rue Example",
  --   "city": "Casablanca",
  --   "country": "Maroc",
  --   "email": "contact@example.com",
  --   "phone": "+212600000000"
  -- }

  -- Informations émetteur (snapshot de SAM)
  issuer_info jsonb not null default '{}',
  -- Mêmes champs que client_info

  -- Description des lignes
  line_items jsonb not null default '[]',
  -- [
  --   { "description": "Recharge wallet publicitaire", "quantity": 1, "unit_price_cents": 100000, "total_cents": 100000 }
  -- ]

  -- Statut
  status text not null default 'draft' check (
    status in ('draft', 'issued', 'paid', 'cancelled')
  ),

  -- Dates
  issued_at timestamptz,
  paid_at timestamptz,
  due_date date,

  -- Méthode de paiement
  payment_method text,
  payment_reference text,

  -- Notes
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index
create index if not exists idx_ad_invoices_establishment on public.ad_invoices (establishment_id);
create index if not exists idx_ad_invoices_status on public.ad_invoices (status);
create index if not exists idx_ad_invoices_issued_at on public.ad_invoices (issued_at desc);
create index if not exists idx_ad_invoices_number on public.ad_invoices (invoice_number);

-- Séquence pour la numérotation
create sequence if not exists ad_invoice_seq start 1;

-- Fonction pour générer le prochain numéro de facture
create or replace function public.generate_ad_invoice_number()
returns text as $$
declare
  v_year text;
  v_seq int;
  v_number text;
begin
  v_year := to_char(current_date, 'YYYY');
  v_seq := nextval('ad_invoice_seq');
  v_number := 'SAM-PUB-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  return v_number;
end;
$$ language plpgsql;

-- Fonction pour créer une facture automatiquement
create or replace function public.create_ad_invoice(
  p_establishment_id uuid,
  p_invoice_type text,
  p_subtotal_cents int,
  p_description text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_payment_method text default null,
  p_payment_reference text default null
)
returns public.ad_invoices as $$
declare
  v_invoice public.ad_invoices;
  v_establishment record;
  v_issuer record;
  v_vat_rate numeric := 20.00;
  v_vat_cents int;
  v_total_cents int;
  v_invoice_number text;
begin
  -- Récupérer les infos de l'établissement
  select * into v_establishment
  from public.establishments
  where id = p_establishment_id;

  if v_establishment is null then
    raise exception 'Établissement non trouvé';
  end if;

  -- Récupérer les infos de SAM (issuer)
  select * into v_issuer
  from public.billing_company_profile
  limit 1;

  -- Calculer la TVA
  v_vat_cents := round(p_subtotal_cents * v_vat_rate / 100);
  v_total_cents := p_subtotal_cents + v_vat_cents;

  -- Générer le numéro de facture
  v_invoice_number := generate_ad_invoice_number();

  -- Créer la facture
  insert into public.ad_invoices (
    invoice_number,
    establishment_id,
    invoice_type,
    reference_type,
    reference_id,
    subtotal_cents,
    vat_rate,
    vat_amount_cents,
    total_cents,
    client_info,
    issuer_info,
    line_items,
    status,
    issued_at,
    payment_method,
    payment_reference
  ) values (
    v_invoice_number,
    p_establishment_id,
    p_invoice_type,
    p_reference_type,
    p_reference_id,
    p_subtotal_cents,
    v_vat_rate,
    v_vat_cents,
    v_total_cents,
    jsonb_build_object(
      'name', v_establishment.name,
      'ice', coalesce(v_establishment.ice, ''),
      'rc', coalesce(v_establishment.rc, ''),
      'address', coalesce(v_establishment.address, ''),
      'city', coalesce(v_establishment.city, ''),
      'country', 'Maroc',
      'email', coalesce(v_establishment.email, ''),
      'phone', coalesce(v_establishment.phone, '')
    ),
    case when v_issuer is not null then
      jsonb_build_object(
        'legal_name', v_issuer.legal_name,
        'trade_name', v_issuer.trade_name,
        'legal_form', v_issuer.legal_form,
        'ice', v_issuer.ice,
        'rc_number', v_issuer.rc_number,
        'rc_court', v_issuer.rc_court,
        'address_line1', v_issuer.address_line1,
        'address_line2', v_issuer.address_line2,
        'city', v_issuer.city,
        'country', v_issuer.country,
        'capital_mad', v_issuer.capital_mad
      )
    else '{}'::jsonb
    end,
    jsonb_build_array(
      jsonb_build_object(
        'description', p_description,
        'quantity', 1,
        'unit_price_cents', p_subtotal_cents,
        'total_cents', p_subtotal_cents
      )
    ),
    'issued',
    now(),
    p_payment_method,
    p_payment_reference
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$ language plpgsql;

-- Accorder les droits
grant all on public.ad_invoices to service_role;
grant select on public.ad_invoices to authenticated;
grant usage, select on sequence ad_invoice_seq to service_role;
