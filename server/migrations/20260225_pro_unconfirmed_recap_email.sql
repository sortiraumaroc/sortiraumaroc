-- Email template: recap of unconfirmed bookings sent to establishments
-- Sent ~30 min after H-3 confirmation emails, before auto-cancel
-- Gives establishments time to call clients who haven't confirmed yet

INSERT INTO email_templates (
  key, audience, name, enabled,
  subject_fr, subject_en,
  body_fr, body_en,
  cta_label_fr, cta_label_en, cta_url
)
VALUES (
  'pro_unconfirmed_recap',
  'pro',
  'Recap reservations non confirmees',
  true,
  '⚠️ {{count}} réservation(s) en attente de confirmation — {{establishment_name}}',
  '⚠️ {{count}} booking(s) awaiting confirmation — {{establishment_name}}',
  'Bonjour,

{{count}} client(s) n''ont pas encore confirmé leur venue chez {{establishment_name}}.

Voici la liste des réservations en attente de confirmation :

{{recap_html}}

Nous vous invitons à contacter ces clients directement pour confirmer leur présence. Sans confirmation de leur part, leur réservation sera automatiquement annulée dans les prochaines minutes.

L''équipe Sortir Au Maroc',
  'Hello,

{{count}} customer(s) have not yet confirmed their attendance at {{establishment_name}}.

Here is the list of bookings awaiting confirmation:

{{recap_html}}

We invite you to contact these customers directly to confirm their attendance. Without their confirmation, their booking will be automatically cancelled in the next few minutes.

The Sortir Au Maroc team',
  'Voir le planning',
  'View planning',
  '{{planning_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en,
  cta_url = EXCLUDED.cta_url;
