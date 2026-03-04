-- Migration: Replace all @sortiraumaroc.ma email addresses with @sam.ma in database
-- This covers email templates, branding settings, and campaign defaults

-- 1. Update email templates body (fr + en) that reference @sortiraumaroc.ma
UPDATE email_templates
SET body_fr = REPLACE(body_fr, '@sortiraumaroc.ma', '@sam.ma')
WHERE body_fr LIKE '%@sortiraumaroc.ma%';

UPDATE email_templates
SET body_en = REPLACE(body_en, '@sortiraumaroc.ma', '@sam.ma')
WHERE body_en LIKE '%@sortiraumaroc.ma%';

-- 2. Update email branding settings
UPDATE email_branding_settings
SET contact_email = REPLACE(contact_email, '@sortiraumaroc.ma', '@sam.ma')
WHERE contact_email LIKE '%@sortiraumaroc.ma%';

-- 3. Update marketing campaign defaults
UPDATE marketing_campaigns
SET from_email = REPLACE(from_email, '@sortiraumaroc.ma', '@sam.ma')
WHERE from_email LIKE '%@sortiraumaroc.ma%';

-- 4. Update marketing_prospects default sender if stored
UPDATE marketing_prospects_settings
SET from_email = REPLACE(from_email, '@sortiraumaroc.ma', '@sam.ma')
WHERE from_email LIKE '%@sortiraumaroc.ma%';
