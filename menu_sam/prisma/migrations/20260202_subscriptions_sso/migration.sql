-- Menu Digital Subscriptions & SSO Migration

-- Add Supabase SSO fields to client table
ALTER TABLE `client`
ADD COLUMN `supabase_user_id` VARCHAR(36) NULL UNIQUE AFTER `updated_at`,
ADD COLUMN `sam_establishment_id` VARCHAR(36) NULL AFTER `supabase_user_id`;

-- Create subscriptions table
CREATE TABLE `menu_digital_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `client_id` INT NOT NULL,
  `place_id` INT NOT NULL,

  -- Plan details
  `plan` VARCHAR(20) NOT NULL DEFAULT 'silver',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Billing
  `sam_order_id` VARCHAR(36) NULL,
  `price_paid_cents` INT NOT NULL DEFAULT 0,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'MAD',
  `billing_cycle` VARCHAR(20) NOT NULL DEFAULT 'annual',

  -- Dates
  `starts_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,

  -- Feature flags based on plan
  `can_manage_menu` BOOLEAN NOT NULL DEFAULT TRUE,
  `can_manage_tables` BOOLEAN NOT NULL DEFAULT TRUE,
  `can_receive_calls` BOOLEAN NOT NULL DEFAULT TRUE,
  `can_view_reviews` BOOLEAN NOT NULL DEFAULT TRUE,
  `can_manage_orders` BOOLEAN NOT NULL DEFAULT FALSE,
  `can_manage_payments` BOOLEAN NOT NULL DEFAULT FALSE,
  `can_manage_promos` BOOLEAN NOT NULL DEFAULT FALSE,
  `can_access_advanced` BOOLEAN NOT NULL DEFAULT FALSE,

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  INDEX `idx_client_id` (`client_id`),
  INDEX `idx_place_id` (`place_id`),
  INDEX `idx_status_expires` (`status`, `expires_at`),

  CONSTRAINT `fk_subscription_client` FOREIGN KEY (`client_id`)
    REFERENCES `client` (`client_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_place` FOREIGN KEY (`place_id`)
    REFERENCES `place` (`place_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create index for Supabase user lookups
CREATE INDEX `idx_client_supabase_user_id` ON `client` (`supabase_user_id`);
