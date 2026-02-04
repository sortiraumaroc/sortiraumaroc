-- Menu Digital Integration Migration
-- Adds fields to establishments table for menu_sam integration

-- Add menu digital fields to establishments table
ALTER TABLE establishments
ADD COLUMN IF NOT EXISTS menu_digital_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS menu_digital_last_sync TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_establishments_menu_digital_enabled
ON establishments (menu_digital_enabled)
WHERE menu_digital_enabled = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN establishments.menu_digital_enabled IS 'Whether this establishment has menu digital QR code system enabled';
COMMENT ON COLUMN establishments.menu_digital_last_sync IS 'Last time the menu was synced to menu_sam system';
