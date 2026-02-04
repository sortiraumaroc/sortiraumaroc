-- CreateTable: Add place_contacts table for storing establishment contacts

CREATE TABLE `place_contacts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `place_id` INT NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `value` VARCHAR(500) NOT NULL,
  `priority` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_place_type` (`place_id`, `type`),
  KEY `idx_place_id` (`place_id`),
  CONSTRAINT `fk_place_contacts_place` FOREIGN KEY (`place_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notes:
-- - Contact types: mobile, whatsapp, fixe, email, site, facebook, instagram, twitter, waze, tiktok, snapchat
-- - Each place can have one contact per type (unique constraint)
-- - priority: 0 = most important, displayed first
-- - value: the actual contact data (phone, email, username, URL, etc.)
-- - created_at and updated_at: for tracking changes
