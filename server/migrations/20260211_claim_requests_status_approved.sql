-- Migration: Update claim_requests CHECK constraint to accept 'approved' status
-- The original migration only allowed: pending, contacted, verified, rejected, completed
-- The admin UI uses 'approved' instead of 'verified', so we need to add it

-- Drop the old CHECK constraint and add the updated one
ALTER TABLE claim_requests DROP CONSTRAINT IF EXISTS claim_requests_status_check;

ALTER TABLE claim_requests ADD CONSTRAINT claim_requests_status_check
  CHECK (status IN ('pending', 'contacted', 'verified', 'approved', 'rejected', 'completed'));

-- Update any existing 'verified' statuses to 'approved' for consistency
UPDATE claim_requests SET status = 'approved' WHERE status = 'verified';
