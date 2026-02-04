-- Menu Digital Email Template
-- Template for notifying pro users when their menu digital subscription is activated

begin;

insert into public.email_templates (
  key, audience, name,
  subject_fr, subject_en,
  body_fr, body_en,
  cta_label_fr, cta_label_en,
  cta_url
)
values
  ('pro_menu_digital_activated', 'pro', 'Activation Menu Digital',
    'Votre Menu Digital est activé — {{establishment}}',
    'Your Digital Menu is activated — {{establishment}}',
    'Bonjour,

Votre Menu Digital ({{plan}}) est maintenant activé pour {{establishment}}.

Votre menu est accessible à l''adresse suivante :
{{menu_url}}

Connectez-vous à votre espace de gestion pour :
• Personnaliser votre menu
• Générer vos QR codes par table
• Gérer vos catégories et articles

Votre abonnement est valable jusqu''au {{expires_at}}.

L''équipe Sortir Au Maroc',

    'Hello,

Your Digital Menu ({{plan}}) is now activated for {{establishment}}.

Your menu is accessible at:
{{menu_url}}

Log in to your management dashboard to:
• Customize your menu
• Generate QR codes per table
• Manage your categories and items

Your subscription is valid until {{expires_at}}.

The Sortir Au Maroc team',

    'Accéder à mon espace Menu Digital',
    'Access my Digital Menu dashboard',
    '{{pro_access_url}}'
  )
on conflict (key) do update set
  subject_fr = excluded.subject_fr,
  subject_en = excluded.subject_en,
  body_fr = excluded.body_fr,
  body_en = excluded.body_en,
  cta_label_fr = excluded.cta_label_fr,
  cta_label_en = excluded.cta_label_en,
  cta_url = excluded.cta_url,
  updated_at = now();

commit;
