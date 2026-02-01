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
    'Les nouveautés Sam’Booking — {{date}}',
    'Sam’Booking news — {{date}}',
    'Bonjour {{user_name}},\n\nVoici les nouveautés Sam’Booking :\n\n- {{line1}}\n- {{line2}}\n- {{line3}}\n\nÀ bientôt,\nL’équipe Sam’Booking',
    'Hello {{user_name}},\n\nHere is what''s new on Sam’Booking:\n\n- {{line1}}\n- {{line2}}\n- {{line3}}\n\nSee you soon,\nThe Sam’Booking team',
    'Découvrir',
    'Explore',
    '{{cta_url}}'
  ),
  (
    'marketing_promo',
    'marketing',
    'Promo (marketing)',
    'Offre spéciale Sam’Booking — {{date}}',
    'Sam’Booking special offer — {{date}}',
    'Bonjour {{user_name}},\n\nOffre spéciale : {{line1}}\n\nDétails :\n{{line2}}\n\nConditions :\n{{line3}}\n\nL’équipe Sam’Booking',
    'Hello {{user_name}},\n\nSpecial offer: {{line1}}\n\nDetails:\n{{line2}}\n\nTerms:\n{{line3}}\n\nThe Sam’Booking team',
    'Voir l’offre',
    'View offer',
    '{{cta_url}}'
  )
on conflict (key) do nothing;

commit;
