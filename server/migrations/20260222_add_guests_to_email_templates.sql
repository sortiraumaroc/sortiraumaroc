-- Migration: Add {{guests}} (nombre de personnes) to reservation email templates
-- Date: 2026-02-22
-- Purpose: All reservation emails should display the number of guests
--
-- NOTE: Some templates store newlines as literal \n (escaped, from 20260120 migration)
--       Others use real newline characters (from 20260204/20260208/20260210 migrations)
--       We handle both cases with separate REPLACE patterns.

-- ============================================================
-- GROUP A: Templates with REAL newlines (E'\n' in REPLACE)
-- ============================================================

-- 1. user_booking_confirmed — real newlines
-- Body has: ...Date : {{date}}\nMontant : {{amount}}...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, E'Date : {{date}}\nMontant', E'Date : {{date}}\nNombre de personnes : {{guests}}\nMontant')
WHERE key = 'user_booking_confirmed';

-- 3. user_booking_pro_confirmed — real newlines
-- Body has: ...Référence : {{booking_ref}}\n\nNous vous attendons...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, E'Référence : {{booking_ref}}\n\nNous vous attendons', E'Référence : {{booking_ref}}\nNombre de personnes : {{guests}}\n\nNous vous attendons')
WHERE key = 'user_booking_pro_confirmed';

-- 4. user_booking_refused — real newlines
-- Body has: ...Référence : {{booking_ref}}\nMotif : {{reason}}...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, E'Référence : {{booking_ref}}\nMotif', E'Référence : {{booking_ref}}\nNombre de personnes : {{guests}}\nMotif')
WHERE key = 'user_booking_refused';

-- 5. user_booking_cancelled_by_pro — real newlines
-- Body has: ...Référence : {{booking_ref}}\n\nSi un paiement...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, E'Référence : {{booking_ref}}\n\nSi un paiement', E'Référence : {{booking_ref}}\nNombre de personnes : {{guests}}\n\nSi un paiement')
WHERE key = 'user_booking_cancelled_by_pro';

-- 8. user_booking_auto_cancelled — real newlines
-- Body: "...prévue le {{date}} à {{time}} a été automatiquement annulée..."
-- No structured "Date :" line — inject guests count inline
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr,
  E'prévue le {{date}} à {{time}}',
  E'prévue le {{date}} à {{time}} ({{guests}} personne(s))')
WHERE key = 'user_booking_auto_cancelled'
AND body_fr NOT LIKE '%{{guests}}%';

-- ============================================================
-- GROUP B: Templates with LITERAL \n (plain text, not E-string)
-- ============================================================

-- 2. pro_new_booking — literal \n
-- Body: ...Date : {{date}}\nMontant : {{amount}}...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, 'Date : {{date}}\nMontant', 'Date : {{date}}\nNombre de personnes : {{guests}}\nMontant')
WHERE key = 'pro_new_booking';

-- 6. user_booking_cancelled — literal \n
-- Body: ...Date : {{date}}\n\nSi vous avez besoin...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, 'Date : {{date}}\n\nSi vous avez', 'Date : {{date}}\nNombre de personnes : {{guests}}\n\nSi vous avez')
WHERE key = 'user_booking_cancelled';

-- 7. user_booking_updated — literal \n
-- Body: ...Nouvelle date : {{date}}\n\nÀ bientôt...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, 'Nouvelle date : {{date}}\n\n', 'Nouvelle date : {{date}}\nNombre de personnes : {{guests}}\n\n')
WHERE key = 'user_booking_updated';

-- 9. pro_customer_cancelled — literal \n
-- Body: ...Date : {{date}}\n\nL''équipe...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, 'Date : {{date}}\n\nL''équipe', 'Date : {{date}}\nNombre de personnes : {{guests}}\n\nL''équipe')
WHERE key = 'pro_customer_cancelled';

-- 10. pro_customer_change_request — literal \n
-- Body: ...Date : {{date}}\n\nMerci de répondre...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, 'Date : {{date}}\n\nMerci de répondre', 'Date : {{date}}\nNombre de personnes : {{guests}}\n\nMerci de répondre')
WHERE key = 'pro_customer_change_request';

-- 11. user_booking_reminder_d1 — literal \n
-- Body: ...Date : {{date}}\n\nÀ bientôt...
UPDATE public.email_templates
SET body_fr = REPLACE(body_fr, 'Date : {{date}}\n\n', 'Date : {{date}}\nNombre de personnes : {{guests}}\n\n')
WHERE key = 'user_booking_reminder_d1';
