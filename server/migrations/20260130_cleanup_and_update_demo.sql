-- Cleanup emails and update demo account
-- Run this in Supabase SQL Editor

-- 1. Delete specified email addresses from users table (if they exist there)
DELETE FROM auth.users WHERE email IN ('s.aitnasser@me.com', 'hello@sam.ma');

-- 2. Delete from any other tables that might have these emails
DELETE FROM marketing_prospects WHERE email IN ('s.aitnasser@me.com', 'hello@sam.ma');

-- 3. Update demo account: set function to CEO and fix password hash for demo123!
UPDATE admin_collaborators
SET
  function = 'CEO',
  password_hash = '52da7dfb6501a7d0b27f40c1baa367129cd84e05ab5bf4bc4a30f9e9cbba91c5:091ff311ed7ae7ad816d82bc32b859561d1b1ad937388a7afac165493e405b560fc577463da0f68501fcfa07e216f7fe6304209569f244c4a5ecfb2c0fa6600f'
WHERE email = 'demo';

-- 4. Verify the changes
SELECT email, password_hash, function, role_id FROM admin_collaborators WHERE email = 'demo';
