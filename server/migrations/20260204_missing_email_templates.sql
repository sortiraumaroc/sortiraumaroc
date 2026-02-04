-- ============================================================================
-- Migration: Missing Email Templates
-- Date: 2026-02-04
-- Description: Add all missing email templates for complete coverage
-- ============================================================================

begin;

-- ============================================================================
-- CONSUMER TEMPLATES
-- ============================================================================

-- Email verification code (OTP)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_email_verification',
  'consumer',
  'Code de verification email',
  true,
  'Votre code de verification : {{code}}',
  'Bonjour {{user_name}},

Voici votre code de verification pour confirmer votre adresse email :

{{code}}

Ce code est valable pendant 10 minutes.

Si vous n''avez pas demande ce code, ignorez cet email.

L''equipe Sortir Au Maroc',
  null,
  'Your verification code: {{code}}',
  'Hello {{user_name}},

Here is your verification code to confirm your email address:

{{code}}

This code is valid for 10 minutes.

If you did not request this code, please ignore this email.

The Sortir Au Maroc team',
  null,
  null
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Contact form received (Lead acknowledgment)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_contact_received',
  'consumer',
  'Formulaire de contact recu',
  true,
  'Nous avons bien recu votre message',
  'Bonjour {{user_name}},

Nous avons bien recu votre message et nous vous repondrons dans les plus brefs delais.

Votre demande :
{{message}}

Notre equipe vous contactera sous 24 a 48 heures.

L''equipe Sortir Au Maroc',
  'Visiter le site',
  'We received your message',
  'Hello {{user_name}},

We have received your message and will respond as soon as possible.

Your inquiry:
{{message}}

Our team will contact you within 24 to 48 hours.

The Sortir Au Maroc team',
  'Visit website',
  'https://sortiraumaroc.ma/'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Waitlist joined confirmation
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_waitlist_joined',
  'consumer',
  'Inscription liste d''attente confirmee',
  true,
  'Vous etes sur la liste d''attente - {{establishment}}',
  'Bonjour {{user_name}},

Votre inscription sur la liste d''attente est confirmee.

Etablissement : {{establishment}}
Date souhaitee : {{date}}
Nombre de personnes : {{guests}}

Nous vous contacterons des qu''une place se libere. Vous serez prioritaire pour reserver.

L''equipe Sortir Au Maroc',
  'Voir mes listes d''attente',
  'You are on the waitlist - {{establishment}}',
  'Hello {{user_name}},

Your waitlist registration is confirmed.

Establishment: {{establishment}}
Requested date: {{date}}
Number of guests: {{guests}}

We will contact you as soon as a spot becomes available. You will have priority to book.

The Sortir Au Maroc team',
  'View my waitlists',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Waitlist expired
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_waitlist_expired',
  'consumer',
  'Liste d''attente expiree',
  true,
  'Votre offre liste d''attente a expire - {{establishment}}',
  'Bonjour {{user_name}},

L''offre de reservation qui vous avait ete proposee pour {{establishment}} le {{date}} a expire.

Ne vous inquietez pas, vous restez inscrit sur la liste d''attente et nous vous recontacterons si une nouvelle place se libere.

L''equipe Sortir Au Maroc',
  'Explorer d''autres options',
  'Your waitlist offer has expired - {{establishment}}',
  'Hello {{user_name}},

The booking offer that was proposed to you for {{establishment}} on {{date}} has expired.

Don''t worry, you remain on the waitlist and we will contact you again if another spot becomes available.

The Sortir Au Maroc team',
  'Explore other options',
  'https://sortiraumaroc.ma/'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Booking reminder H-3
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_booking_reminder_h3',
  'consumer',
  'Rappel H-3 reservation',
  true,
  'Rappel : votre reservation dans 3 heures - {{establishment}}',
  'Bonjour {{user_name}},

Petit rappel : votre reservation est dans 3 heures.

Etablissement : {{establishment}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}
Reference : {{booking_ref}}

A tres bientot !

L''equipe Sortir Au Maroc',
  'Voir ma reservation',
  'Reminder: your booking in 3 hours - {{establishment}}',
  'Hello {{user_name}},

Quick reminder: your booking is in 3 hours.

Establishment: {{establishment}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}
Reference: {{booking_ref}}

See you soon!

The Sortir Au Maroc team',
  'View my booking',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Referral: Invitation sent
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_referral_invitation',
  'consumer',
  'Invitation parrainage envoyee',
  true,
  '{{referrer_name}} vous invite sur Sortir Au Maroc',
  'Bonjour,

{{referrer_name}} vous invite a decouvrir Sortir Au Maroc, la plateforme de reservation des meilleures adresses au Maroc.

En utilisant son lien de parrainage, vous beneficiez de {{reward_amount}} MAD de credit sur votre premiere reservation.

Rejoignez la communaute et decouvrez des experiences uniques !

L''equipe Sortir Au Maroc',
  'Rejoindre Sortir Au Maroc',
  '{{referrer_name}} invites you to Sortir Au Maroc',
  'Hello,

{{referrer_name}} invites you to discover Sortir Au Maroc, the booking platform for the best addresses in Morocco.

By using their referral link, you get {{reward_amount}} MAD credit on your first booking.

Join the community and discover unique experiences!

The Sortir Au Maroc team',
  'Join Sortir Au Maroc',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Referral: Reward earned (referrer)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_referral_reward_earned',
  'consumer',
  'Recompense parrainage gagnee',
  true,
  'Felicitations ! Vous avez gagne {{reward_amount}} MAD',
  'Bonjour {{user_name}},

Bonne nouvelle ! Votre filleul {{referred_name}} a effectue sa premiere reservation.

Vous avez gagne {{reward_amount}} MAD de credit sur votre portefeuille Sortir Au Maroc.

Solde actuel : {{wallet_balance}} MAD

Continuez a parrainer vos proches pour gagner encore plus de credits !

L''equipe Sortir Au Maroc',
  'Voir mon portefeuille',
  'Congratulations! You earned {{reward_amount}} MAD',
  'Hello {{user_name}},

Good news! Your referral {{referred_name}} made their first booking.

You earned {{reward_amount}} MAD credit in your Sortir Au Maroc wallet.

Current balance: {{wallet_balance}} MAD

Keep referring friends and family to earn more credits!

The Sortir Au Maroc team',
  'View my wallet',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Referral: Welcome bonus (referred user)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_referral_welcome_bonus',
  'consumer',
  'Bonus de bienvenue parrainage',
  true,
  'Bienvenue ! Votre bonus de {{reward_amount}} MAD est disponible',
  'Bonjour {{user_name}},

Bienvenue sur Sortir Au Maroc !

Grace au parrainage de {{referrer_name}}, vous avez recu {{reward_amount}} MAD de credit sur votre portefeuille.

Ce credit sera automatiquement applique a votre premiere reservation.

Decouvrez les meilleures adresses du Maroc !

L''equipe Sortir Au Maroc',
  'Decouvrir les etablissements',
  'Welcome! Your {{reward_amount}} MAD bonus is available',
  'Hello {{user_name}},

Welcome to Sortir Au Maroc!

Thanks to {{referrer_name}}''s referral, you received {{reward_amount}} MAD credit in your wallet.

This credit will be automatically applied to your first booking.

Discover the best addresses in Morocco!

The Sortir Au Maroc team',
  'Discover establishments',
  'https://sortiraumaroc.ma/'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Direct booking confirmation (via book.sam.ma/@username)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'user_direct_booking_confirmed',
  'consumer',
  'Confirmation reservation directe',
  true,
  'Reservation confirmee - {{establishment}}',
  'Bonjour {{user_name}},

Votre reservation directe est confirmee.

Etablissement : {{establishment}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}
Reference : {{booking_ref}}

Cette reservation a ete effectuee via le lien direct de l''etablissement.

A bientot !

L''equipe Sortir Au Maroc',
  'Voir ma reservation',
  'Booking confirmed - {{establishment}}',
  'Hello {{user_name}},

Your direct booking is confirmed.

Establishment: {{establishment}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}
Reference: {{booking_ref}}

This booking was made via the establishment''s direct link.

See you soon!

The Sortir Au Maroc team',
  'View my booking',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- ============================================================================
-- PRO TEMPLATES
-- ============================================================================

-- New lead received
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_new_lead',
  'pro',
  'Nouveau lead recu',
  true,
  'Nouvelle demande de contact - {{establishment}}',
  'Bonjour,

Vous avez recu une nouvelle demande de contact.

Nom : {{lead_name}}
Email : {{lead_email}}
Telephone : {{lead_phone}}
Message : {{lead_message}}

Repondez rapidement pour maximiser vos chances de conversion !

L''equipe Sortir Au Maroc',
  'Repondre au lead',
  'New contact request - {{establishment}}',
  'Hello,

You received a new contact request.

Name: {{lead_name}}
Email: {{lead_email}}
Phone: {{lead_phone}}
Message: {{lead_message}}

Respond quickly to maximize your conversion chances!

The Sortir Au Maroc team',
  'Respond to lead',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Bulk import welcome
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_bulk_import_welcome',
  'pro',
  'Bienvenue import en masse',
  true,
  'Bienvenue sur Sortir Au Maroc PRO - Votre fiche est prete',
  'Bonjour,

Votre etablissement {{establishment}} a ete ajoute sur Sortir Au Maroc.

Votre fiche est desormais visible par des milliers d''utilisateurs a la recherche des meilleures adresses au Maroc.

Pour gerer votre fiche et recevoir des reservations :
1. Connectez-vous a votre espace PRO
2. Completez votre profil
3. Activez les reservations en ligne

Besoin d''aide ? Notre equipe est la pour vous accompagner.

L''equipe Sortir Au Maroc',
  'Acceder a mon espace PRO',
  'Welcome to Sortir Au Maroc PRO - Your listing is ready',
  'Hello,

Your establishment {{establishment}} has been added to Sortir Au Maroc.

Your listing is now visible to thousands of users looking for the best addresses in Morocco.

To manage your listing and receive bookings:
1. Log in to your PRO space
2. Complete your profile
3. Enable online bookings

Need help? Our team is here to assist you.

The Sortir Au Maroc team',
  'Access my PRO space',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Visibility order created (pending payment)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_visibility_order_created',
  'pro',
  'Commande visibilite creee',
  true,
  'Commande de visibilite #{{order_ref}} - En attente de paiement',
  'Bonjour,

Votre commande de visibilite a ete creee.

Reference : #{{order_ref}}
Etablissement : {{establishment}}
Pack : {{pack_name}}
Montant : {{amount}} MAD

Finalisez votre paiement pour activer votre pack.

L''equipe Sortir Au Maroc',
  'Finaliser le paiement',
  'Visibility order #{{order_ref}} - Pending payment',
  'Hello,

Your visibility order has been created.

Reference: #{{order_ref}}
Establishment: {{establishment}}
Pack: {{pack_name}}
Amount: {{amount}} MAD

Complete your payment to activate your pack.

The Sortir Au Maroc team',
  'Complete payment',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Visibility order paid
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_visibility_order_paid',
  'pro',
  'Commande visibilite payee',
  true,
  'Paiement confirme - Commande #{{order_ref}}',
  'Bonjour,

Votre paiement a ete confirme.

Reference : #{{order_ref}}
Etablissement : {{establishment}}
Pack : {{pack_name}}
Montant : {{amount}} MAD

Votre service de visibilite est maintenant actif.

L''equipe Sortir Au Maroc',
  'Voir mon pack',
  'Payment confirmed - Order #{{order_ref}}',
  'Hello,

Your payment has been confirmed.

Reference: #{{order_ref}}
Establishment: {{establishment}}
Pack: {{pack_name}}
Amount: {{amount}} MAD

Your visibility service is now active.

The Sortir Au Maroc team',
  'View my pack',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Direct booking received (via book.sam.ma/@username)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_direct_booking_received',
  'pro',
  'Reservation directe recue',
  true,
  'Nouvelle reservation directe - {{booking_ref}}',
  'Bonjour,

Vous avez recu une reservation via votre lien direct book.sam.ma/@{{username}}.

Reference : {{booking_ref}}
Client : {{user_name}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}

Cette reservation n''est pas soumise a la commission SAM.

L''equipe Sortir Au Maroc',
  'Voir la reservation',
  'New direct booking - {{booking_ref}}',
  'Hello,

You received a booking via your direct link book.sam.ma/@{{username}}.

Reference: {{booking_ref}}
Customer: {{user_name}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}

This booking is not subject to SAM commission.

The Sortir Au Maroc team',
  'View booking',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Menu Digital subscription activated
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_menu_digital_activated',
  'pro',
  'Menu Digital active',
  true,
  'Votre Menu Digital est active - {{establishment}}',
  'Bonjour,

Felicitations ! Votre Menu Digital est maintenant actif.

Etablissement : {{establishment}}
Valide jusqu''au : {{expires_at}}

Vous pouvez maintenant :
- Telecharger votre QR code a placer sur vos tables
- Personnaliser votre menu en temps reel
- Suivre les statistiques de consultation

L''equipe Sortir Au Maroc',
  'Gerer mon Menu Digital',
  'Your Digital Menu is active - {{establishment}}',
  'Hello,

Congratulations! Your Digital Menu is now active.

Establishment: {{establishment}}
Valid until: {{expires_at}}

You can now:
- Download your QR code to place on your tables
- Customize your menu in real time
- Track consultation statistics

The Sortir Au Maroc team',
  'Manage my Digital Menu',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Menu Digital expiring reminder
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_menu_digital_expiring',
  'pro',
  'Menu Digital expire bientot',
  true,
  'Votre Menu Digital expire dans {{days}} jours',
  'Bonjour,

Votre abonnement Menu Digital pour {{establishment}} expire le {{expires_at}}.

Pour continuer a proposer votre menu digital a vos clients, pensez a renouveler votre abonnement.

L''equipe Sortir Au Maroc',
  'Renouveler maintenant',
  'Your Digital Menu expires in {{days}} days',
  'Hello,

Your Digital Menu subscription for {{establishment}} expires on {{expires_at}}.

To continue offering your digital menu to your customers, remember to renew your subscription.

The Sortir Au Maroc team',
  'Renew now',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Profile update approved
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_profile_update_approved',
  'pro',
  'Modification profil approuvee',
  true,
  'Modification approuvee - {{establishment}}',
  'Bonjour,

Votre demande de modification de profil pour {{establishment}} a ete approuvee.

Les modifications sont maintenant visibles sur votre fiche.

L''equipe Sortir Au Maroc',
  'Voir ma fiche',
  'Profile update approved - {{establishment}}',
  'Hello,

Your profile update request for {{establishment}} has been approved.

The changes are now visible on your listing.

The Sortir Au Maroc team',
  'View my listing',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Profile update rejected
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_profile_update_rejected',
  'pro',
  'Modification profil refusee',
  true,
  'Modification refusee - {{establishment}}',
  'Bonjour,

Votre demande de modification de profil pour {{establishment}} n''a pas pu etre approuvee.

Raison : {{rejection_reason}}

Vous pouvez soumettre une nouvelle demande en tenant compte de ces indications.

L''equipe Sortir Au Maroc',
  'Modifier ma fiche',
  'Profile update rejected - {{establishment}}',
  'Hello,

Your profile update request for {{establishment}} could not be approved.

Reason: {{rejection_reason}}

You can submit a new request taking these comments into account.

The Sortir Au Maroc team',
  'Edit my listing',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Weekly stats summary
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_weekly_stats',
  'pro',
  'Statistiques hebdomadaires',
  true,
  'Votre semaine en chiffres - {{establishment}}',
  'Bonjour,

Voici le resume de votre semaine pour {{establishment}} :

Vues de la fiche : {{views_count}}
Reservations : {{bookings_count}}
Couverts : {{guests_count}}
Avis recus : {{reviews_count}}
Note moyenne : {{avg_rating}}/5

Consultez votre tableau de bord pour plus de details.

L''equipe Sortir Au Maroc',
  'Voir le tableau de bord',
  'Your week in numbers - {{establishment}}',
  'Hello,

Here is the summary of your week for {{establishment}}:

Listing views: {{views_count}}
Bookings: {{bookings_count}}
Guests: {{guests_count}}
Reviews received: {{reviews_count}}
Average rating: {{avg_rating}}/5

Check your dashboard for more details.

The Sortir Au Maroc team',
  'View dashboard',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- ============================================================================
-- SYSTEM TEMPLATES
-- ============================================================================

-- Pro password reset
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_password_reset',
  'system',
  'Reinitialisation mot de passe PRO',
  true,
  'Reinitialisation de votre mot de passe PRO',
  'Bonjour,

Pour reinitialiser votre mot de passe PRO Sortir Au Maroc, cliquez sur le lien ci-dessous.

Ce lien est valable pendant 1 heure.

Si vous n''avez pas demande cette reinitialisation, ignorez cet email.

L''equipe Sortir Au Maroc',
  'Reinitialiser mon mot de passe',
  'Reset your PRO password',
  'Hello,

To reset your Sortir Au Maroc PRO password, click the link below.

This link is valid for 1 hour.

If you did not request this reset, please ignore this email.

The Sortir Au Maroc team',
  'Reset my password',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Pro password created successfully
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'pro_password_created',
  'system',
  'Mot de passe PRO cree',
  true,
  'Votre mot de passe PRO a ete cree',
  'Bonjour,

Votre mot de passe pour l''espace PRO Sortir Au Maroc a ete cree avec succes.

Vous pouvez maintenant vous connecter avec votre email et votre nouveau mot de passe.

L''equipe Sortir Au Maroc',
  'Se connecter',
  'Your PRO password has been created',
  'Hello,

Your password for the Sortir Au Maroc PRO space has been successfully created.

You can now log in with your email and your new password.

The Sortir Au Maroc team',
  'Log in',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Newsletter subscription confirmed
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'system_newsletter_subscribed',
  'system',
  'Inscription newsletter confirmee',
  true,
  'Bienvenue dans la newsletter Sortir Au Maroc',
  'Bonjour,

Vous etes maintenant inscrit a la newsletter Sortir Au Maroc.

Vous recevrez nos meilleures recommandations, les nouveaux etablissements et les offres exclusives.

A bientot !

L''equipe Sortir Au Maroc',
  'Explorer les etablissements',
  'Welcome to the Sortir Au Maroc newsletter',
  'Hello,

You are now subscribed to the Sortir Au Maroc newsletter.

You will receive our best recommendations, new establishments and exclusive offers.

See you soon!

The Sortir Au Maroc team',
  'Explore establishments',
  'https://sortiraumaroc.ma/'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- ============================================================================
-- MARKETING TEMPLATES
-- ============================================================================

-- Promo code offer
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'marketing_promo_code',
  'marketing',
  'Offre code promo',
  true,
  'Code promo exclusif : {{promo_code}}',
  'Bonjour {{user_name}},

Profitez de {{discount_value}} sur votre prochaine reservation avec le code :

{{promo_code}}

Offre valable jusqu''au {{expires_at}}.

L''equipe Sortir Au Maroc',
  'Utiliser le code',
  'Exclusive promo code: {{promo_code}}',
  'Hello {{user_name}},

Enjoy {{discount_value}} on your next booking with the code:

{{promo_code}}

Offer valid until {{expires_at}}.

The Sortir Au Maroc team',
  'Use the code',
  'https://sortiraumaroc.ma/'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- New establishment announcement
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'marketing_new_establishment',
  'marketing',
  'Nouvelle adresse',
  true,
  'Decouvrez {{establishment}} - Nouvelle adresse sur Sortir Au Maroc',
  'Bonjour {{user_name}},

Nous avons le plaisir de vous presenter une nouvelle adresse : {{establishment}}

{{establishment_description}}

Ville : {{city}}
Type : {{category}}

Reservez des maintenant !

L''equipe Sortir Au Maroc',
  'Decouvrir',
  'Discover {{establishment}} - New on Sortir Au Maroc',
  'Hello {{user_name}},

We are pleased to introduce a new address: {{establishment}}

{{establishment_description}}

City: {{city}}
Type: {{category}}

Book now!

The Sortir Au Maroc team',
  'Discover',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- ============================================================================
-- FINANCE TEMPLATES
-- ============================================================================

-- Deposit received
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'finance_deposit_received',
  'finance',
  'Acompte recu',
  true,
  'Acompte recu pour votre reservation {{booking_ref}}',
  'Bonjour {{user_name}},

Votre acompte a ete encaisse avec succes.

Reference : {{booking_ref}}
Etablissement : {{establishment}}
Montant de l''acompte : {{deposit_amount}} MAD
Reste a payer sur place : {{remaining_amount}} MAD

Date de la reservation : {{date}}

L''equipe Sortir Au Maroc',
  'Voir ma reservation',
  'Deposit received for your booking {{booking_ref}}',
  'Hello {{user_name}},

Your deposit has been successfully received.

Reference: {{booking_ref}}
Establishment: {{establishment}}
Deposit amount: {{deposit_amount}} MAD
Remaining to pay on site: {{remaining_amount}} MAD

Reservation date: {{date}}

The Sortir Au Maroc team',
  'View my booking',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Deposit refunded (cancellation)
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'finance_deposit_refunded',
  'finance',
  'Acompte rembourse',
  true,
  'Remboursement de votre acompte - {{booking_ref}}',
  'Bonjour {{user_name}},

Suite a l''annulation de votre reservation, votre acompte a ete rembourse.

Reference : {{booking_ref}}
Montant rembourse : {{refund_amount}} MAD

Le remboursement sera visible sur votre compte sous 5 a 10 jours ouvrés.

L''equipe Sortir Au Maroc',
  null,
  'Your deposit refund - {{booking_ref}}',
  'Hello {{user_name}},

Following the cancellation of your booking, your deposit has been refunded.

Reference: {{booking_ref}}
Refunded amount: {{refund_amount}} MAD

The refund will appear on your account within 5 to 10 business days.

The Sortir Au Maroc team',
  null,
  null
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

-- Wallet credited
INSERT INTO public.email_templates (
  key, audience, name, enabled,
  subject_fr, body_fr, cta_label_fr,
  subject_en, body_en, cta_label_en,
  cta_url
) VALUES (
  'finance_wallet_credited',
  'finance',
  'Portefeuille credite',
  true,
  'Votre portefeuille a ete credite de {{amount}} MAD',
  'Bonjour {{user_name}},

Votre portefeuille Sortir Au Maroc a ete credite.

Montant : {{amount}} MAD
Raison : {{reason}}

Nouveau solde : {{balance}} MAD

Ce credit sera automatiquement applique a vos prochaines reservations.

L''equipe Sortir Au Maroc',
  'Voir mon portefeuille',
  'Your wallet has been credited with {{amount}} MAD',
  'Hello {{user_name}},

Your Sortir Au Maroc wallet has been credited.

Amount: {{amount}} MAD
Reason: {{reason}}

New balance: {{balance}} MAD

This credit will be automatically applied to your next bookings.

The Sortir Au Maroc team',
  'View my wallet',
  '{{cta_url}}'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  subject_fr = EXCLUDED.subject_fr,
  body_fr = EXCLUDED.body_fr,
  subject_en = EXCLUDED.subject_en,
  body_en = EXCLUDED.body_en;

commit;

-- Verify all templates
SELECT key, audience, name, enabled FROM email_templates ORDER BY audience, key;
