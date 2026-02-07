-- Contact Forms System
-- Système de formulaires de contact personnalisables pour l'admin

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Contact Forms (Formulaires)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text null,

  -- Page d'accueil du formulaire (personnalisable)
  hero_image_url text null, -- Image d'illustration principale
  hero_title text not null default 'Besoin d''informations ?',
  hero_subtitle text null default 'Contactez-nous ! Notre équipe vous répond rapidement.',
  hero_background_color text not null default '#A3001D', -- Fond rouge par défaut (primary)
  hero_text_color text not null default '#FFFFFF',
  show_hero boolean not null default true,

  -- Logo et branding
  logo_url text null,
  show_logo boolean not null default false,

  -- Formulaire styling
  form_title text null, -- Titre au dessus du formulaire (optionnel)
  submit_button_text text not null default 'Envoyer le message',
  submit_button_color text not null default '#A3001D',
  success_message text not null default 'Merci ! Votre message a bien été envoyé.',
  success_redirect_url text null, -- Redirection après soumission (optionnel)

  -- Layout options
  layout text not null default 'split' check (layout in ('split', 'centered', 'full-width')),
  -- split: hero à gauche, form à droite (comme l'image exemple)
  -- centered: tout centré
  -- full-width: hero en haut, form en bas

  -- Settings
  is_active boolean not null default true,
  require_all_fields boolean not null default false,
  send_confirmation_email boolean not null default false,
  confirmation_email_subject text null,
  confirmation_email_body text null,

  -- Notification settings
  notify_on_submission boolean not null default true,
  notification_emails text[] null, -- Liste d'emails à notifier

  -- SEO
  meta_title text null,
  meta_description text null,

  -- Metadata
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_forms_slug on public.contact_forms (slug);
create index if not exists idx_contact_forms_active on public.contact_forms (is_active);

-- Trigger updated_at
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_contact_forms_updated_at') then
      create trigger trg_contact_forms_updated_at
      before update on public.contact_forms
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contact Form Fields (Champs des formulaires)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.contact_forms(id) on delete cascade,
  -- Field config
  field_type text not null check (field_type in (
    'text',           -- Champ texte simple
    'textarea',       -- Zone de texte multiligne
    'email',          -- Email avec validation
    'phone',          -- Téléphone avec indicatif pays
    'number',         -- Nombre
    'select',         -- Liste déroulante (réponse unique)
    'radio',          -- Boutons radio (réponse unique)
    'checkbox',       -- Cases à cocher (réponses multiples)
    'date',           -- Date
    'time',           -- Heure
    'datetime',       -- Date et heure
    'file',           -- Upload de fichier
    'country',        -- Sélecteur de pays
    'google_place',   -- Recherche Google Maps
    'rating',         -- Notation par étoiles
    'hidden'          -- Champ caché
  )),
  label text not null,
  placeholder text null,
  helper_text text null,
  -- Options for select/radio/checkbox
  options jsonb null, -- [{value: string, label: string}]
  -- Validation
  is_required boolean not null default false,
  min_length int null,
  max_length int null,
  min_value numeric null,
  max_value numeric null,
  pattern text null, -- Regex pattern
  -- Phone specific
  default_country_code text null default '+212',
  allowed_country_codes text[] null,
  -- File specific
  allowed_file_types text[] null, -- ['image/*', 'application/pdf']
  max_file_size_mb int null default 5,
  -- Display
  width text not null default 'full' check (width in ('full', 'half', 'third')),
  sort_order int not null default 0,
  -- Conditional display
  conditional_field_id uuid null references public.contact_form_fields(id) on delete set null,
  conditional_value text null, -- Show field only if conditional_field_id has this value
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_form_fields_form on public.contact_form_fields (form_id, sort_order);

do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_contact_form_fields_updated_at') then
      create trigger trg_contact_form_fields_updated_at
      before update on public.contact_form_fields
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contact Form Submissions (Réponses aux formulaires)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.contact_forms(id) on delete cascade,
  -- Submission data
  data jsonb not null default '{}', -- {field_id: value}
  -- Contact info (extracted from data for quick search)
  email text null,
  phone text null,
  full_name text null,
  -- Status
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived', 'spam')),
  -- Admin notes
  admin_notes text null,
  handled_by text null,
  handled_at timestamptz null,
  -- Tracking
  ip_address text null,
  user_agent text null,
  referrer text null,
  utm_source text null,
  utm_medium text null,
  utm_campaign text null,
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_form_submissions_form on public.contact_form_submissions (form_id, created_at desc);
create index if not exists idx_contact_form_submissions_status on public.contact_form_submissions (status, created_at desc);
create index if not exists idx_contact_form_submissions_email on public.contact_form_submissions (email);
create index if not exists idx_contact_form_submissions_created on public.contact_form_submissions (created_at desc);

do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_contact_form_submissions_updated_at') then
      create trigger trg_contact_form_submissions_updated_at
      before update on public.contact_form_submissions
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contact Form Files (Fichiers uploadés)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_form_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.contact_form_submissions(id) on delete cascade,
  field_id uuid not null references public.contact_form_fields(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size int not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_form_files_submission on public.contact_form_files (submission_id);

-- ---------------------------------------------------------------------------
-- Admin notifications for new submissions
-- ---------------------------------------------------------------------------
create table if not exists public.contact_form_notifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.contact_form_submissions(id) on delete cascade,
  admin_email text not null,
  sent_at timestamptz null,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_form_notifications_submission on public.contact_form_notifications (submission_id);

-- ---------------------------------------------------------------------------
-- View for form statistics
-- ---------------------------------------------------------------------------
create or replace view public.contact_form_stats as
select
  f.id as form_id,
  f.name as form_name,
  f.slug,
  f.is_active,
  count(s.id) as total_submissions,
  count(case when s.status = 'new' then 1 end) as new_submissions,
  count(case when s.status = 'read' then 1 end) as read_submissions,
  count(case when s.status = 'replied' then 1 end) as replied_submissions,
  count(case when s.status = 'archived' then 1 end) as archived_submissions,
  count(case when s.status = 'spam' then 1 end) as spam_submissions,
  max(s.created_at) as last_submission_at
from public.contact_forms f
left join public.contact_form_submissions s on s.form_id = f.id
group by f.id, f.name, f.slug, f.is_active;

commit;
