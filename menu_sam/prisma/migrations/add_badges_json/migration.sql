-- Create a temporary column to hold the old label data
ALTER TABLE menu_item ADD COLUMN label_temp VARCHAR(255) NULL;

-- Copy label data to temp column
UPDATE menu_item SET label_temp = label WHERE label IS NOT NULL;

-- Drop the old label column
ALTER TABLE menu_item DROP COLUMN label;

-- Rename the badges column to label (if it already exists as placeholder)
-- Or create a new badges JSON column
ALTER TABLE menu_item ADD COLUMN badges JSON NULL DEFAULT NULL;

-- Migrate data from temp column to badges JSON array
UPDATE menu_item 
SET badges = JSON_ARRAY(label_temp) 
WHERE label_temp IS NOT NULL;

-- Drop the temp column
ALTER TABLE menu_item DROP COLUMN label_temp;
