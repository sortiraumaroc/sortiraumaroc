-- Migration: Add missing reservation status email templates
-- Date: 2026-02-10
-- Description: Adds email templates for when a pro confirms, refuses,
--              or cancels a reservation. Also updates no-show template CTA.

-- 1. Pro confirms reservation → email to customer
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_booking_pro_confirmed',
  'consumer',
  'Réservation confirmée par le pro',
  true,
  'Votre réservation chez {{establishment}} est confirmée ✅',
  'Bonjour {{user_name}},

Bonne nouvelle ! Votre réservation du {{date}} chez {{establishment}} a été confirmée par l''établissement.

Référence : {{booking_ref}}

Nous vous attendons avec impatience. Pensez à prévenir l''établissement si vos plans changent.

À bientôt !',
  'Voir ma réservation',
  '{{cta_url}}',
  'Your reservation at {{establishment}} is confirmed ✅',
  'Hello {{user_name}},

Great news! Your reservation on {{date}} at {{establishment}} has been confirmed by the establishment.

Reference: {{booking_ref}}

We look forward to seeing you. Please let the establishment know if your plans change.

See you soon!',
  'View my reservation'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- 2. Pro refuses reservation → email to customer
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_booking_refused',
  'consumer',
  'Réservation refusée par le pro',
  true,
  'Votre réservation chez {{establishment}} n''a pas pu être acceptée',
  'Bonjour {{user_name}},

Malheureusement, votre réservation du {{date}} chez {{establishment}} n''a pas pu être acceptée par l''établissement.

Référence : {{booking_ref}}
Motif : {{reason}}

Vous pouvez réserver un autre créneau directement sur la fiche de l''établissement.

Nous nous excusons pour la gêne occasionnée.',
  'Réserver un autre créneau',
  '{{cta_url}}',
  'Your reservation at {{establishment}} could not be accepted',
  'Hello {{user_name}},

Unfortunately, your reservation on {{date}} at {{establishment}} could not be accepted by the establishment.

Reference: {{booking_ref}}
Reason: {{reason}}

You can book another time slot directly on the establishment page.

We apologize for the inconvenience.',
  'Book another slot'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- 3. Pro cancels reservation → email to customer
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_booking_cancelled_by_pro',
  'consumer',
  'Réservation annulée par le pro',
  true,
  'Votre réservation chez {{establishment}} a été annulée',
  'Bonjour {{user_name}},

Nous sommes désolés de vous informer que votre réservation du {{date}} chez {{establishment}} a été annulée par l''établissement.

Référence : {{booking_ref}}

Si un paiement avait été effectué, le remboursement sera traité automatiquement.

Vous pouvez réserver un autre créneau sur la fiche de l''établissement.

Nous nous excusons pour la gêne occasionnée.',
  'Réserver un autre créneau',
  '{{cta_url}}',
  'Your reservation at {{establishment}} has been cancelled',
  'Hello {{user_name}},

We are sorry to inform you that your reservation on {{date}} at {{establishment}} has been cancelled by the establishment.

Reference: {{booking_ref}}

If a payment was made, the refund will be processed automatically.

You can book another time slot on the establishment page.

We apologize for the inconvenience.',
  'Book another slot'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- 4. Update no-show template CTA to use {{cta_url}} instead of {{contest_url}}
UPDATE email_templates
SET cta_url = '{{cta_url}}'
WHERE key = 'user_no_show_notification'
  AND cta_url = '{{contest_url}}';
