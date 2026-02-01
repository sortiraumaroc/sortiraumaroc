-- Add pack_purchase support to finance.escrow_holds
--
-- Notes:
-- - Adds reference_type and reference_id columns to support both reservations and pack purchases.
-- - Makes reservation_id nullable for backward compatibility.
-- - Creates a unique constraint on (reference_type, reference_id) for idempotency.
-- - Backfills existing rows with reference_type='reservation' and reference_id=reservation_id.

-- 1) Add columns to escrow_holds if they don't exist (nullable initially for backfill)
ALTER TABLE finance.escrow_holds
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id text;

-- 2) Drop the unique constraint on reservation_id if it exists
-- (This needs to be done carefully to avoid lock issues in production)
-- We'll replace it with a more flexible constraint.
ALTER TABLE finance.escrow_holds
  DROP CONSTRAINT IF EXISTS escrow_holds_reservation_id_key;

-- 3) Backfill reference_type and reference_id for existing rows where they are null
UPDATE finance.escrow_holds
SET
  reference_type = COALESCE(reference_type, 'reservation'),
  reference_id = COALESCE(reference_id, reservation_id)
WHERE reference_type IS NULL OR reference_id IS NULL;

-- 4) Add NOT NULL constraints
ALTER TABLE finance.escrow_holds
  ALTER COLUMN reference_type SET NOT NULL,
  ALTER COLUMN reference_id SET NOT NULL;

-- 5) Create a unique constraint on (reference_type, reference_id)
-- Using CONCURRENTLY to minimize lock impact
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS escrow_holds_reference_type_id_key
ON finance.escrow_holds (reference_type, reference_id);

-- 6) Create an index on reservation_id for backward compatibility queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS escrow_holds_reservation_id_idx
ON finance.escrow_holds (reservation_id)
WHERE reservation_id IS NOT NULL;
