-- Update demo account to superadmin role
-- Run this in Supabase SQL Editor

UPDATE admin_collaborators
SET role_id = 'superadmin'
WHERE email = 'demo';
