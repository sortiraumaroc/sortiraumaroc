-- Password Reset Tokens for Consumer Users
-- Allows users to reset their password via a secure link instead of temporary password

begin;

-- ---------------------------------------------------------------------------
-- Password reset tokens table
-- ---------------------------------------------------------------------------
create table if not exists public.consumer_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

-- Index for token lookup
create index if not exists idx_consumer_password_reset_tokens_token
  on public.consumer_password_reset_tokens(token) where used_at is null;

-- Index for cleanup of expired tokens
create index if not exists idx_consumer_password_reset_tokens_expires
  on public.consumer_password_reset_tokens(expires_at) where used_at is null;

-- RLS policies
alter table public.consumer_password_reset_tokens enable row level security;

-- Only service role can manage tokens
create policy "service_only_consumer_password_reset_tokens"
  on public.consumer_password_reset_tokens
  for all
  using (false)
  with check (false);

comment on table public.consumer_password_reset_tokens is 'Secure tokens for consumer password reset flow';
comment on column public.consumer_password_reset_tokens.token is 'Cryptographically secure random token';
comment on column public.consumer_password_reset_tokens.expires_at is 'Token expiration (typically 1 hour)';
comment on column public.consumer_password_reset_tokens.used_at is 'When the token was used to reset password (null if unused)';

-- ---------------------------------------------------------------------------
-- Email template: user_password_reset_link
-- Sends a link instead of a temporary password
-- ---------------------------------------------------------------------------
insert into public.email_templates (
  key,
  audience,
  name,
  subject_fr,
  subject_en,
  body_fr,
  body_en,
  cta_label_fr,
  cta_label_en,
  cta_url,
  enabled
) values (
  'user_password_reset_link',
  'consumer',
  'Lien de réinitialisation mot de passe',
  'Réinitialisez votre mot de passe Sortir Au Maroc',
  'Reset your Sortir Au Maroc password',
  '<p>Bonjour {{user_name}},</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
<p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="{{reset_url}}" style="display: inline-block; padding: 14px 32px; background-color: #A3001D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Créer un nouveau mot de passe</a>
</p>
<p style="color: #666; font-size: 14px;">Ce lien expirera dans 1 heure. Si vous n''avez pas demandé cette réinitialisation, ignorez cet email.</p>
<p>L''équipe Sortir Au Maroc</p>',
  '<p>Hello {{user_name}},</p>
<p>You have requested a password reset.</p>
<p>Click the button below to create a new password:</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="{{reset_url}}" style="display: inline-block; padding: 14px 32px; background-color: #A3001D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Create a new password</a>
</p>
<p style="color: #666; font-size: 14px;">This link will expire in 1 hour. If you did not request this reset, please ignore this email.</p>
<p>The Sortir Au Maroc team</p>',
  'Créer un nouveau mot de passe',
  'Create a new password',
  '{{reset_url}}',
  true
) on conflict (key) do update set
  name = excluded.name,
  subject_fr = excluded.subject_fr,
  subject_en = excluded.subject_en,
  body_fr = excluded.body_fr,
  body_en = excluded.body_en,
  cta_label_fr = excluded.cta_label_fr,
  cta_label_en = excluded.cta_label_en,
  cta_url = excluded.cta_url,
  updated_at = now();

commit;
