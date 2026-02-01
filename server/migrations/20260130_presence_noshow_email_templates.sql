-- Email templates for presence/no-show flow
-- Run this in Supabase SQL Editor

-- ============================================================================
-- USER TEMPLATES - Presence & Review Flow
-- ============================================================================

-- User: Presence confirmed - Thank you + Review invitation
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_presence_confirmed',
  'consumer',
  'Présence confirmée + Invitation avis',
  true,
  'Merci pour votre visite chez {{establishment}} !',
  'Bonjour {{user_name}},

Nous espérons que vous avez passé un excellent moment chez {{establishment}} !

Votre avis compte énormément pour nous et pour l''établissement. Prenez quelques secondes pour partager votre expérience et aider d''autres utilisateurs à faire leur choix.

En laissant un avis, vous contribuez à améliorer la qualité des services proposés.

À très bientôt sur Sam''Booking !',
  'Laisser un avis',
  '{{review_url}}',
  'Thank you for visiting {{establishment}}!',
  'Hello {{user_name}},

We hope you had a wonderful time at {{establishment}}!

Your feedback means a lot to us and to the establishment. Take a few seconds to share your experience and help other users make their choice.

By leaving a review, you help improve the quality of services offered.

See you soon on Sam''Booking!',
  'Leave a review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- User: No-show notification
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_no_show_notification',
  'consumer',
  'Notification absence (no-show)',
  true,
  'Vous n''êtes pas venu à votre réservation chez {{establishment}}',
  'Bonjour {{user_name}},

Nous avons constaté que vous n''avez pas honoré votre réservation du {{date}} chez {{establishment}}.

Les no-shows ont un impact important sur les établissements qui réservent des places pour leurs clients. Nous vous encourageons à annuler vos réservations si vos plans changent.

Si vous pensez qu''il s''agit d''une erreur, vous pouvez contester cette décision dans les 24 heures.

Merci de votre compréhension.',
  'Contester',
  '{{contest_url}}',
  'You missed your reservation at {{establishment}}',
  'Hello {{user_name}},

We noticed that you did not show up for your reservation on {{date}} at {{establishment}}.

No-shows have a significant impact on establishments that reserve spots for their customers. We encourage you to cancel your reservations if your plans change.

If you believe this is an error, you can contest this decision within 24 hours.

Thank you for your understanding.',
  'Contest'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- User: Confirm absence (for user to self-report)
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_confirm_absence',
  'consumer',
  'Confirmer votre absence',
  true,
  'Avez-vous honoré votre réservation chez {{establishment}} ?',
  'Bonjour {{user_name}},

Vous aviez une réservation le {{date}} chez {{establishment}}.

Si vous n''avez pas pu vous rendre à cette réservation, merci de nous le confirmer. Cela nous aide à maintenir un système juste pour tous.

Si vous y êtes bien allé, aucune action n''est nécessaire de votre part.',
  'Je n''ai pas pu venir',
  '{{confirm_absence_url}}',
  'Did you attend your reservation at {{establishment}}?',
  'Hello {{user_name}},

You had a reservation on {{date}} at {{establishment}}.

If you were unable to attend this reservation, please confirm. This helps us maintain a fair system for everyone.

If you did attend, no action is needed from you.',
  'I could not attend'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- ============================================================================
-- PRO TEMPLATES - Presence Confirmation Flow
-- ============================================================================

-- Pro: Request to confirm client presence (with direct link)
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_confirm_presence_request',
  'pro',
  'Demande confirmation présence client',
  true,
  'Confirmez la présence de {{user_name}} - Réservation du {{date}}',
  'Bonjour,

Le client {{user_name}} avait une réservation aujourd''hui à {{time}} pour {{guests}} personne(s).

Merci de confirmer si le client s''est présenté ou non. Cette information est importante pour maintenir la qualité du service.

Vous pouvez également scanner le QR code du client lors de son arrivée pour une confirmation instantanée.

IMPORTANT : Vous avez 48h pour confirmer. Passé ce délai, la présence sera automatiquement validée.',
  'Confirmer la présence',
  '{{confirm_presence_url}}',
  'Confirm {{user_name}}''s presence - Reservation on {{date}}',
  'Hello,

Customer {{user_name}} had a reservation today at {{time}} for {{guests}} person(s).

Please confirm whether the customer showed up or not. This information is important to maintain service quality.

You can also scan the customer''s QR code upon arrival for instant confirmation.

IMPORTANT: You have 48 hours to confirm. After this deadline, the presence will be automatically validated.',
  'Confirm presence'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: Reminder - 24h left to confirm
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_confirm_presence_reminder',
  'pro',
  'Rappel : 24h pour confirmer présence',
  true,
  'RAPPEL : Plus que 24h pour confirmer la présence de {{user_name}}',
  'Bonjour,

Vous n''avez pas encore confirmé la présence du client {{user_name}} pour sa réservation du {{date}} à {{time}}.

Il vous reste 24 heures pour indiquer si le client s''est présenté ou non.

ATTENTION : Sans réponse de votre part dans les 24h, la présence sera automatiquement validée et la réservation sera comptabilisée comme honorée. Aucune contestation ne sera acceptée après ce délai.',
  'Confirmer maintenant',
  '{{confirm_presence_url}}',
  'REMINDER: 24 hours left to confirm {{user_name}}''s presence',
  'Hello,

You have not yet confirmed the presence of customer {{user_name}} for their reservation on {{date}} at {{time}}.

You have 24 hours left to indicate whether the customer showed up or not.

WARNING: Without a response from you within 24 hours, the presence will be automatically validated and the reservation will be counted as honored. No dispute will be accepted after this deadline.',
  'Confirm now'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: Final reminder - 6h left
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_confirm_presence_final',
  'pro',
  'Dernier rappel : confirmation imminente',
  true,
  'URGENT : Dernières heures pour confirmer la présence de {{user_name}}',
  'Bonjour,

Ceci est votre dernier rappel concernant la réservation de {{user_name}} du {{date}}.

Dans quelques heures, sans action de votre part, la présence sera AUTOMATIQUEMENT VALIDÉE.

Si le client ne s''est pas présenté, c''est votre dernière chance de le signaler.',
  'Confirmer / Signaler no-show',
  '{{confirm_presence_url}}',
  'URGENT: Final hours to confirm {{user_name}}''s presence',
  'Hello,

This is your final reminder regarding {{user_name}}''s reservation on {{date}}.

In a few hours, without action on your part, the presence will be AUTOMATICALLY VALIDATED.

If the customer did not show up, this is your last chance to report it.',
  'Confirm / Report no-show'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: Auto-confirmation notification (48h expired)
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_presence_auto_confirmed',
  'pro',
  'Présence confirmée automatiquement',
  true,
  'Présence de {{user_name}} confirmée automatiquement',
  'Bonjour,

Le délai de 48h pour confirmer la présence du client {{user_name}} (réservation du {{date}}) est expiré.

La présence a été automatiquement validée conformément à nos conditions d''utilisation.

Pour éviter cela à l''avenir, pensez à :
- Scanner le QR code du client à son arrivée
- Confirmer rapidement via le lien envoyé par email
- Utiliser l''application pour gérer vos réservations en temps réel',
  'Voir mes réservations',
  '{{reservations_url}}',
  '{{user_name}}''s presence automatically confirmed',
  'Hello,

The 48-hour deadline to confirm customer {{user_name}}''s presence (reservation on {{date}}) has expired.

The presence has been automatically validated in accordance with our terms of use.

To avoid this in the future, remember to:
- Scan the customer''s QR code upon arrival
- Quickly confirm via the email link
- Use the app to manage your reservations in real time',
  'View my reservations'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: QR code scanned successfully
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_qrcode_scanned',
  'pro',
  'QR code scanné - Présence confirmée',
  true,
  'Présence confirmée par QR code - {{user_name}}',
  'Bonjour,

Le QR code du client {{user_name}} a été scanné avec succès.

Réservation : {{date}} à {{time}}
Nombre de personnes : {{guests}}

La présence est maintenant confirmée. Le client recevra une invitation à laisser un avis.',
  null,
  null,
  'Presence confirmed via QR code - {{user_name}}',
  'Hello,

Customer {{user_name}}''s QR code has been successfully scanned.

Reservation: {{date}} at {{time}}
Number of guests: {{guests}}

The presence is now confirmed. The customer will receive an invitation to leave a review.',
  null
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: No-show alert (when user self-reports absence)
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_no_show_alert',
  'pro',
  'Alerte no-show client',
  true,
  'No-show signalé : {{user_name}} - {{date}}',
  'Bonjour,

Le client {{user_name}} a été marqué comme no-show pour sa réservation du {{date}} à {{time}}.

Détails de la réservation :
- Nombre de personnes : {{guests}}
- Référence : {{booking_ref}}

Cette information a été enregistrée dans l''historique du client.',
  'Voir les détails',
  '{{booking_url}}',
  'No-show reported: {{user_name}} - {{date}}',
  'Hello,

Customer {{user_name}} has been marked as a no-show for their reservation on {{date}} at {{time}}.

Reservation details:
- Number of guests: {{guests}}
- Reference: {{booking_ref}}

This information has been recorded in the customer''s history.',
  'View details'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: New review received
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_review_received',
  'pro',
  'Nouvel avis reçu',
  true,
  'Nouvel avis de {{user_name}} - {{rating}}/5',
  'Bonjour,

Vous avez reçu un nouvel avis de {{user_name}} !

Note : {{rating}}/5
{{#if comment}}
Commentaire : "{{comment}}"
{{/if}}

Répondre aux avis montre que vous êtes à l''écoute de vos clients et améliore votre visibilité.',
  'Répondre à l''avis',
  '{{review_url}}',
  'New review from {{user_name}} - {{rating}}/5',
  'Hello,

You have received a new review from {{user_name}}!

Rating: {{rating}}/5
{{#if comment}}
Comment: "{{comment}}"
{{/if}}

Responding to reviews shows that you listen to your customers and improves your visibility.',
  'Respond to review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: Review response reminder
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_review_response_reminder',
  'pro',
  'Rappel : avis en attente de réponse',
  true,
  'Vous avez {{count}} avis en attente de réponse',
  'Bonjour,

Vous avez {{count}} avis client(s) qui n''ont pas encore reçu de réponse.

Les établissements qui répondent aux avis ont en moyenne 35% de réservations en plus. C''est l''occasion de montrer votre professionnalisme et votre écoute !

Prenez quelques minutes pour répondre à vos clients.',
  'Voir les avis',
  '{{reviews_url}}',
  'You have {{count}} reviews awaiting response',
  'Hello,

You have {{count}} customer review(s) that have not yet received a response.

Establishments that respond to reviews have on average 35% more bookings. This is an opportunity to show your professionalism and attentiveness!

Take a few minutes to respond to your customers.',
  'View reviews'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- ============================================================================
-- ADDITIONAL MISSING TEMPLATES
-- ============================================================================

-- User: Birthday email
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_birthday',
  'consumer',
  'Email anniversaire',
  true,
  'Joyeux anniversaire {{user_name}} !',
  'Bonjour {{user_name}},

Toute l''équipe Sam''Booking vous souhaite un très joyeux anniversaire !

Pour célébrer ce jour spécial, découvrez nos établissements partenaires qui proposent des offres spéciales pour les anniversaires.

Passez une excellente journée !',
  'Découvrir les offres',
  '{{birthday_offers_url}}',
  'Happy birthday {{user_name}}!',
  'Hello {{user_name}},

The entire Sam''Booking team wishes you a very happy birthday!

To celebrate this special day, discover our partner establishments that offer special birthday deals.

Have a wonderful day!',
  'Discover offers'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- User: Reactivation (inactive user)
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'user_reactivation',
  'consumer',
  'Réengagement utilisateur inactif',
  true,
  '{{user_name}}, vous nous manquez !',
  'Bonjour {{user_name}},

Cela fait un moment que nous ne vous avons pas vu sur Sam''Booking !

De nombreux nouveaux établissements ont rejoint notre plateforme et proposent des expériences uniques.

Revenez découvrir les nouveautés et réservez votre prochaine sortie.',
  'Découvrir les nouveautés',
  '{{explore_url}}',
  '{{user_name}}, we miss you!',
  'Hello {{user_name}},

It''s been a while since we''ve seen you on Sam''Booking!

Many new establishments have joined our platform and offer unique experiences.

Come back to discover what''s new and book your next outing.',
  'Discover what''s new'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: Payout completed
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_payout_completed',
  'pro',
  'Virement effectué',
  true,
  'Votre virement de {{amount}} MAD a été effectué',
  'Bonjour,

Nous avons le plaisir de vous informer que votre virement a été effectué.

Montant : {{amount}} MAD
Référence : {{payout_ref}}
Date d''exécution : {{date}}

Le montant sera crédité sur votre compte bancaire sous 1 à 3 jours ouvrés.

Vous pouvez consulter l''historique de vos paiements dans votre espace pro.',
  'Voir mes paiements',
  '{{payments_url}}',
  'Your transfer of {{amount}} MAD has been completed',
  'Hello,

We are pleased to inform you that your transfer has been completed.

Amount: {{amount}} MAD
Reference: {{payout_ref}}
Execution date: {{date}}

The amount will be credited to your bank account within 1 to 3 business days.

You can view your payment history in your pro area.',
  'View my payments'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Pro: Daily reservations summary (morning briefing)
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'pro_daily_briefing',
  'pro',
  'Briefing réservations du jour',
  true,
  'Vos {{count}} réservation(s) pour aujourd''hui',
  'Bonjour,

Voici le récapitulatif de vos réservations pour aujourd''hui :

{{reservations_summary}}

Total : {{count}} réservation(s) pour {{total_guests}} couverts.

Bonne journée !',
  'Voir le planning',
  '{{planning_url}}',
  'Your {{count}} reservation(s) for today',
  'Hello,

Here is the summary of your reservations for today:

{{reservations_summary}}

Total: {{count}} reservation(s) for {{total_guests}} guests.

Have a great day!',
  'View schedule'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- System: Password changed confirmation
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'system_password_changed',
  'system',
  'Mot de passe modifié',
  true,
  'Votre mot de passe a été modifié',
  'Bonjour {{user_name}},

Votre mot de passe Sam''Booking a été modifié avec succès.

Si vous n''êtes pas à l''origine de cette modification, veuillez nous contacter immédiatement à support@sambooking.ma ou réinitialiser votre mot de passe.

Date de modification : {{date}}
Adresse IP : {{ip_address}}',
  'Réinitialiser mon mot de passe',
  '{{reset_password_url}}',
  'Your password has been changed',
  'Hello {{user_name}},

Your Sam''Booking password has been successfully changed.

If you did not make this change, please contact us immediately at support@sambooking.ma or reset your password.

Date of change: {{date}}
IP address: {{ip_address}}',
  'Reset my password'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Finance: Refund processed
INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'finance_refund_processed',
  'finance',
  'Remboursement effectué',
  true,
  'Votre remboursement de {{amount}} MAD a été traité',
  'Bonjour {{user_name}},

Nous vous confirmons que votre remboursement a été traité.

Montant remboursé : {{amount}} MAD
Référence : {{refund_ref}}
Réservation concernée : {{booking_ref}}

Le montant sera crédité sur votre moyen de paiement d''origine sous 5 à 10 jours ouvrés selon votre banque.

Si vous avez des questions, n''hésitez pas à nous contacter.',
  null,
  null,
  'Your refund of {{amount}} MAD has been processed',
  'Hello {{user_name}},

We confirm that your refund has been processed.

Refunded amount: {{amount}} MAD
Reference: {{refund_ref}}
Related reservation: {{booking_ref}}

The amount will be credited to your original payment method within 5 to 10 business days depending on your bank.

If you have any questions, please don''t hesitate to contact us.',
  null
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- Verify all templates were created
SELECT key, audience, name, enabled FROM email_templates ORDER BY audience, key;
