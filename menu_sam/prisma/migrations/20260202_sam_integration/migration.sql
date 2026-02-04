-- SAM Integration Migration
-- Adds fields to link menu_sam with Sortir Au Maroc establishments

-- Add SAM integration fields to place table
ALTER TABLE `place`
ADD COLUMN `sam_establishment_id` VARCHAR(36) NULL UNIQUE AFTER `geo_fence_radius_meters`,
ADD COLUMN `sam_sync_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `sam_establishment_id`,
ADD COLUMN `sam_last_sync_at` DATETIME NULL AFTER `sam_sync_enabled`;

-- Add SAM category mapping to menu_category table
ALTER TABLE `menu_category`
ADD COLUMN `sam_category_id` VARCHAR(36) NULL UNIQUE AFTER `icon_scan`;

-- Add SAM item mapping to menu_item table
ALTER TABLE `menu_item`
ADD COLUMN `sam_item_id` VARCHAR(36) NULL UNIQUE AFTER `label`,
ADD COLUMN `sam_variant_id` VARCHAR(36) NULL AFTER `sam_item_id`;

-- Create indexes for faster lookups
CREATE INDEX `idx_place_sam_establishment_id` ON `place` (`sam_establishment_id`);
CREATE INDEX `idx_menu_category_sam_category_id` ON `menu_category` (`sam_category_id`);
CREATE INDEX `idx_menu_item_sam_item_id` ON `menu_item` (`sam_item_id`);
