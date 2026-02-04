-- AlterTable
-- First, update any existing NULL qr_code values to empty string
UPDATE `qr_tables` SET `qr_code` = '' WHERE `qr_code` IS NULL;

-- Then, make the column NOT NULL
ALTER TABLE `qr_tables` MODIFY `qr_code` LONGTEXT NOT NULL;
