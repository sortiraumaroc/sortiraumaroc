/**
 * Zod Schemas for Admin Notifications Routes
 */
import { z } from "zod";

// POST /api/admin/notifications/bulk-action
export const AdminNotificationBulkActionSchema = z.object({
  action: z.enum(["read", "delete"], { message: "Action invalide. Doit être 'read' ou 'delete'." }),
  ids: z.array(z.string()).min(1, "Au moins 1 id requis").max(100, "Maximum 100 ids"),
});
