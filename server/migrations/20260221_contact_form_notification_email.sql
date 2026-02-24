-- Activer les notifications email à hello@sam.ma pour le formulaire d'inscription gratuite
UPDATE contact_forms
SET notify_on_submission = true,
    notification_emails = ARRAY['hello@sam.ma']
WHERE slug = 'inscription-gratuite-sur-sam-ma';
