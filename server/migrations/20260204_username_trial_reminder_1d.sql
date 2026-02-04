-- Migration: Add J-1 trial reminder email template for username subscriptions
-- This completes the trial reminder sequence: J-3 (existing) -> J-1 (new) -> Trial ended (existing)

-- Insert trial reminder 1 day before end
INSERT INTO public.email_templates (slug, subject, body_html, body_text, variables, is_active)
VALUES (
  'username_trial_reminder_1d',
  'Dernier jour d''essai - Ne perdez pas votre @{{username}}',
  '<h1>{{establishment_name}}, c''est votre dernier jour !</h1>
<p>Votre essai gratuit du <strong>Lien Personnalise</strong> se termine <strong>demain</strong>.</p>
<p>Apres demain, votre lien <strong>book.sam.ma/@{{username}}</strong> ne sera plus actif et vos clients ne pourront plus reserver directement.</p>
<div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;">
  <h3 style="margin-top:0;">Passez a l''abonnement annuel</h3>
  <p style="font-size:24px;font-weight:bold;color:#a3001d;margin:10px 0;">2 400 DH HT/an</p>
  <p style="color:#666;margin:0;">soit seulement 200 DH/mois</p>
</div>
<p><strong>Ce que vous gardez :</strong></p>
<ul>
  <li>Votre @username unique reserve</li>
  <li>Votre QR code personnalise</li>
  <li>0% de commission sur les reservations</li>
  <li>Statistiques detaillees</li>
</ul>
<p style="text-align:center;margin:30px 0;">
  <a href="{{subscribe_url}}" style="background:#a3001d;color:white;padding:16px 32px;text-decoration:none;border-radius:6px;font-size:18px;font-weight:bold;">Souscrire maintenant</a>
</p>
<p style="color:#666;font-size:14px;">Si vous ne souscrivez pas, votre @username sera reserve pendant 7 jours supplementaires avant d''etre libere.</p>',
  '{{establishment_name}}, c''est votre dernier jour !

Votre essai gratuit du Lien Personnalise se termine demain.

Apres demain, votre lien book.sam.ma/@{{username}} ne sera plus actif et vos clients ne pourront plus reserver directement.

---
Passez a l''abonnement annuel
2 400 DH HT/an (soit seulement 200 DH/mois)
---

Ce que vous gardez :
- Votre @username unique reserve
- Votre QR code personnalise
- 0% de commission sur les reservations
- Statistiques detaillees

Souscrire maintenant : {{subscribe_url}}

Si vous ne souscrivez pas, votre @username sera reserve pendant 7 jours supplementaires avant d''etre libere.',
  '["establishment_name", "username", "subscribe_url"]'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active;

-- Add comment for documentation
COMMENT ON TABLE public.email_templates IS 'Username subscription trial reminders: J-3 (username_trial_reminder_3d) and J-1 (username_trial_reminder_1d)';
