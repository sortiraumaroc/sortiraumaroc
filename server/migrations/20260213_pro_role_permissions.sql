-- =============================================================================
-- Pro Role Permissions — Customizable role-based permissions per establishment
-- =============================================================================
-- Allows the Owner to customize which permissions each role has.
-- If no row exists for a given (establishment_id, role), the defaults apply
-- (matching the previously hard-coded values).
-- Owner always has ALL permissions — no row is ever created for "owner".
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pro_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'reception', 'accounting', 'marketing')),

  -- Permission flags (6 categories)
  manage_profile BOOLEAN NOT NULL DEFAULT false,
  manage_team BOOLEAN NOT NULL DEFAULT false,        -- Always false, owner-only, non-customizable
  manage_reservations BOOLEAN NOT NULL DEFAULT false,
  view_billing BOOLEAN NOT NULL DEFAULT false,
  manage_inventory BOOLEAN NOT NULL DEFAULT false,
  manage_offers BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (establishment_id, role)
);

-- Index for fast lookups by establishment
CREATE INDEX IF NOT EXISTS idx_pro_role_permissions_establishment
  ON public.pro_role_permissions(establishment_id);

-- RLS
ALTER TABLE public.pro_role_permissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pro_role_permissions IS
  'Custom permission overrides per establishment+role. If no row exists, defaults apply.';
COMMENT ON COLUMN public.pro_role_permissions.manage_team IS
  'Always false. Team management is owner-only and not customizable.';

COMMIT;
