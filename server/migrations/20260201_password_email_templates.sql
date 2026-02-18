-- Password management email templates
-- Adds templates for password reset and password change confirmation

begin;

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
    'user_password_reset',
    'consumer',
    'Mot de passe réinitialisé',
    'Votre nouveau mot de passe Sortir Au Maroc',
    'Your new Sortir Au Maroc password',
    'Bonjour {{user_name}},

Vous avez demandé la réinitialisation de votre mot de passe.

Voici votre nouveau mot de passe temporaire :

{{temp_password}}

Nous vous recommandons de le changer dès votre prochaine connexion pour plus de sécurité.

Si vous n''avez pas demandé cette réinitialisation, contactez-nous immédiatement.

L''équipe Sortir Au Maroc',
    'Hello {{user_name}},

You have requested a password reset.

Here is your new temporary password:

{{temp_password}}

We recommend changing it after your next login for better security.

If you did not request this reset, please contact us immediately.

The Sortir Au Maroc team',
    null,
    null,
    null,
    true
  ),
  (
    'user_password_changed',
    'consumer',
    'Confirmation changement mot de passe',
    'Votre mot de passe Sortir Au Maroc a été modifié',
    'Your Sortir Au Maroc password has been changed',
    'Bonjour {{user_name}},

Votre mot de passe a été modifié avec succès.

Si vous n''êtes pas à l''origine de cette modification, contactez-nous immédiatement.

L''équipe Sortir Au Maroc',
    'Hello {{user_name}},

Your password has been changed successfully.

If you did not make this change, please contact us immediately.

The Sortir Au Maroc team',
    null,
    null,
    null,
    true
  )
on conflict (key) do update set
  subject_fr = EXCLUDED.subject_fr,
  subject_en = EXCLUDED.subject_en,
  body_fr = EXCLUDED.body_fr,
  body_en = EXCLUDED.body_en,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_label_en = EXCLUDED.cta_label_en,
  cta_url = EXCLUDED.cta_url;

commit;
