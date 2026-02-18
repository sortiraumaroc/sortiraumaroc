-- Establishment Usernames (Custom Short URLs)
-- Allows establishments to have @username URLs like sam.ma/@nomdutilisateur
-- Usernames require moderation and can only be changed every 180 days

BEGIN;

-- ---------------------------------------------------------------------------
-- Add username column to establishments
-- ---------------------------------------------------------------------------
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

-- Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_establishments_username_unique
  ON public.establishments(lower(username))
  WHERE username IS NOT NULL;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_establishments_username_lookup
  ON public.establishments(username);

-- Comment on columns
COMMENT ON COLUMN public.establishments.username IS 'Custom short URL username (e.g., @monrestaurant). Must be approved by admin.';
COMMENT ON COLUMN public.establishments.username_changed_at IS 'Timestamp of last username change. Cannot change again for 180 days.';

-- ---------------------------------------------------------------------------
-- Create username moderation requests table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.establishment_username_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  requested_username text NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_username_requests_establishment
  ON public.establishment_username_requests(establishment_id);

CREATE INDEX IF NOT EXISTS idx_username_requests_status
  ON public.establishment_username_requests(status);

CREATE INDEX IF NOT EXISTS idx_username_requests_username
  ON public.establishment_username_requests(lower(requested_username));

-- Comment on table
COMMENT ON TABLE public.establishment_username_requests IS 'Moderation queue for establishment username change requests';

-- ---------------------------------------------------------------------------
-- Function to check username availability
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_username_available(username_to_check text)
RETURNS boolean AS $$
BEGIN
  -- Normalize to lowercase
  username_to_check := lower(trim(username_to_check));

  -- Check if already taken by an establishment
  IF EXISTS (
    SELECT 1 FROM public.establishments
    WHERE lower(username) = username_to_check
  ) THEN
    RETURN false;
  END IF;

  -- Check if pending in moderation queue
  IF EXISTS (
    SELECT 1 FROM public.establishment_username_requests
    WHERE lower(requested_username) = username_to_check
    AND status = 'pending'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Function to validate username format
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_username_format(username_val text)
RETURNS boolean AS $$
BEGIN
  -- Must be 3-30 characters
  IF length(username_val) < 3 OR length(username_val) > 30 THEN
    RETURN false;
  END IF;

  -- Only lowercase letters, numbers, underscores, and dots allowed
  -- Must start with a letter
  -- Cannot end with underscore or dot
  -- No consecutive underscores or dots
  IF username_val !~ '^[a-z][a-z0-9._]*[a-z0-9]$' AND username_val !~ '^[a-z][a-z0-9]?$' THEN
    RETURN false;
  END IF;

  -- No consecutive dots or underscores
  IF username_val ~ '\.\.' OR username_val ~ '__' OR username_val ~ '\._' OR username_val ~ '_\.' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- RLS Policies for username_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.establishment_username_requests ENABLE ROW LEVEL SECURITY;

-- Pro users can view their own requests
CREATE POLICY "Pro users can view own username requests"
  ON public.establishment_username_requests
  FOR SELECT
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.pro_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Pro users with edit rights can create requests
CREATE POLICY "Pro users can create username requests"
  ON public.establishment_username_requests
  FOR INSERT
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.pro_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can manage all username requests"
  ON public.establishment_username_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE user_id = auth.uid()
    )
  );

COMMIT;
