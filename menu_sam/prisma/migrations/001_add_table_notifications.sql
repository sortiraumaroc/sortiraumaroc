-- CreateTable table_notifications
CREATE TABLE `table_notifications` (
    `id` VARCHAR(36) NOT NULL,
    `commande_id` INTEGER NULL,
    `place_id` INTEGER NOT NULL,
    `table_number` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` VARCHAR(500) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'normal',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledged_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `table_notifications_commande_id_idx` ON `table_notifications`(`commande_id`);

-- CreateIndex
CREATE INDEX `table_notifications_place_id_idx` ON `table_notifications`(`place_id`);

-- CreateIndex
CREATE INDEX `table_notifications_place_id_status_idx` ON `table_notifications`(`place_id`, `status`);

-- CreateIndex
CREATE INDEX `table_notifications_place_id_type_status_idx` ON `table_notifications`(`place_id`, `type`, `status`);

-- AddForeignKey
ALTER TABLE `table_notifications` ADD CONSTRAINT `table_notifications_commande_id_fkey` FOREIGN KEY (`commande_id`) REFERENCES `commandes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_notifications` ADD CONSTRAINT `table_notifications_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `place`(`place_id`) ON DELETE CASCADE ON UPDATE CASCADE;
