-- ============================================================================
-- Migration: Rename rentacar universe label
-- Date: 2026-02-04
-- Description: Rename "Louer un véhicule" to "Se déplacer"
-- ============================================================================

begin;

-- Update the French label for rentacar universe
update public.universes
set label_fr = 'Se déplacer'
where slug = 'rentacar';

commit;
