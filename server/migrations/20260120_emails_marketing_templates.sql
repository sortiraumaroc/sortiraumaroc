-- Seed marketing templates for Emails & Campagnes

begin;

insert into public.email_templates (
  key, audience, name,
  subject_fr, subject_en,
  body_fr, body_en,
  cta_label_fr, cta_label_en,
  cta_url
)
values
  (
    'marketing_newsletter',
    'marketing',
    'Newsletter (marketing)',
    'Les nouveautés Sortir Au Maroc — {{date}}',
    'Sortir Au Maroc news — {{date}}',
    'Bonjour {{user_name}},\n\nVoici les nouveautés Sortir Au Maroc :\n\n- {{line1}}\n- {{line2}}\n- {{line3}}\n\nÀ bientôt,\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nHere is what''s new on Sortir Au Maroc:\n\n- {{line1}}\n- {{line2}}\n- {{line3}}\n\nSee you soon,\nThe Sortir Au Maroc team',
    'Découvrir',
    'Explore',
    '{{cta_url}}'
  ),
  (
    'marketing_promo',
    'marketing',
    'Promo (marketing)',
    'Offre spéciale Sortir Au Maroc — {{date}}',
    'Sortir Au Maroc special offer — {{date}}',
    'Bonjour {{user_name}},\n\nOffre spéciale : {{line1}}\n\nDétails :\n{{line2}}\n\nConditions :\n{{line3}}\n\nL’équipe Sortir Au Maroc',
    'Hello {{user_name}},\n\nSpecial offer: {{line1}}\n\nDetails:\n{{line2}}\n\nTerms:\n{{line3}}\n\nThe Sortir Au Maroc team',
    'Voir l’offre',
    'View offer',
    '{{cta_url}}'
  )
on conflict (key) do nothing;

commit;
