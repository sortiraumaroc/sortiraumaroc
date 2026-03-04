/**
 * Zod Schemas for Admin Activity Tracking Routes
 */
import { z } from "zod";

// POST /api/admin/activity/heartbeat
export const AdminActivityHeartbeatSchema = z.object({
  session_id: z.string().min(1, "session_id requis").max(100),
  active_seconds: z.coerce.number().int().min(1, "active_seconds doit être >= 1").max(120, "active_seconds doit être <= 120"),
  page_path: z.string().max(500).optional(),
});
