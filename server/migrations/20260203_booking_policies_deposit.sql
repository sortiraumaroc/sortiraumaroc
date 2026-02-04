-- Migration: Add deposit_per_person to booking_policies
-- This field controls whether guaranteed booking is available for an establishment
-- If null or 0, the "Place garantie" option will not be shown to users

-- Add deposit_per_person column (nullable, in MAD)
ALTER TABLE booking_policies
ADD COLUMN IF NOT EXISTS deposit_per_person INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN booking_policies.deposit_per_person IS
  'Deposit amount per person in MAD for guaranteed reservations. If NULL or 0, guaranteed booking option is disabled.';
