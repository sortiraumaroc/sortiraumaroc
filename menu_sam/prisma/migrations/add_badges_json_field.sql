-- Rename old label column to badges_legacy
ALTER TABLE menu_item CHANGE COLUMN label label_legacy VARCHAR(255) NULL;

-- Add new badges JSON column
ALTER TABLE menu_item ADD COLUMN badges JSON NULL DEFAULT NULL;

-- Migrate data from label_legacy to badges (convert single value to array)
-- This creates an array with the single label value if it exists
UPDATE menu_item 
SET badges = JSON_ARRAY(label_legacy) 
WHERE label_legacy IS NOT NULL;

-- Drop the old label_legacy column
ALTER TABLE menu_item DROP COLUMN label_legacy;
