-- Pro Password Management
-- Add password reset email template and must_change_password flag

begin;

-- ---------------------------------------------------------------------------
-- Add must_change_password flag to pro_profiles
-- ---------------------------------------------------------------------------
alter table public.pro_profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.pro_profiles.must_change_password is 'When true, force the user to change password at next login';

-- ---------------------------------------------------------------------------
-- Email template: pro_password_reset
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
  'pro_password_reset',
  'pro',
  'Réinitialisation mot de passe Pro',
  'Nouveau mot de passe - Espace Pro Sortir Au Maroc',
  'New password - Pro Space Sortir Au Maroc',
  '<p>Bonjour,</p>
<p>Un nouveau mot de passe a été généré pour votre <strong>Espace Pro Sortir Au Maroc</strong> ({{establishment_name}}).</p>
<p>Voici vos informations de connexion :</p>
<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <p style="margin: 5px 0;"><strong>Email :</strong> {{email}}</p>
  <p style="margin: 5px 0;"><strong>Nouveau mot de passe :</strong> {{password}}</p>
</div>
<p style="color: #A3001D;"><strong>Important :</strong> Pour des raisons de sécurité, vous serez invité à modifier ce mot de passe lors de votre prochaine connexion.</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="{{login_url}}" style="display: inline-block; padding: 14px 32px; background-color: #A3001D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Accéder à mon Espace Pro</a>
</p>
<p>Si vous n''avez pas demandé cette réinitialisation, contactez-nous immédiatement à <a href="mailto:pro@sortiraumaroc.ma">pro@sortiraumaroc.ma</a>.</p>',
  '<p>Hello,</p>
<p>A new password has been generated for your <strong>Sortir Au Maroc Pro Space</strong> ({{establishment_name}}).</p>
<p>Here are your login credentials:</p>
<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <p style="margin: 5px 0;"><strong>Email:</strong> {{email}}</p>
  <p style="margin: 5px 0;"><strong>New password:</strong> {{password}}</p>
</div>
<p style="color: #A3001D;"><strong>Important:</strong> For security reasons, you will be prompted to change this password on your next login.</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="{{login_url}}" style="display: inline-block; padding: 14px 32px; background-color: #A3001D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Access my Pro Space</a>
</p>
<p>If you did not request this reset, contact us immediately at <a href="mailto:pro@sortiraumaroc.ma">pro@sortiraumaroc.ma</a>.</p>',
  'Accéder à mon Espace Pro',
  'Access my Pro Space',
  '{{login_url}}',
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

-- ---------------------------------------------------------------------------
-- Email template: pro_welcome_password
-- Sent when admin creates a Pro account with initial password
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
  'pro_welcome_password',
  'pro',
  'Bienvenue Pro - Compte créé',
  'Bienvenue sur votre Espace Pro Sortir Au Maroc',
  'Welcome to your Sortir Au Maroc Pro Space',
  '<p>Bonjour,</p>
<p>Votre compte <strong>Espace Pro Sortir Au Maroc</strong> pour <strong>{{establishment_name}}</strong> a été créé avec succès !</p>
<p>Voici vos informations de connexion :</p>
<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <p style="margin: 5px 0;"><strong>Email :</strong> {{email}}</p>
  <p style="margin: 5px 0;"><strong>Mot de passe provisoire :</strong> {{password}}</p>
</div>
<p style="color: #A3001D;"><strong>Important :</strong> Pour des raisons de sécurité, vous serez invité à modifier ce mot de passe lors de votre première connexion.</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="{{login_url}}" style="display: inline-block; padding: 14px 32px; background-color: #A3001D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Accéder à mon Espace Pro</a>
</p>
<p>Pour toute question, contactez-nous à <a href="mailto:pro@sortiraumaroc.ma">pro@sortiraumaroc.ma</a>.</p>',
  '<p>Hello,</p>
<p>Your <strong>Sortir Au Maroc Pro Space</strong> account for <strong>{{establishment_name}}</strong> has been successfully created!</p>
<p>Here are your login credentials:</p>
<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <p style="margin: 5px 0;"><strong>Email:</strong> {{email}}</p>
  <p style="margin: 5px 0;"><strong>Temporary password:</strong> {{password}}</p>
</div>
<p style="color: #A3001D;"><strong>Important:</strong> For security reasons, you will be prompted to change this password on your first login.</p>
<p style="text-align: center; margin: 30px 0;">
  <a href="{{login_url}}" style="display: inline-block; padding: 14px 32px; background-color: #A3001D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Access my Pro Space</a>
</p>
<p>For any questions, contact us at <a href="mailto:pro@sortiraumaroc.ma">pro@sortiraumaroc.ma</a>.</p>',
  'Accéder à mon Espace Pro',
  'Access my Pro Space',
  '{{login_url}}',
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
