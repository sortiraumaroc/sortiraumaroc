-- Migration: Create claim_requests table for establishment ownership claims
-- This table stores requests from business owners who want to claim their establishment listing

CREATE TABLE IF NOT EXISTS claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  establishment_name TEXT NOT NULL,

  -- Contact information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,

  -- Availability for callback
  preferred_day TEXT NOT NULL, -- lundi, mardi, etc.
  preferred_time TEXT NOT NULL, -- 9h-11h, 11h-13h, etc.

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'verified', 'rejected', 'completed')),
  admin_notes TEXT,
  processed_by UUID REFERENCES admin_collaborators(id),
  processed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_claim_requests_establishment ON claim_requests(establishment_id);
CREATE INDEX IF NOT EXISTS idx_claim_requests_status ON claim_requests(status);
CREATE INDEX IF NOT EXISTS idx_claim_requests_email ON claim_requests(email);
CREATE INDEX IF NOT EXISTS idx_claim_requests_created ON claim_requests(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_claim_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_claim_requests_updated_at ON claim_requests;
CREATE TRIGGER trigger_claim_requests_updated_at
  BEFORE UPDATE ON claim_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_claim_requests_updated_at();

-- RLS policies
ALTER TABLE claim_requests ENABLE ROW LEVEL SECURITY;

-- Allow insert from anyone (public form submission)
CREATE POLICY claim_requests_insert_policy ON claim_requests
  FOR INSERT
  WITH CHECK (true);

-- Only service role can select/update/delete
CREATE POLICY claim_requests_service_policy ON claim_requests
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE claim_requests IS 'Stores requests from business owners to claim their establishment listings';
COMMENT ON COLUMN claim_requests.status IS 'pending: new request, contacted: admin called, verified: ownership confirmed, rejected: claim denied, completed: pro account created';
