-- Consumer account lifecycle (deactivation, deletion, data export)
-- This module is server-driven: clients must NOT write these tables directly.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- consumer_users: add account lifecycle fields
-- ---------------------------------------------------------------------------
alter table public.consumer_users
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active','deactivated','deleted')),
  add column if not exists deactivated_at timestamptz null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists account_reason_code text null,
  add column if not exists account_reason_text text null;

-- Backfill (safe if column already existed)
update public.consumer_users
set account_status = 'active'
where account_status is null;

-- ---------------------------------------------------------------------------
-- Data export requests (token-based secure link)
-- ---------------------------------------------------------------------------
create table if not exists public.consumer_data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.consumer_users(id) on delete restrict,
  format text not null default 'json' check (format in ('json','csv')),
  status text not null default 'ready' check (status in ('pending','ready','delivered','expired','failed')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  delivered_at timestamptz null,
  ip text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_consumer_data_export_requests_user on public.consumer_data_export_requests (user_id, created_at desc);
create index if not exists idx_consumer_data_export_requests_expires on public.consumer_data_export_requests (expires_at desc);

-- ---------------------------------------------------------------------------
-- Admin views
-- ---------------------------------------------------------------------------
create or replace view public.admin_consumer_users as
select
  u.id,
  u.full_name as name,
  u.email,
  u.status,
  s.reliability_score,
  s.reservations_count,
  s.no_shows_count,
  u.city,
  u.country,
  u.created_at,
  coalesce(s.last_activity_at, u.created_at) as last_activity_at,
  u.account_status,
  u.deactivated_at,
  u.deleted_at,
  u.account_reason_code,
  u.account_reason_text
from public.consumer_users u
left join public.consumer_user_stats s on s.user_id = u.id;

create or replace view public.admin_consumer_account_actions as
select
  e.id,
  e.user_id,
  u.email as user_email,
  u.full_name as user_name,
  e.event_type as action_type,
  e.occurred_at,
  nullif(e.metadata->>'reason_code','') as reason_code,
  nullif(e.metadata->>'reason_text','') as reason_text,
  nullif(e.metadata->>'ip','') as ip,
  nullif(e.metadata->>'user_agent','') as user_agent
from public.consumer_user_events e
join public.consumer_users u on u.id = e.user_id
where e.event_type in (
  'account.deactivated',
  'account.reactivated',
  'account.deleted',
  'account.export_requested'
);

-- ---------------------------------------------------------------------------
-- Email templates (FR/EN)
-- ---------------------------------------------------------------------------
insert into public.email_templates (
  key, audience, name,
  subject_fr, subject_en,
  body_fr, body_en,
  cta_label_fr, cta_label_en,
  cta_url,
  enabled
)
values
  (
    'user_account_deactivated',
    'consumer',
    'Compte désactivé (confirmation)',
    'Confirmation — compte désactivé',
    'Confirmation — account deactivated',
    'Bonjour {{user_name}},\n\nVotre compte Sam’Booking a été désactivé.\n\nVous pouvez le réactiver à tout moment en vous reconnectant.\n\nSi vous avez besoin d’aide, contactez-nous.\n\nL’équipe Sam’Booking',
    'Hello {{user_name}},\n\nYour Sam’Booking account has been deactivated.\n\nYou can reactivate it at any time by signing in again.\n\nIf you need help, contact us.\n\nThe Sam’Booking team',
    null,
    null,
    null,
    true
  ),
  (
    'user_account_deleted',
    'consumer',
    'Suppression compte (confirmation)',
    'Confirmation — compte supprimé',
    'Confirmation — account deleted',
    'Bonjour {{user_name}},\n\nVotre demande de suppression a été prise en compte. Votre compte est désormais supprimé.\n\nCertaines informations peuvent être conservées de manière limitée lorsque la loi l’impose (ex. obligations comptables, prévention fraude, litiges).\n\nL’équipe Sam’Booking',
    'Hello {{user_name}},\n\nYour deletion request has been processed. Your account is now deleted.\n\nSome information may be retained in a limited way when required by law (e.g., accounting obligations, fraud prevention, disputes).\n\nThe Sam’Booking team',
    null,
    null,
    null,
    true
  ),
  (
    'user_data_export_ready',
    'consumer',
    'Export données personnelles (lien)',
    'Votre export de données Sam’Booking est prêt',
    'Your Sam’Booking data export is ready',
    'Bonjour {{user_name}},\n\nVotre export de données est prêt.\n\nCliquez sur le lien ci-dessous pour le télécharger. Ce lien est temporaire.\n\nL’équipe Sam’Booking',
    'Hello {{user_name}},\n\nYour data export is ready.\n\nUse the link below to download it. This link is temporary.\n\nThe Sam’Booking team',
    'Télécharger',
    'Download',
    '{{cta_url}}',
    true
  )
on conflict (key) do nothing;

commit;
