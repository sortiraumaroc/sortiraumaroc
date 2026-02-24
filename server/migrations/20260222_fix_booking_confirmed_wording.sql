-- Migration: Fix user_booking_confirmed wording
-- Date: 2026-02-22
-- Purpose: The first email sent to the customer after creating a reservation
--          says "Votre réservation est confirmée" but the reservation is actually
--          pending_pro_validation. This creates confusion when the pro later
--          confirms and a second email says "confirmée par l'établissement".
--          Fix: Change wording to "demande envoyée à l'établissement pour confirmation".
--
-- NOTE: This template uses REAL newlines (not literal \n).

-- 1. Update subject_fr
UPDATE public.email_templates
SET subject_fr = 'Réservation {{booking_ref}} — En attente de confirmation'
WHERE key = 'user_booking_confirmed';

-- 2. Update body_fr (full replacement with E-string for real newlines)
UPDATE public.email_templates
SET body_fr = E'Bonjour {{user_name}},\n\nMerci pour votre réservation ! Votre demande a été envoyée à l''établissement pour confirmation.\n\nRéférence : {{booking_ref}}\nÉtablissement : {{establishment}}\nDate : {{date}}\nNombre de personnes : {{guests}}\nMontant : {{amount}}\n\nL''établissement examinera votre demande et vous enverra une confirmation sous peu. Vous recevrez un email dès que votre réservation sera confirmée.\n\n📱 Le jour J, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Ce QR code unique vous identifie et permet de valider votre réservation à l''arrivée.\n\nÀ bientôt,\nL''équipe Sortir Au Maroc'
WHERE key = 'user_booking_confirmed';
