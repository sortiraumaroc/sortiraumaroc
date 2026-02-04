-- Emails & Campagnes (Superadmin)
-- This module is server-driven: clients must NOT write these tables directly.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Branding (single row: id=1)
-- ---------------------------------------------------------------------------
create table if not exists public.email_branding_settings (
  id int primary key,
  logo_url text null,
  primary_color text not null default '#A3001D',
  secondary_color text not null default '#000000',
  background_color text not null default '#FFFFFF',
  from_name text not null default 'Sortir Au Maroc',
  contact_email text not null default 'hello@sortiraumaroc.ma',
  legal_links jsonb not null default '{"legal":"https://sortiraumaroc.ma/mentions-legales","terms":"https://sortiraumaroc.ma/cgu","privacy":"https://sortiraumaroc.ma/politique-de-confidentialite"}'::jsonb,
  signature_fr text not null default 'L’équipe Sortir Au Maroc',
  signature_en text not null default 'The Sortir Au Maroc team',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.email_branding_settings (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  audience text not null check (audience in ('consumer','pro','finance','system','marketing')),
  name text not null,
  subject_fr text not null,
  subject_en text not null,
  body_fr text not null,
  body_en text not null,
  cta_label_fr text null,
  cta_label_en text null,
  cta_url text null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_templates_audience_enabled on public.email_templates (audience, enabled);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_email_templates_updated_at') then
      create trigger trg_email_templates_updated_at
      before update on public.email_templates
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid not null references public.email_templates(id) on delete restrict,
  subject_override text null,
  audience text not null check (audience in ('consumer','pro')),
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at timestamptz null,
  send_started_at timestamptz null,
  send_finished_at timestamptz null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_campaigns_status_created_at on public.email_campaigns (status, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'trg_email_campaigns_updated_at') then
      create trigger trg_email_campaigns_updated_at
      before update on public.email_campaigns
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('consumer','pro')),
  recipient_id uuid null,
  email text not null,
  full_name text null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped_unsubscribed')),
  email_id text null,
  message_id text null,
  error text null,
  sent_at timestamptz null,
  opened_at timestamptz null,
  clicked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_campaign_recipients_campaign on public.email_campaign_recipients (campaign_id, created_at desc);
create index if not exists idx_email_campaign_recipients_email on public.email_campaign_recipients (email);
create index if not exists idx_email_campaign_recipients_status on public.email_campaign_recipients (status);

-- ---------------------------------------------------------------------------
-- Tracking events
-- ---------------------------------------------------------------------------
create table if not exists public.email_events (
  id bigserial primary key,
  email_id text not null,
  campaign_id uuid null references public.email_campaigns(id) on delete set null,
  recipient_id uuid null references public.email_campaign_recipients(id) on delete set null,
  kind text not null check (kind in ('open','click','unsubscribe')),
  url text null,
  user_agent text null,
  ip text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_events_email_id_kind on public.email_events (email_id, kind, created_at desc);
create index if not exists idx_email_events_campaign_id on public.email_events (campaign_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Unsubscribes (marketing)
-- ---------------------------------------------------------------------------
create table if not exists public.email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  scope text not null default 'marketing',
  created_at timestamptz not null default now(),
  unique (email, scope)
);

create index if not exists idx_email_unsubscribes_email on public.email_unsubscribes (email);

-- ---------------------------------------------------------------------------
-- Seed templates (FR/EN)
-- ---------------------------------------------------------------------------
insert into public.email_templates (
  key, audience, name,
  subject_fr, subject_en,
  body_fr, body_en,
  cta_label_fr, cta_label_en,
  cta_url
)
values
  -- USER
  ('user_welcome','consumer','Bienvenue utilisateur',
    'Bienvenue sur Sortir Au Maroc, {{user_name}}',
    'Welcome to Sortir Au Maroc, {{user_name}}',
    'Bonjour {{user_name}},\n\nBienvenue sur Sortir Au Maroc. Vous pouvez découvrir et réserver les meilleures expériences au Maroc.\n\nÀ bientôt,\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nWelcome to Sortir Au Maroc. Discover and book the best experiences in Morocco.\n\nSee you soon,\nThe Sortir Au Maroc team',
    'Découvrir Sortir Au Maroc','Explore Sortir Au Maroc',
    'https://sortiraumaroc.ma/'),

  ('user_booking_confirmed','consumer','Confirmation de réservation',
    'Confirmation de réservation {{booking_ref}}',
    'Booking confirmation {{booking_ref}}',
    'Bonjour {{user_name}},\n\nVotre réservation est confirmée.\n\nRéférence : {{booking_ref}}\nÉtablissement : {{establishment}}\nDate : {{date}}\nMontant : {{amount}}\n\nÀ bientôt,\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour booking is confirmed.\n\nReference: {{booking_ref}}\nEstablishment: {{establishment}}\nDate: {{date}}\nAmount: {{amount}}\n\nSee you soon,\nThe Sortir Au Maroc team',
    'Voir ma réservation','View my booking',
    '{{cta_url}}'),

  ('user_booking_updated','consumer','Modification de réservation',
    'Votre réservation {{booking_ref}} a été modifiée',
    'Your booking {{booking_ref}} was updated',
    'Bonjour {{user_name}},\n\nVotre réservation a été mise à jour.\n\nRéférence : {{booking_ref}}\nÉtablissement : {{establishment}}\nNouvelle date : {{date}}\n\nÀ bientôt,\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour booking has been updated.\n\nReference: {{booking_ref}}\nEstablishment: {{establishment}}\nNew date: {{date}}\n\nRegards,\nThe Sortir Au Maroc team',
    'Voir la réservation','View booking',
    '{{cta_url}}'),

  ('user_booking_cancelled','consumer','Annulation de réservation',
    'Annulation de réservation {{booking_ref}}',
    'Booking cancellation {{booking_ref}}',
    'Bonjour {{user_name}},\n\nVotre réservation a été annulée.\n\nRéférence : {{booking_ref}}\nÉtablissement : {{establishment}}\nDate : {{date}}\n\nSi vous avez besoin d’aide, contactez-nous.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour booking was cancelled.\n\nReference: {{booking_ref}}\nEstablishment: {{establishment}}\nDate: {{date}}\n\nIf you need help, contact us.\n\nThe Sortir Au Maroc team',
    'Contacter le support','Contact support',
    'https://sortiraumaroc.ma/aide'),

  ('user_waitlist_offer','consumer','Offre liste d’attente',
    'Une place est disponible — {{establishment}}',
    'A spot is available — {{establishment}}',
    'Bonjour {{user_name}},\n\nBonne nouvelle : une place est disponible pour {{establishment}}.\n\nDate : {{date}}\n\nRéservez maintenant via le lien ci-dessous.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nGood news: a spot is available for {{establishment}}.\n\nDate: {{date}}\n\nBook now using the link below.\n\nThe Sortir Au Maroc team',
    'Réserver maintenant','Book now',
    '{{cta_url}}'),

  ('user_booking_reminder_d1','consumer','Rappel J-1',
    'Rappel — réservation demain ({{booking_ref}})',
    'Reminder — booking tomorrow ({{booking_ref}})',
    'Bonjour {{user_name}},\n\nPetit rappel : votre réservation a lieu demain.\n\nRéférence : {{booking_ref}}\nÉtablissement : {{establishment}}\nDate : {{date}}\n\nÀ bientôt,\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nQuick reminder: your booking is tomorrow.\n\nReference: {{booking_ref}}\nEstablishment: {{establishment}}\nDate: {{date}}\n\nSee you soon,\nThe Sortir Au Maroc team',
    'Voir la réservation','View booking',
    '{{cta_url}}'),

  ('user_review_request','consumer','Demande d’avis',
    'Votre avis compte — {{establishment}}',
    'Your review matters — {{establishment}}',
    'Bonjour {{user_name}},\n\nMerci pour votre visite chez {{establishment}}.\n\nPartagez votre avis en 1 minute.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nThanks for visiting {{establishment}}.\n\nShare your review in 1 minute.\n\nThe Sortir Au Maroc team',
    'Laisser un avis','Leave a review',
    '{{cta_url}}'),

  ('user_social_signup','consumer','Création compte via réseau social',
    'Votre compte Sortir Au Maroc est prêt',
    'Your Sortir Au Maroc account is ready',
    'Bonjour {{user_name}},\n\nVotre compte a été créé via votre réseau social.\n\nVous pouvez maintenant gérer vos réservations et préférences.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour account was created via social login.\n\nYou can now manage your bookings and preferences.\n\nThe Sortir Au Maroc team',
    'Accéder à mon compte','Go to my account',
    'https://sortiraumaroc.ma/profile'),

  ('user_password_reset','consumer','Réinitialisation mot de passe',
    'Réinitialisation de votre mot de passe',
    'Reset your password',
    'Bonjour {{user_name}},\n\nPour réinitialiser votre mot de passe, utilisez le lien ci-dessous.\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet email.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nUse the link below to reset your password.\n\nIf you did not request this, you can ignore this email.\n\nThe Sortir Au Maroc team',
    'Réinitialiser mon mot de passe','Reset password',
    '{{cta_url}}'),

  -- PRO
  ('pro_welcome','pro','Bienvenue établissement',
    'Bienvenue sur Sortir Au Maroc PRO — {{establishment}}',
    'Welcome to Sortir Au Maroc PRO — {{establishment}}',
    'Bonjour {{user_name}},\n\nBienvenue ! Votre espace PRO est prêt pour {{establishment}}.\n\nNous vous accompagnons pour activer votre fiche et recevoir vos premières réservations.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nWelcome! Your PRO space is ready for {{establishment}}.\n\nWe will help you activate your listing and receive bookings.\n\nThe Sortir Au Maroc team',
    'Accéder au dashboard PRO','Open PRO dashboard',
    '{{cta_url}}'),

  ('pro_new_booking','pro','Nouvelle réservation reçue',
    'Nouvelle réservation — {{booking_ref}}',
    'New booking — {{booking_ref}}',
    'Bonjour,\n\nVous avez reçu une nouvelle réservation.\n\nRéférence : {{booking_ref}}\nClient : {{user_name}}\nDate : {{date}}\nMontant : {{amount}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nYou received a new booking.\n\nReference: {{booking_ref}}\nCustomer: {{user_name}}\nDate: {{date}}\nAmount: {{amount}}\n\nThe Sortir Au Maroc team',
    'Voir la réservation','View booking',
    '{{cta_url}}'),

  ('pro_customer_change_request','pro','Demande de modification client',
    'Demande de modification — {{booking_ref}}',
    'Change request — {{booking_ref}}',
    'Bonjour,\n\nUn client a demandé une modification de réservation.\n\nRéférence : {{booking_ref}}\nDate : {{date}}\n\nMerci de répondre depuis votre espace PRO.\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nA customer requested a booking change.\n\nReference: {{booking_ref}}\nDate: {{date}}\n\nPlease respond from your PRO space.\n\nThe Sortir Au Maroc team',
    'Ouvrir l’espace PRO','Open PRO space',
    '{{cta_url}}'),

  ('pro_customer_cancelled','pro','Annulation client',
    'Annulation client — {{booking_ref}}',
    'Customer cancellation — {{booking_ref}}',
    'Bonjour,\n\nLe client a annulé sa réservation.\n\nRéférence : {{booking_ref}}\nDate : {{date}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nThe customer cancelled their booking.\n\nReference: {{booking_ref}}\nDate: {{date}}\n\nThe Sortir Au Maroc team',
    'Voir le détail','View details',
    '{{cta_url}}'),

  ('pro_payment_received','pro','Paiement reçu',
    'Paiement reçu — {{booking_ref}}',
    'Payment received — {{booking_ref}}',
    'Bonjour,\n\nUn paiement a été enregistré.\n\nRéférence : {{booking_ref}}\nMontant : {{amount}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nA payment has been recorded.\n\nReference: {{booking_ref}}\nAmount: {{amount}}\n\nThe Sortir Au Maroc team',
    'Voir la réservation','View booking',
    '{{cta_url}}'),

  ('pro_invoice_available','pro','Facture disponible',
    'Votre facture est disponible',
    'Your invoice is available',
    'Bonjour,\n\nVotre facture est disponible dans votre espace PRO.\n\nMontant : {{amount}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nYour invoice is available in your PRO space.\n\nAmount: {{amount}}\n\nThe Sortir Au Maroc team',
    'Télécharger la facture','Download invoice',
    '{{cta_url}}'),

  ('pro_visibility_activated','pro','Activation service visibilité',
    'Visibilité activée — {{establishment}}',
    'Visibility activated — {{establishment}}',
    'Bonjour,\n\nVotre service de visibilité est activé pour {{establishment}}.\n\nMerci,\nL’équipe Sortir Au Maroc',
    'Hello,\n\nYour visibility service is activated for {{establishment}}.\n\nThanks,\nThe Sortir Au Maroc team',
    'Voir mon pack','View my plan',
    '{{cta_url}}'),

  ('pro_documents_reminder','pro','Rappel documents administratifs',
    'Documents requis — {{establishment}}',
    'Documents required — {{establishment}}',
    'Bonjour,\n\nPour finaliser l’activation de {{establishment}}, merci de nous transmettre les documents requis.\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nTo finalize activation for {{establishment}}, please send the required documents.\n\nThe Sortir Au Maroc team',
    'Envoyer les documents','Send documents',
    '{{cta_url}}'),

  ('pro_monthly_summary','pro','Résumé mensuel d’activité',
    'Résumé mensuel — {{establishment}}',
    'Monthly summary — {{establishment}}',
    'Bonjour,\n\nVoici votre résumé mensuel d’activité.\n\nÉtablissement : {{establishment}}\nMontant total : {{amount}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nHere is your monthly activity summary.\n\nEstablishment: {{establishment}}\nTotal amount: {{amount}}\n\nThe Sortir Au Maroc team',
    'Voir le détail','View details',
    '{{cta_url}}'),

  -- FINANCE
  ('finance_payment_confirmation','finance','Confirmation paiement client',
    'Confirmation de paiement — {{booking_ref}}',
    'Payment confirmation — {{booking_ref}}',
    'Bonjour {{user_name}},\n\nVotre paiement a bien été pris en compte.\n\nRéférence : {{booking_ref}}\nMontant : {{amount}}\n\nMerci,\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour payment has been confirmed.\n\nReference: {{booking_ref}}\nAmount: {{amount}}\n\nThank you,\nThe Sortir Au Maroc team',
    'Voir le reçu','View receipt',
    '{{cta_url}}'),

  ('finance_receipt','finance','Reçu de paiement',
    'Reçu de paiement — {{booking_ref}}',
    'Payment receipt — {{booking_ref}}',
    'Bonjour {{user_name}},\n\nVeuillez trouver votre reçu de paiement.\n\nRéférence : {{booking_ref}}\nMontant : {{amount}}\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nPlease find your payment receipt.\n\nReference: {{booking_ref}}\nAmount: {{amount}}\n\nThe Sortir Au Maroc team',
    'Télécharger le reçu','Download receipt',
    '{{cta_url}}'),

  ('finance_invoice_to_pro','finance','Facture Sambooking → PRO',
    'Facture Sambooking',
    'Sortir Au Maroc invoice',
    'Bonjour,\n\nVotre facture Sambooking est disponible.\n\nMontant : {{amount}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nYour Sortir Au Maroc invoice is available.\n\nAmount: {{amount}}\n\nThe Sortir Au Maroc team',
    'Télécharger la facture','Download invoice',
    '{{cta_url}}'),

  ('finance_transfer_notice','finance','Avis de virement à venir',
    'Virement à venir',
    'Upcoming transfer',
    'Bonjour,\n\nUn virement est programmé.\n\nMontant : {{amount}}\nDate : {{date}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nA transfer has been scheduled.\n\nAmount: {{amount}}\nDate: {{date}}\n\nThe Sortir Au Maroc team',
    'Voir le détail','View details',
    '{{cta_url}}'),

  ('finance_payment_rejected','finance','Rejet paiement',
    'Paiement refusé — action requise',
    'Payment rejected — action required',
    'Bonjour {{user_name}},\n\nVotre paiement a été refusé.\n\nMontant : {{amount}}\n\nMerci de réessayer ou de contacter le support.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour payment was rejected.\n\nAmount: {{amount}}\n\nPlease try again or contact support.\n\nThe Sortir Au Maroc team',
    'Contacter le support','Contact support',
    'https://sortiraumaroc.ma/aide'),

  ('finance_invoice_request','finance','Appel à facture établissement',
    'Demande de facture — {{establishment}}',
    'Invoice request — {{establishment}}',
    'Bonjour,\n\nMerci de nous transmettre votre facture pour {{establishment}}.\n\nPériode : {{date}}\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nPlease send us your invoice for {{establishment}}.\n\nPeriod: {{date}}\n\nThe Sortir Au Maroc team',
    'Envoyer la facture','Send invoice',
    '{{cta_url}}'),

  -- SYSTEM
  ('system_email_change','system','Changement d’email',
    'Changement d’email confirmé',
    'Email change confirmed',
    'Bonjour {{user_name}},\n\nVotre adresse email a été modifiée avec succès.\n\nSi vous n’êtes pas à l’origine de cette action, contactez-nous immédiatement.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour email address was changed successfully.\n\nIf you did not do this, contact us immediately.\n\nThe Sortir Au Maroc team',
    'Contacter le support','Contact support',
    'https://sortiraumaroc.ma/aide'),

  ('system_security_alert','system','Alerte sécurité',
    'Alerte sécurité — action requise',
    'Security alert — action required',
    'Bonjour {{user_name}},\n\nNous avons détecté une activité inhabituelle sur votre compte.\n\nSi ce n’est pas vous, changez votre mot de passe et contactez le support.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nWe detected unusual activity on your account.\n\nIf this wasn’t you, change your password and contact support.\n\nThe Sortir Au Maroc team',
    'Sécuriser mon compte','Secure my account',
    '{{cta_url}}'),

  ('system_account_closure','system','Fermeture de compte',
    'Confirmation de fermeture de compte',
    'Account closure confirmation',
    'Bonjour {{user_name}},\n\nVotre compte a été fermé.\n\nMerci d’avoir utilisé Sortir Au Maroc.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour account has been closed.\n\nThank you for using Sortir Au Maroc.\n\nThe Sortir Au Maroc team',
    'Revenir sur le site','Back to website',
    'https://sortiraumaroc.ma/'),

  ('system_data_deletion','system','Suppression données',
    'Suppression de vos données',
    'Your data deletion',
    'Bonjour {{user_name}},\n\nVotre demande de suppression de données a été prise en compte.\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nYour data deletion request has been processed.\n\nThe Sortir Au Maroc team',
    'Contacter le support','Contact support',
    'https://sortiraumaroc.ma/aide'),

  ('system_maintenance','system','Maintenance plateforme',
    'Maintenance programmée',
    'Scheduled maintenance',
    'Bonjour,\n\nUne maintenance est programmée.\n\nDate : {{date}}\n\nMerci pour votre compréhension.\n\nL’équipe Sortir Au Maroc',
    'Hello,\n\nA maintenance is scheduled.\n\nDate: {{date}}\n\nThanks for your understanding.\n\nThe Sortir Au Maroc team',
    'En savoir plus','Learn more',
    '{{cta_url}}')

on conflict (key) do nothing;

commit;
