-- ============================================================================
-- Migration: Add personal QR code mention to booking/payment email templates
-- Date: 2026-02-08
-- Description: Updates email templates to mention the personal QR code
--              that users should present at the establishment instead of
--              per-booking QR codes.
-- ============================================================================

-- 1. user_booking_confirmed — Confirmation de réservation
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre réservation est confirmée.

Référence : {{booking_ref}}
Établissement : {{establishment}}
Date : {{date}}
Montant : {{amount}}

📱 Le jour J, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Ce QR code unique vous identifie et permet de valider votre réservation à l''arrivée.

À bientôt,
L''équipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your booking is confirmed.

Reference: {{booking_ref}}
Establishment: {{establishment}}
Date: {{date}}
Amount: {{amount}}

📱 On the day, present your personal QR code available in the "My QR Code" section of the app. This unique QR code identifies you and validates your reservation upon arrival.

See you soon,
The Sortir Au Maroc team'
WHERE key = 'user_booking_confirmed';

-- 2. user_direct_booking_confirmed — Confirmation réservation directe
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre reservation directe est confirmee.

Etablissement : {{establishment}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}
Reference : {{booking_ref}}

Cette reservation a ete effectuee via le lien direct de l''etablissement.

📱 Le jour J, presentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Ce QR code unique vous identifie et permet de valider votre reservation a l''arrivee.

A bientot !

L''equipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your direct booking is confirmed.

Establishment: {{establishment}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}
Reference: {{booking_ref}}

This booking was made via the establishment''s direct link.

📱 On the day, present your personal QR code available in the "My QR Code" section of the app. This unique QR code identifies you and validates your reservation upon arrival.

See you soon!

The Sortir Au Maroc team'
WHERE key = 'user_direct_booking_confirmed';

-- 3. user_booking_reconfirmed — Reconfirmation H-3
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre présence est confirmée pour votre réservation.

Établissement : {{establishment}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}

📱 Pensez à préparer votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Présentez-le à votre arrivée pour une entrée rapide.

À très bientôt !

L''équipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your attendance is confirmed for your reservation.

Establishment: {{establishment}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}

📱 Remember to prepare your personal QR code available in the "My QR Code" section of the app. Present it upon arrival for quick entry.

See you very soon!

The Sortir Au Maroc team'
WHERE key = 'user_booking_reconfirmed';

-- 4. finance_payment_confirmation — Confirmation de paiement
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre paiement a bien été pris en compte.

Référence : {{booking_ref}}
Montant : {{amount}}

📱 Le jour de votre réservation, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application pour valider votre entrée.

Merci,
L''équipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your payment has been confirmed.

Reference: {{booking_ref}}
Amount: {{amount}}

📱 On the day of your reservation, present your personal QR code available in the "My QR Code" section of the app to validate your entry.

Thank you,
The Sortir Au Maroc team'
WHERE key = 'finance_payment_confirmation';

-- 5. user_booking_confirm_3h — Demande de confirmation H-3
-- Note: This template asks user to confirm attendance, we add QR mention as reminder
UPDATE public.email_templates
SET
  body_fr = COALESCE(body_fr, '') || '

📱 Rappel : le jour J, présentez votre QR code personnel (disponible dans "Mon QR Code" sur l''application) à l''établissement pour valider votre réservation.'
WHERE key = 'user_booking_confirm_3h'
  AND body_fr IS NOT NULL
  AND body_fr NOT LIKE '%Mon QR Code%';

-- 6. finance_deposit_received — Acompte reçu
UPDATE public.email_templates
SET
  body_fr = COALESCE(body_fr, '') || '

📱 Le jour J, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application pour valider votre entrée.'
WHERE key = 'finance_deposit_received'
  AND body_fr IS NOT NULL
  AND body_fr NOT LIKE '%Mon QR Code%';
