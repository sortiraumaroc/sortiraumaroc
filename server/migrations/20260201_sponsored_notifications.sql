-- =============================================================================
-- SPONSORED NOTIFICATIONS SYSTEM
-- Push notifications sponsorisées envoyées aux utilisateurs
-- =============================================================================

-- Table pour stocker les notifications sponsorisées envoyées aux utilisateurs
-- Ces notifications apparaissent dans l'espace notifications des users
create table if not exists public.sponsored_notifications (
  id uuid primary key default gen_random_uuid(),

  -- Lien vers la campagne pub
  campaign_id uuid references public.pro_campaigns(id) on delete set null,
  establishment_id uuid references public.establishments(id) on delete set null,

  -- Contenu de la notification
  title varchar(50) not null,        -- Max 50 caractères
  description varchar(150) not null, -- Max 150 caractères
  link_url text,                      -- URL de destination
  image_url text,                     -- Image optionnelle (512x256 recommandé)

  -- Type de notification (pour icône)
  notification_type text not null default 'promo' check (
    notification_type in ('promo', 'nouveau', 'flash', 'evenement', 'rappel')
  ),

  -- Ciblage
  targeting jsonb not null default '{}',
  -- Exemples de targeting:
  -- { "cities": ["Casablanca", "Rabat"], "universes": ["restaurants"], "min_reservations": 1 }

  -- Statistiques
  sent_count int not null default 0,
  delivered_count int not null default 0,
  opened_count int not null default 0,
  clicked_count int not null default 0,

  -- Coût
  cost_per_unit_cents int not null default 50, -- 0.5 MAD par notification envoyée
  total_cost_cents int not null default 0,

  -- Statuts
  status text not null default 'draft' check (
    status in ('draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'sending', 'sent', 'cancelled')
  ),

  -- Planification
  scheduled_at timestamptz,
  sent_at timestamptz,

  -- Modération
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour les recherches fréquentes
create index if not exists idx_sponsored_notif_campaign on public.sponsored_notifications (campaign_id);
create index if not exists idx_sponsored_notif_status on public.sponsored_notifications (status);
create index if not exists idx_sponsored_notif_scheduled on public.sponsored_notifications (scheduled_at) where status = 'scheduled';

-- Table pour tracker les notifications reçues par chaque utilisateur
-- Permet d'afficher les notifications dans l'espace utilisateur
create table if not exists public.consumer_sponsored_notifications (
  id uuid primary key default gen_random_uuid(),

  user_id text not null references public.consumer_users(id) on delete cascade,
  notification_id uuid not null references public.sponsored_notifications(id) on delete cascade,

  -- Statut de lecture
  is_read boolean not null default false,
  read_at timestamptz,

  -- Statut de clic
  is_clicked boolean not null default false,
  clicked_at timestamptz,

  -- Push envoyé
  push_sent boolean not null default false,
  push_sent_at timestamptz,

  created_at timestamptz not null default now(),

  unique(user_id, notification_id)
);

-- Index pour récupérer les notifications d'un utilisateur
create index if not exists idx_consumer_sponsored_notif_user on public.consumer_sponsored_notifications (user_id, created_at desc);
create index if not exists idx_consumer_sponsored_notif_unread on public.consumer_sponsored_notifications (user_id, is_read) where is_read = false;

-- Contraintes pour les caractères max (utilisation de triggers car varchar fait la vérification)
-- Les validations seront faites côté API

-- View pour les notifications d'un utilisateur avec détails
create or replace view public.v_consumer_notifications as
select
  csn.id,
  csn.user_id,
  csn.notification_id,
  csn.is_read,
  csn.read_at,
  csn.is_clicked,
  csn.clicked_at,
  csn.created_at,
  sn.title,
  sn.description,
  sn.link_url,
  sn.image_url,
  sn.notification_type,
  sn.establishment_id,
  e.name as establishment_name,
  e.cover_url as establishment_cover_url
from public.consumer_sponsored_notifications csn
join public.sponsored_notifications sn on sn.id = csn.notification_id
left join public.establishments e on e.id = sn.establishment_id
where sn.status = 'sent';

-- Accorder les droits
grant select on public.v_consumer_notifications to authenticated;
grant all on public.sponsored_notifications to service_role;
grant all on public.consumer_sponsored_notifications to service_role;
grant select, insert, update on public.consumer_sponsored_notifications to authenticated;
