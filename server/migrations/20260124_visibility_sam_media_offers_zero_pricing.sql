begin;

-- Make SAM Media offers visible in PRO marketplace.
-- For now: price = 0 MAD (tarif à définir), active = true.
-- Checkout will remain blocked until pricing is set (> 0) from Admin.

update public.visibility_offers
set
  active = true,
  price_cents = 0,
  currency = 'MAD',
  description = 'Visibilité ciblée & impact immédiat',
  deliverables = array[
    '1 vidéo professionnelle (90 secondes maximum)',
    'Scénario, tournage et montage inclus',
    'Voix off incluse',
    'Diffusion sur les réseaux Sortir Au Maroc (Instagram, TikTok, Snapchat, Facebook selon pertinence)',
    'Mention collaboration commerciale si requise par la plateforme',
    '7 jours de sponsoring ciblé (ville + profil de clientèle)'
  ]::text[]
where deleted_at is null
  and title = 'PACK SILVER';

update public.visibility_offers
set
  active = true,
  price_cents = 0,
  currency = 'MAD',
  description = 'Visibilité renforcée & contenu durable',
  deliverables = array[
    'Tout le Pack Silver inclus',
    '30 jours de sponsoring ciblé',
    '4 stories de rappel (1 par semaine pendant 1 mois)',
    'Call-To-Action cliquable (réservation, WhatsApp, site web, réseaux sociaux)',
    '1 article de publi-reportage sur le blog Sortir Au Maroc',
    'Contenu durable (SEO)'
  ]::text[]
where deleted_at is null
  and title = 'PACK PREMIUM';

update public.visibility_offers
set
  active = true,
  price_cents = 0,
  currency = 'MAD'
where deleted_at is null
  and title = 'OFFRE MÉDIA — VIDÉO (Workflow)'
  and type = 'media_video';

-- ---------------------------------------------------------------------------
-- Services complémentaires (OPTIONS)
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
      'Option — Vidéo off (sans mention SAM)',
      'Vidéo “off” sans mention Sortir Au Maroc (pour diffusion sur vos propres réseaux).',
      'option',
      array['Vidéo off sans mention SAM']::text[],
      null,
      0,
      'MAD',
      false,
      0,
      'TVA',
      true,
      21
    ),
    (
      'Option — Récupération de la vidéo SAM',
      'Récupération de la vidéo SAM pour diffusion sur vos réseaux.',
      'option',
      array['Récupération de la vidéo SAM']::text[],
      null,
      0,
      'MAD',
      false,
      0,
      'TVA',
      true,
      22
    ),
    (
      'Option — Extension sponsoring (14 jours)',
      'Extension de sponsoring par tranches de 14 jours.',
      'option',
      array['Extension sponsoring (14 jours)']::text[],
      14,
      0,
      'MAD',
      true,
      0,
      'TVA',
      true,
      23
    ),
    (
      'Option — Service stories (min 2)',
      'Service stories (minimum 2 stories – Instagram & Snapchat).',
      'option',
      array['Service stories (minimum 2)']::text[],
      null,
      0,
      'MAD',
      true,
      0,
      'TVA',
      true,
      24
    ),
    (
      'Option — Service carrousel',
      'Publi-reportage sous forme de carrousel sponsorisé.',
      'option',
      array['Carrousel sponsorisé']::text[],
      null,
      0,
      'MAD',
      true,
      0,
      'TVA',
      true,
      25
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
