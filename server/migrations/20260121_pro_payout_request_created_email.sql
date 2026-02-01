-- Internal notification email when a PRO submits a payout request ("appel à facture")
-- Note: this is sent to the finance inbox (internal), not to the PRO.

begin;

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
)
values (
  'pro_payout_request_created',
  'finance',
  'Demande payout soumise (interne)',
  'Nouvelle demande de payout — {{establishment}}',
  'New payout request — {{establishment}}',
  'Bonjour,\n\nUne demande de payout vient d’être soumise.\n\nÉtablissement : {{establishment}} ({{establishment_id}})\nPériode : {{window_start}} → {{window_end}}\nMontant : {{amount}}\nDemande ID : {{payout_request_id}}\nPayout ID : {{payout_id}}\nDemandeur : {{pro_email}}\n\nRIB : {{rib}}\n\nCommentaire PRO :\n{{pro_comment}}\n\nAccès Superadmin : {{cta_url}}\n\nL’équipe Sam’Booking',
  'Hello,\n\nA new payout request has been submitted.\n\nEstablishment: {{establishment}} ({{establishment_id}})\nPeriod: {{window_start}} → {{window_end}}\nAmount: {{amount}}\nRequest ID: {{payout_request_id}}\nPayout ID: {{payout_id}}\nRequester: {{pro_email}}\n\nBank details: {{rib}}\n\nPRO comment:\n{{pro_comment}}\n\nAdmin link: {{cta_url}}\n\nThe Sam’Booking team',
  'Ouvrir dans le Superadmin',
  'Open in Admin',
  '{{cta_url}}',
  true
)
on conflict (key) do nothing;

commit;
