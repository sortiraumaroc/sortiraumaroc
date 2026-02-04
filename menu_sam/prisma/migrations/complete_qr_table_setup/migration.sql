-- ============ ALTER admin TABLE ============
ALTER TABLE `admin` ADD COLUMN `last_login` DATETIME DEFAULT NULL;
ALTER TABLE `admin` ADD COLUMN `refresh_token` VARCHAR(500) DEFAULT NULL;
ALTER TABLE `admin` ADD COLUMN `is_active` TINYINT(1) DEFAULT 1;
ALTER TABLE `admin` ADD COLUMN `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `admin` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============ ALTER client TABLE ============
ALTER TABLE `client` ADD COLUMN `last_login` DATETIME DEFAULT NULL;
ALTER TABLE `client` ADD COLUMN `refresh_token` VARCHAR(500) DEFAULT NULL;
ALTER TABLE `client` ADD COLUMN `establishment_id` INT(11) DEFAULT NULL COMMENT 'Lien vers sa place/établissement principal';
ALTER TABLE `client` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============ ALTER place TABLE ============
-- QR-Table features
ALTER TABLE `place` ADD COLUMN `qr_tables_enabled` ENUM('oui','non') DEFAULT 'oui' COMMENT 'Activer/désactiver les QR tables';
ALTER TABLE `place` ADD COLUMN `online_orders_enabled` ENUM('oui','non') DEFAULT 'oui' COMMENT 'Accepter les commandes en ligne';

-- Operations
ALTER TABLE `place` ADD COLUMN `max_tables` INT(3) DEFAULT 20 COMMENT 'Nombre max de tables QR';
ALTER TABLE `place` ADD COLUMN `timezone` VARCHAR(50) DEFAULT 'Africa/Casablanca' COMMENT 'Fuseau horaire';
ALTER TABLE `place` ADD COLUMN `kitchen_display_enabled` ENUM('oui','non') DEFAULT 'oui' COMMENT 'Écran cuisine activé';

-- Infos pratiques
ALTER TABLE `place` ADD COLUMN `parking_available` TINYINT(1) DEFAULT 0 COMMENT 'Parking disponible';
ALTER TABLE `place` ADD COLUMN `delivery_available` TINYINT(1) DEFAULT 0 COMMENT 'Livraison disponible';
ALTER TABLE `place` ADD COLUMN `phone_order` VARCHAR(20) NOT NULL COMMENT 'Téléphone pour les commandes';
ALTER TABLE `place` ADD COLUMN `email_order` VARCHAR(255) NOT NULL COMMENT 'Email pour les commandes';

-- Timestamps
ALTER TABLE `place` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `place` ADD COLUMN `deleted_at` DATETIME DEFAULT NULL COMMENT 'Soft delete';

-- ============ ALTER commandes TABLE (existing table, add QR-TABLE fields) ============
ALTER TABLE `commandes` ADD COLUMN `table_number` INT(3) DEFAULT NULL COMMENT 'Numéro de table QR';
ALTER TABLE `commandes` ADD COLUMN `join_code` VARCHAR(10) DEFAULT NULL COMMENT 'Code pour rejoindre la commande';
ALTER TABLE `commandes` ADD COLUMN `kitchen_status` ENUM('new','preparing','ready','served','cancelled') DEFAULT 'new' COMMENT 'Statut en cuisine';
ALTER TABLE `commandes` ADD COLUMN `service_type` ENUM('sur_place','livraison','emporter') DEFAULT 'sur_place' COMMENT 'Type de service';
ALTER TABLE `commandes` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============ ALTER commandes_products TABLE ============
ALTER TABLE `commandes_products` ADD COLUMN `added_by_session_id` VARCHAR(255) DEFAULT NULL COMMENT 'Qui a ajouté cet article (session ID du client)';
ALTER TABLE `commandes_products` ADD COLUMN `added_by_name` VARCHAR(255) DEFAULT NULL COMMENT 'Nom de qui a ajouté';
ALTER TABLE `commandes_products` ADD COLUMN `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `commandes_products` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============ CREATE qr_tables TABLE ============
CREATE TABLE IF NOT EXISTS `qr_tables` (
  `id` VARCHAR(36) PRIMARY KEY,
  `place_id` INT(11) NOT NULL,
  `table_number` INT(3) NOT NULL,
  `qr_code` LONGTEXT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`place_id`) REFERENCES `place` (`place_id`) ON DELETE CASCADE,
  UNIQUE KEY `place_table` (`place_id`, `table_number`),
  KEY `place_id` (`place_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ CREATE participants TABLE ============
CREATE TABLE IF NOT EXISTS `participants` (
  `id` VARCHAR(36) PRIMARY KEY,
  `commande_id` INT(11) NOT NULL,
  `session_id` VARCHAR(255) NOT NULL,
  `first_name` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`commande_id`) REFERENCES `commandes` (`id`) ON DELETE CASCADE,
  KEY `commande_id` (`commande_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ CREATE payments TABLE ============
CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(36) PRIMARY KEY,
  `commande_id` INT(11) NOT NULL,
  `amount` DECIMAL(25,2) NOT NULL,
  `payment_method` VARCHAR(50),
  `transaction_id` VARCHAR(255),
  `status` ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`commande_id`) REFERENCES `commandes` (`id`) ON DELETE CASCADE,
  KEY `commande_id` (`commande_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ ADD FOREIGN KEY CONSTRAINTS ============
ALTER TABLE `commandes_products` 
  ADD CONSTRAINT `commandes_products_ibfk_menu_id` 
  FOREIGN KEY (`menu_id`) REFERENCES `menu_item` (`menu_item_id`) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX `idx_commandes_place_id` ON `commandes` (`place_id`);
CREATE INDEX `idx_commandes_products_commande_id` ON `commandes_products` (`commande_id`);
CREATE INDEX `idx_participants_commande_id` ON `participants` (`commande_id`);
