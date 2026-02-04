-- Menu Digital Subscriptions Migration
-- Adds subscription tracking fields to establishments table

-- Add menu digital subscription fields
ALTER TABLE establishments
ADD COLUMN IF NOT EXISTS menu_digital_plan VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS menu_digital_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN establishments.menu_digital_plan IS 'The menu digital plan tier: silver or premium';
COMMENT ON COLUMN establishments.menu_digital_expires_at IS 'When the menu digital subscription expires';

-- Create index for expiration checks
CREATE INDEX IF NOT EXISTS idx_establishments_menu_digital_expires
ON establishments (menu_digital_expires_at)
WHERE menu_digital_expires_at IS NOT NULL;
