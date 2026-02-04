-- Create CITY table
CREATE TABLE IF NOT EXISTS `city` (
  `city_id` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(255) NOT NULL,
  `country` varchar(100),
  `postal_code` varchar(20),
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create PLACE table
CREATE TABLE IF NOT EXISTS `place` (
  `place_id` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `client_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `city_id` int(11) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `logo` varchar(255),
  `banner_image` varchar(255),
  `description` text,
  `status` tinyint(1) DEFAULT 1,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE CASCADE,
  FOREIGN KEY (`city_id`) REFERENCES `city` (`city_id`),
  KEY `idx_client_id` (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update QR_TABLES table structure
CREATE TABLE IF NOT EXISTS `qr_tables` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `place_id` int(11) NOT NULL,
  `table_number` int(11) NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`place_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE,
  UNIQUE KEY `uniq_place_table` (`place_id`, `table_number`),
  KEY `idx_place_id` (`place_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create QR_TABLE_ORDERS table
CREATE TABLE IF NOT EXISTS `qr_table_orders` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `establishment_id` int(11) NOT NULL,
  `table_number` int(11) NOT NULL,
  `join_code` varchar(50) NOT NULL,
  `status` varchar(50) DEFAULT 'open',
  `kitchen_status` varchar(50) DEFAULT 'new',
  `payment_status` varchar(50),
  `payment_method` varchar(50),
  `discount_amount` decimal(10,2) DEFAULT 0,
  `service_type` varchar(50) DEFAULT 'sur_place',
  `delayed_until` datetime,
  `kitchen_note` text,
  `kitchen_updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`establishment_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE,
  KEY `idx_establishment_created` (`establishment_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create QR_TABLE_ORDER_ITEMS table
CREATE TABLE IF NOT EXISTS `qr_table_order_items` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `order_id` varchar(36) NOT NULL,
  `menu_item_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `price` decimal(10,2) NOT NULL,
  `note` text,
  `created_by` varchar(100),
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `qr_table_orders` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`menu_item_id`) REFERENCES `menu_item` (`menu_item_id`) ON DELETE CASCADE,
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create QR_TABLE_PARTICIPANTS table
CREATE TABLE IF NOT EXISTS `qr_table_participants` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `order_id` varchar(36) NOT NULL,
  `first_name` varchar(100),
  `device_id` varchar(100),
  `joined_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `qr_table_orders` (`id`) ON DELETE CASCADE,
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create QR_TABLE_ORDER_EVENTS table
CREATE TABLE IF NOT EXISTS `qr_table_order_events` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `order_id` varchar(36) NOT NULL,
  `event_type` varchar(50) NOT NULL,
  `note` text,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `qr_table_orders` (`id`) ON DELETE CASCADE,
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create PAYMENTS table
CREATE TABLE IF NOT EXISTS `payments` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `order_id` varchar(36) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) DEFAULT 'DH',
  `payment_method` varchar(50),
  `status` varchar(50) DEFAULT 'pending',
  `transaction_id` varchar(100),
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `qr_table_orders` (`id`) ON DELETE CASCADE,
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create USERS_PRO table
CREATE TABLE IF NOT EXISTS `users_pro` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `place_id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL UNIQUE,
  `password_hash` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `role` varchar(50) DEFAULT 'manager',
  `last_login` datetime,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`place_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE,
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update PROMO_CODES table to reference place_id
ALTER TABLE `promo_codes` ADD CONSTRAINT `fk_promo_place` FOREIGN KEY (`place_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Update MENU_CATEGORY table to reference place_id  
ALTER TABLE `menu_category` ADD CONSTRAINT `fk_menu_category_place` FOREIGN KEY (`place_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE ON UPDATE CASCADE;
