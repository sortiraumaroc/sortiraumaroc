-- Add instagram_url and google_maps_url to claim_requests
-- These are filled by the Ramadan onboarding wizard so that admin can see
-- the social links submitted by the restaurant owner.

ALTER TABLE claim_requests ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE claim_requests ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
