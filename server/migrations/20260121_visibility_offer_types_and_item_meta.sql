-- Extend Visibility (SAM Media) offer types and support item-level workflow metadata

begin;

-- ---------------------------------------------------------------------------
-- Expand offer types
-- ---------------------------------------------------------------------------
alter table public.visibility_offers
  drop constraint if exists visibility_offers_type_check;

alter table public.visibility_offers
  add constraint visibility_offers_type_check
  check (type in ('pack', 'option', 'menu_digital', 'media_video'));

alter table public.visibility_order_items
  drop constraint if exists visibility_order_items_type_check;

alter table public.visibility_order_items
  add constraint visibility_order_items_type_check
  check (type in ('pack', 'option', 'menu_digital', 'media_video'));

-- ---------------------------------------------------------------------------
-- Item metadata (workflow tracking for media production)
-- ---------------------------------------------------------------------------
alter table public.visibility_order_items
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Seed Menu Digital plans (active by default)
-- Prices are in cents (ex: 200 MAD => 20000)
-- Annual discount: -17% on 12 months
-- ---------------------------------------------------------------------------
insert into public.visibility_offers (
  title,
  description,
  type,
  deliverables,
  duration_days,
  price_cents,
  currency,
  allow_quantity,
  tax_rate_bps,
  tax_label,
  active,
  display_order
)
select * from (
  values
    (
      'MENU DIGITAL — SILVER (Mensuel)',
      'Abonnement Menu Digital (Silver) · Paiement mensuel.',
      'menu_digital',
      array[
        'Menu digital accessible via QR code',
        'Lien partageable (WhatsApp / Instagram)',
        'Mises à jour illimitées depuis votre espace',
        'Support SAM'
      ]::text[],
      30,
      20000,
      'MAD',
      false,
      0,
      'TVA',
      true,
      30
    ),
    (
      'MENU DIGITAL — SILVER (Annuel -17%)',
      'Abonnement Menu Digital (Silver) · Paiement annuel (-17%).',
      'menu_digital',
      array[
        'Menu digital accessible via QR code',
        'Lien partageable (WhatsApp / Instagram)',
        'Mises à jour illimitées depuis votre espace',
        'Support SAM'
      ]::text[],
      365,
      199200,
      'MAD',
      false,
      0,
      'TVA',
      true,
      31
    ),
    (
      'MENU DIGITAL — PREMIUM (Mensuel)',
      'Abonnement Menu Digital (Premium) · Paiement mensuel.',
      'menu_digital',
      array[
        'Tout le Silver',
        'Mise en avant du menu (visuel + sections)',
        'Support prioritaire'
      ]::text[],
      30,
      50000,
      'MAD',
      false,
      0,
      'TVA',
      true,
      40
    ),
    (
      'MENU DIGITAL — PREMIUM (Annuel -17%)',
      'Abonnement Menu Digital (Premium) · Paiement annuel (-17%).',
      'menu_digital',
      array[
        'Tout le Silver',
        'Mise en avant du menu (visuel + sections)',
        'Support prioritaire'
      ]::text[],
      365,
      498000,
      'MAD',
      false,
      0,
      'TVA',
      true,
      41
    ),
    (
      'OFFRE MÉDIA — VIDÉO (Workflow)',
      'Production vidéo avec suivi en 8 étapes (rendez-vous → diffusion).',
      'media_video',
      array[
        'Rendez-vous pris',
        'Tournage effectué',
        'Montage en cours',
        'Voix off',
        'Validation',
        'Sous-titrage',
        'Publication',
        'Diffusion'
      ]::text[],
      null,
      null,
      'MAD',
      false,
      0,
      'TVA',
      false,
      50
    )
) as v(
  title,
  description,
  type,
  deliverables,
  duration_days,
  price_cents,
  currency,
  allow_quantity,
  tax_rate_bps,
  tax_label,
  active,
  display_order
)
where not exists (
  select 1 from public.visibility_offers o
  where o.title = v.title and o.deleted_at is null
);

commit;
