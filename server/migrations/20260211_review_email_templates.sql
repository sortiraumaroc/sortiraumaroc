-- Migration: Review system V2 email templates
-- Date: 2026-02-11
-- Description: Adds all email templates needed by the reviews system.
--   Templates: invitation, reminders, moderation feedback,
--   commercial gesture workflow, publication notifications.
--
-- All inserts are idempotent (ON CONFLICT … DO UPDATE).

-- =============================================================================
-- 1. review_invitation — Sent 8h after check-in to invite the client to review
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_invitation',
  'consumer',
  'Invitation à donner un avis',
  true,
  'Comment s''est passée votre visite chez {{establishment_name}} ?',
  'Bonjour,

Vous avez récemment visité {{establishment_name}} et nous aimerions connaître votre expérience.

Votre avis compte ! En quelques minutes, partagez votre ressenti et aidez d''autres personnes à faire leur choix.

Vous avez 14 jours pour déposer votre avis.',
  'Donner mon avis',
  '{{review_url}}',
  'How was your visit to {{establishment_name}}?',
  'Hello,

You recently visited {{establishment_name}} and we would love to hear about your experience.

Your opinion matters! In just a few minutes, share your feedback and help others make their choice.

You have 14 days to submit your review.',
  'Leave my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 2. review_reminder_3d — Sent 3 days after invitation if no review yet
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_reminder_3d',
  'consumer',
  'Rappel J+3 — Donner un avis',
  true,
  'N''oubliez pas de donner votre avis sur {{establishment_name}} 🌟',
  'Bonjour,

Il y a quelques jours, nous vous avons invité à partager votre avis sur {{establishment_name}}.

Votre retour est précieux et ne prend que quelques minutes. Chaque avis aide la communauté à découvrir les meilleures adresses.

N''attendez plus !',
  'Donner mon avis',
  '{{review_url}}',
  'Don''t forget to review {{establishment_name}} 🌟',
  'Hello,

A few days ago, we invited you to share your review of {{establishment_name}}.

Your feedback is valuable and only takes a few minutes. Every review helps the community discover the best places.

Don''t wait any longer!',
  'Leave my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 3. review_reminder_7d — Last chance reminder 7 days after invitation
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_reminder_7d',
  'consumer',
  'Dernier rappel J+7 — Donner un avis',
  true,
  'Dernière chance pour donner votre avis sur {{establishment_name}} ⏰',
  'Bonjour,

C''est votre dernière chance de partager votre avis sur {{establishment_name}}.

Votre invitation expire bientôt. Prenez 2 minutes pour partager votre expérience et aider d''autres personnes à faire le bon choix.

Merci pour votre contribution !',
  'Dernière chance pour donner mon avis',
  '{{review_url}}',
  'Last chance to review {{establishment_name}} ⏰',
  'Hello,

This is your last chance to share your review of {{establishment_name}}.

Your invitation expires soon. Take 2 minutes to share your experience and help others make the right choice.

Thank you for your contribution!',
  'Last chance to leave my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 4. review_rejected — Review rejected by moderation
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_rejected',
  'consumer',
  'Avis rejeté par la modération',
  true,
  'Votre avis sur {{establishment_name}} n''a pas pu être publié',
  'Bonjour,

Nous avons examiné votre avis sur {{establishment_name}} et malheureusement, celui-ci n''a pas pu être publié pour la raison suivante :

« {{rejection_reason}} »

Notre politique de modération vise à garantir des avis utiles, respectueux et factuels. Si vous pensez que cette décision est une erreur, vous pouvez nous contacter via le support.

Merci de votre compréhension.',
  NULL,
  NULL,
  'Your review of {{establishment_name}} could not be published',
  'Hello,

We reviewed your feedback about {{establishment_name}} and unfortunately, it could not be published for the following reason:

"{{rejection_reason}}"

Our moderation policy aims to ensure reviews are useful, respectful, and factual. If you believe this decision was made in error, you can contact our support team.

Thank you for your understanding.',
  NULL
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 5. review_modification_requested — Admin asks client to modify their review
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_modification_requested',
  'consumer',
  'Demande de modification d''avis',
  true,
  'Modification demandée pour votre avis sur {{establishment_name}}',
  'Bonjour,

Notre équipe de modération a examiné votre avis sur {{establishment_name}} et vous demande d''y apporter une modification :

« {{modification_note}} »

Cliquez sur le bouton ci-dessous pour modifier votre avis. Une fois modifié, il sera à nouveau examiné pour publication.

Merci pour votre coopération !',
  'Modifier mon avis',
  NULL,
  'Modification requested for your review of {{establishment_name}}',
  'Hello,

Our moderation team reviewed your feedback about {{establishment_name}} and is requesting a modification:

"{{modification_note}}"

Click the button below to edit your review. Once modified, it will be reviewed again for publication.

Thank you for your cooperation!',
  'Edit my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 6. review_gesture_proposed — Sent to client when pro proposes a gesture
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_proposed',
  'consumer',
  'Geste commercial proposé',
  true,
  '{{establishment_name}} vous propose un geste commercial 🎁',
  'Bonjour,

Suite à votre avis sur {{establishment_name}}, l''établissement vous propose un geste commercial :

« {{gesture_message}} »

Vous avez 48 heures pour accepter ou refuser cette proposition. Si vous acceptez, vous recevrez un code promo utilisable lors de votre prochaine visite et votre avis ne sera pas publié. Si vous refusez, votre avis sera publié normalement avec mention du geste commercial proposé.

Prenez le temps d''y réfléchir !',
  'Voir le geste commercial',
  NULL,
  '{{establishment_name}} offers you a commercial gesture 🎁',
  'Hello,

Following your review of {{establishment_name}}, the establishment is offering you a commercial gesture:

"{{gesture_message}}"

You have 48 hours to accept or refuse this offer. If you accept, you will receive a promo code for your next visit and your review will not be published. If you refuse, your review will be published normally with a mention of the proposed gesture.

Take your time to decide!',
  'View the commercial gesture'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 7. review_gesture_opportunity — Sent to pro when negative review is approved
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_opportunity',
  'pro',
  'Avis négatif — Opportunité de geste commercial',
  true,
  'Avis négatif ({{rating}}/5) pour {{establishment_name}} — Geste commercial possible',
  'Bonjour,

Un avis négatif ({{rating}}/5) a été validé par notre modération pour {{establishment_name}} :

« {{comment_preview}} »

Vous avez 24 heures pour proposer un geste commercial au client (code promo, réduction). Si vous proposez un geste et que le client l''accepte, l''avis ne sera pas publié.

Si vous ne répondez pas dans les 24h, l''avis sera automatiquement publié.

Agissez vite !',
  'Proposer un geste commercial',
  NULL,
  'Negative review ({{rating}}/5) for {{establishment_name}} — Commercial gesture possible',
  'Hello,

A negative review ({{rating}}/5) has been validated by our moderation for {{establishment_name}}:

"{{comment_preview}}"

You have 24 hours to propose a commercial gesture to the customer (promo code, discount). If you make an offer and the customer accepts, the review will not be published.

If you do not respond within 24 hours, the review will be automatically published.

Act fast!',
  'Propose a commercial gesture'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 8. review_published — Sent to client when their review is published
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_published',
  'consumer',
  'Avis publié',
  true,
  'Votre avis sur {{establishment_name}} est maintenant en ligne ✅',
  'Bonjour,

Merci pour votre retour ! Votre avis sur {{establishment_name}} a été vérifié par notre équipe de modération et est désormais publié.

Votre contribution aide d''autres personnes à découvrir les meilleures adresses. N''hésitez pas à partager vos expériences après chacune de vos visites !

Merci de faire partie de la communauté Sortir Au Maroc.',
  'Voir mon avis',
  NULL,
  'Your review of {{establishment_name}} is now live ✅',
  'Hello,

Thank you for your feedback! Your review of {{establishment_name}} has been verified by our moderation team and is now published.

Your contribution helps others discover the best places. Don''t hesitate to share your experiences after each visit!

Thank you for being part of the Sortir Au Maroc community.',
  'View my review'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 9. review_gesture_accepted — Confirmation email to client with promo code
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_accepted',
  'consumer',
  'Geste commercial accepté — Code promo',
  true,
  'Votre code promo chez {{establishment_name}} 🎉',
  'Bonjour,

Vous avez accepté le geste commercial de {{establishment_name}}. Voici votre code promo :

Code : {{promo_code}}
Réduction : {{discount_percent}}%

Présentez ce code lors de votre prochaine visite chez {{establishment_name}} pour en bénéficier.

Merci d''avoir donné une seconde chance à cet établissement. Nous espérons que votre prochaine expérience sera excellente !',
  'Réserver ma prochaine visite',
  NULL,
  'Your promo code at {{establishment_name}} 🎉',
  'Hello,

You accepted the commercial gesture from {{establishment_name}}. Here is your promo code:

Code: {{promo_code}}
Discount: {{discount_percent}}%

Present this code during your next visit to {{establishment_name}} to benefit from the discount.

Thank you for giving this establishment a second chance. We hope your next experience will be excellent!',
  'Book my next visit'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;

-- =============================================================================
-- 10. review_gesture_expired_client — Sent to client when gesture expires
-- =============================================================================

INSERT INTO email_templates (key, audience, name, enabled, subject_fr, body_fr, cta_label_fr, cta_url, subject_en, body_en, cta_label_en)
VALUES (
  'review_gesture_expired_client',
  'consumer',
  'Geste commercial expiré — Avis publié',
  true,
  'Le geste commercial de {{establishment_name}} a expiré',
  'Bonjour,

Le geste commercial proposé par {{establishment_name}} a expiré car le délai de réponse de 48 heures est dépassé.

Votre avis a été publié automatiquement avec une mention indiquant qu''un geste commercial avait été proposé.

Merci pour votre contribution à la communauté.',
  NULL,
  NULL,
  'The commercial gesture from {{establishment_name}} has expired',
  'Hello,

The commercial gesture proposed by {{establishment_name}} has expired because the 48-hour response window has passed.

Your review has been automatically published with a note indicating that a commercial gesture was proposed.

Thank you for your contribution to the community.',
  NULL
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  cta_label_fr = EXCLUDED.cta_label_fr,
  cta_url = EXCLUDED.cta_url,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en,
  cta_label_en = EXCLUDED.cta_label_en;
